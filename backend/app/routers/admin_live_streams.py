from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, LiveStream, LiveStreamStatus, VideoSection
from app.mux_services import create_mux_live_stream, delete_mux_live_stream, MuxServiceError
from app.routers.live_streams import _to_broadcast_info, MUX_RTMP_URL
from app.schemas import LiveStreamCreate, LiveStreamBroadcastInfoOut

router = APIRouter(prefix="/admin/videos/live", tags=["admin-live-streaming"])


@router.post("", response_model=LiveStreamBroadcastInfoOut, status_code=status.HTTP_201_CREATED)
def create_live_stream_as_admin(
    payload: LiveStreamCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin can always create a live stream — no can_live_stream
    permission check (that flag only gates Creator/Organiser accounts,
    see User model), since admins are theomy staff.
    """
    if payload.section not in ("play", "archive"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play' or 'archive'.")

    try:
        mux_data = create_mux_live_stream(payload.title)
    except MuxServiceError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    live_stream = LiveStream(
        title=payload.title,
        description=payload.description,
        section=VideoSection(payload.section),
        uploaded_by_admin_id=current_admin.id,
        mux_live_stream_id=mux_data["id"],
        mux_playback_id=mux_data["playback_ids"][0]["id"],
        mux_stream_key=mux_data["stream_key"],
    )
    db.add(live_stream)
    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)


@router.get("", response_model=list[LiveStreamBroadcastInfoOut])
def list_all_live_streams(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every live stream regardless of owner or status — the admin
    management view, includes RTMP/stream-key details so support staff
    can help a creator troubleshoot their broadcast setup if needed.
    """
    streams = db.query(LiveStream).order_by(LiveStream.created_at.desc()).all()
    return [_to_broadcast_info(s) for s in streams]


@router.post("/{live_stream_id}/end", response_model=LiveStreamBroadcastInfoOut)
def end_any_live_stream(
    live_stream_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")

    delete_mux_live_stream(live_stream.mux_live_stream_id)
    live_stream.status = LiveStreamStatus.ended
    live_stream.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)


@router.delete("/{live_stream_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_live_stream(
    live_stream_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")
    delete_mux_live_stream(live_stream.mux_live_stream_id)
    db.delete(live_stream)
    db.commit()
