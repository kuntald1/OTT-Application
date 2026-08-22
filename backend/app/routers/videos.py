from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, UserRole, Video, VideoPricing, VideoRevenueTier,
    VideoSection, VideoStatus, VideoMonetization,
)
from app.schemas import VideoCreate, VideoOut, VideoPricingOut, VideoRevenueTierOut

router = APIRouter(prefix="/videos", tags=["videos"])


def _require_creator_or_organiser(user: User) -> None:
    if user.role not in (UserRole.content_creator, UserRole.plays_organiser):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Content Creator or Plays Organiser accounts can upload videos.",
        )


def _to_out(video: Video, db: Session) -> VideoOut:
    uploader = db.query(User).filter(User.id == video.uploaded_by_user_id).first()
    pricing_row = db.query(VideoPricing).filter(VideoPricing.video_id == video.id).first()
    tiers = (
        db.query(VideoRevenueTier)
        .filter(VideoRevenueTier.video_id == video.id)
        .order_by(VideoRevenueTier.min_minutes.asc())
        .all()
    )
    return VideoOut(
        id=video.id,
        uploaded_by_name=uploader.name if uploader else "Unknown",
        title=video.title,
        description=video.description,
        section=video.section.value,
        has_ads=video.has_ads,
        monetization_type=video.monetization_type.value,
        status=video.status.value,
        admin_note=video.admin_note,
        pricing=(
            VideoPricingOut(price_inr=pricing_row.price_inr, price_usd=pricing_row.price_usd)
            if pricing_row else None
        ),
        revenue_tiers=[
            VideoRevenueTierOut(
                id=t.id, min_minutes=t.min_minutes, max_minutes=t.max_minutes,
                rate_per_minute_inr=t.rate_per_minute_inr,
            )
            for t in tiers
        ],
        created_at=video.created_at,
        published_at=video.published_at,
    )


@router.post("", response_model=VideoOut, status_code=status.HTTP_201_CREATED)
def upload_video(
    payload: VideoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator_or_organiser(current_user)

    if payload.monetization_type == "pay_per_video":
        if payload.price_inr is None or payload.price_usd is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pay-Per-Video requires both an INR and a USD price.",
            )

    video = Video(
        uploaded_by_user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        section=VideoSection(payload.section),
        has_ads=payload.has_ads,
        monetization_type=VideoMonetization(payload.monetization_type),
    )
    db.add(video)
    db.flush()

    if payload.monetization_type == "pay_per_video":
        db.add(VideoPricing(
            video_id=video.id, price_inr=payload.price_inr, price_usd=payload.price_usd,
        ))

    for tier in payload.revenue_tiers:
        db.add(VideoRevenueTier(
            video_id=video.id, min_minutes=tier.min_minutes,
            max_minutes=tier.max_minutes, rate_per_minute_inr=tier.rate_per_minute_inr,
        ))

    db.commit()
    db.refresh(video)
    return _to_out(video, db)


@router.get("/mine", response_model=list[VideoOut])
def list_my_videos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator_or_organiser(current_user)
    videos = (
        db.query(Video)
        .filter(Video.uploaded_by_user_id == current_user.id)
        .order_by(Video.created_at.desc())
        .all()
    )
    return [_to_out(v, db) for v in videos]


@router.get("", response_model=list[VideoOut])
def list_published_videos(
    section: str | None = None,
    db: Session = Depends(get_db),
):
    # Public — only ever returns published videos. Pending/rejected
    # videos are never visible outside their uploader's own "My Video
    # List" (see /videos/mine above).
    query = db.query(Video).filter(Video.status == VideoStatus.published)
    if section:
        if section not in ("play", "archive"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play' or 'archive'")
        query = query.filter(Video.section == VideoSection(section))
    videos = query.order_by(Video.published_at.desc()).all()
    return [_to_out(v, db) for v in videos]
