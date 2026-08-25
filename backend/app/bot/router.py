from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import BotFlow, User, Tenant
from app.auth.dependencies import get_current_user, require_admin_or_owner
from app.bot.templates import BOT_FLOW_TEMPLATES, render_template

router = APIRouter(prefix="/bot", tags=["bot"])


class CreateFlowFromTemplate(BaseModel):
    template_key: str


class BotFlowCreate(BaseModel):
    name: str
    flow_data: dict = {}


class BotFlowUpdate(BaseModel):
    name: Optional[str] = None
    flow_data: Optional[dict] = None


class FlowNode(BaseModel):
    id: str
    type: str  # welcome | menu | text | collect_info | agent_handoff | fallback | faq
    data: dict
    position: Optional[dict] = None


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None


class SaveFlowPayload(BaseModel):
    nodes: list[FlowNode]
    edges: list[FlowEdge]


@router.get("/templates")
async def list_templates(current_user: User = Depends(get_current_user)):
    """Predefined starting flows a business can pick during onboarding."""
    return [
        {"key": t["key"], "name": t["name"], "description": t["description"]}
        for t in BOT_FLOW_TEMPLATES.values()
    ]


@router.post("/flows/from-template", status_code=201)
async def create_flow_from_template(
    payload: CreateFlowFromTemplate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    """Create a new (inactive) flow pre-filled from a predefined template."""
    if payload.template_key not in BOT_FLOW_TEMPLATES:
        raise HTTPException(status_code=404, detail="Unknown template.")

    tenant = await db.get(Tenant, current_user.tenant_id)
    template = BOT_FLOW_TEMPLATES[payload.template_key]
    flow = BotFlow(
        tenant_id=current_user.tenant_id,
        name=template["name"],
        flow_data=render_template(payload.template_key, tenant.name if tenant else ""),
        is_active=False,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return {"id": str(flow.id), "name": flow.name}


@router.get("/flows")
async def list_flows(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(BotFlow)
        .where(BotFlow.tenant_id == current_user.tenant_id)
        .order_by(BotFlow.created_at.desc())
    )
    flows = result.scalars().all()
    return [
        {
            "id": str(f.id),
            "name": f.name,
            "is_active": f.is_active,
            "node_count": len((f.flow_data or {}).get("nodes", [])),
            "created_at": f.created_at.isoformat(),
            "updated_at": f.updated_at.isoformat(),
        }
        for f in flows
    ]


@router.get("/flows/{flow_id}")
async def get_flow(
    flow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    flow = await db.get(BotFlow, flow_id)
    if not flow or flow.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return {
        "id": str(flow.id),
        "name": flow.name,
        "is_active": flow.is_active,
        "flow_data": flow.flow_data,
        "updated_at": flow.updated_at.isoformat(),
    }


@router.post("/flows", status_code=201)
async def create_flow(
    payload: BotFlowCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    flow = BotFlow(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        flow_data=payload.flow_data,
        is_active=False,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return {"id": str(flow.id), "name": flow.name}


@router.patch("/flows/{flow_id}")
async def update_flow(
    flow_id: UUID,
    payload: BotFlowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    flow = await db.get(BotFlow, flow_id)
    if not flow or flow.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Flow not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(flow, field, value)
    await db.commit()
    return {"id": str(flow.id)}


@router.post("/flows/{flow_id}/save")
async def save_flow_canvas(
    flow_id: UUID,
    payload: SaveFlowPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    """Save the full node/edge graph from the visual builder."""
    flow = await db.get(BotFlow, flow_id)
    if not flow or flow.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Flow not found.")
    flow.flow_data = {
        "nodes": [n.model_dump() for n in payload.nodes],
        "edges": [e.model_dump() for e in payload.edges],
    }
    await db.commit()
    return {"message": "Flow saved.", "node_count": len(payload.nodes)}


@router.post("/flows/{flow_id}/activate")
async def activate_flow(
    flow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    """Activate this flow and deactivate all others for the tenant."""
    flow = await db.get(BotFlow, flow_id)
    if not flow or flow.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Flow not found.")

    nodes = (flow.flow_data or {}).get("nodes", [])
    if not nodes:
        raise HTTPException(status_code=400, detail="Cannot activate an empty flow.")

    # Deactivate all other flows
    result = await db.execute(
        select(BotFlow).where(
            BotFlow.tenant_id == current_user.tenant_id,
            BotFlow.id != flow_id,
        )
    )
    for other in result.scalars().all():
        other.is_active = False

    flow.is_active = True
    await db.commit()
    return {"message": f"Flow '{flow.name}' is now active.", "flow_id": str(flow.id)}


@router.post("/flows/{flow_id}/deactivate")
async def deactivate_flow(
    flow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    flow = await db.get(BotFlow, flow_id)
    if not flow or flow.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Flow not found.")
    flow.is_active = False
    await db.commit()
    return {"message": "Flow deactivated."}


@router.delete("/flows/{flow_id}", status_code=204)
async def delete_flow(
    flow_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    flow = await db.get(BotFlow, flow_id)
    if not flow or flow.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Flow not found.")
    if flow.is_active:
        raise HTTPException(status_code=400, detail="Deactivate the flow before deleting.")
    await db.delete(flow)
    await db.commit()


@router.get("/flows/{flow_id}/test")
async def test_flow(
    flow_id: UUID,
    message: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dry-run the bot engine against a test message and return what it would send."""
    flow = await db.get(BotFlow, flow_id)
    if not flow or flow.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Flow not found.")

    nodes = (flow.flow_data or {}).get("nodes", [])
    from app.bot.engine import find_node_by_type, format_menu_text, find_node_by_id

    responses = []
    message_lower = message.strip().lower()

    # Check FAQ match first
    from app.bot.engine import match_faq
    faq_answer = await match_faq(message_lower, current_user.tenant_id, db)
    if faq_answer:
        responses.append({"type": "faq_match", "content": faq_answer})
        return {"matched": "faq", "responses": responses}

    if message_lower in ["hi", "hello", "menu", "start"]:
        welcome = find_node_by_type(nodes, "welcome")
        menu = find_node_by_type(nodes, "menu")
        if welcome:
            responses.append({"type": "text", "content": welcome.get("data", {}).get("text")})
        if menu:
            responses.append({"type": "menu", "content": format_menu_text(menu)})
        return {"matched": "welcome", "responses": responses}

    return {"matched": "fallback", "responses": [{"type": "text", "content": "Sorry, I didn't understand that. Reply menu to see options."}]}
