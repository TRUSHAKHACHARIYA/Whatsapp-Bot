import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import get_db
from app.database.models import Subscription, Tenant, SubscriptionPlan, SubscriptionStatus, User
from app.auth.dependencies import get_current_user, require_owner

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

PLAN_CONFIG = {
    SubscriptionPlan.STARTER: {
        "name": "Starter",
        "price_monthly": 99900,   # paise (₹999)
        "price_annual": 899900,   # paise (₹8999)
        "max_agents": 2,
        "max_conversations_per_month": 1000,
        "max_whatsapp_numbers": 1,
        "razorpay_plan_id_monthly": "plan_starter_monthly",
        "razorpay_plan_id_annual": "plan_starter_annual",
    },
    SubscriptionPlan.GROWTH: {
        "name": "Growth",
        "price_monthly": 249900,
        "price_annual": 2199900,
        "max_agents": 10,
        "max_conversations_per_month": 10000,
        "max_whatsapp_numbers": 3,
        "razorpay_plan_id_monthly": "plan_growth_monthly",
        "razorpay_plan_id_annual": "plan_growth_annual",
    },
    SubscriptionPlan.ENTERPRISE: {
        "name": "Enterprise",
        "price_monthly": 699900,
        "price_annual": 5999900,
        "max_agents": 999,
        "max_conversations_per_month": 999999,
        "max_whatsapp_numbers": 999,
        "razorpay_plan_id_monthly": "plan_enterprise_monthly",
        "razorpay_plan_id_annual": "plan_enterprise_annual",
    },
}


def get_razorpay_client():
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


class CreateSubscriptionPayload(BaseModel):
    plan: SubscriptionPlan
    billing_cycle: str = "monthly"  # monthly | annual


