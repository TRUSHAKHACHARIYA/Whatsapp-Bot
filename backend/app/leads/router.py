from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.database.models import Lead, Contact, User, LeadStage
from app.auth.dependencies import get_current_user, require_any_agent

router = APIRouter(prefix="/leads", tags=["leads"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    contact_id: UUID
    stage: LeadStage = LeadStage.NEW
    source: Optional[str] = None
    notes: Optional[str] = None
    value: Optional[float] = None
    assigned_agent_id: Optional[UUID] = None


class LeadUpdate(BaseModel):
    stage: Optional[LeadStage] = None
    notes: Optional[str] = None
    value: Optional[float] = None
    assigned_agent_id: Optional[UUID] = None


class LeadOut(BaseModel):
    id: UUID
    contact_id: UUID
    stage: LeadStage
    source: Optional[str]
    notes: Optional[str]
    value: Optional[float]
    assigned_agent_id: Optional[UUID]
    contact_name: Optional[str]
    contact_phone: Optional[str]

    class Config:
        from_attributes = True


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/")
async def list_leads(
    stage: Optional[LeadStage] = None,
    assigned_to_me: bool = False,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    query = (
        select(Lead)
        .join(Contact, Lead.contact_id == Contact.id)
        .where(Lead.tenant_id == current_user.tenant_id)
        .options(selectinload(Lead.contact))
        .order_by(Lead.created_at.desc())
    )

    if stage:
        query = query.where(Lead.stage == stage)
    if assigned_to_me:
        query = query.where(Lead.assigned_agent_id == current_user.id)
    if search:
        query = query.where(
            Contact.name.ilike(f"%{search}%") | Contact.phone.ilike(f"%{search}%")
        )

    result = await db.execute(query.offset(skip).limit(limit))
    leads = result.scalars().all()

    return [
        {
            "id": str(l.id),
            "stage": l.stage,
            "source": l.source,
            "notes": l.notes,
            "value": l.value,
            "assigned_agent_id": str(l.assigned_agent_id) if l.assigned_agent_id else None,
            "contact": {
                "id": str(l.contact.id),
                "name": l.contact.name,
                "phone": l.contact.phone,
                "email": l.contact.email,
            },
            "created_at": l.created_at.isoformat(),
        }
        for l in leads
    ]


@router.get("/stats")
async def lead_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    """Pipeline counts per stage."""
    result = await db.execute(
        select(Lead.stage, func.count(Lead.id))
        .where(Lead.tenant_id == current_user.tenant_id)
        .group_by(Lead.stage)
    )
    rows = result.all()
    stats = {row[0]: row[1] for row in rows}
    return {
        "total": sum(stats.values()),
        "by_stage": {stage.value: stats.get(stage, 0) for stage in LeadStage},
    }


@router.post("/", status_code=201)
async def create_lead(
    payload: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    # Verify contact belongs to tenant
    contact = await db.get(Contact, payload.contact_id)
    if not contact or contact.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Contact not found.")

    lead = Lead(tenant_id=current_user.tenant_id, **payload.model_dump())
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return {"id": str(lead.id), "stage": lead.stage}


@router.patch("/{lead_id}")
async def update_lead(
    lead_id: UUID,
    payload: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    lead = await db.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Lead not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)

    await db.commit()
    return {"id": str(lead.id), "stage": lead.stage}


@router.delete("/{lead_id}", status_code=204)
async def delete_lead(
    lead_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any_agent),
):
    lead = await db.get(Lead, lead_id)
    if not lead or lead.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Lead not found.")
    await db.delete(lead)
    await db.commit()
