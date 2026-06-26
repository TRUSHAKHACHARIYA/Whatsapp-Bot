"""
WhatsApp Templates router.
Lists approved templates from Meta, caches them locally, allows creation.
"""
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import get_db
from app.database.models import WhatsAppAccount, User
from app.auth.dependencies import get_current_user, require_admin_or_owner

router = APIRouter(prefix="/templates", tags=["templates"])


class TemplateCreate(BaseModel):
    name: str
    language: str = "en"
    category: str = "MARKETING"  # MARKETING | UTILITY | AUTHENTICATION
    header: Optional[dict] = None  # {"type": "TEXT", "text": "Hello"}
    body: str
    footer: Optional[str] = None
    buttons: Optional[list[dict]] = None


@router.get("/")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch all approved templates from Meta for the tenant's WABA."""
    result = await db.execute(
        select(WhatsAppAccount).where(
            WhatsAppAccount.tenant_id == current_user.tenant_id,
            WhatsAppAccount.is_active == True,
        ).limit(1)
    )
    wa_account = result.scalar_one_or_none()
    if not wa_account:
        raise HTTPException(status_code=404, detail="No WhatsApp account connected.")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.WHATSAPP_API_URL}/{wa_account.waba_id}/message_templates",
                headers={"Authorization": f"Bearer {wa_account.access_token}"},
                params={"limit": 100, "fields": "name,status,language,category,components"},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Meta API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch templates: {str(e)}")

    templates = data.get("data", [])
    return {
        "total": len(templates),
        "templates": [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "status": t.get("status"),
                "language": t.get("language"),
                "category": t.get("category"),
                "components": t.get("components", []),
            }
            for t in templates
        ],
    }


@router.post("/")
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    """Submit a new template to Meta for approval."""
    result = await db.execute(
        select(WhatsAppAccount).where(
            WhatsAppAccount.tenant_id == current_user.tenant_id,
            WhatsAppAccount.is_active == True,
        ).limit(1)
    )
    wa_account = result.scalar_one_or_none()
    if not wa_account:
        raise HTTPException(status_code=404, detail="No WhatsApp account connected.")

    # Build components
    components = []
    if payload.header:
        components.append({"type": "HEADER", **payload.header})
    components.append({"type": "BODY", "text": payload.body})
    if payload.footer:
        components.append({"type": "FOOTER", "text": payload.footer})
    if payload.buttons:
        components.append({"type": "BUTTONS", "buttons": payload.buttons})

    request_body = {
        "name": payload.name.lower().replace(" ", "_"),
        "language": payload.language,
        "category": payload.category,
        "components": components,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.WHATSAPP_API_URL}/{wa_account.waba_id}/message_templates",
                headers={
                    "Authorization": f"Bearer {wa_account.access_token}",
                    "Content-Type": "application/json",
                },
                json=request_body,
                timeout=15,
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"Meta rejected template: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{template_name}")
async def delete_template(
    template_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    """Delete a template from Meta."""
    result = await db.execute(
        select(WhatsAppAccount).where(
            WhatsAppAccount.tenant_id == current_user.tenant_id,
            WhatsAppAccount.is_active == True,
        ).limit(1)
    )
    wa_account = result.scalar_one_or_none()
    if not wa_account:
        raise HTTPException(status_code=404, detail="No WhatsApp account connected.")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{settings.WHATSAPP_API_URL}/{wa_account.waba_id}/message_templates",
                headers={"Authorization": f"Bearer {wa_account.access_token}"},
                params={"name": template_name},
                timeout=10,
            )
            response.raise_for_status()
            return {"message": f"Template '{template_name}' deleted."}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=400, detail=f"Meta error: {e.response.text}")
