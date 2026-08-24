import os
import uuid as uuid_module
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pathlib import Path
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import (
    User, UserRole, Video, VideoPricing, VideoRevenueTier,
    VideoSection, VideoStatus, VideoMonetization, AgeRating,
    VideoCategory, VideoCast, VideoCrew, Person, AdminUser,
    Subscription, VideoPurchase, PaymentStatus, VideoLike, MyListItem, WatchProgress,
    Ad, AdCuePoint,
)
from app.schemas import (
    VideoCreate, VideoOut, VideoPricingOut, VideoRevenueTierOut,
    VideoCastOut, VideoCrewOut, PersonOut, VideoLikeToggleResponse, PlayerAdCuePointOut,
)

router = APIRouter(prefix="/videos", tags=["videos"])

POSTER_UPLOAD_DIR = Path("uploads/video_posters")
ALLOWED_POSTER_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_POSTER_BYTES = 5 * 1024 * 1024  # 5 MB

ALLOWED_AGE_RATINGS = {"U", "UA7+", "UA13+", "UA16+", "A"}


def _get_allowed_categories(db: Session) -> set[str]:
    """Live from the database (Menu rows under the "Category" parent,
    admin-managed via /admin/categories) instead of a hardcoded set —
    this is what makes "Category Dynamic" actually dynamic: an admin
    adding/renaming/removing a category here changes what's valid on
    the very next upload, no redeploy needed.
    """
    from app.models import Menu

    parent = db.query(Menu).filter(Menu.label == "Category", Menu.parent_menu_id.is_(None)).first()
    if not parent:
        return set()
    rows = db.query(Menu).filter(Menu.parent_menu_id == parent.id, Menu.is_active == True).all()  # noqa: E712
    return {m.category_param or m.label for m in rows}


def _require_creator_or_organiser(user: User) -> None:
    if user.role not in (UserRole.content_creator, UserRole.plays_organiser):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Content Creator or Plays Organiser accounts can upload videos.",
        )


def _fetch_and_cache_duration(video: Video, db: Session) -> None:
    """Lazily asks Bunny for this video's real runtime and caches it —
    only runs for videos that have a file but no cached duration yet, so
    once resolved this never calls Bunny again for that video. Uses a
    SYNCHRONOUS httpx client deliberately: _to_out is called from many
    non-async endpoint handlers, and making the whole call chain async
    just for this would be a much bigger, riskier change than it's worth.
    Silently does nothing on any failure — a missing duration is a minor
    cosmetic gap, never worth breaking a video listing over.
    """
    if not (video.bunny_video_id and settings.BUNNY_LIBRARY_ID and settings.BUNNY_API_KEY):
        return
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(
                f"https://video.bunnycdn.com/library/{settings.BUNNY_LIBRARY_ID}/videos/{video.bunny_video_id}",
                headers={"AccessKey": settings.BUNNY_API_KEY, "Accept": "application/json"},
            )
            if resp.status_code == 200:
                length = resp.json().get("length")
                if length and length > 0:
                    video.duration_seconds = int(length)
                    db.commit()
    except Exception:
        pass


# A subscription's plan_name covers a video's section if it's exactly
# matched ("Play" plan -> "play" section) or the user bought "Both".
_SECTION_TO_PLAN = {VideoSection.play: "Play", VideoSection.archive: "Archive"}


def _has_active_subscription_for_section(user: User, section: VideoSection, db: Session) -> bool:
    required_plan = _SECTION_TO_PLAN[section]
    return (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.is_active == True,  # noqa: E712
            Subscription.expires_at > datetime.now(timezone.utc),
            Subscription.plan_name.in_([required_plan, "Both"]),
        )
        .first()
        is not None
    )


def _has_active_subscription_any(user: User, db: Session) -> bool:
    """Pay-Per-Video's prerequisite check — ANY active, unexpired plan
    unlocks the ability to buy pay-per-video content, regardless of
    which section it covers (matches the Video model's docstring:
    subscription is the gate to purchasing at all, not a specific-plan
    match like the subscription_only case above).
    """
    return (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.is_active == True,  # noqa: E712
            Subscription.expires_at > datetime.now(timezone.utc),
        )
        .first()
        is not None
    )


