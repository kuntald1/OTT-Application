from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import SpecialCategory, SpecialCategoryVideo, Video, VideoSection
from app.schemas import SpecialCategoryOut, SpecialCategoryVideoCardOut

router = APIRouter(prefix="/special-categories", tags=["special-categories"])


@router.get("", response_model=list[SpecialCategoryOut])
def list_active_special_categories(section: str = "play", db: Session = Depends(get_db)):
    """Public — no auth. Returns only categories that are currently
    "live": not disabled, and today falls within
    [visible_from, visible_to] (inclusive both ends — a category
    set to end 30/8/2026 is still visible ON 30/8/2026, and gone
    from 31/8/2026). section-matching includes "both" rows regardless
    of which specific section (play/archive) was requested — same
    pattern as live streams' section filtering.
    """
    if section not in ("play", "archive"):
        section = "play"
    today = date.today()
    rows = (
        db.query(SpecialCategory)
        .filter(
            SpecialCategory.is_disabled == False,  # noqa: E712
            SpecialCategory.visible_from <= today,
            SpecialCategory.visible_to >= today,
            SpecialCategory.section.in_([VideoSection(section), VideoSection.both]),
        )
        .order_by(SpecialCategory.created_at.desc())
        .all()
    )

    out = []
    for sc in rows:
        video_ids = [
            l.video_id
            for l in db.query(SpecialCategoryVideo).filter(SpecialCategoryVideo.special_category_id == sc.id).all()
        ]
        videos = db.query(Video).filter(Video.id.in_(video_ids)).all() if video_ids else []
        out.append(SpecialCategoryOut(
            id=sc.id,
            title=sc.title,
            visible_from=sc.visible_from,
            visible_to=sc.visible_to,
            section=sc.section.value,
            is_disabled=sc.is_disabled,
            video_count=len(videos),
            videos=[
                SpecialCategoryVideoCardOut(
                    id=v.id,
                    title=v.title,
                    poster_image_url=v.poster_image_url,
                    thumbnail_url=(
                        f"https://{settings.BUNNY_CDN_HOSTNAME}/{v.bunny_video_id}/thumbnail.jpg"
                        if v.bunny_video_id else None
                    ),
                    trailer_playback_url=(
                        f"https://{settings.BUNNY_CDN_HOSTNAME}/{v.trailer_bunny_video_id}/playlist.m3u8"
                        if v.trailer_bunny_video_id else None
                    ),
                )
                for v in videos
            ],
        ))
    return out
