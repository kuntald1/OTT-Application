import httpx
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, UserRole, Video, VideoPricing, VideoRevenueTier,
    VideoSection, VideoStatus, VideoMonetization,
)
from app.schemas import VideoCreate, VideoOut, VideoPricingOut, VideoRevenueTierOut

router = APIRouter(prefix="/videos", tags=["videos"])

# Same taxonomy as the site's Category menu and Event Enquiry form.
ALLOWED_CATEGORIES = {
    "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
    "Classical Theatre", "Experimental Theatre", "Popular Shows",
}


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
        category=video.category,
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
        has_file=bool(video.bunny_video_id),
        playback_url=(
            f"https://{settings.BUNNY_CDN_HOSTNAME}/{video.bunny_video_id}/playlist.m3u8"
            if video.bunny_video_id else None
        ),
        embed_url=(
            f"https://player.mediadelivery.net/embed/{settings.BUNNY_LIBRARY_ID}/{video.bunny_video_id}"
            if video.bunny_video_id else None
        ),
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

    if payload.category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"category must be one of: {', '.join(sorted(ALLOWED_CATEGORIES))}",
        )

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
        category=payload.category,
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


ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/x-msvideo",
}
MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB — matches Nginx's client_max_body_size


@router.post("/{video_id}/upload-file", response_model=VideoOut)
async def upload_video_file(
    video_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Phase 2 — the browser sends the video file to US, and we relay it
    to Bunny Stream (create the video object, then PUT the bytes). This
    keeps the Bunny API key entirely server-side, never exposed to the
    frontend. Uses this server's own bandwidth for the relay — fine for
    early-stage volume; if this becomes a bottleneck, a future
    improvement would generate a signed direct-to-Bunny upload URL
    instead so large files skip our server entirely.
    """
    _require_creator_or_organiser(current_user)

    video = db.query(Video).filter(Video.id == video_id, Video.uploaded_by_user_id == current_user.id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if video.bunny_video_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This video already has a file uploaded.")

    if file.content_type not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only MP4, MOV, MKV, WEBM, or AVI files are allowed.",
        )

    contents = await file.read()
    if len(contents) > MAX_VIDEO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File exceeds the 500MB size limit.",
        )
    if not (settings.BUNNY_LIBRARY_ID and settings.BUNNY_API_KEY and settings.BUNNY_CDN_HOSTNAME):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Video hosting isn't configured yet. Bunny Stream credentials are missing.",
        )

    async with httpx.AsyncClient(timeout=900.0) as client:  # 15 min — generous for 2GB files on modest upload speeds
        # Step 1: create the video "slot" in the Bunny library
        create_resp = await client.post(
            f"https://video.bunnycdn.com/library/{settings.BUNNY_LIBRARY_ID}/videos",
            headers={"AccessKey": settings.BUNNY_API_KEY, "Accept": "application/json"},
            json={"title": video.title},
        )
        if create_resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Couldn't create video on Bunny Stream: {create_resp.text}",
            )
        bunny_video_id = create_resp.json()["guid"]

        # Step 2: upload the actual file bytes to that slot
        upload_resp = await client.put(
            f"https://video.bunnycdn.com/library/{settings.BUNNY_LIBRARY_ID}/videos/{bunny_video_id}",
            headers={"AccessKey": settings.BUNNY_API_KEY},
            content=contents,
        )
        if upload_resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Couldn't upload video file to Bunny Stream: {upload_resp.text}",
            )

    video.bunny_video_id = bunny_video_id
    db.commit()
    db.refresh(video)
    return _to_out(video, db)
