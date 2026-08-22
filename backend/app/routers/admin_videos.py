from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, Video, VideoStatus
from app.schemas import VideoOut, AdminVideoRejectRequest
from app.routers.videos import _to_out

router = APIRouter(prefix="/admin/videos", tags=["admin-videos"])

# Video approval is day-to-day operational work — available to both
# "admin" and "superadmin" roles (get_current_admin alone is enough here,
# unlike the admin-account-management endpoints in admin_auth.py which
# require get_current_superadmin specifically).


@router.get("", response_model=list[VideoOut])
def list_videos_for_review(
    status_filter: str = "pending",
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if status_filter not in ("pending", "published", "rejected", "all"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")

    query = db.query(Video)
    if status_filter != "all":
        query = query.filter(Video.status == VideoStatus(status_filter))
    videos = query.order_by(Video.created_at.desc()).all()
    return [_to_out(v, db) for v in videos]


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
    return _to_out(video, db)
