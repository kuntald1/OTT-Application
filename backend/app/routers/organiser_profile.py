import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.html_sanitize import sanitize_rich_text
from app.models import User, UserRole, OrganiserProfileSection
from app.schemas import OrganiserProfileSectionOut, OrganiserProfileSectionCreate, OrganiserProfileSectionUpdate

router = APIRouter(prefix="/organiser-profile", tags=["organiser-profile"])

# Same bind-mounted uploads/ pattern as profile photos (auth.py) — see
# that file's UPLOAD_DIR comment for why this survives container rebuilds.
COVER_UPLOAD_DIR = Path("uploads/studio_covers")
ALLOWED_COVER_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_COVER_BYTES = 8 * 1024 * 1024  # 8MB — a banner-sized image, larger than an avatar


@router.get("/{user_id}/cover", response_model=dict)
def get_public_cover_image(user_id: str, db: Session = Depends(get_db)):
    """Public — powers the banner at the top of a studio's video list
    (e.g. "Bohurupee — Plays"). Returns null if the organiser hasn't
    uploaded one, not an error — the page just skips the banner.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return {"cover_image_url": user.studio_cover_image_url}


@router.post("/cover-image", response_model=dict)
async def upload_my_cover_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The image upload on Manage Profile > About [Organisation] —
    only a Plays Organiser has a studio to put a banner on.
    """
    if current_user.role != UserRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Plays Organiser accounts have a studio cover image.")
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

    # Delete the old cover file, if one exists, so orphaned uploads
    # don't pile up on disk every time it's replaced.
    if current_user.studio_cover_image_url:
        old_filename = current_user.studio_cover_image_url.rsplit("/", 1)[-1]
        old_path = COVER_UPLOAD_DIR / old_filename
        if old_path.exists() and old_path.is_file():
            old_path.unlink(missing_ok=True)

    current_user.studio_cover_image_url = f"/api/uploads/studio_covers/{filename}"
    db.commit()
    return {"cover_image_url": current_user.studio_cover_image_url}


@router.get("/{user_id}/sections", response_model=list[OrganiserProfileSectionOut])
def list_public_sections(user_id: str, db: Session = Depends(get_db)):
    """Public, read-only — powers the "About [Studio]" block shown
    under a studio's video list (clicking the "Studio" link on a
    video detail page). Anyone's sections are visible here regardless
    of role; there's nothing sensitive in an About page.
    """
    return (
        db.query(OrganiserProfileSection)
        .filter(OrganiserProfileSection.user_id == user_id)
        .order_by(OrganiserProfileSection.display_order)
        .all()
    )


@router.get("/sections", response_model=list[OrganiserProfileSectionOut])
def list_my_sections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(OrganiserProfileSection)
        .filter(OrganiserProfileSection.user_id == current_user.id)
        .order_by(OrganiserProfileSection.display_order)
        .all()
    )


@router.post("/sections", response_model=OrganiserProfileSectionOut, status_code=status.HTTP_201_CREATED)
def create_my_section(
    payload: OrganiserProfileSectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The "About [Organisation]" editor on Manage Profile — only a
    Plays Organiser has an organisation to describe here.
    """
    if current_user.role != UserRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Plays Organiser accounts have an About page.")
    next_order = (
        db.query(func.coalesce(func.max(OrganiserProfileSection.display_order), -1))
        .filter(OrganiserProfileSection.user_id == current_user.id)
        .scalar() or -1
    ) + 1
    section = OrganiserProfileSection(
        user_id=current_user.id,
        title=payload.title,
        content_html=sanitize_rich_text(payload.content_html),
        display_order=next_order,
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


def _get_own_section_or_404(section_id: str, current_user: User, db: Session) -> OrganiserProfileSection:
    section = (
        db.query(OrganiserProfileSection)
        .filter(OrganiserProfileSection.id == section_id, OrganiserProfileSection.user_id == current_user.id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    return section


@router.put("/sections/{section_id}", response_model=OrganiserProfileSectionOut)
def update_my_section(
    section_id: str,
    payload: OrganiserProfileSectionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _get_own_section_or_404(section_id, current_user, db)
    section.title = payload.title
    section.content_html = sanitize_rich_text(payload.content_html)
    db.commit()
    db.refresh(section)
    return section


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_section(
    section_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    section = _get_own_section_or_404(section_id, current_user, db)
    db.delete(section)
    db.commit()
