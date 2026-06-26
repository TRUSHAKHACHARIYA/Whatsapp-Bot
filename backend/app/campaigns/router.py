from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import Campaign, CampaignStatus, Contact, WhatsAppAccount, User
from app.auth.dependencies import get_current_user, require_admin_or_owner

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    template_name: str
    template_language: str = "en"
    template_variables: list = []
    audience_filter: dict = {}
    scheduled_at: Optional[datetime] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    template_name: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    audience_filter: Optional[dict] = None


# ─── Audience builder ─────────────────────────────────────────────────────────

async def build_audience(tenant_id: UUID, filters: dict, db: AsyncSession) -> list[Contact]:
    """Filter contacts based on campaign audience filters."""
    query = select(Contact).where(
        Contact.tenant_id == tenant_id,
        Contact.opted_out == False,
    )

    tags = filters.get("tags", [])
    if tags:
        # PostgreSQL JSON array containment
        for tag in tags:
            query = query.where(Contact.tags.contains([tag]))

    result = await db.execute(query)
    return result.scalars().all()


# ─── Background broadcast task ────────────────────────────────────────────────

async def run_broadcast(campaign_id: UUID, db: AsyncSession):
    """Send broadcast messages to all audience members."""
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        return

    campaign.status = CampaignStatus.RUNNING
    campaign.started_at = datetime.utcnow()
    await db.commit()

    # Get WhatsApp account for tenant
    result = await db.execute(
        select(WhatsAppAccount).where(
            WhatsAppAccount.tenant_id == campaign.tenant_id,
            WhatsAppAccount.is_active == True,
        ).limit(1)
    )
    wa_account = result.scalar_one_or_none()
    if not wa_account:
        campaign.status = CampaignStatus.PAUSED
        await db.commit()
        return

    contacts = await build_audience(campaign.tenant_id, campaign.audience_filter or {}, db)
    campaign.audience_count = len(contacts)

    from app.whatsapp.router import send_whatsapp_message
    sent = 0
    failed = 0

    for contact in contacts:
        try:
            template_payload = {
                "name": campaign.template_name,
                "language": {"code": campaign.template_language},
            }
            if campaign.template_variables:
                template_payload["components"] = [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": str(v)} for v in campaign.template_variables],
                    }
                ]

            await send_whatsapp_message(
                wa_account.phone_number_id,
                wa_account.access_token,
                contact.phone,
                "template",
                template_payload,
            )
            sent += 1
        except Exception as e:
            print(f"[Campaign] Failed to send to {contact.phone}: {e}")
            failed += 1

    campaign.sent_count = sent
    campaign.failed_count = failed
    campaign.status = CampaignStatus.COMPLETED
    campaign.completed_at = datetime.utcnow()
    await db.commit()


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/")
async def list_campaigns(
    status: Optional[CampaignStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Campaign).where(Campaign.tenant_id == current_user.tenant_id).order_by(Campaign.created_at.desc())
    if status:
        query = query.where(Campaign.status == status)

    result = await db.execute(query)
    campaigns = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "template_name": c.template_name,
            "status": c.status,
            "audience_count": c.audience_count,
            "sent_count": c.sent_count,
            "delivered_count": c.delivered_count,
            "read_count": c.read_count,
            "failed_count": c.failed_count,
            "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
            "created_at": c.created_at.isoformat(),
        }
        for c in campaigns
    ]


@router.post("/", status_code=201)
async def create_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    campaign = Campaign(
        tenant_id=current_user.tenant_id,
        **payload.model_dump(),
        status=CampaignStatus.DRAFT,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return {"id": str(campaign.id), "status": campaign.status}


@router.post("/{campaign_id}/send")
async def send_campaign(
    campaign_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign or campaign.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status not in [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED]:
        raise HTTPException(status_code=400, detail=f"Cannot send a campaign in {campaign.status} status.")

    # Queue in background
    background_tasks.add_task(run_broadcast, campaign_id, db)
    return {"message": "Campaign broadcast started.", "campaign_id": str(campaign_id)}


@router.patch("/{campaign_id}")
async def update_campaign(
    campaign_id: UUID,
    payload: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign or campaign.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status != CampaignStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only draft campaigns can be edited.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(campaign, field, value)

    await db.commit()
    return {"id": str(campaign.id)}


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign or campaign.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    await db.delete(campaign)
    await db.commit()
