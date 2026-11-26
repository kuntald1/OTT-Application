import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, BrandingConfig, SitePage, FaqItem
from app.schemas import BrandingOut, SitePageOut, SitePageUpdate, FaqItemOut, FaqItemCreate, FaqItemUpdate

router = APIRouter(prefix="/admin", tags=["admin-site-content"])

ALLOWED_SLUGS = {"about", "contact", "privacy", "terms", "cookies"}

LOGO_UPLOAD_DIR = Path("uploads/branding")
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB — a header mark, not a poster
# SVG is allowed here and nowhere else on the site: a logo is the one
# image that has to stay sharp at any size, and the header draws it at
# a handful of pixels on a phone and large on a desktop. An SVG is also
# a document that can carry script, so it is served from a path nobody
# can navigate to as a page and is never inlined into the DOM — the
# clients all render it through an <img>/<Image> src, where script in
# an SVG does not execute.
LOGO_EXT_BY_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}


def _branding_row(db: Session) -> BrandingConfig:
    """The single branding row, created on first use. Seeding lazily
    rather than in a migration keeps this table out of the deploy
    checklist entirely — create_all() makes it, and the first upload
    fills it."""
    row = db.query(BrandingConfig).first()
    if not row:
        row = BrandingConfig()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/branding", response_model=BrandingOut)
def get_branding_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = db.query(BrandingConfig).first()
    return BrandingOut(logo_url=(row.logo_url or None) if row else None)


@router.post("/branding/logo", response_model=BrandingOut)
async def upload_logo(
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Replace the mark in the site header.

    Takes effect everywhere the next time a page is loaded — the
    website header, and the app's header too, since both read the same
    public /branding endpoint.
    """
    ext = LOGO_EXT_BY_TYPE.get(file.content_type or "")
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logo must be a PNG, JPEG, WEBP or SVG image.",
        )
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file is empty.")
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo must be smaller than 2MB.")

    LOGO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # A fresh name every time, never a fixed "logo.png". The old file
    # stays on disk and the URL changes, so browsers and phones pick the
    # new mark up immediately instead of serving a cached old one — and
    # the previous logo is still there if the new one was a mistake.
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(LOGO_UPLOAD_DIR / stored_name, "wb") as out:
        out.write(contents)

    row = _branding_row(db)
    row.logo_url = f"/api/uploads/branding/{stored_name}"
    db.commit()
    db.refresh(row)
    return BrandingOut(logo_url=row.logo_url)


@router.delete("/branding/logo", response_model=BrandingOut)
def reset_logo(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Back to the built-in mark. Clears the pointer and leaves the
    uploaded file alone — undoing a logo change should not be the
    thing that deletes the file you may want back."""
    row = db.query(BrandingConfig).first()
    if row:
        row.logo_url = None
        db.commit()
    return BrandingOut(logo_url=None)


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
