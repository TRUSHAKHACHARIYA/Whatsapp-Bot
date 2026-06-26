import asyncio
import json
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db, AsyncSessionLocal
from app.database.models import (
    Conversation, Message, Contact, User,
    ConversationStatus, MessageDirection, MessageStatus
)
from app.auth.dependencies import get_current_user, require_any_agent
from app.whatsapp.router import send_whatsapp_message

router = APIRouter(prefix="/chat", tags=["chat"])


# ─── WebSocket Connection Manager ────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        # tenant_id -> list of websockets
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, ws: WebSocket, tenant_id: str):
        await ws.accept()
        if tenant_id not in self.active:
            self.active[tenant_id] = []
        self.active[tenant_id].append(ws)

    def disconnect(self, ws: WebSocket, tenant_id: str):
        if tenant_id in self.active:
            self.active[tenant_id] = [c for c in self.active[tenant_id] if c != ws]

    async def broadcast_to_tenant(self, tenant_id: str, event: dict):
        dead = []
        for ws in self.active.get(tenant_id, []):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, tenant_id)


manager = ConnectionManager()


# ─── WebSocket endpoint ──────────────────────────────────────────────────────

@router.websocket("/ws/{tenant_id}")
async def websocket_inbox(websocket: WebSocket, tenant_id: str, token: str = Query(...)):
    """Real-time inbox updates for agents."""
    # Validate token
    try:
        from app.auth.service import decode_token
        payload = decode_token(token)
        if payload.get("tenant_id") != tenant_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, tenant_id)
    try:
        while True:
            # Keep alive ping
            data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
            if data == "ping":
                await websocket.send_text("pong")
    except (WebSocketDisconnect, asyncio.TimeoutError):
        manager.disconnect(websocket, tenant_id)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class SendMessagePayload(BaseModel):
    content: str
    message_type: str = "text"
    is_internal_note: bool = False


class AssignPayload(BaseModel):
    agent_id: Optional[UUID] = None


class ConversationStatusUpdate(BaseModel):
    status: ConversationStatus


# ─── Conversation listing ────────────────────────────────────────────────────

