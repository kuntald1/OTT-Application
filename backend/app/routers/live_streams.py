from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import User, LiveStream, LiveStreamStatus, VideoSection
from app.mux_services import create_mux_live_stream, delete_mux_live_stream, MuxServiceError
from app.schemas import LiveStreamCreate, LiveStreamOut, LiveStreamBroadcastInfoOut

router = APIRouter(prefix="/videos/live", tags=["live-streaming"])

MUX_RTMP_URL = "rtmp://global-live.mux.com:5222/app"


def _playback_url(mux_playback_id: str) -> str:
    return f"https://stream.mux.com/{mux_playback_id}.m3u8"


def _to_broadcast_info(ls: LiveStream) -> LiveStreamBroadcastInfoOut:
    return LiveStreamBroadcastInfoOut(
        id=ls.id, title=ls.title, status=ls.status.value,
        rtmp_url=MUX_RTMP_URL, stream_key=ls.mux_stream_key,
        playback_url=_playback_url(ls.mux_playback_id),
    )


def _to_public_out(ls: LiveStream, viewer: User | None) -> LiveStreamOut:
    # Viewer access isn't subscription-gated yet (see LiveStream's
    # docstring) — just needs to be logged in. playback_url is only
    # ever populated for a logged-in viewer, same "don't hand out the
    # URL to nobody" shape as VOD's has_access/embed_url pattern.
    return LiveStreamOut(
        id=ls.id, title=ls.title, description=ls.description,
        section=ls.section.value, poster_image_url=ls.poster_image_url,
        status=ls.status.value,
        playback_url=_playback_url(ls.mux_playback_id) if viewer else None,
        started_at=ls.started_at,
    )


@router.post("", response_model=LiveStreamBroadcastInfoOut, status_code=status.HTTP_201_CREATED)
def create_live_stream(
    payload: LiveStreamCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Creator/Organiser live stream creation — gated by
    User.can_live_stream, an admin-toggled permission (see Admin >
    Users), not just having the right role. Returns the RTMP URL and
    stream key ONCE in this response; the same info is retrievable
    again via GET /videos/live/mine for as long as this stream exists.
    """
    if not current_user.can_live_stream:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Live streaming isn't enabled for your account yet — ask an admin to enable it.",
        )
    if payload.section not in ("play", "archive", "both"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play', 'archive', or 'both'.")

    try:
        mux_data = create_mux_live_stream(payload.title)
    except MuxServiceError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    live_stream = LiveStream(
        title=payload.title,
        description=payload.description,
        section=VideoSection(payload.section),
        uploaded_by_user_id=current_user.id,
        mux_live_stream_id=mux_data["id"],
        mux_playback_id=mux_data["playback_ids"][0]["id"],
        mux_stream_key=mux_data["stream_key"],
    )
    db.add(live_stream)
    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)


@router.get("/mine", response_model=list[LiveStreamBroadcastInfoOut])
def list_my_live_streams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    streams = (
        db.query(LiveStream)
        .filter(LiveStream.uploaded_by_user_id == current_user.id)
        .order_by(LiveStream.created_at.desc())
        .all()
    )
    return [_to_broadcast_info(s) for s in streams]


@router.get("", response_model=list[LiveStreamOut])
def list_active_live_streams(
    section: str | None = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Currently-live streams, most recently started first. See
    LiveStream's docstring — no subscription check yet, just requires
    the viewer to be logged in to actually get a playback_url back.
    section (play/archive), when given, scopes results to that
    section OR any live stream tagged "both" — so a "both" event shows
    up on whichever page the viewer is on, while a plain Play or
    Archive event only shows on its own page.
    """
    query = db.query(LiveStream).filter(LiveStream.status == LiveStreamStatus.active)
    if section:
        if section not in ("play", "archive"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play' or 'archive'.")
        query = query.filter(LiveStream.section.in_([VideoSection(section), VideoSection.both]))
    streams = query.order_by(LiveStream.started_at.desc()).all()
    return [_to_public_out(s, current_user) for s in streams]


@router.get("/{live_stream_id}", response_model=LiveStreamOut)
def get_live_stream(
    live_stream_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")
    return _to_public_out(live_stream, current_user)


@router.post("/{live_stream_id}/end", response_model=LiveStreamBroadcastInfoOut)
def end_my_live_stream(
    live_stream_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually ends a broadcast (in addition to it auto-ending via the
    Mux webhook when the encoder disconnects) — deletes the Mux
    resource so it can't be pushed to again, and marks it ended here.
    """
    live_stream = (
        db.query(LiveStream)
        .filter(LiveStream.id == live_stream_id, LiveStream.uploaded_by_user_id == current_user.id)
        .first()
    )
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")

    delete_mux_live_stream(live_stream.mux_live_stream_id)
    live_stream.status = LiveStreamStatus.ended
    live_stream.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)