class VerifyPaymentPayload(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


@router.get("/me")
async def get_my_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription).where(Subscription.tenant_id == current_user.tenant_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found.")

    plan_cfg = PLAN_CONFIG.get(sub.plan, {})
    return {
        "id": str(sub.id),
        "plan": sub.plan,
        "status": sub.status,
        "plan_name": plan_cfg.get("name"),
        "max_agents": sub.max_agents,
        "max_conversations_per_month": sub.max_conversations_per_month,
        "max_whatsapp_numbers": sub.max_whatsapp_numbers,
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "razorpay_subscription_id": sub.razorpay_subscription_id,
        "cancelled_at": sub.cancelled_at.isoformat() if sub.cancelled_at else None,
    }


@router.get("/plans")
async def list_plans():
    """Public endpoint returning all plan details."""
    return [
        {
            "id": plan.value,
            "name": cfg["name"],
            "price_monthly": cfg["price_monthly"] // 100,
            "price_annual": cfg["price_annual"] // 100,
            "max_agents": cfg["max_agents"],
            "max_conversations_per_month": cfg["max_conversations_per_month"],
            "max_whatsapp_numbers": cfg["max_whatsapp_numbers"],
        }
        for plan, cfg in PLAN_CONFIG.items()
    ]


@router.post("/create")
async def create_subscription(
    payload: CreateSubscriptionPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    """Create a Razorpay subscription for the tenant."""
    plan_cfg = PLAN_CONFIG[payload.plan]
    plan_id_key = f"razorpay_plan_id_{payload.billing_cycle}"
    razorpay_plan_id = plan_cfg[plan_id_key]

    client = get_razorpay_client()

    # Create or get Razorpay customer
    result = await db.execute(
        select(Subscription).where(Subscription.tenant_id == current_user.tenant_id)
    )
    sub = result.scalar_one_or_none()

    customer_id = sub.razorpay_customer_id if sub else None
    if not customer_id:
        tenant = await db.get(Tenant, current_user.tenant_id)
        customer = client.customer.create({
            "name": tenant.name,
            "email": current_user.email,
        })
        customer_id = customer["id"]

    # Create subscription
    rz_sub = client.subscription.create({
        "plan_id": razorpay_plan_id,
        "customer_notify": 1,
        "total_count": 12 if payload.billing_cycle == "monthly" else 1,
        "quantity": 1,
    })

    # Update local subscription record
    if sub:
        sub.razorpay_subscription_id = rz_sub["id"]
        sub.razorpay_customer_id = customer_id
        sub.plan = payload.plan
        sub.status = SubscriptionStatus.TRIALING
    else:
        sub = Subscription(
            tenant_id=current_user.tenant_id,
            plan=payload.plan,
            status=SubscriptionStatus.TRIALING,
            razorpay_subscription_id=rz_sub["id"],
            razorpay_customer_id=customer_id,
            max_agents=plan_cfg["max_agents"],
            max_conversations_per_month=plan_cfg["max_conversations_per_month"],
            max_whatsapp_numbers=plan_cfg["max_whatsapp_numbers"],
        )
        db.add(sub)

    await db.commit()

    return {
        "razorpay_subscription_id": rz_sub["id"],
        "razorpay_key_id": settings.RAZORPAY_KEY_ID,
        "plan": payload.plan,
    }


@router.post("/verify-payment")
async def verify_payment(
    payload: VerifyPaymentPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify Razorpay payment signature and activate subscription."""
    generated = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{payload.razorpay_payment_id}|{payload.razorpay_subscription_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(generated, payload.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed.")

    result = await db.execute(
        select(Subscription).where(Subscription.tenant_id == current_user.tenant_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    plan_cfg = PLAN_CONFIG[sub.plan]
    sub.status = SubscriptionStatus.ACTIVE
    sub.current_period_start = datetime.utcnow()
    sub.current_period_end = datetime.utcnow() + timedelta(days=30)
    sub.max_agents = plan_cfg["max_agents"]
    sub.max_conversations_per_month = plan_cfg["max_conversations_per_month"]
    sub.max_whatsapp_numbers = plan_cfg["max_whatsapp_numbers"]

    await db.commit()
    return {"status": "active", "plan": sub.plan}


@router.post("/cancel")
async def cancel_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    result = await db.execute(
        select(Subscription).where(Subscription.tenant_id == current_user.tenant_id)
    )
    sub = result.scalar_one_or_none()
    if not sub or not sub.razorpay_subscription_id:
        raise HTTPException(status_code=404, detail="No active subscription found.")

    client = get_razorpay_client()
    try:
        client.subscription.cancel(sub.razorpay_subscription_id, {"cancel_at_cycle_end": 1})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Razorpay error: {str(e)}")

    sub.status = SubscriptionStatus.CANCELLED
    sub.cancelled_at = datetime.utcnow()
    await db.commit()
    return {"message": "Subscription cancelled. Access continues until period end."}


@router.post("/webhook")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Razorpay subscription webhooks."""
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()

    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    import json
    event = json.loads(body)
    event_type = event.get("event")

    if event_type == "subscription.activated":
        rz_sub_id = event["payload"]["subscription"]["entity"]["id"]
        result = await db.execute(
            select(Subscription).where(Subscription.razorpay_subscription_id == rz_sub_id)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = SubscriptionStatus.ACTIVE
            await db.commit()

    elif event_type in ("subscription.cancelled", "subscription.completed"):
        rz_sub_id = event["payload"]["subscription"]["entity"]["id"]
        result = await db.execute(
            select(Subscription).where(Subscription.razorpay_subscription_id == rz_sub_id)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = SubscriptionStatus.CANCELLED
            sub.cancelled_at = datetime.utcnow()
            await db.commit()

    elif event_type == "subscription.charged":
        rz_sub_id = event["payload"]["subscription"]["entity"]["id"]
        result = await db.execute(
            select(Subscription).where(Subscription.razorpay_subscription_id == rz_sub_id)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = SubscriptionStatus.ACTIVE
            sub.current_period_start = datetime.utcnow()
            sub.current_period_end = datetime.utcnow() + timedelta(days=30)
            await db.commit()

    return {"status": "ok"}