def _check_video_access(video: Video, user: User | None, db: Session) -> tuple[bool, str | None]:
    """Real, server-side access gate — the only thing that decides
    whether playback_url/embed_url get populated in _to_out below.
    Replaces the old behaviour where the video player only checked
    whether the browser had a login token, never whether that user's
    subscription was actually active or had expired.

    Returns (has_access, access_reason). access_reason is None only
    when has_access is True.
    """
    if user is None:
        return False, "login_required"

    if video.monetization_type == VideoMonetization.pay_per_video:
        if not _has_active_subscription_any(user, db):
            return False, "subscription_required"
        purchased = (
            db.query(VideoPurchase)
            .filter(
                VideoPurchase.user_id == user.id,
                VideoPurchase.video_id == video.id,
                VideoPurchase.status == PaymentStatus.paid,
            )
            .first()
        )
        if not purchased:
            return False, "purchase_required"
        return True, None

    # subscription_only
    if _has_active_subscription_for_section(user, video.section, db):
        return True, None
    return False, "subscription_required"


def _to_out(video: Video, db: Session, viewer: User | None = None) -> VideoOut:
    if video.bunny_video_id and video.duration_seconds is None:
        _fetch_and_cache_duration(video, db)

    if video.uploaded_by_user_id:
        uploader = db.query(User).filter(User.id == video.uploaded_by_user_id).first()
        uploader_name = uploader.name if uploader else "Unknown"
    elif video.uploaded_by_admin_id:
        admin_uploader = db.query(AdminUser).filter(AdminUser.id == video.uploaded_by_admin_id).first()
        uploader_name = f"{admin_uploader.name} (Admin)" if admin_uploader else "Unknown Admin"
    else:
        uploader_name = "Unknown"
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
    has_access, access_reason = _check_video_access(video, viewer, db)
    likes_count = db.query(VideoLike).filter(VideoLike.video_id == video.id).count()
    liked_by_me = bool(
        viewer and db.query(VideoLike).filter(VideoLike.video_id == video.id, VideoLike.user_id == viewer.id).first()
    )
    in_my_list = bool(
        viewer and db.query(MyListItem).filter(
            MyListItem.user_id == viewer.id, MyListItem.item_id == str(video.id)
        ).first()
    )

    # Resume-from-last-position — see WatchProgress's docstring for the
    # honest caveat (wall-clock approximation, not a precise player
    # timestamp). Skipped when the video is essentially finished (within
    # 15s of its known duration) so a completed watch restarts from the
    # top instead of the last couple seconds.
    resume_seconds = 0
    if viewer and video.bunny_video_id:
        progress = (
            db.query(WatchProgress)
            .filter(WatchProgress.user_id == viewer.id, WatchProgress.video_id == video.id)
            .first()
        )
        if progress and progress.position_seconds > 5:
            near_end = (
                video.duration_seconds is not None
                and progress.position_seconds >= video.duration_seconds - 15
            )
            if not near_end:
                resume_seconds = progress.position_seconds

    # Ad cue points — only when the viewer genuinely has playback access
    # (no point exposing VAST tags to someone who can't watch anyway)
    # AND the video's own has_ads is still True. Toggling has_ads off
    # hides cue points without deleting them (see AdCuePoint docstring).
    ad_cue_points: list[PlayerAdCuePointOut] = []
    if has_access and video.has_ads:
        cue_rows = (
            db.query(AdCuePoint, Ad)
            .join(Ad, Ad.id == AdCuePoint.ad_id)
            .filter(AdCuePoint.video_id == video.id, Ad.is_active == True)  # noqa: E712
            .order_by(AdCuePoint.offset_seconds.asc())
            .all()
        )
        ad_cue_points = [
            PlayerAdCuePointOut(offset_seconds=cue.offset_seconds, vast_tag_url=ad.vast_tag_url)
            for cue, ad in cue_rows
        ]
    return VideoOut(
        id=video.id,
        uploaded_by_name=uploader_name,
        title=video.title,
        description=video.description,
        section=video.section.value,
        categories=[c.category for c in categories] or [video.category],
        release_year=video.release_year,
        age_rating=video.age_rating.value,
        languages=[l.strip() for l in video.languages.split(",")] if video.languages else [],
        poster_image_url=video.poster_image_url,
        duration_seconds=video.duration_seconds,
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
            if video.bunny_video_id and has_access else None
        ),
        embed_url=(
            f"https://player.mediadelivery.net/embed/{settings.BUNNY_LIBRARY_ID}/{video.bunny_video_id}"
            + (f"?t={resume_seconds}" if resume_seconds else "")
            if video.bunny_video_id and has_access else None
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
        has_access=has_access,
        access_reason=access_reason,
        likes_count=likes_count,
        liked_by_me=liked_by_me,
        in_my_list=in_my_list,
        resume_position_seconds=resume_seconds,
        ad_cue_points=ad_cue_points,
    )


