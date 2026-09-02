import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, PageHero, PageHeroMedia, PageHeroContentType
from app.schemas import PageHeroOut

router = APIRouter(prefix="/admin/page-heroes", tags=["admin-page-heroes"])

ALLOWED_PAGE_KEYS = {"plays", "archive", "community", "ticketing"}

MEDIA_UPLOAD_DIR = Path("uploads/page_hero_media")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50MB — hero videos run bigger than a typical poster/document upload


def _get_or_create_hero(page_key: str, db: Session) -> PageHero:
    if page_key not in ALLOWED_PAGE_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown page_key. Must be one of {sorted(ALLOWED_PAGE_KEYS)}.")
    hero = db.query(PageHero).filter(PageHero.page_key == page_key).first()
    if not hero:
        hero = PageHero(page_key=page_key, headline=page_key.title())
        db.add(hero)
        db.commit()
        db.refresh(hero)
    return hero


@router.get("", response_model=list[PageHeroOut])
def list_page_heroes(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(PageHero).order_by(PageHero.page_key).all()


@router.put("/{page_key}", response_model=PageHeroOut)
def update_page_hero_details(
    page_key: str,
    content_type: str = Form(...),
    eyebrow: str = Form(""),
    headline: str = Form(...),
    subtext: str = Form(""),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Saves the TEXT side of a hero (eyebrow/headline/subtext) and
    which content_type it should render as. Deliberately doesn't touch
    media here — uploading/removing files is its own pair of endpoints
    below, so a person can add a photo to the slideshow without
    re-submitting the whole form, and vice versa.
    """
    hero = _get_or_create_hero(page_key, db)
    try:
        content_type_enum = PageHeroContentType(content_type)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="content_type must be image, video, or text.")

    hero.content_type = content_type_enum
    hero.eyebrow = eyebrow or None
    hero.headline = headline
    hero.subtext = subtext or None
    db.commit()
    db.refresh(hero)
    return hero


@router.post("/{page_key}/media", response_model=PageHeroOut)
async def add_page_hero_media(
    page_key: str,
    files: list[UploadFile] = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Adds one or more image/video files to this hero's slideshow —
    matches the old behavior of dropping several files into
    src/assets/HeroVideo/ and having them all play in sequence, or
    several posters cross-fade. Files are validated against the hero's
    CURRENT content_type (set via PUT above) — switch to Image or
    Video first if it isn't already, then upload.
    """
    hero = _get_or_create_hero(page_key, db)
    if hero.content_type == PageHeroContentType.text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Set Content Type to Image or Video before uploading media.")
    allowed = ALLOWED_IMAGE_TYPES if hero.content_type == PageHeroContentType.image else ALLOWED_VIDEO_TYPES

    next_order = (db.query(func.coalesce(func.max(PageHeroMedia.display_order), -1)).filter(PageHeroMedia.page_hero_id == hero.id).scalar() or -1) + 1
    MEDIA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    for f in files:
        if f.content_type not in allowed:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{f.filename}' isn't a valid {hero.content_type.value} file.")
        contents = await f.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"'{f.filename}' is larger than 50MB.")
        ext = os.path.splitext(f.filename or "")[1].lower() or (".jpg" if hero.content_type == PageHeroContentType.image else ".mp4")
        stored_name = f"{uuid_module.uuid4()}{ext}"
        with open(MEDIA_UPLOAD_DIR / stored_name, "wb") as out:
            out.write(contents)
        db.add(PageHeroMedia(page_hero_id=hero.id, media_url=f"/api/uploads/page_hero_media/{stored_name}", display_order=next_order))
        next_order += 1

    db.commit()
    db.refresh(hero)
    return hero


@router.delete("/{page_key}/media/{media_id}", response_model=PageHeroOut)
def delete_page_hero_media(
    page_key: str,
    media_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    hero = _get_or_create_hero(page_key, db)
    item = db.query(PageHeroMedia).filter(PageHeroMedia.id == media_id, PageHeroMedia.page_hero_id == hero.id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found.")
    db.delete(item)
    db.commit()
    db.refresh(hero)
    return hero
