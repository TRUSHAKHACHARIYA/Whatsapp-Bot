from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.database.models import Form, FormField, FormResponse, Contact, FormFieldType, User
from app.auth.dependencies import get_current_user, require_admin_or_owner

router = APIRouter(prefix="/forms", tags=["forms"])


class FormFieldSchema(BaseModel):
    label: str
    field_type: FormFieldType
    is_required: bool = True
    order: int = 0
    options: list[str] = []
    placeholder: Optional[str] = None
    maps_to: Optional[str] = None  # name, email, phone, city


class FormCreate(BaseModel):
    name: str
    description: Optional[str] = None
    fields: list[FormFieldSchema] = []


class FormUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class FormFieldUpdate(BaseModel):
    label: Optional[str] = None
    field_type: Optional[FormFieldType] = None
    is_required: Optional[bool] = None
    order: Optional[int] = None
    options: Optional[list[str]] = None
    placeholder: Optional[str] = None
    maps_to: Optional[str] = None


class FormResponseSubmit(BaseModel):
    answers: dict  # field_id -> value
    contact_phone: Optional[str] = None


@router.get("/")
async def list_forms(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Form)
        .where(Form.tenant_id == current_user.tenant_id)
        .options(selectinload(Form.fields))
        .order_by(Form.created_at.desc())
    )
    forms = result.scalars().all()
    return [
        {
            "id": str(f.id),
            "name": f.name,
            "description": f.description,
            "is_active": f.is_active,
            "response_count": f.response_count,
            "field_count": len(f.fields),
            "created_at": f.created_at.isoformat(),
        }
        for f in forms
    ]


@router.get("/{form_id}")
async def get_form(
    form_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Form)
        .where(Form.id == form_id, Form.tenant_id == current_user.tenant_id)
        .options(selectinload(Form.fields))
    )
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found.")
    return {
        "id": str(form.id),
        "name": form.name,
        "description": form.description,
        "is_active": form.is_active,
        "response_count": form.response_count,
        "fields": [
            {
                "id": str(ff.id),
                "label": ff.label,
                "field_type": ff.field_type,
                "is_required": ff.is_required,
                "order": ff.order,
                "options": ff.options,
                "placeholder": ff.placeholder,
                "maps_to": ff.maps_to,
            }
            for ff in sorted(form.fields, key=lambda x: x.order)
        ],
    }


@router.post("/", status_code=201)
async def create_form(
    payload: FormCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    form = Form(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        description=payload.description,
    )
    db.add(form)
    await db.flush()

    for i, field_data in enumerate(payload.fields):
        field = FormField(
            form_id=form.id,
            order=field_data.order if field_data.order else i,
            **field_data.model_dump(exclude={"order"} if not field_data.order else set()),
        )
        db.add(field)

    await db.commit()
    await db.refresh(form)
    return {"id": str(form.id), "name": form.name}


@router.patch("/{form_id}")
async def update_form(
    form_id: UUID,
    payload: FormUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    form = await db.get(Form, form_id)
    if not form or form.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Form not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(form, field, value)
    await db.commit()
    return {"id": str(form.id)}


@router.delete("/{form_id}", status_code=204)
async def delete_form(
    form_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    form = await db.get(Form, form_id)
    if not form or form.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Form not found.")
    await db.delete(form)
    await db.commit()


@router.post("/{form_id}/fields", status_code=201)
async def add_field(
    form_id: UUID,
    payload: FormFieldSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    form = await db.get(Form, form_id)
    if not form or form.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Form not found.")
    field = FormField(form_id=form_id, **payload.model_dump())
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return {"id": str(field.id)}


@router.patch("/{form_id}/fields/{field_id}")
async def update_field(
    form_id: UUID,
    field_id: UUID,
    payload: FormFieldUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    form = await db.get(Form, form_id)
    if not form or form.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Form not found.")
    field = await db.get(FormField, field_id)
    if not field or field.form_id != form_id:
        raise HTTPException(status_code=404, detail="Field not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(field, k, v)
    await db.commit()
    return {"id": str(field.id)}


@router.delete("/{form_id}/fields/{field_id}", status_code=204)
async def delete_field(
    form_id: UUID,
    field_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    form = await db.get(Form, form_id)
    if not form or form.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Form not found.")
    field = await db.get(FormField, field_id)
    if not field or field.form_id != form_id:
        raise HTTPException(status_code=404, detail="Field not found.")
    await db.delete(field)
    await db.commit()


@router.post("/{form_id}/responses", status_code=201)
async def submit_response(
    form_id: UUID,
    payload: FormResponseSubmit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a form response. Optionally links to a contact by phone."""
    result = await db.execute(
        select(Form)
        .where(Form.id == form_id, Form.tenant_id == current_user.tenant_id, Form.is_active == True)
        .options(selectinload(Form.fields))
    )
    form = result.scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or inactive.")

    # Validate required fields
    for field in form.fields:
        if field.is_required and str(field.id) not in payload.answers:
            raise HTTPException(status_code=422, detail=f"Field '{field.label}' is required.")

    # Resolve or create contact from mapped fields
    contact_id = None
    if payload.contact_phone:
        result = await db.execute(
            select(Contact).where(
                Contact.tenant_id == current_user.tenant_id,
                Contact.phone == payload.contact_phone,
            )
        )
        contact = result.scalar_one_or_none()
        if not contact:
            # Auto-create contact from mapped form fields
            name = None
            email = None
            for field in form.fields:
                if field.maps_to == "name":
                    name = payload.answers.get(str(field.id))
                elif field.maps_to == "email":
                    email = payload.answers.get(str(field.id))
            contact = Contact(
                tenant_id=current_user.tenant_id,
                phone=payload.contact_phone,
                name=name,
                email=email,
                source="whatsapp_form",
            )
            db.add(contact)
            await db.flush()
        contact_id = contact.id

    response = FormResponse(
        form_id=form_id,
        tenant_id=current_user.tenant_id,
        contact_id=contact_id,
        answers=payload.answers,
    )
    db.add(response)
    form.response_count = (form.response_count or 0) + 1
    await db.commit()
    return {"id": str(response.id), "contact_id": str(contact_id) if contact_id else None}


@router.get("/{form_id}/responses")
async def list_responses(
    form_id: UUID,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    form = await db.get(Form, form_id)
    if not form or form.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Form not found.")
    result = await db.execute(
        select(FormResponse)
        .where(FormResponse.form_id == form_id)
        .options(selectinload(FormResponse.form))
        .order_by(FormResponse.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    responses = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "contact_id": str(r.contact_id) if r.contact_id else None,
            "answers": r.answers,
            "created_at": r.created_at.isoformat(),
        }
        for r in responses
    ]
