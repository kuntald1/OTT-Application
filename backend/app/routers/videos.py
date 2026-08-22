import os
import uuid as uuid_module

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, UserRole, Video, VideoPricing, VideoRevenueTier,
    VideoSection, VideoStatus, VideoMonetization, AgeRating,
    VideoCategory, VideoCast, VideoCrew, Person,
)
from app.schemas import (
    VideoCreate, VideoOut, VideoPricingOut, VideoRevenueTierOut,
    VideoCastOut, VideoCrewOut, PersonOut,
)

router = APIRouter(prefix="/videos", tags=["videos"])

POSTER_UPLOAD_DIR = Path("uploads/video_posters")
ALLOWED_POSTER_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_POSTER_BYTES = 5 * 1024 * 1024  # 5 MB

# Same taxonomy as the site's Category menu and Event Enquiry form.
ALLOWED_CATEGORIES = {
    "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
    "Classical Theatre", "Experimental Theatre", "Popular Shows",
}
ALLOWED_AGE_RATINGS = {"U", "UA7+", "UA13+", "UA16+", "A"}


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
    categories = (
        db.query(VideoCategory).filter(VideoCategory.video_id == video.id).all()
    )
    cast = (
        db.query(VideoCast)
        .filter(VideoCast.video_id == video.id)
        .order_by(VideoCast.display_order.asc())
        .all()
    )
    crew = (
        db.query(VideoCrew)
        .filter(VideoCrew.video_id == video.id)
        .order_by(VideoCrew.display_order.asc())
        .all()
    )
    return VideoOut(
        id=video.id,
        uploaded_by_name=uploader.name if uploader else "Unknown",
        title=video.title,
        description=video.description,
        section=video.section.value,
        categories=[c.category for c in categories] or [video.category],
        release_year=video.release_year,
        age_rating=video.age_rating.value,
        languages=[l.strip() for l in video.languages.split(",")] if video.languages else [],
        poster_image_url=video.poster_image_url,
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
        cast=[
            VideoCastOut(
                id=c.id, character_role=c.character_role,
                person=PersonOut.model_validate(db.query(Person).filter(Person.id == c.person_id).first()),
            )
            for c in cast
        ],
        crew=[
            VideoCrewOut(
                id=c.id, role=c.role,
                person=PersonOut.model_validate(db.query(Person).filter(Person.id == c.person_id).first()),
            )
            for c in crew
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
        thumbnail_url=(
            f"https://{settings.BUNNY_CDN_HOSTNAME}/{video.bunny_video_id}/thumbnail.jpg"
            if video.bunny_video_id else None
        ),
        preview_url=(
            f"https://{settings.BUNNY_CDN_HOSTNAME}/{video.bunny_video_id}/preview.webp"
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

    invalid_categories = [c for c in payload.categories if c not in ALLOWED_CATEGORIES]
    if invalid_categories:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid categories: {', '.join(invalid_categories)}. Must be one of: {', '.join(sorted(ALLOWED_CATEGORIES))}",
        )
    if payload.age_rating not in ALLOWED_AGE_RATINGS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"age_rating must be one of: {', '.join(sorted(ALLOWED_AGE_RATINGS))}",
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
        category=payload.categories[0],  # backward-compat column, see model docstring
        release_year=payload.release_year,
        age_rating=AgeRating(payload.age_rating),
        languages=", ".join(payload.languages) if payload.languages else None,
        has_ads=payload.has_ads,
        monetization_type=VideoMonetization(payload.monetization_type),
    )
    db.add(video)
    db.flush()

    for cat in payload.categories:
        db.add(VideoCategory(video_id=video.id, category=cat))

    for i, member in enumerate(payload.cast):
        person = Person(
            name=member.name, occupation=member.occupation, date_of_birth=member.date_of_birth,
            birthplace=member.birthplace, about=member.about, early_life=member.early_life,
            personal_life=member.personal_life, debut_initial_years=member.debut_initial_years,
            breakthrough_beyond=member.breakthrough_beyond, recent_projects=member.recent_projects,
            created_by_user_id=current_user.id,
        )
        db.add(person)
        db.flush()
        db.add(VideoCast(video_id=video.id, person_id=person.id, character_role=member.character_role, display_order=i))

    for i, member in enumerate(payload.crew):
        person = Person(
            name=member.name, occupation=member.occupation, date_of_birth=member.date_of_birth,
            birthplace=member.birthplace, about=member.about, early_life=member.early_life,
            personal_life=member.personal_life, debut_initial_years=member.debut_initial_years,
            breakthrough_beyond=member.breakthrough_beyond, recent_projects=member.recent_projects,
            created_by_user_id=current_user.id,
        )
        db.add(person)
        db.flush()
        db.add(VideoCrew(video_id=video.id, person_id=person.id, role=member.role, display_order=i))

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


@router.post("/{video_id}/upload-poster", response_model=VideoOut)
async def upload_video_poster(
    video_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Custom poster image — separate from Bunny's auto-grabbed video
    thumbnail. Saved to the project folder (bind-mounted, same pattern as
    profile photos and community post images), not to Bunny — this is a
    static image, not video content.
    """
    _require_creator_or_organiser(current_user)

    video = db.query(Video).filter(Video.id == video_id, Video.uploaded_by_user_id == current_user.id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    if file.content_type not in ALLOWED_POSTER_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, or WEBP images are allowed.",
        )
    contents = await file.read()
    if len(contents) > MAX_POSTER_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Poster image must be smaller than 5MB.")

    POSTER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(POSTER_UPLOAD_DIR / stored_name, "wb") as out:
        out.write(contents)

    video.poster_image_url = f"/api/uploads/video_posters/{stored_name}"
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
