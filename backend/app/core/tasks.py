"""
All background Celery tasks.
"""
import asyncio
from datetime import datetime, timedelta

from app.core.celery_app import celery_app


def run_async(coro):
    """Run an async coroutine inside a sync Celery task."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─── Campaign broadcast ───────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.core.tasks.send_campaign_broadcast",
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def send_campaign_broadcast(self, campaign_id: str):
    """
    Broadcast a campaign to all audience members.
    Runs as a background task to avoid blocking the API.
    """
    async def _run():
        from app.database.session import AsyncSessionLocal
        from app.database.models import Campaign, CampaignStatus, Contact, WhatsAppAccount
        from app.whatsapp.router import send_whatsapp_message
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            campaign = await db.get(Campaign, campaign_id)
            if not campaign:
                return {"error": "Campaign not found"}

            if campaign.status not in [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED]:
                return {"error": f"Campaign is in {campaign.status} status, cannot send"}

            campaign.status = CampaignStatus.RUNNING
            campaign.started_at = datetime.utcnow()
            await db.commit()

            # Get WhatsApp account
            wa_result = await db.execute(
                select(WhatsAppAccount).where(
                    WhatsAppAccount.tenant_id == campaign.tenant_id,
                    WhatsAppAccount.is_active == True,
                ).limit(1)
            )
            wa_account = wa_result.scalar_one_or_none()
            if not wa_account:
                campaign.status = CampaignStatus.PAUSED
                await db.commit()
                return {"error": "No WhatsApp account configured"}

            # Build audience
            query = select(Contact).where(
                Contact.tenant_id == campaign.tenant_id,
                Contact.opted_out == False,
            )
            audience_filter = campaign.audience_filter or {}
            tags = audience_filter.get("tags", [])
            for tag in tags:
                query = query.where(Contact.tags.contains([tag]))

            result = await db.execute(query)
            contacts = result.scalars().all()
            campaign.audience_count = len(contacts)

            sent = 0
            failed = 0

            for contact in contacts:
                try:
                    template_payload = {
                        "name": campaign.template_name,
                        "language": {"code": campaign.template_language or "en"},
                    }
                    if campaign.template_variables:
                        template_payload["components"] = [{
                            "type": "body",
                            "parameters": [
                                {"type": "text", "text": str(v)}
                                for v in campaign.template_variables
                            ],
                        }]

                    await send_whatsapp_message(
                        wa_account.phone_number_id,
                        wa_account.access_token,
                        contact.phone,
                        "template",
                        template_payload,
                    )
                    sent += 1

                    # Small delay to respect WhatsApp rate limits
                    await asyncio.sleep(0.05)

                except Exception as e:
                    print(f"[Campaign] Failed {contact.phone}: {e}")
                    failed += 1

            campaign.sent_count = sent
            campaign.failed_count = failed
            campaign.status = CampaignStatus.COMPLETED
            campaign.completed_at = datetime.utcnow()
            await db.commit()

            return {
                "campaign_id": campaign_id,
                "sent": sent,
                "failed": failed,
                "total": len(contacts),
            }

    try:
        return run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc)


# ─── Check scheduled campaigns ───────────────────────────────────────────────

@celery_app.task(name="app.core.tasks.check_scheduled_campaigns")
def check_scheduled_campaigns():
    """Check for campaigns that are due to be sent and trigger them."""

    async def _run():
        from app.database.session import AsyncSessionLocal
        from app.database.models import Campaign, CampaignStatus
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            now = datetime.utcnow()
            result = await db.execute(
                select(Campaign).where(
                    Campaign.status == CampaignStatus.SCHEDULED,
                    Campaign.scheduled_at <= now,
                )
            )
            campaigns = result.scalars().all()

            triggered = []
            for campaign in campaigns:
                send_campaign_broadcast.delay(str(campaign.id))
                triggered.append(str(campaign.id))

            return {"triggered": triggered, "count": len(triggered)}

    return run_async(_run())


# ─── Single WhatsApp message ──────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.core.tasks.send_single_whatsapp_message",
    max_retries=3,
    default_retry_delay=30,
)
def send_single_whatsapp_message(
    self,
    phone_number_id: str,
    access_token: str,
    to: str,
    message_type: str,
    content: str,
):
    """Send a single WhatsApp message asynchronously."""

    async def _run():
        from app.whatsapp.router import send_whatsapp_message
        return await send_whatsapp_message(phone_number_id, access_token, to, message_type, content)

    try:
        return run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc)


# ─── Analytics aggregation ───────────────────────────────────────────────────

@celery_app.task(name="app.core.tasks.aggregate_daily_analytics")
def aggregate_daily_analytics():
    """
    Pre-aggregate daily analytics for all tenants.
    Stores results in Redis for fast dashboard queries.
    """

    async def _run():
        from app.database.session import AsyncSessionLocal
        from app.database.models import Tenant, Message, Conversation, Lead, MessageDirection
        from sqlalchemy import select, func

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Tenant).where(Tenant.is_active == True)
            )
            tenants = result.scalars().all()

            yesterday = datetime.utcnow().replace(hour=0, minute=0, second=0) - timedelta(days=1)
            today = yesterday + timedelta(days=1)

            aggregated = 0
            for tenant in tenants:
                # Count messages
                msg_count = await db.scalar(
                    select(func.count(Message.id)).where(
                        Message.tenant_id == tenant.id,
                        Message.created_at >= yesterday,
                        Message.created_at < today,
                    )
                ) or 0

                # Count inbound
                inbound_count = await db.scalar(
                    select(func.count(Message.id)).where(
                        Message.tenant_id == tenant.id,
                        Message.direction == MessageDirection.INBOUND,
                        Message.created_at >= yesterday,
                        Message.created_at < today,
                    )
                ) or 0

                # Count new leads
                lead_count = await db.scalar(
                    select(func.count(Lead.id)).where(
                        Lead.tenant_id == tenant.id,
                        Lead.created_at >= yesterday,
                        Lead.created_at < today,
                    )
                ) or 0

                # Store in Redis
                import redis
                r = redis.from_url("redis://localhost:6379/0")
                key = f"analytics:{tenant.id}:{yesterday.strftime('%Y-%m-%d')}"
                r.hset(key, mapping={
                    "messages": msg_count,
                    "inbound": inbound_count,
                    "leads": lead_count,
                })
                r.expire(key, 90 * 86400)  # 90 days TTL
                aggregated += 1

            return {"tenants_aggregated": aggregated, "date": str(yesterday.date())}

    return run_async(_run())


# ─── Subscription reminders ───────────────────────────────────────────────────

@celery_app.task(name="app.core.tasks.send_subscription_reminders")
def send_subscription_reminders():
    """Send email reminders for subscriptions expiring in 3 days."""

    async def _run():
        from app.database.session import AsyncSessionLocal
        from app.database.models import Subscription, SubscriptionStatus, Tenant, User, UserRole
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            three_days = datetime.utcnow() + timedelta(days=3)

            result = await db.execute(
                select(Subscription).where(
                    Subscription.status.in_([
                        SubscriptionStatus.ACTIVE,
                        SubscriptionStatus.TRIALING,
                    ]),
                    Subscription.current_period_end <= three_days,
                    Subscription.current_period_end > datetime.utcnow(),
                )
            )
            expiring = result.scalars().all()

            reminded = []
            for sub in expiring:
                # Get owner email
                owner_result = await db.execute(
                    select(User).where(
                        User.tenant_id == sub.tenant_id,
                        User.role == UserRole.OWNER,
                        User.is_active == True,
                    ).limit(1)
                )
                owner = owner_result.scalar_one_or_none()
                if owner:
                    # In production: send email via SMTP/SES
                    print(f"[Reminder] Subscription expiring for {owner.email} on {sub.current_period_end}")
                    reminded.append(owner.email)

            return {"reminded": reminded, "count": len(reminded)}

    return run_async(_run())
