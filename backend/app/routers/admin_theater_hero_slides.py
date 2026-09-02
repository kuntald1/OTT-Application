import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, TheaterHeroSlide
from app.schemas import TheaterHeroSlideOut, TheaterHeroSlideTextUpdate

router = APIRouter(prefix="/admin/theater-hero-slides", tags=["admin-theater-hero-slides"])

IMAGE_UPLOAD_DIR = Path("uploads/theater_hero_slides")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


@router.get("", response_model=list[TheaterHeroSlideOut])
def list_slides_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(TheaterHeroSlide).order_by(TheaterHeroSlide.display_order).all()


@router.post("", response_model=TheaterHeroSlideOut, status_code=status.HTTP_201_CREATED)
async def create_slide(
    image: UploadFile = File(...),
    category: str = Form(""),
    venue: str = Form(""),
    title: str = Form(...),
    synopsis: str = Form(""),
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

    next_order = (db.query(func.coalesce(func.max(TheaterHeroSlide.display_order), -1)).scalar() or -1) + 1
    slide = TheaterHeroSlide(
        image_url=f"/api/uploads/theater_hero_slides/{stored_name}",
        category=category or None,
        venue=venue or None,
        title=title,
        synopsis=synopsis or None,
        display_order=next_order,
    )
    db.add(slide)
    db.commit()
    db.refresh(slide)
    return slide


@router.put("/{slide_id}", response_model=TheaterHeroSlideOut)
def update_slide_text(
    slide_id: str,
    payload: TheaterHeroSlideTextUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Text-only edit — to change the image, delete this slide and add
    a new one (keeps the upload endpoint above as the single place
    that handles file validation/storage).
    """
    slide = db.query(TheaterHeroSlide).filter(TheaterHeroSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")
    slide.category = payload.category or None
    slide.venue = payload.venue or None
    slide.title = payload.title
    slide.synopsis = payload.synopsis or None
    db.commit()
    db.refresh(slide)
    return slide


@router.delete("/{slide_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_slide(
    slide_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    slide = db.query(TheaterHeroSlide).filter(TheaterHeroSlide.id == slide_id).first()
    if not slide:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Slide not found.")
    db.delete(slide)
    db.commit()