def _validate_video_payload(payload: VideoCreate, db: Session) -> None:
    allowed_categories = _get_allowed_categories(db)
    invalid_categories = [c for c in payload.categories if c not in allowed_categories]
    if invalid_categories:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid categories: {', '.join(invalid_categories)}. Must be one of: {', '.join(sorted(allowed_categories))}",
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


def _sync_categories(video: Video, payload: VideoCreate, db: Session) -> None:
    db.query(VideoCategory).filter(VideoCategory.video_id == video.id).delete()
    for cat in payload.categories:
        db.add(VideoCategory(video_id=video.id, category=cat))


def _sync_cast_and_crew(
    video: Video, payload: VideoCreate, db: Session,
    person_created_by_user_id: str | None = None, person_created_by_admin_id: str | None = None,
) -> None:
    """Reconciles cast/crew with what's in the payload — critical
    difference from a naive delete-and-recreate: when an incoming entry
    carries a person_id matching an existing cast/crew member on THIS
    video, that Person's text fields get UPDATED IN PLACE rather than
    deleted and rebuilt from scratch. This preserves photo_url (and any
    other fields not included in the edit form) across edits — the
    previous delete-everything approach silently wiped every uploaded
    photo on every single edit save, even ones that never touched
    cast/crew at all. Only genuinely new entries (no person_id, or one
    that doesn't match anything on this video) get a fresh Person row;
    only entries actually removed from the submission get deleted.
    """
    existing_cast = {c.person_id: c for c in db.query(VideoCast).filter(VideoCast.video_id == video.id).all()}
    existing_crew = {c.person_id: c for c in db.query(VideoCrew).filter(VideoCrew.video_id == video.id).all()}

    def _apply_person_fields(person: Person, member) -> None:
        person.name = member.name
        person.occupation = member.occupation
        person.date_of_birth = member.date_of_birth
        person.birthplace = member.birthplace
        person.about = member.about
        person.early_life = member.early_life
        person.personal_life = member.personal_life
        person.debut_initial_years = member.debut_initial_years
        person.breakthrough_beyond = member.breakthrough_beyond
        person.recent_projects = member.recent_projects

    kept_cast_person_ids = set()
    for i, member in enumerate(payload.cast):
        if member.person_id and member.person_id in existing_cast:
            person = db.query(Person).filter(Person.id == member.person_id).first()
            if person:
                _apply_person_fields(person, member)
                vc = existing_cast[member.person_id]
                vc.character_role = member.character_role
                vc.display_order = i
                kept_cast_person_ids.add(member.person_id)
                continue
        person = Person(
            created_by_user_id=person_created_by_user_id, created_by_admin_id=person_created_by_admin_id,
        )
        _apply_person_fields(person, member)
        db.add(person)
        db.flush()
        db.add(VideoCast(video_id=video.id, person_id=person.id, character_role=member.character_role, display_order=i))

    for old_person_id, vc in existing_cast.items():
        if old_person_id not in kept_cast_person_ids:
            db.delete(vc)
    db.flush()
    for old_person_id in existing_cast:
        if old_person_id not in kept_cast_person_ids:
            db.query(Person).filter(Person.id == old_person_id).delete()

    kept_crew_person_ids = set()
    for i, member in enumerate(payload.crew):
        if member.person_id and member.person_id in existing_crew:
            person = db.query(Person).filter(Person.id == member.person_id).first()
            if person:
                _apply_person_fields(person, member)
                vc = existing_crew[member.person_id]
                vc.role = member.role
                vc.display_order = i
                kept_crew_person_ids.add(member.person_id)
                continue
        person = Person(
            created_by_user_id=person_created_by_user_id, created_by_admin_id=person_created_by_admin_id,
        )
        _apply_person_fields(person, member)
        db.add(person)
        db.flush()
        db.add(VideoCrew(video_id=video.id, person_id=person.id, role=member.role, display_order=i))

    for old_person_id, vc in existing_crew.items():
        if old_person_id not in kept_crew_person_ids:
            db.delete(vc)
    db.flush()
    for old_person_id in existing_crew:
        if old_person_id not in kept_crew_person_ids:
            db.query(Person).filter(Person.id == old_person_id).delete()
    db.flush()