@router.get("/conversations")
async def list_conversations(
    status: Optional[ConversationStatus] = None,
    assigned_to_me: bool = False,
    unread_only: bool = False,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    query = (
        select(Conversation)
        .where(Conversation.tenant_id == current_user.tenant_id)
        .options(
            selectinload(Conversation.contact),
            selectinload(Conversation.assigned_agent),
        )
        .order_by(desc(Conversation.last_message_at))
    )
    if status:
        query = query.where(Conversation.status == status)
    if assigned_to_me:
        query = query.where(Conversation.assigned_agent_id == current_user.id)
    if unread_only:
        query = query.where(Conversation.unread_count > 0)
    if search:
        query = query.join(Contact).where(
            Contact.name.ilike(f"%{search}%") | Contact.phone.ilike(f"%{search}%")
        )

    result = await db.execute(query.offset(skip).limit(limit))
    conversations = result.scalars().all()

    return [
        {
            "id": str(c.id),
            "status": c.status,
            "bot_active": c.bot_active,
            "unread_count": c.unread_count,
            "last_message_at": c.last_message_at.isoformat() if c.last_message_at else None,
            "last_message_preview": c.last_message_preview,
            "contact": {
                "id": str(c.contact.id),
                "name": c.contact.name,
                "phone": c.contact.phone,
                "email": c.contact.email,
                "tags": c.contact.tags,
            },
            "assigned_agent": {
                "id": str(c.assigned_agent.id),
                "name": c.assigned_agent.name,
            } if c.assigned_agent else None,
        }
        for c in conversations
    ]


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id, Conversation.tenant_id == current_user.tenant_id)
        .options(
            selectinload(Conversation.contact),
            selectinload(Conversation.assigned_agent),
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    # Mark as read
    conv.unread_count = 0
    await db.commit()

    return {
        "id": str(conv.id),
        "status": conv.status,
        "bot_active": conv.bot_active,
        "unread_count": 0,
        "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
        "contact": {
            "id": str(conv.contact.id),
            "name": conv.contact.name,
            "phone": conv.contact.phone,
            "email": conv.contact.email,
            "city": conv.contact.city,
            "tags": conv.contact.tags,
            "source": conv.contact.source,
            "created_at": conv.contact.created_at.isoformat(),
        },
        "assigned_agent": {
            "id": str(conv.assigned_agent.id),
            "name": conv.assigned_agent.name,
        } if conv.assigned_agent else None,
    }


# ─── Messages ─────────────────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: UUID,
    before: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == current_user.tenant_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.created_at))
        .limit(limit)
    )
    if before:
        query = query.where(Message.created_at < before)

    result = await db.execute(query)
    messages = list(reversed(result.scalars().all()))

    return [
        {
            "id": str(m.id),
            "direction": m.direction,
            "message_type": m.message_type,
            "content": m.content,
            "media_url": m.media_url,
            "status": m.status,
            "is_internal_note": m.is_internal_note,
            "sent_by_agent_id": str(m.sent_by_agent_id) if m.sent_by_agent_id else None,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.post("/conversations/{conversation_id}/messages", status_code=201)
async def send_message(
    conversation_id: UUID,
    payload: SendMessagePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id, Conversation.tenant_id == current_user.tenant_id)
        .options(selectinload(Conversation.contact))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    message = Message(
        conversation_id=conversation_id,
        tenant_id=current_user.tenant_id,
        direction=MessageDirection.OUTBOUND,
        message_type=payload.message_type,
        content=payload.content,
        is_internal_note=payload.is_internal_note,
        sent_by_agent_id=current_user.id,
        status=MessageStatus.SENT,
    )
    db.add(message)

    # Send via WhatsApp (skip for internal notes)
    if not payload.is_internal_note:
        from app.database.models import WhatsAppAccount
        wa_result = await db.execute(
            select(WhatsAppAccount).where(
                WhatsAppAccount.id == conv.whatsapp_account_id,
                WhatsAppAccount.is_active == True,
            )
        )
        wa_account = wa_result.scalar_one_or_none()
        if wa_account:
            try:
                resp = await send_whatsapp_message(
                    wa_account.phone_number_id,
                    wa_account.access_token,
                    conv.contact.phone,
                    payload.message_type,
                    payload.content,
                )
                message.wa_message_id = resp.get("messages", [{}])[0].get("id")
            except Exception as e:
                print(f"[Chat] WhatsApp send failed: {e}")

        conv.last_message_at = datetime.utcnow()
        conv.last_message_preview = payload.content[:100]

    await db.commit()
    await db.refresh(message)

    # Broadcast to other agents
    await manager.broadcast_to_tenant(
        str(current_user.tenant_id),
        {
            "event": "new_message",
            "conversation_id": str(conversation_id),
            "message": {
                "id": str(message.id),
                "direction": message.direction,
                "content": message.content,
                "is_internal_note": message.is_internal_note,
                "sent_by_agent_id": str(current_user.id),
                "created_at": message.created_at.isoformat(),
            },
        },
    )

    return {"id": str(message.id), "status": message.status}


# ─── Agent actions ────────────────────────────────────────────────────────────

@router.post("/conversations/{conversation_id}/takeover")
async def agent_takeover(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    """Agent takes over from bot."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == current_user.tenant_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    conv.bot_active = False
    conv.status = ConversationStatus.ASSIGNED
    conv.assigned_agent_id = current_user.id
    await db.commit()

    await manager.broadcast_to_tenant(
        str(current_user.tenant_id),
        {
            "event": "agent_takeover",
            "conversation_id": str(conversation_id),
            "agent": {"id": str(current_user.id), "name": current_user.name},
        },
    )
    return {"message": "Bot paused. Conversation assigned to you.", "bot_active": False}


@router.post("/conversations/{conversation_id}/handback")
async def handback_to_bot(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    """Return conversation to bot."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == current_user.tenant_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    conv.bot_active = True
    conv.status = ConversationStatus.BOT
    conv.assigned_agent_id = None
    await db.commit()
    return {"message": "Conversation returned to bot.", "bot_active": True}


@router.patch("/conversations/{conversation_id}/assign")
async def assign_conversation(
    conversation_id: UUID,
    payload: AssignPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == current_user.tenant_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if payload.agent_id:
        # Verify agent belongs to tenant
        agent = await db.get(User, payload.agent_id)
        if not agent or agent.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=404, detail="Agent not found.")
        conv.assigned_agent_id = payload.agent_id
        conv.status = ConversationStatus.ASSIGNED
        conv.bot_active = False
    else:
        conv.assigned_agent_id = None
        conv.status = ConversationStatus.OPEN

    await db.commit()

    await manager.broadcast_to_tenant(
        str(current_user.tenant_id),
        {
            "event": "conversation_assigned",
            "conversation_id": str(conversation_id),
            "agent_id": str(payload.agent_id) if payload.agent_id else None,
        },
    )
    return {"conversation_id": str(conversation_id), "assigned_agent_id": str(payload.agent_id) if payload.agent_id else None}


@router.patch("/conversations/{conversation_id}/status")
async def update_conversation_status(
    conversation_id: UUID,
    payload: ConversationStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == current_user.tenant_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    conv.status = payload.status
    await db.commit()
    return {"status": conv.status}
