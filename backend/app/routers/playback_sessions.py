from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, Video, VideoStatus, VideoMonetization, Subscription, PlaybackSession,
)
from app.schemas import (
    PlaybackSessionStartRequest, PlaybackSessionStartResponse, PlaybackSessionEndRequest,
)

router = APIRouter(prefix="/videos", tags=["playback-sessions"])

# A session with no heartbeat in this long is treated as gone (tab
# closed, connection lost, app backgrounded) — the player heartbeats
# every 20s (see VideoBrowsePage.jsx), so 50s tolerates one missed beat
# without prematurely freeing a slot someone is still actively using.
ACTIVE_WINDOW_SECONDS = 50


def _get_max_screens(video: Video, user: User, db: Session) -> int:
    """How many concurrent devices this user is allowed for THIS video.
    Pay-Per-Video purchases don't have a "screens" concept at all (no
    screens selector exists at checkout) — a single stream is the
    reasonable default there. Subscription-gated videos use whatever
    screens count that subscription was actually bought with.
    """
    if video.monetization_type == VideoMonetization.pay_per_video:
        return 1

    required_plan = {"play": "Play", "archive": "Archive"}[video.section.value]
    sub = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user.id,
            Subscription.is_active == True,  # noqa: E712
            Subscription.expires_at > datetime.now(timezone.utc),
            Subscription.plan_name.in_([required_plan, "Both"]),
        )
        .first()
    )
    return sub.screens if sub else 1


@router.post("/{video_id}/playback-session/start", response_model=PlaybackSessionStartResponse)
def start_playback_session(
    video_id: str,
    payload: PlaybackSessionStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Called right before playback actually begins (Play pressed, not
    just the detail page loading). Registers/refreshes this device's
    session and checks it against the real screens limit — this is the
    enforcement that was previously entirely missing; "screens" only
    ever changed the price before this.
    """
    video = db.query(Video).filter(Video.id == video_id, Video.status == VideoStatus.published).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    max_screens = _get_max_screens(video, current_user, db)
    active_cutoff = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_WINDOW_SECONDS)

    own_session = (
        db.query(PlaybackSession)
        .filter(PlaybackSession.user_id == current_user.id, PlaybackSession.session_token == payload.session_token)
        .first()
    )

    other_active_count = (
        db.query(PlaybackSession)
        .filter(
            PlaybackSession.user_id == current_user.id,
            PlaybackSession.session_token != payload.session_token,
            PlaybackSession.last_heartbeat_at >= active_cutoff,
        )
        .count()
    )

    if other_active_count >= max_screens:
        return PlaybackSessionStartResponse(
            allowed=False,
            active_screens=other_active_count + (1 if own_session else 0),
            max_screens=max_screens,
            reason=(
                f"You're already watching on {max_screens} device{'s' if max_screens != 1 else ''} "
                f"— that's the limit for your plan. Stop playback elsewhere first, or upgrade for more screens."
            ),
        )

    if own_session:
        own_session.video_id = video.id
        own_session.last_heartbeat_at = datetime.now(timezone.utc)
    else:
        db.add(PlaybackSession(
            user_id=current_user.id,
            session_token=payload.session_token,
            video_id=video.id,
        ))
    db.commit()

    return PlaybackSessionStartResponse(
        allowed=True,
        active_screens=other_active_count + 1,
        max_screens=max_screens,
    )


@router.post("/playback-session/end", status_code=status.HTTP_204_NO_CONTENT)
def end_playback_session(
    payload: PlaybackSessionEndRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Called when the player closes/unmounts — frees the slot
    immediately instead of waiting for ACTIVE_WINDOW_SECONDS to elapse,
    so switching devices deliberately doesn't feel artificially
    throttled.
    """
    session = (
        db.query(PlaybackSession)
        .filter(PlaybackSession.user_id == current_user.id, PlaybackSession.session_token == payload.session_token)
        .first()
    )
    if session:
        db.delete(session)
        db.commit()