def _sync_pricing_and_tiers(video: Video, payload: VideoCreate, db: Session) -> None:
    db.query(VideoPricing).filter(VideoPricing.video_id == video.id).delete()
    if payload.monetization_type == "pay_per_video":
        db.add(VideoPricing(video_id=video.id, price_inr=payload.price_inr, price_usd=payload.price_usd))

    db.query(VideoRevenueTier).filter(VideoRevenueTier.video_id == video.id).delete()
    for tier in payload.revenue_tiers:
        db.add(VideoRevenueTier(
            video_id=video.id, min_minutes=tier.min_minutes,
            max_minutes=tier.max_minutes, rate_per_minute_inr=tier.rate_per_minute_inr,
        ))


def _apply_video_fields(video: Video, payload: VideoCreate) -> None:
    video.title = payload.title
    video.description = payload.description
    video.section = VideoSection(payload.section)
    video.category = payload.categories[0]  # backward-compat column, see model docstring
    video.release_year = payload.release_year
    video.age_rating = AgeRating(payload.age_rating)
    video.languages = ", ".join(payload.languages) if payload.languages else None
    video.has_ads = payload.has_ads
    video.monetization_type = VideoMonetization(payload.monetization_type)


def _create_video_core(
    payload: VideoCreate, db: Session,
    uploaded_by_user_id: str | None = None, uploaded_by_admin_id: str | None = None,
    person_created_by_user_id: str | None = None, person_created_by_admin_id: str | None = None,
    auto_publish: bool = False,
) -> Video:
    """Shared by both the Creator/Organiser upload endpoint and the Admin
    'Add Video' endpoint, so the two paths can never silently drift apart
    — exactly one of uploaded_by_user_id/uploaded_by_admin_id should be
    set by the caller, matching Video's either/or ownership design.
    """
    _validate_video_payload(payload, db)

    video = Video(uploaded_by_user_id=uploaded_by_user_id, uploaded_by_admin_id=uploaded_by_admin_id)
    _apply_video_fields(video, payload)
    if auto_publish:
        from datetime import datetime, timezone
        video.status = VideoStatus.published
        video.published_at = datetime.now(timezone.utc)
    db.add(video)
    db.flush()

    _sync_categories(video, payload, db)
    _sync_cast_and_crew(video, payload, db, person_created_by_user_id, person_created_by_admin_id)
    _sync_pricing_and_tiers(video, payload, db)

    db.commit()
    db.refresh(video)
    return video


def _update_video_core(video: Video, payload: VideoCreate, db: Session) -> Video:
    """Admin edit — updates every field, reusing the exact same sync
    helpers as creation so there's only one place that knows how to
    correctly store categories/cast/crew/pricing/tiers.
    """
    _validate_video_payload(payload, db)
    _apply_video_fields(video, payload)
    _sync_categories(video, payload, db)
    _sync_cast_and_crew(video, payload, db, video.uploaded_by_user_id, video.uploaded_by_admin_id)
    _sync_pricing_and_tiers(video, payload, db)
    db.commit()
    db.refresh(video)
    return video


