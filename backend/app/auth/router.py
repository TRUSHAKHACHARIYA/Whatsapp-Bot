from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
import re

from app.database.session import get_db
from app.database.models import User, Tenant
from app.auth import service

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    company_name: str
    owner_name: str
    owner_email: EmailStr
    password: str

    def derive_slug(self) -> str:
        slug = re.sub(r"[^a-z0-9]", "-", self.company_name.lower())
        slug = re.sub(r"-+", "-", slug).strip("-")
        return slug[:50]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    tenant_slug: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr
    tenant_slug: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/signup", status_code=201)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)):
    slug = payload.derive_slug()

    try:
        tenant, user = await service.register_tenant(
            db=db,
            company_name=payload.company_name,
            slug=slug,
            owner_name=payload.owner_name,
            owner_email=payload.owner_email,
            password=payload.password,
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(status_code=400, detail="Company slug already exists. Try a different company name.")
        raise HTTPException(status_code=500, detail="Registration failed.")

    access_token = service.create_access_token(str(user.id), str(tenant.id), user.role)
    refresh_token = service.create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "tenant_id": str(tenant.id),
            "tenant_slug": tenant.slug,
            "tenant_name": tenant.name,
        },
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await service.authenticate_user(db, payload.email, payload.password, payload.tenant_slug)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or tenant not found.",
        )

    tenant = await db.get(Tenant, user.tenant_id)

    access_token = service.create_access_token(str(user.id), str(user.tenant_id), user.role)
    refresh_token = service.create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "tenant_id": str(user.tenant_id),
            "tenant_slug": tenant.slug,
            "tenant_name": tenant.name,
        },
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        data = service.decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise ValueError("Not a refresh token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token.")

    result = await db.execute(select(User).where(User.id == data["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found.")

    new_access = service.create_access_token(str(user.id), str(user.tenant_id), user.role)
    new_refresh = service.create_refresh_token(str(user.id))
    return TokenResponse(access_token=new_access, refresh_token=new_refresh, user={"id": str(user.id)})


@router.post("/password-reset/request")
async def request_password_reset(payload: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    # In production: generate token, save to DB, send email
    # For MVP: return success always (don't leak user existence)
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/password-reset/confirm")
async def confirm_password_reset(payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(
            User.reset_token == payload.token,
            User.reset_token_expires > datetime.utcnow(),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    user.hashed_password = service.hash_password(payload.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()
    return {"message": "Password updated successfully."}
