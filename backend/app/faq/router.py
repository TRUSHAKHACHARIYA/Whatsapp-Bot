from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.database.models import FAQ, User
from app.auth.dependencies import get_current_user, require_admin_or_owner

router = APIRouter(prefix="/faqs", tags=["faqs"])


class FAQCreate(BaseModel):
    question: str
    answer: str
    keywords: list[str] = []
    category: Optional[str] = None


class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    keywords: Optional[list[str]] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/")
async def list_faqs(
    category: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(FAQ).where(FAQ.tenant_id == current_user.tenant_id).order_by(FAQ.hit_count.desc())
    if category:
        query = query.where(FAQ.category == category)
    if search:
        query = query.where(FAQ.question.ilike(f"%{search}%"))
    result = await db.execute(query.offset(skip).limit(limit))
    faqs = result.scalars().all()
    return [
        {
            "id": str(f.id),
            "question": f.question,
            "answer": f.answer,
            "keywords": f.keywords,
            "category": f.category,
            "hit_count": f.hit_count,
            "is_active": f.is_active,
            "created_at": f.created_at.isoformat(),
        }
        for f in faqs
    ]


@router.get("/categories")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FAQ.category, func.count(FAQ.id))
        .where(FAQ.tenant_id == current_user.tenant_id, FAQ.category.isnot(None))
        .group_by(FAQ.category)
    )
    return [{"category": row[0], "count": row[1]} for row in result.all()]


@router.post("/", status_code=201)
async def create_faq(
    payload: FAQCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    faq = FAQ(tenant_id=current_user.tenant_id, **payload.model_dump())
    db.add(faq)
    await db.commit()
    await db.refresh(faq)
    return {"id": str(faq.id), "question": faq.question}


@router.patch("/{faq_id}")
async def update_faq(
    faq_id: UUID,
    payload: FAQUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    faq = await db.get(FAQ, faq_id)
    if not faq or faq.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="FAQ not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(faq, field, value)
    await db.commit()
    return {"id": str(faq.id)}


@router.delete("/{faq_id}", status_code=204)
async def delete_faq(
    faq_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_owner),
):
    faq = await db.get(FAQ, faq_id)
    if not faq or faq.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="FAQ not found.")
    await db.delete(faq)
    await db.commit()


@router.post("/{faq_id}/test")
async def test_faq_match(
    faq_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test if a given message would match this FAQ."""
    message = body.get("message", "").lower()
    faq = await db.get(FAQ, faq_id)
    if not faq or faq.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="FAQ not found.")
    matched_keywords = [kw for kw in (faq.keywords or []) if kw.lower() in message]
    return {"matched": len(matched_keywords) > 0, "matched_keywords": matched_keywords}
