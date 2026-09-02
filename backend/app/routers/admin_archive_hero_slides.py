import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, ArchiveHeroSlide
from app.schemas import ArchiveHeroSlideOut, ArchiveHeroSlideTextUpdate

router = APIRouter(prefix="/admin/archive-hero-slides", tags=["admin-archive-hero-slides"])

IMAGE_UPLOAD_DIR = Path("uploads/archive_hero_slides")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


@router.get("", response_model=list[ArchiveHeroSlideOut])
def list_slides_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(ArchiveHeroSlide).order_by(ArchiveHeroSlide.display_order).all()


@router.post("", response_model=ArchiveHeroSlideOut, status_code=status.HTTP_201_CREATED)
async def create_slide(
    image: UploadFile = File(...),
    eyebrow: str = Form(""),
    headline: str = Form(...),
    subtext: str = Form(""),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
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

    next_order = (db.query(func.coalesce(func.max(ArchiveHeroSlide.display_order), -1)).scalar() or -1) + 1
    slide = ArchiveHeroSlide(
        image_url=f"/api/uploads/archive_hero_slides/{stored_name}",
        eyebrow=eyebrow or None,
        headline=headline,
        subtext=subtext or None,
        display_order=next_order,
    )
    db.add(slide)
    db.commit()
    db.refresh(slide)
    return slide


@router.put("/{slide_id}", response_model=ArchiveHeroSlideOut)
def update_slide_text(
    slide_id: str,
    payload: ArchiveHeroSlideTextUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Text-only edit — to change the image, delete this slide and add
    a new one (keeps the upload endpoint above as the single place
    that handles file validation/storage).
    """
    slide = db.query(ArchiveHeroSlide).filter(ArchiveHeroSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")
    slide.eyebrow = payload.eyebrow or None
    slide.headline = payload.headline
    slide.subtext = payload.subtext or None
    db.commit()
    db.refresh(slide)
    return slide


@router.delete("/{slide_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_slide(
    slide_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    slide = db.query(ArchiveHeroSlide).filter(ArchiveHeroSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")
    db.delete(slide)
    db.commit()
