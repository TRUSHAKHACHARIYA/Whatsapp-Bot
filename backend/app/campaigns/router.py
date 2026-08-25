from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import Campaign, CampaignStatus, User
from app.auth.dependencies import get_current_user, require_admin_or_owner
from app.core.tasks import send_campaign_broadcast

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign or campaign.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status not in [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED]:
        raise HTTPException(status_code=400, detail=f"Cannot send a campaign in {campaign.status} status.")

    # Hand off to the Celery worker — a broadcast can be thousands of contacts,
    # which shouldn't run inline in the API's event loop.
    send_campaign_broadcast.delay(str(campaign_id))
    return {"message": "Campaign broadcast queued.", "campaign_id": str(campaign_id)}


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
