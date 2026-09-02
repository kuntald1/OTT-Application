import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, PageHero, PageHeroContentType
from app.schemas import PageHeroOut

router = APIRouter(prefix="/admin/page-heroes", tags=["admin-page-heroes"])

ALLOWED_PAGE_KEYS = {"plays", "archive", "community", "ticketing"}

MEDIA_UPLOAD_DIR = Path("uploads/page_hero_media")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB — hero videos run bigger than a typical poster/document upload


@router.get("", response_model=list[PageHeroOut])
def list_page_heroes(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(PageHero).order_by(PageHero.page_key).all()


@router.put("/{page_key}", response_model=PageHeroOut)
async def update_page_hero(
    page_key: str,
    content_type: str = Form(...),
    eyebrow: str = Form(""),
    headline: str = Form(...),
    subtext: str = Form(""),
    media: UploadFile | None = File(None),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Upserts the one hero row for this page — creates it on first
    save if it doesn't exist yet. A new media file replaces the old
    one; switching content_type to "text" clears any previously set
    media_url (the old file is left on disk, not deleted, same
    leave-it-be convention as other upload flows in this codebase).
    """
    if page_key not in ALLOWED_PAGE_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown page_key. Must be one of {sorted(ALLOWED_PAGE_KEYS)}.")
    try:
        content_type_enum = PageHeroContentType(content_type)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="content_type must be image, video, or text.")

    hero = db.query(PageHero).filter(PageHero.page_key == page_key).first()
    if not hero:
        hero = PageHero(page_key=page_key, headline=headline)
        db.add(hero)

    if media is not None and media.filename:
        if content_type_enum == PageHeroContentType.image:
            allowed = ALLOWED_IMAGE_TYPES
        elif content_type_enum == PageHeroContentType.video:
            allowed = ALLOWED_VIDEO_TYPES
        else:
            allowed = None
        if allowed is not None:
            if media.content_type not in allowed:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File type not allowed for {content_type_enum.value}.")
            contents = await media.read()
            if len(contents) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be smaller than 50MB.")
            MEDIA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            ext = os.path.splitext(media.filename or "")[1].lower() or (".jpg" if content_type_enum == PageHeroContentType.image else ".mp4")
            stored_name = f"{uuid_module.uuid4()}{ext}"
            with open(MEDIA_UPLOAD_DIR / stored_name, "wb") as out:
                out.write(contents)
            hero.media_url = f"/api/uploads/page_hero_media/{stored_name}"

    if content_type_enum == PageHeroContentType.text:
        hero.media_url = None

    hero.content_type = content_type_enum
    hero.eyebrow = eyebrow or None
    hero.headline = headline
    hero.subtext = subtext or None

    db.commit()
    db.refresh(hero)
    return hero
