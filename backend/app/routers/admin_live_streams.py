from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AdminUser, LiveStream, LiveStreamStatus, LiveStreamMonetization, VideoSection,
)
from app.mux_services import create_mux_live_stream, delete_mux_live_stream, MuxServiceError
from app.routers.live_streams import (
    _effective_section, _to_broadcast_info, _validate_monetization, _validate_section,
    apply_live_stream_update, MUX_RTMP_URL,
)
from app.schemas import LiveStreamCreate, LiveStreamUpdate, LiveStreamBroadcastInfoOut

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
    monetization = _validate_monetization(
        payload.monetization_type, payload.price_inr, payload.price_usd
    )
    section = _effective_section(_validate_section(payload.section), monetization)

    try:
        mux_data = create_mux_live_stream(payload.title)
    except MuxServiceError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    is_ppv = monetization == LiveStreamMonetization.pay_per_stream
    live_stream = LiveStream(
        title=payload.title,
        description=payload.description,
        section=section,
        monetization_type=monetization,
        price_inr=payload.price_inr if is_ppv else None,
        price_usd=payload.price_usd if is_ppv else None,
        scheduled_start_at=payload.scheduled_start_at,
        promo_from=payload.promo_from,
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


@router.put("/{live_stream_id}", response_model=LiveStreamBroadcastInfoOut)
def update_live_stream(
    live_stream_id: str,
    payload: LiveStreamUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Edits theomy-side metadata only — see LiveStreamUpdate's
    docstring for why the Mux-linked fields (RTMP key, playback id)
    are never editable here. Works regardless of the stream's current
    status (idle/active/ended), since correcting a typo in the title
    of an already-ended event is a legitimate use case too.

    The editing rules themselves live in live_streams.py's
    apply_live_stream_update, shared with the organiser's own-events
    route so an admin and an organiser are held to the same rules.
    """
    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")

    apply_live_stream_update(live_stream, payload)

    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)


@router.post("/{live_stream_id}/simulate-start", response_model=LiveStreamBroadcastInfoOut)
def simulate_start_live_stream(
    live_stream_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """⚠️ TEMPORARY / TEST-ONLY — flips status to "active" directly in
    theomy's own database WITHOUT touching Mux or requiring a real RTMP
    broadcast. Exists purely so the "Live Now" row, floating badge, and
    player UI can be previewed/tested without OBS or a real broadcast
    running. In real use, status only ever becomes "active" via the
    signature-verified Mux webhook (see webhooks.py) when a genuine
    broadcast starts — this endpoint bypasses that entirely and should
    be removed once real end-to-end Mux broadcasting has been tested.
    """
    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")

    live_stream.status = LiveStreamStatus.active
    live_stream.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)


@router.post("/{live_stream_id}/end", response_model=LiveStreamBroadcastInfoOut)
def end_any_live_stream(
    live_stream_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Marks not-currently-live without destroying the Mux resource —
    see live_streams.py's end_my_live_stream for the full reasoning
    (same fix applies here: this used to permanently kill the RTMP
    key, which is why "End" made a stream unresumable — now it
    doesn't, and DELETE below remains the truly permanent action).
    """
    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")

    live_stream.status = LiveStreamStatus.idle
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
