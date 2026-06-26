from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import Tenant, User, UserRole
from app.auth.dependencies import get_current_user, require_admin_or_owner, require_owner
from app.auth.service import hash_password

router = APIRouter(prefix="/tenants", tags=["tenants"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class TenantProfileUpdate(BaseModel):
    name: Optional[str] = None
    primary_color: Optional[str] = None
    logo_url: Optional[str] = None
    custom_domain: Optional[str] = None
    email_from_name: Optional[str] = None
    email_from_address: Optional[str] = None


class InviteTeamMember(BaseModel):
    name: str
    email: EmailStr
    role: UserRole
    password: str  # In production: send invite email instead


class UpdateTeamMember(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str


# ─── Tenant profile ──────────────────────────────────────────────────────────

@router.get("/me")
async def get_tenant_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "logo_url": tenant.logo_url,
        "primary_color": tenant.primary_color,
        "custom_domain": tenant.custom_domain,
        "email_from_name": tenant.email_from_name,
        "email_from_address": tenant.email_from_address,
        "settings": tenant.settings,
        "created_at": tenant.created_at.isoformat(),
    }


@router.patch("/me")
async def update_tenant_profile(
    payload: TenantProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "custom_domain" and value:
            # Check uniqueness
            result = await db.execute(
                select(Tenant).where(Tenant.custom_domain == value, Tenant.id != tenant.id)
            )
            if result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Domain already in use.")
        setattr(tenant, field, value)

    await db.commit()
    return {"message": "Profile updated."}


# ─── Team management ─────────────────────────────────────────────────────────

@router.get("/team")
async def list_team(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    result = await db.execute(
        select(User)
        .where(User.tenant_id == current_user.tenant_id)
        .order_by(User.created_at)
    )
    members = result.scalars().all()
    return [
        {
            "id": str(m.id),
            "name": m.name,
            "email": m.email,
            "role": m.role,
            "is_active": m.is_active,
            "is_online": m.is_online,
            "last_seen_at": m.last_seen_at.isoformat() if m.last_seen_at else None,
            "created_at": m.created_at.isoformat(),
        }
        for m in members
    ]


@router.post("/team", status_code=201)
async def invite_team_member(
    payload: InviteTeamMember,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    # Only owner can create admins
    if payload.role == UserRole.OWNER and current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=403, detail="Only owner can assign owner role.")

    # Check subscription limits
    from app.database.models import Subscription
    result = await db.execute(
        select(Subscription).where(Subscription.tenant_id == current_user.tenant_id)
    )
    sub = result.scalar_one_or_none()

    result = await db.execute(
        select(User).where(User.tenant_id == current_user.tenant_id, User.is_active == True)
    )
    current_count = len(result.scalars().all())

    if sub and current_count >= sub.max_agents:
        raise HTTPException(
            status_code=403,
            detail=f"Agent limit reached ({sub.max_agents}). Please upgrade your plan.",
        )

    # Check duplicate email
    result = await db.execute(
        select(User).where(User.tenant_id == current_user.tenant_id, User.email == payload.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists in this workspace.")

    user = User(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": str(user.id), "email": user.email, "role": user.role}


@router.patch("/team/{user_id}")
async def update_team_member(
    user_id: UUID,
    payload: UpdateTeamMember,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    member = await db.get(User, user_id)
    if not member or member.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Team member not found.")
    if member.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account here.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, field, value)
    await db.commit()
    return {"id": str(member.id)}


@router.delete("/team/{user_id}", status_code=204)
async def remove_team_member(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    member = await db.get(User, user_id)
    if not member or member.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Team member not found.")
    if member.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself.")
    member.is_active = False
    await db.commit()


# ─── Current user profile ─────────────────────────────────────────────────────

@router.get("/profile/me")
async def my_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "avatar_url": current_user.avatar_url,
    }


@router.patch("/profile/me")
async def update_my_profile(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed = {"name", "avatar_url"}
    for field in allowed:
        if field in payload:
            setattr(current_user, field, payload[field])
    await db.commit()
    return {"message": "Profile updated."}


@router.post("/profile/change-password")
async def change_password(
    payload: ChangePasswordPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.auth.service import verify_password
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    current_user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return {"message": "Password changed successfully."}
