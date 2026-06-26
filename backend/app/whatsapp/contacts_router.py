"""
Contacts router — manage WhatsApp contacts, tags, opt-out, bulk import.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import Contact, User
from app.auth.dependencies import get_current_user, require_admin_or_owner

router = APIRouter(prefix="/contacts", tags=["contacts"])


class ContactCreate(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    tags: list[str] = []
    source: Optional[str] = "manual"
    custom_attributes: dict = {}


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    tags: Optional[list[str]] = None
    custom_attributes: Optional[dict] = None
    opted_out: Optional[bool] = None


@router.get("/")
async def list_contacts(
    search: Optional[str] = None,
    tag: Optional[str] = None,
    opted_out: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(Contact)
        .where(Contact.tenant_id == current_user.tenant_id)
        .order_by(Contact.created_at.desc())
    )
    if search:
        query = query.where(
            or_(
                Contact.name.ilike(f"%{search}%"),
                Contact.phone.ilike(f"%{search}%"),
                Contact.email.ilike(f"%{search}%"),
            )
        )
    if tag:
        query = query.where(Contact.tags.contains([tag]))
    if opted_out is not None:
        query = query.where(Contact.opted_out == opted_out)

    result = await db.execute(query.offset(skip).limit(limit))
    contacts = result.scalars().all()

    # Total count
    count_result = await db.execute(
        select(func.count(Contact.id)).where(Contact.tenant_id == current_user.tenant_id)
    )
    total = count_result.scalar() or 0

    return {
        "total": total,
        "contacts": [
            {
                "id": str(c.id),
                "phone": c.phone,
                "name": c.name,
                "email": c.email,
                "city": c.city,
                "tags": c.tags,
                "source": c.source,
                "opted_out": c.opted_out,
                "created_at": c.created_at.isoformat(),
            }
            for c in contacts
        ],
    }


@router.get("/stats")
async def contact_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = await db.scalar(
        select(func.count(Contact.id)).where(Contact.tenant_id == current_user.tenant_id)
    ) or 0
    opted_out = await db.scalar(
        select(func.count(Contact.id)).where(
            Contact.tenant_id == current_user.tenant_id,
            Contact.opted_out == True,
        )
    ) or 0
    return {
        "total": total,
        "active": total - opted_out,
        "opted_out": opted_out,
    }


@router.get("/tags")
async def list_all_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all unique tags used across contacts for this tenant."""
    result = await db.execute(
        select(Contact.tags).where(
            Contact.tenant_id == current_user.tenant_id,
            Contact.tags != [],
        )
    )
    all_tags: set[str] = set()
    for row in result.scalars().all():
        if row:
            all_tags.update(row)
    return sorted(list(all_tags))


@router.get("/{contact_id}")
async def get_contact(
    contact_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contact = await db.get(Contact, contact_id)
    if not contact or contact.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Contact not found.")
    return {
        "id": str(contact.id),
        "phone": contact.phone,
        "name": contact.name,
        "email": contact.email,
        "city": contact.city,
        "tags": contact.tags,
        "source": contact.source,
        "opted_out": contact.opted_out,
        "custom_attributes": contact.custom_attributes,
        "created_at": contact.created_at.isoformat(),
    }


@router.post("/", status_code=201)
async def create_contact(
    payload: ContactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    # Check for duplicate phone
    result = await db.execute(
        select(Contact).where(
            Contact.tenant_id == current_user.tenant_id,
            Contact.phone == payload.phone,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Contact with this phone already exists.")

    contact = Contact(tenant_id=current_user.tenant_id, **payload.model_dump())
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return {"id": str(contact.id), "phone": contact.phone}


@router.patch("/{contact_id}")
async def update_contact(
    contact_id: UUID,
    payload: ContactUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contact = await db.get(Contact, contact_id)
    if not contact or contact.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Contact not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)

    await db.commit()
    return {"id": str(contact.id)}


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    contact = await db.get(Contact, contact_id)
    if not contact or contact.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Contact not found.")
    await db.delete(contact)
    await db.commit()


@router.post("/{contact_id}/opt-out")
async def opt_out_contact(
    contact_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contact = await db.get(Contact, contact_id)
    if not contact or contact.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Contact not found.")
    contact.opted_out = True
    await db.commit()
    return {"message": "Contact opted out from broadcasts."}


@router.post("/{contact_id}/tags")
async def add_tags(
    contact_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add tags to a contact without replacing existing ones."""
    contact = await db.get(Contact, contact_id)
    if not contact or contact.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Contact not found.")

    new_tags = body.get("tags", [])
    existing = set(contact.tags or [])
    existing.update(new_tags)
    contact.tags = sorted(list(existing))
    await db.commit()
    return {"tags": contact.tags}


@router.post("/import/csv")
async def import_contacts_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    """
    Import contacts from CSV.
    Expected columns: phone, name, email, city, tags (comma-separated)
    """
    import csv
    import io

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV.")

    content = await file.read()
    text = content.decode("utf-8-sig")  # Handle BOM

    reader = csv.DictReader(io.StringIO(text))
    required_col = "phone"
    if reader.fieldnames and required_col not in [f.strip().lower() for f in reader.fieldnames]:
        raise HTTPException(status_code=400, detail="CSV must have a 'phone' column.")

    created = 0
    skipped = 0
    errors = []

    for i, row in enumerate(reader, start=2):
        phone = row.get("phone", "").strip()
        if not phone:
            errors.append(f"Row {i}: Missing phone number")
            continue

        # Check existing
        result = await db.execute(
            select(Contact).where(
                Contact.tenant_id == current_user.tenant_id,
                Contact.phone == phone,
            )
        )
        if result.scalar_one_or_none():
            skipped += 1
            continue

        tags_raw = row.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

        contact = Contact(
            tenant_id=current_user.tenant_id,
            phone=phone,
            name=row.get("name", "").strip() or None,
            email=row.get("email", "").strip() or None,
            city=row.get("city", "").strip() or None,
            tags=tags,
            source="csv_import",
        )
        db.add(contact)
        created += 1

        # Commit in batches of 100
        if created % 100 == 0:
            await db.commit()

    await db.commit()

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors[:20],  # Return first 20 errors
        "total_processed": created + skipped + len(errors),
    }
