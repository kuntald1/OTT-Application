from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LiveStream, LiveStreamStatus
from app.mux_services import verify_mux_webhook_signature

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/mux", status_code=status.HTTP_204_NO_CONTENT)
async def handle_mux_webhook(request: Request, db: Session = Depends(get_db)):
    """Mux calls this whenever a live stream's broadcast state changes.
    Signature-verified (see mux_services.verify_mux_webhook_signature)
    so this can't be spoofed into falsely marking a stream "active" —
    that would hand out a real playback_url for a broadcast that isn't
    actually running.

    Configure this URL (https://theomy.com/api/webhooks/mux) in the
    Mux dashboard's webhook settings once MUX_WEBHOOK_SECRET is set.
    """
    raw_body = await request.body()
    signature = request.headers.get("Mux-Signature", "")

    if not verify_mux_webhook_signature(raw_body, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    payload = await request.json()
    event_type = payload.get("type", "")
    mux_live_stream_id = payload.get("data", {}).get("id")
    if not mux_live_stream_id:
        return

    live_stream = db.query(LiveStream).filter(LiveStream.mux_live_stream_id == mux_live_stream_id).first()
    if not live_stream:
        return  # Unknown stream (e.g. created outside theomy) — nothing to update

    if event_type == "video.live_stream.active":
        live_stream.status = LiveStreamStatus.active
        live_stream.started_at = datetime.now(timezone.utc)
    elif event_type == "video.live_stream.idle":
        # Encoder disconnected — the broadcast session ended, though the
        # Mux live stream RESOURCE may still be reusable depending on
        # how it was configured. theomy treats a single LiveStream row
        # as one broadcast, so this is a real end.
        live_stream.status = LiveStreamStatus.ended
        live_stream.ended_at = datetime.now(timezone.utc)

    db.commit()
