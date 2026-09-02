import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, TicketingPortrait
from app.schemas import TicketingPortraitOut, TicketingPortraitCaptionUpdate

router = APIRouter(prefix="/admin/ticketing-portraits", tags=["admin-ticketing-portraits"])

IMAGE_UPLOAD_DIR = Path("uploads/ticketing_portraits")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


@router.get("", response_model=list[TicketingPortraitOut])
def list_portraits_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(TicketingPortrait).order_by(TicketingPortrait.display_order).all()


@router.post("", response_model=TicketingPortraitOut, status_code=status.HTTP_201_CREATED)
async def create_portrait(
    image: UploadFile = File(...),
    caption: str = Form(""),
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

    next_order = (db.query(func.coalesce(func.max(TicketingPortrait.display_order), -1)).scalar() or -1) + 1
    portrait = TicketingPortrait(
        image_url=f"/api/uploads/ticketing_portraits/{stored_name}",
        caption=caption or None,
        display_order=next_order,
    )
    db.add(portrait)
    db.commit()
    db.refresh(portrait)
    return portrait


@router.put("/{portrait_id}", response_model=TicketingPortraitOut)
def update_portrait_caption(
    portrait_id: str,
    payload: TicketingPortraitCaptionUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    portrait = db.query(TicketingPortrait).filter(TicketingPortrait.id == portrait_id).first()
    if not portrait:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portrait not found.")
    portrait.caption = payload.caption or None
    db.commit()
    db.refresh(portrait)
    return portrait


@router.delete("/{portrait_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portrait(
    portrait_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    portrait = db.query(TicketingPortrait).filter(TicketingPortrait.id == portrait_id).first()
    if not portrait:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portrait not found.")
    db.delete(portrait)
    db.commit()
