from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.models import User, Tenant, Subscription, SubscriptionPlan, SubscriptionStatus

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, tenant_id: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


async def get_user_by_email(db: AsyncSession, email: str, tenant_id: UUID) -> Optional[User]:
    result = await db.execute(
        select(User).where(User.email == email, User.tenant_id == tenant_id)
    )
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str, tenant_slug: str) -> Optional[User]:
    # Resolve tenant from slug
    result = await db.execute(select(Tenant).where(Tenant.slug == tenant_slug, Tenant.is_active == True))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return None

    user = await get_user_by_email(db, email, tenant.id)
    if not user or not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


async def register_tenant(
    db: AsyncSession,
    company_name: str,
    slug: str,
    owner_name: str,
    owner_email: str,
    password: str,
) -> tuple[Tenant, User]:
    # Create tenant
    tenant = Tenant(name=company_name, slug=slug)
    db.add(tenant)
    await db.flush()

    # Create owner user
    user = User(
        tenant_id=tenant.id,
        name=owner_name,
        email=owner_email,
        hashed_password=hash_password(password),
        role="owner",
        email_verified=False,
    )
    db.add(user)

    # Create trial subscription
    subscription = Subscription(
        tenant_id=tenant.id,
        plan=SubscriptionPlan.STARTER,
        status=SubscriptionStatus.TRIALING,
        max_agents=2,
        max_conversations_per_month=1000,
        max_whatsapp_numbers=1,
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow() + timedelta(days=14),
    )
    db.add(subscription)
    await db.flush()

    return tenant, user