@router.post("", response_model=VideoOut, status_code=status.HTTP_201_CREATED)
def upload_video(
    payload: VideoCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator_or_organiser(current_user)
    video = _create_video_core(
        payload, db,
        uploaded_by_user_id=current_user.id, person_created_by_user_id=current_user.id,
        auto_publish=False,
    )
    return _to_out(video, db)


async def _save_poster_file(video: Video, file: UploadFile, db: Session) -> Video:
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
    return video


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

    video = await _save_poster_file(video, file, db)
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
    current_user: User | None = Depends(get_current_user_optional),
):
    # Public — only ever returns published videos. Pending/rejected
    # videos are never visible outside their uploader's own "My Video
    # List" (see /videos/mine above). Auth is optional here (browsing
    # works logged out) but when a token IS present, each card's
    # has_access reflects that viewer's real subscription/purchase
    # status, so the browse grid can show a lock badge on content they
    # can't actually play.
    query = db.query(Video).filter(Video.status == VideoStatus.published)
    if section:
        if section not in ("play", "archive"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play' or 'archive'")
        query = query.filter(Video.section == VideoSection(section))
    videos = query.order_by(Video.published_at.desc()).all()
    return [_to_out(v, db, current_user) for v in videos]


@router.get("/{video_id}", response_model=VideoOut)
def get_published_video(
    video_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Public single-video fetch — powers the real video detail/player
    page. Only ever returns a published video, same visibility rule as
    the list endpoint above — a pending/rejected/disabled video's ID
    simply 404s here, it doesn't leak details to anyone who guesses the
    URL.

    Auth is optional (the page still loads logged out, so a visitor can
    see the poster/synopsis/cast and get prompted to log in) but
    playback_url/embed_url are only ever populated for a viewer who
    genuinely has access right now — see _check_video_access. This is
    the fix for the previously-known gap where the player only checked
    whether the browser HAD a login token, never whether that user's
    subscription was actually active or had since expired.
    """
    video = db.query(Video).filter(Video.id == video_id, Video.status == VideoStatus.published).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return _to_out(video, db, current_user)


ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4", "video/quicktime", "video/x-matroska", "video/webm", "video/x-msvideo",
}
MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB — matches Nginx's client_max_body_size


async def _upload_to_bunny(video: Video, file: UploadFile, db: Session) -> Video:
    if video.bunny_video_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This video already has a file uploaded.")
    if file.content_type not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only MP4, MOV, MKV, WEBM, or AVI files are allowed.",
        )

    contents = await file.read()
    if len(contents) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds the 2GB size limit.")
    if not (settings.BUNNY_LIBRARY_ID and settings.BUNNY_API_KEY and settings.BUNNY_CDN_HOSTNAME):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Video hosting isn't configured yet. Bunny Stream credentials are missing.",
        )

    async with httpx.AsyncClient(timeout=900.0) as client:  # 15 min — generous for 2GB files on modest upload speeds
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
    return video


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

    video = await _upload_to_bunny(video, file, db)
    return _to_out(video, db)


@router.post("/{video_id}/like/toggle", response_model=VideoLikeToggleResponse)
def toggle_video_like(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Real thumbs-up toggle — replaces the previously purely decorative
    button (see VideoBrowsePage.jsx's RealDetailModal). Same
    toggle-by-row-existence pattern as community PostLike.
    """
    video = db.query(Video).filter(Video.id == video_id, Video.status == VideoStatus.published).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    existing = (
        db.query(VideoLike)
        .filter(VideoLike.video_id == video.id, VideoLike.user_id == current_user.id)
        .first()
    )
    if existing:
        db.delete(existing)
        liked = False
    else:
        db.add(VideoLike(video_id=video.id, user_id=current_user.id))
        liked = True
    db.commit()

    likes_count = db.query(VideoLike).filter(VideoLike.video_id == video.id).count()
    return VideoLikeToggleResponse(liked=liked, likes_count=likes_count)
