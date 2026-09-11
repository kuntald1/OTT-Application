import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.html_sanitize import sanitize_rich_text
from app.models import AdminUser, User, OrganiserProfileSection
from app.schemas import OrganiserProfileSectionOut, OrganiserProfileSectionCreate, OrganiserProfileSectionUpdate

router = APIRouter(prefix="/admin/organiser-profile", tags=["admin-organiser-profile"])

COVER_UPLOAD_DIR = Path("uploads/studio_covers")
ALLOWED_COVER_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_COVER_BYTES = 8 * 1024 * 1024


@router.post("/{user_id}/cover-image", response_model=dict)
async def upload_cover_image_admin(
    user_id: str,
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin > User Management's "About Page" — lets an admin set a
    studio's cover image on their behalf, same as organiser_profile.py's
    self-service version.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if file.content_type not in ALLOWED_COVER_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPEG, PNG, or WEBP images are allowed.")

    contents = await file.read()
    if len(contents) > MAX_COVER_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be smaller than 8MB.")

    COVER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    with open(COVER_UPLOAD_DIR / filename, "wb") as f:
        f.write(contents)

    if user.studio_cover_image_url:
        old_filename = user.studio_cover_image_url.rsplit("/", 1)[-1]
        old_path = COVER_UPLOAD_DIR / old_filename
        if old_path.exists() and old_path.is_file():
            old_path.unlink(missing_ok=True)

    user.studio_cover_image_url = f"/api/uploads/studio_covers/{filename}"
    db.commit()
    return {"cover_image_url": user.studio_cover_image_url}


@router.get("/{user_id}/sections", response_model=list[OrganiserProfileSectionOut])
def list_sections_admin(
    user_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return (
        db.query(OrganiserProfileSection)
        .filter(OrganiserProfileSection.user_id == user_id)
        .order_by(OrganiserProfileSection.display_order)
        .all()
    )


@router.post("/{user_id}/sections", response_model=OrganiserProfileSectionOut, status_code=status.HTTP_201_CREATED)
def create_section_admin(
    user_id: str,
    payload: OrganiserProfileSectionCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin > User Management's "About Page" management for a Plays
    Organiser — same underlying sections the organiser edits from
    their own Manage Profile, just editable by an admin too (helping
    an organiser who's stuck, or moderating content).
    """
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    next_order = (
        db.query(func.coalesce(func.max(OrganiserProfileSection.display_order), -1))
        .filter(OrganiserProfileSection.user_id == user_id)
        .scalar() or -1
    ) + 1
    section = OrganiserProfileSection(
        user_id=user_id,
        title=payload.title,
        content_html=sanitize_rich_text(payload.content_html),
        display_order=next_order,
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


@router.put("/sections/{section_id}", response_model=OrganiserProfileSectionOut)
def update_section_admin(
    section_id: str,
    payload: OrganiserProfileSectionUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    section = db.query(OrganiserProfileSection).filter(OrganiserProfileSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    section.title = payload.title
    section.content_html = sanitize_rich_text(payload.content_html)
    db.commit()
    db.refresh(section)
    return section


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section_admin(
    section_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    section = db.query(OrganiserProfileSection).filter(OrganiserProfileSection.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    db.delete(section)
    db.commit()
