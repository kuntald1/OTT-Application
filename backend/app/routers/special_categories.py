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
    "live": not disabled, and (today falls within [visible_from,
    visible_to] inclusive) OR (both dates are unset — a PERMANENT
    curated row with no expiry, the "no Visible From/To" case). A
    category set to end 30/8/2026 is still visible ON 30/8/2026, and
    gone from 31/8/2026. section-matching includes "both" rows
    regardless of which specific section (play/archive) was requested
    — same pattern as live streams' section filtering.

    Ordering: date-windowed specials (e.g. "Sunday Special") always
    come first, most-recently-created first — these are meant to feel
    like a temporary banner above everything. Permanent curated rows
    (the ones replacing auto-generated category rows like "Drama")
    follow, in the admin's own chosen display_order (ascending).
    """
    if section not in ("play", "archive"):
        section = "play"
    today = date.today()
    base_filter = [
        SpecialCategory.is_disabled == False,  # noqa: E712
        SpecialCategory.section.in_([VideoSection(section), VideoSection.both]),
    ]
    dated_rows = (
        db.query(SpecialCategory)
        .filter(
            *base_filter,
            SpecialCategory.visible_from.isnot(None),
            SpecialCategory.visible_from <= today,
            SpecialCategory.visible_to >= today,
        )
        .order_by(SpecialCategory.created_at.desc())
        .all()
    )
    permanent_rows = (
        db.query(SpecialCategory)
        .filter(*base_filter, SpecialCategory.visible_from.is_(None))
        .order_by(SpecialCategory.display_order.asc(), SpecialCategory.created_at.asc())
        .all()
    )
    rows = dated_rows + permanent_rows

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
            display_order=sc.display_order,
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
