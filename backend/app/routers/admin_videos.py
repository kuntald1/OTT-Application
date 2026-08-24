import httpx
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.config import settings
from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, Video, VideoPricing, VideoRevenueTier, VideoStatus, User, UserRole, Person
from app.schemas import VideoOut, AdminVideoRejectRequest, VideoCreate, AdminVideoCreate, CreatorAccountOut, PersonOut
from app.routers.videos import _to_out, _create_video_core, _update_video_core, _upload_to_bunny, _save_poster_file
from app.routers.recommendations import compute_and_store_embedding
from app.routers.people import _save_person_photo
from app.notifications import (
    send_video_approved_whatsapp, send_video_approved_email,
    send_video_rejected_whatsapp, send_video_rejected_email,
)

router = APIRouter(prefix="/admin/videos", tags=["admin-videos"])

# Video approval is day-to-day operational work — available to both
# "admin" and "superadmin" roles (get_current_admin alone is enough here,
# unlike the admin-account-management endpoints in admin_auth.py which
# require get_current_superadmin specifically).


def _notify_video_uploader(video: Video, db: Session, decision: str, reason: str | None = None) -> None:
    """Only Creator/Organiser-uploaded videos have someone to notify —
    admin-uploaded videos with no attribution have no User account
    behind them. Notification failures are non-fatal by design (see
    notifications.py) so this never blocks the approve/reject action
    itself, even if email/WhatsApp aren't configured or fail.
    """
    if not video.uploaded_by_user_id:
        return
    uploader = db.query(User).filter(User.id == video.uploaded_by_user_id).first()
    if not uploader:
        return

    if decision == "approved":
        send_video_approved_email(uploader.email, uploader.name, video.title)
        send_video_approved_whatsapp(uploader.phone, uploader.name, video.title)
    elif decision == "rejected":
        send_video_rejected_email(uploader.email, uploader.name, video.title, reason or "")
        send_video_rejected_whatsapp(uploader.phone, uploader.name, video.title, reason or "")


