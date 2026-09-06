import os
import uuid as uuid_module
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, AdBanner, AdBannerPage
from app.schemas import AdBannerOut, AdBannerTextUpdate

router = APIRouter(prefix="/admin/ad-banners", tags=["admin-ad-banners"])

ALLOWED_PAGE_KEYS = {"plays", "archive", "mylist", "community", "ticketing"}
IMAGE_UPLOAD_DIR = Path("uploads/ad_banners")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


def _to_out(b: AdBanner) -> AdBannerOut:
    return AdBannerOut(
        id=b.id, image_url=b.image_url, redirect_url=b.redirect_url,
        start_date=b.start_date, end_date=b.end_date, is_active=b.is_active,
        display_order=b.display_order, pages=[p.page_key for p in b.pages],
    )


def _validate_pages(pages: list[str]):
    invalid = set(pages) - ALLOWED_PAGE_KEYS
    if invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown page(s): {sorted(invalid)}. Must be from {sorted(ALLOWED_PAGE_KEYS)}.")


@router.get("", response_model=list[AdBannerOut])
def list_ad_banners_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(AdBanner).order_by(AdBanner.display_order).all()
    return [_to_out(b) for b in rows]


@router.post("", response_model=AdBannerOut, status_code=status.HTTP_201_CREATED)
async def create_ad_banner(
    image: UploadFile = File(...),
    redirect_url: str = Form(...),
    start_date: date = Form(...),
    end_date: date = Form(...),
    pages: str = Form(...),  # comma-separated page keys, e.g. "plays,archive"
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    page_list = [p.strip() for p in pages.split(",") if p.strip()]
    if not page_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one page.")
    _validate_pages(page_list)
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be on or after the start date.")

    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be JPEG, PNG, or WebP.")
    contents = await image.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be smaller than 10MB.")

    IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(image.filename or "")[1].lower() or ".jpg"
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(IMAGE_UPLOAD_DIR / stored_name, "wb") as out:
        out.write(contents)

    next_order = (db.query(func.coalesce(func.max(AdBanner.display_order), -1)).scalar() or -1) + 1
    banner = AdBanner(
        image_url=f"/api/uploads/ad_banners/{stored_name}",
        redirect_url=redirect_url,
        start_date=start_date,
        end_date=end_date,
        display_order=next_order,
    )
    db.add(banner)
    db.flush()
    for p in page_list:
        db.add(AdBannerPage(ad_banner_id=banner.id, page_key=p))
    db.commit()
    db.refresh(banner)
    return _to_out(banner)


@router.put("/{banner_id}", response_model=AdBannerOut)
def update_ad_banner(
    banner_id: str,
    payload: AdBannerTextUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Text-only edit (redirect URL, dates, page assignment) — to
    change the image, delete this banner and add a new one, same
    convention as the other admin-managed carousels this platform uses
    (Theater/Archive Hero Slides).
    """
    banner = db.query(AdBanner).filter(AdBanner.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    _validate_pages(payload.pages)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be on or after the start date.")

    banner.redirect_url = payload.redirect_url
    banner.start_date = payload.start_date
    banner.end_date = payload.end_date

    db.query(AdBannerPage).filter(AdBannerPage.ad_banner_id == banner.id).delete()
    for p in payload.pages:
        db.add(AdBannerPage(ad_banner_id=banner.id, page_key=p))

    db.commit()
    db.refresh(banner)
    return _to_out(banner)


@router.patch("/{banner_id}/toggle", response_model=AdBannerOut)
def toggle_ad_banner(
    banner_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Pause/resume a banner without deleting it or touching its dates
    — flips is_active. A banner can be within its active date window
    and still be switched off this way.
    """
    banner = db.query(AdBanner).filter(AdBanner.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    banner.is_active = not banner.is_active
    db.commit()
    db.refresh(banner)
    return _to_out(banner)


@router.delete("/{banner_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ad_banner(
    banner_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    banner = db.query(AdBanner).filter(AdBanner.id == banner_id).first()
    if not banner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Banner not found.")
    db.delete(banner)
    db.commit()
