from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, SitePage, FaqItem
from app.schemas import SitePageOut, SitePageUpdate, FaqItemOut, FaqItemCreate, FaqItemUpdate

router = APIRouter(prefix="/admin", tags=["admin-site-content"])

ALLOWED_SLUGS = {"about", "contact", "privacy", "terms", "cookies"}


@router.get("/site-pages", response_model=list[SitePageOut])
def list_site_pages_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(SitePage).order_by(SitePage.slug).all()


@router.put("/site-pages/{slug}", response_model=SitePageOut)
def update_site_page(
    slug: str,
    payload: SitePageUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if slug not in ALLOWED_SLUGS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown page slug. Must be one of {sorted(ALLOWED_SLUGS)}.")
    page = db.query(SitePage).filter(SitePage.slug == slug).first()
    if not page:
        page = SitePage(slug=slug, title=payload.title, content=payload.content)
        db.add(page)
    else:
        page.title = payload.title
        page.content = payload.content
    db.commit()
    db.refresh(page)
    return page


@router.get("/faqs", response_model=list[FaqItemOut])
def list_faqs_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(FaqItem).order_by(FaqItem.display_order).all()


@router.post("/faqs", response_model=FaqItemOut, status_code=status.HTTP_201_CREATED)
def create_faq(
    payload: FaqItemCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    next_order = (db.query(func.coalesce(func.max(FaqItem.display_order), -1)).scalar() or -1) + 1
    faq = FaqItem(question=payload.question, answer=payload.answer, display_order=next_order)
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return faq


@router.put("/faqs/{faq_id}", response_model=FaqItemOut)
def update_faq(
    faq_id: str,
    payload: FaqItemUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    faq = db.query(FaqItem).filter(FaqItem.id == faq_id).first()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found.")
    faq.question = payload.question
    faq.answer = payload.answer
    db.commit()
    db.refresh(faq)
    return faq


@router.delete("/faqs/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faq(
    faq_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    faq = db.query(FaqItem).filter(FaqItem.id == faq_id).first()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found.")
    db.delete(faq)
    db.commit()
