import hashlib
import hmac
import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import get_db
from app.database.models import (
    WhatsAppAccount, Contact, Conversation, Message,
    ConversationStatus, MessageDirection, MessageStatus
)
from app.auth.dependencies import get_current_user, require_admin_or_owner
from app.database.models import User

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


# ─── Webhook verification ─────────────────────────────────────────────────────

@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed.")


# ─── Webhook receiver ─────────────────────────────────────────────────────────

@router.post("/webhook")
async def receive_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()

    # Signature verification
    signature = request.headers.get("X-Hub-Signature-256", "")
    # In production, verify against app secret

    payload = json.loads(body)
    await process_webhook_payload(payload, db)
    return {"status": "ok"}


async def process_webhook_payload(payload: dict, db: AsyncSession):
    """Parse and store incoming WhatsApp messages."""
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id")

            # Find the WhatsApp account
            result = await db.execute(
                select(WhatsAppAccount).where(
                    WhatsAppAccount.phone_number_id == phone_number_id,
                    WhatsAppAccount.is_active == True,
                )
            )
            wa_account = result.scalar_one_or_none()
            if not wa_account:
                continue

            # Process incoming messages
            for msg in value.get("messages", []):
                await handle_incoming_message(msg, wa_account, db)

            # Process status updates
            for status_update in value.get("statuses", []):
                await handle_status_update(status_update, db)

    await db.commit()


async def handle_incoming_message(msg: dict, wa_account: WhatsAppAccount, db: AsyncSession):
    from_phone = msg.get("from")
    wa_msg_id = msg.get("id")
    msg_type = msg.get("type", "text")
    timestamp = msg.get("timestamp")

    # Upsert contact
    result = await db.execute(
        select(Contact).where(
            Contact.tenant_id == wa_account.tenant_id,
            Contact.phone == from_phone,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        # Try to get name from contacts info
        contact_name = None
        contact = Contact(
            tenant_id=wa_account.tenant_id,
            phone=from_phone,
            name=contact_name,
            source="organic",
        )
        db.add(contact)
        await db.flush()

    # Upsert conversation
    result = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == wa_account.tenant_id,
            Conversation.contact_id == contact.id,
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        conversation = Conversation(
            tenant_id=wa_account.tenant_id,
            contact_id=contact.id,
            whatsapp_account_id=wa_account.id,
            status=ConversationStatus.BOT,
            bot_active=True,
        )
        db.add(conversation)
        await db.flush()

    # Extract message content
    content = None
    if msg_type == "text":
        content = msg.get("text", {}).get("body", "")
    elif msg_type == "interactive":
        interactive = msg.get("interactive", {})
        if interactive.get("type") == "button_reply":
            content = interactive["button_reply"]["title"]
        elif interactive.get("type") == "list_reply":
            content = interactive["list_reply"]["title"]

    # Store message
    message = Message(
        conversation_id=conversation.id,
        tenant_id=wa_account.tenant_id,
        direction=MessageDirection.INBOUND,
        message_type=msg_type,
        content=content,
        wa_message_id=wa_msg_id,
        status=MessageStatus.DELIVERED,
    )
    db.add(message)

    # Update conversation
    conversation.last_message_at = message.created_at
    conversation.last_message_preview = (content or "")[:100]
    conversation.unread_count = (conversation.unread_count or 0) + 1

    # Trigger bot engine if bot is active
    if conversation.bot_active:
        from app.bot.engine import process_message
        await process_message(content, conversation, contact, wa_account, db)


async def handle_status_update(status_update: dict, db: AsyncSession):
    wa_msg_id = status_update.get("id")
    new_status = status_update.get("status")

    status_map = {
        "sent": MessageStatus.SENT,
        "delivered": MessageStatus.DELIVERED,
        "read": MessageStatus.READ,
        "failed": MessageStatus.FAILED,
    }

    if new_status in status_map:
        result = await db.execute(
            select(Message).where(Message.wa_message_id == wa_msg_id)
        )
        msg = result.scalar_one_or_none()
        if msg:
            msg.status = status_map[new_status]


# ─── Send message API ─────────────────────────────────────────────────────────

async def send_whatsapp_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    message_type: str,
    content: Any,
) -> dict:
    """Send a message via Meta Cloud API."""
    url = f"{settings.WHATSAPP_API_URL}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    if message_type == "text":
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": content, "preview_url": False},
        }
    elif message_type == "template":
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": content,
        }
    elif message_type == "interactive":
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": content,
        }
    else:
        payload = {"messaging_product": "whatsapp", "to": to, **content}

    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


# ─── CRUD endpoints for WhatsApp accounts ─────────────────────────────────────

from pydantic import BaseModel


class WhatsAppAccountCreate(BaseModel):
    phone_number: str
    phone_number_id: str
    waba_id: str
    access_token: str
    display_name: str | None = None


@router.post("/accounts", status_code=201)
async def create_whatsapp_account(
    payload: WhatsAppAccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    account = WhatsAppAccount(
        tenant_id=current_user.tenant_id,
        **payload.model_dump(),
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return {"id": str(account.id), "phone_number": account.phone_number}


@router.get("/accounts")
async def list_whatsapp_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(WhatsAppAccount).where(
            WhatsAppAccount.tenant_id == current_user.tenant_id,
            WhatsAppAccount.is_active == True,
        )
    )
    accounts = result.scalars().all()
    return [
        {"id": str(a.id), "phone_number": a.phone_number, "display_name": a.display_name}
        for a in accounts
    ]