@router.get("", response_model=list[VideoOut])
def list_videos_for_review(
    status_filter: str = "pending",
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if status_filter not in ("pending", "published", "disabled", "rejected", "all"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")

    query = db.query(Video)
    if status_filter != "all":
        query = query.filter(Video.status == VideoStatus(status_filter))
    videos = query.order_by(Video.created_at.desc()).all()
    return [_to_out(v, db) for v in videos]


@router.put("/{video_id}", response_model=VideoOut)
def edit_video(
    video_id: str,
    payload: VideoCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Full edit — works regardless of the video's current status
    (Pending, Published, Disabled, Rejected). Reuses the exact same
    field-sync helpers as creation (_update_video_core), so editing can
    never silently diverge from how a video is created in the first
    place. Does NOT change status or uploader attribution — this is
    purely a content edit.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    video = _update_video_core(video, payload, db)
    return _to_out(video, db)


@router.post("/{video_id}/approve", response_model=VideoOut)
def approve_video(
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    video.status = VideoStatus.published
    video.published_at = datetime.now(timezone.utc)
    video.admin_note = None
    db.commit()
    db.refresh(video)
    compute_and_store_embedding(video, db)  # best-effort — see its docstring
    _notify_video_uploader(video, db, "approved")
    return _to_out(video, db)


@router.post("/{video_id}/reject", response_model=VideoOut)
def reject_video(
    video_id: str,
    payload: AdminVideoRejectRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    video.status = VideoStatus.rejected
    video.admin_note = payload.admin_note
    db.commit()
    db.refresh(video)
    _notify_video_uploader(video, db, "rejected", reason=payload.admin_note)
    return _to_out(video, db)


@router.post("/{video_id}/disable", response_model=VideoOut)
def disable_video(
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Hides a published video from the public site WITHOUT deleting it
    from the database or removing the file from Bunny Stream — fully
    reversible via /enable.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if video.status != VideoStatus.published:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only published videos can be disabled.")

    video.status = VideoStatus.disabled
    db.commit()
    db.refresh(video)
    return _to_out(video, db)


@router.post("/{video_id}/enable", response_model=VideoOut)
def enable_video(
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if video.status != VideoStatus.disabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only disabled videos can be re-enabled.")

    video.status = VideoStatus.published
    db.commit()
    db.refresh(video)
    return _to_out(video, db)


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Permanently removes the video — deletes the file from Bunny Stream
    (if one was uploaded) AND the database rows. This is the ONLY
    irreversible action in video review; disable/enable is reversible,
    this is not. The frontend is responsible for confirming with the
    admin before calling this.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    if video.bunny_video_id and settings.BUNNY_LIBRARY_ID and settings.BUNNY_API_KEY:
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                await client.delete(
                    f"https://video.bunnycdn.com/library/{settings.BUNNY_LIBRARY_ID}/videos/{video.bunny_video_id}",
                    headers={"AccessKey": settings.BUNNY_API_KEY},
                )
            except Exception:
                # Don't block the database cleanup if Bunny is unreachable
                # — worst case, an orphaned file sits in Bunny storage,
                # which is far better than a video the admin thinks was
                # deleted but is still live on the actual database.
                pass

    db.query(VideoPricing).filter(VideoPricing.video_id == video.id).delete()
    db.query(VideoRevenueTier).filter(VideoRevenueTier.video_id == video.id).delete()
    db.delete(video)
    db.commit()


@router.post("/{video_id}/recompute-embedding", response_model=dict)
def recompute_video_embedding(
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Manual retry for a video whose embedding failed to generate at
    publish time (e.g. VOYAGE_API_KEY wasn't configured yet, or Voyage
    AI was briefly down). Safe to call anytime — recomputes from
    scratch using the video's current title/description/categories.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    success = compute_and_store_embedding(video, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Couldn't compute embedding — check VOYAGE_API_KEY is configured and Voyage AI is reachable.",
        )
    return {"success": True}


@router.get("/creators", response_model=list[CreatorAccountOut])
def search_creator_accounts(
    search: str = "",
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """For the 'Add Video' attribution picker — only Content Creator and
    Plays Organiser accounts are eligible, matching who's normally
    allowed to upload videos themselves.
    """
    query = db.query(User).filter(User.role.in_([UserRole.content_creator, UserRole.plays_organiser]))
    if search.strip():
        like = f"%{search.strip()}%"
        query = query.filter((User.name.ilike(like)) | (User.email.ilike(like)))
    return query.order_by(User.name.asc()).limit(20).all()


@router.post("", response_model=VideoOut, status_code=status.HTTP_201_CREATED)
def create_video_as_admin(
    payload: AdminVideoCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin 'Add Video' — reuses the exact same creation logic as the
    Creator/Organiser upload path (_create_video_core), so the two can
    never silently drift apart. Auto-publishes immediately, unlike
    Creator submissions which start pending — the admin adding this IS
    already the reviewer, so there's no one else to review it. This
    holds true even when attributed_user_id is set: the admin is still
    the one physically creating this entry right now, just crediting it
    to the correct account.
    """
    if payload.attributed_user_id:
        attributed_user = db.query(User).filter(
            User.id == payload.attributed_user_id,
            User.role.in_([UserRole.content_creator, UserRole.plays_organiser]),
        ).first()
        if not attributed_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="attributed_user_id must reference an existing Content Creator or Plays Organiser account.",
            )
        video = _create_video_core(
            payload, db,
            uploaded_by_user_id=attributed_user.id, person_created_by_user_id=attributed_user.id,
            auto_publish=True,
        )
    else:
        video = _create_video_core(
            payload, db,
            uploaded_by_admin_id=current_admin.id, person_created_by_admin_id=current_admin.id,
            auto_publish=True,
        )
    compute_and_store_embedding(video, db)  # best-effort — auto-published, so this is "on publish" too
    return _to_out(video, db)


@router.post("/{video_id}/upload-file", response_model=VideoOut)
async def upload_video_file_as_admin(
    video_id: str,
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    # No ownership filter — any admin can upload the file for any video,
    # matching approve/reject/disable/delete's scope. Previously this
    # filtered by uploaded_by_admin_id.isnot(None), which broke for any
    # video attributed to a Creator/Organiser account (those have
    # uploaded_by_admin_id = null by design) — fixed here.
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    video = await _upload_to_bunny(video, file, db)
    return _to_out(video, db)


@router.post("/{video_id}/upload-poster", response_model=VideoOut)
async def upload_video_poster_as_admin(
    video_id: str,
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    video = await _save_poster_file(video, file, db)
    return _to_out(video, db)


@router.post("/people/{person_id}/upload-photo", response_model=PersonOut)
async def upload_person_photo_as_admin(
    person_id: str,
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin-scoped photo upload for cast/crew Person profiles — needed
    because the regular /api/people/{id}/upload-photo endpoint checks
    ownership against the users table via get_current_user, which an
    admin token can never satisfy (admin tokens only resolve against
    admin_users, by design — see AdminUser model docstring). Any admin
    can upload a photo for any person, matching the same broad scope as
    the other admin video actions (approve/reject/disable/delete don't
    check per-admin ownership either).
    """
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    return await _save_person_photo(person, file, db)
