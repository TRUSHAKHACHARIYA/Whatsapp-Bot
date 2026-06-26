from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import (
    Message, Conversation, Lead, Campaign, User,
    MessageDirection, LeadStage, CampaignStatus, ConversationStatus
)
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
async def dashboard_stats(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = current_user.tenant_id
    since = datetime.utcnow() - timedelta(days=days)

    # Total messages
    msg_result = await db.execute(
        select(func.count(Message.id)).where(
            Message.tenant_id == tenant_id,
            Message.created_at >= since,
        )
    )
    total_messages = msg_result.scalar() or 0

    # Inbound vs outbound
    inbound_result = await db.execute(
        select(func.count(Message.id)).where(
            Message.tenant_id == tenant_id,
            Message.direction == MessageDirection.INBOUND,
            Message.created_at >= since,
        )
    )
    inbound_count = inbound_result.scalar() or 0

    # New leads
    leads_result = await db.execute(
        select(func.count(Lead.id)).where(
            Lead.tenant_id == tenant_id,
            Lead.created_at >= since,
        )
    )
    new_leads = leads_result.scalar() or 0

    # Won leads
    won_result = await db.execute(
        select(func.count(Lead.id)).where(
            Lead.tenant_id == tenant_id,
            Lead.stage == LeadStage.WON,
        )
    )
    won_leads = won_result.scalar() or 0

    # Conversion rate
    total_leads_result = await db.execute(
        select(func.count(Lead.id)).where(Lead.tenant_id == tenant_id)
    )
    total_leads = total_leads_result.scalar() or 1
    conversion_rate = round((won_leads / total_leads) * 100, 1)

    # Active campaigns
    active_campaigns_result = await db.execute(
        select(func.count(Campaign.id)).where(
            Campaign.tenant_id == tenant_id,
            Campaign.status.in_([CampaignStatus.RUNNING, CampaignStatus.SCHEDULED]),
        )
    )
    active_campaigns = active_campaigns_result.scalar() or 0

    # Conversations by status
    conv_result = await db.execute(
        select(Conversation.status, func.count(Conversation.id))
        .where(Conversation.tenant_id == tenant_id)
        .group_by(Conversation.status)
    )
    conversations_by_status = {row[0]: row[1] for row in conv_result.all()}

    # Bot vs agent handled
    bot_handled = conversations_by_status.get(ConversationStatus.BOT, 0)
    agent_handled = sum(
        conversations_by_status.get(s, 0)
        for s in [ConversationStatus.OPEN, ConversationStatus.ASSIGNED, ConversationStatus.RESOLVED]
    )
    automation_rate = round((bot_handled / max(bot_handled + agent_handled, 1)) * 100, 1)

    return {
        "period_days": days,
        "messages": {
            "total": total_messages,
            "inbound": inbound_count,
            "outbound": total_messages - inbound_count,
        },
        "leads": {
            "new": new_leads,
            "won": won_leads,
            "conversion_rate": conversion_rate,
        },
        "campaigns": {
            "active": active_campaigns,
        },
        "conversations": {
            "bot_handled": bot_handled,
            "agent_handled": agent_handled,
            "automation_rate": automation_rate,
        },
    }


@router.get("/agent-performance")
async def agent_performance(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = current_user.tenant_id
    since = datetime.utcnow() - timedelta(days=days)

    # Conversations assigned per agent
    result = await db.execute(
        select(User.id, User.name, func.count(Conversation.id).label("chat_count"))
        .join(Conversation, Conversation.assigned_agent_id == User.id)
        .where(
            User.tenant_id == tenant_id,
            Conversation.created_at >= since,
        )
        .group_by(User.id, User.name)
        .order_by(func.count(Conversation.id).desc())
    )
    rows = result.all()
    return [
        {"agent_id": str(r[0]), "name": r[1], "conversations": r[2]}
        for r in rows
    ]


@router.get("/faq-performance")
async def faq_performance(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.database.models import FAQ
    result = await db.execute(
        select(FAQ)
        .where(FAQ.tenant_id == current_user.tenant_id)
        .order_by(FAQ.hit_count.desc())
        .limit(limit)
    )
    faqs = result.scalars().all()
    return [
        {"id": str(f.id), "question": f.question, "category": f.category, "hits": f.hit_count}
        for f in faqs
    ]
