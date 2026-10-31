from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import (
    User, LiveStream, LiveStreamStatus, LiveStreamMonetization,
    LiveStreamPurchase, PaymentStatus, VideoSection,
)
from app.mux_services import create_mux_live_stream, delete_mux_live_stream, MuxServiceError
from app.routers.videos import _has_active_subscription_for_section
from app.schemas import LiveStreamCreate, LiveStreamOut, LiveStreamBroadcastInfoOut

router = APIRouter(prefix="/videos/live", tags=["live-streaming"])

MUX_RTMP_URL = "rtmp://global-live.mux.com:5222/app"


def _playback_url(mux_playback_id: str) -> str:
    return f"https://stream.mux.com/{mux_playback_id}.m3u8"


def _validate_section(section: str) -> VideoSection:
    if section not in ("play", "archive", "both"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="section must be 'play', 'archive', or 'both'.",
        )
    return VideoSection(section)


def _validate_monetization(monetization_type: str, price_inr, price_usd) -> LiveStreamMonetization:
    """Shared by the organiser and admin create/update routes so the two
    can't drift. A ticketed event with no price would render a "Pay"
    button with nothing to charge, so both prices are required up front
    — same stance VideoPricing takes for pay-per-video.
    """
    if monetization_type not in ("subscription", "pay_per_stream"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="monetization_type must be 'subscription' or 'pay_per_stream'.",
        )
    monetization = LiveStreamMonetization(monetization_type)
    if monetization == LiveStreamMonetization.pay_per_stream and (price_inr is None or price_usd is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A Pay Per Streaming event needs both an INR and a USD show price.",
        )
    return monetization


def _effective_section(section: VideoSection, monetization: LiveStreamMonetization) -> VideoSection:
    """A Pay Per Streaming show is sold to whoever wants it — no plan is
    involved, so there's no plan-shaped section to honour. Those are
    always listed in BOTH sections, whatever the caller asked for. The
    admin/organiser form locks the control to match, but the rule lives
    here because the form isn't the only way in.
    """
    if monetization == LiveStreamMonetization.pay_per_stream:
        return VideoSection.both
    return section


def _to_broadcast_info(ls: LiveStream) -> LiveStreamBroadcastInfoOut:
    return LiveStreamBroadcastInfoOut(
        id=ls.id, title=ls.title, description=ls.description,
        section=ls.section.value, status=ls.status.value,
        monetization_type=ls.monetization_type.value,
        price_inr=ls.price_inr, price_usd=ls.price_usd,
        scheduled_start_at=ls.scheduled_start_at, promo_from=ls.promo_from,
        is_disabled=ls.is_disabled,
        rtmp_url=MUX_RTMP_URL, stream_key=ls.mux_stream_key,
        playback_url=_playback_url(ls.mux_playback_id),
    )


def _check_live_access(ls: LiveStream, user: User | None, db: Session) -> tuple[bool, str | None]:
    """Real, server-side access gate — the only thing that decides
    whether playback_url gets populated below. Mirrors videos.py's
    _check_video_access so live and on-demand behave identically:
    the reason strings are the same ones the web/app already branch on
    ("login_required", "subscription_required", "purchase_required").

    Note this answers "may this viewer watch?", NOT "is it on air?" —
    a viewer with access still gets no playback_url until the stream is
    actually active, so the listing can show an announced show to
    everyone while keeping it unplayable.
    """
    if user is None:
        return False, "login_required"

    # The organiser who created the event can always watch their own
    # broadcast back — same self-preview carve-out videos.py gives an
    # uploader, and what makes "My Live Events" usable without the
    # organiser buying a ticket to their own show.
    if ls.uploaded_by_user_id and user.id == ls.uploaded_by_user_id:
        return True, None

    if ls.monetization_type == LiveStreamMonetization.pay_per_stream:
        purchased = (
            db.query(LiveStreamPurchase)
            .filter(
                LiveStreamPurchase.user_id == user.id,
                LiveStreamPurchase.live_stream_id == ls.id,
                LiveStreamPurchase.status == PaymentStatus.paid,
            )
            .first()
        )
        if not purchased:
            return False, "purchase_required"
        return True, None

    # subscription — "both" is satisfied by EITHER plan, so it can't go
    # through _has_active_subscription_for_section directly (that helper
    # only knows the two real sections).
    if ls.section == VideoSection.both:
        if (
            _has_active_subscription_for_section(user, VideoSection.play, db)
            or _has_active_subscription_for_section(user, VideoSection.archive, db)
        ):
            return True, None
        return False, "subscription_required"

    if _has_active_subscription_for_section(user, ls.section, db):
        return True, None
    return False, "subscription_required"


def _to_public_out(ls: LiveStream, viewer: User | None, db: Session) -> LiveStreamOut:
    has_access, access_reason = _check_live_access(ls, viewer, db)
    is_live = ls.status == LiveStreamStatus.active
    return LiveStreamOut(
        id=ls.id, title=ls.title, description=ls.description,
        section=ls.section.value, poster_image_url=ls.poster_image_url,
        status=ls.status.value,
        monetization_type=ls.monetization_type.value,
        price_inr=ls.price_inr, price_usd=ls.price_usd,
        scheduled_start_at=ls.scheduled_start_at,
        has_access=has_access, access_reason=access_reason,
        # Only ever handed out when the viewer may watch AND something is
        # actually being broadcast — an announced-but-not-started event
        # returns null here however good the viewer's subscription is.
        playback_url=_playback_url(ls.mux_playback_id) if (has_access and is_live) else None,
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
def list_live_streams(
    section: str | None = None,
    include_upcoming: bool = False,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Live events for the public side.

    Default (include_upcoming=False) = currently-live only, most
    recently started first — the shape the floating "Live Now" badge
    has always consumed, left deliberately unchanged so adding
    pre-announced events doesn't make upcoming shows render as if they
    were on air.

    include_upcoming=True additionally returns announced-but-not-yet-
    live events (promo_from set and already reached), live ones first
    and then upcoming by show time — this is what the Live listing
    page/screen asks for. Disabled events are hidden either way; see
    LiveStream.is_disabled.

    section (play/archive), when given, scopes results to that section
    OR any event tagged "both" — so a "both" event shows up on
    whichever page the viewer is on, while a plain Play or Archive
    event only shows on its own page.
    """
    query = db.query(LiveStream).filter(LiveStream.is_disabled == False)  # noqa: E712
    if include_upcoming:
        query = query.filter(
            or_(
                LiveStream.status == LiveStreamStatus.active,
                LiveStream.promo_from <= date.today(),
            )
        )
    else:
        query = query.filter(LiveStream.status == LiveStreamStatus.active)

    if section:
        if section not in ("play", "archive"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play' or 'archive'.")
        query = query.filter(LiveStream.section.in_([VideoSection(section), VideoSection.both]))

    streams = query.all()
    # Sorted in Python rather than SQL: "live first, then soonest show"
    # needs two different keys across two groups, and these lists are a
    # handful of rows, not a paginated feed.
    live = sorted(
        [s for s in streams if s.status == LiveStreamStatus.active],
        key=lambda s: (s.started_at is None, s.started_at), reverse=True,
    )
    upcoming = sorted(
        [s for s in streams if s.status != LiveStreamStatus.active],
        key=lambda s: (s.scheduled_start_at is None, s.scheduled_start_at),
    )
    return [_to_public_out(s, current_user, db) for s in live + upcoming]


@router.get("/{live_stream_id}", response_model=LiveStreamOut)
def get_live_stream(
    live_stream_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")
    # A disabled event is hidden from the public exactly as if deleted —
    # its owner can still open it, which is what keeps "My Live Events"
    # working while the event is parked.
    if live_stream.is_disabled and not (
        current_user and live_stream.uploaded_by_user_id == current_user.id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")
    return _to_public_out(live_stream, current_user, db)


@router.post("/{live_stream_id}/simulate-start", response_model=LiveStreamBroadcastInfoOut)
def simulate_start_my_live_stream(
    live_stream_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """⚠️ TEMPORARY / TEST-ONLY — same as admin_live_streams.py's
    version, scoped to the caller's own live streams. Flips status to
    "active" directly without touching Mux or requiring a real RTMP
    broadcast, purely so a creator can preview the Live Now UI without
    OBS. Remove once real end-to-end Mux broadcasting has been tested.
    """
    live_stream = (
        db.query(LiveStream)
        .filter(LiveStream.id == live_stream_id, LiveStream.uploaded_by_user_id == current_user.id)
        .first()
    )
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")

    live_stream.status = LiveStreamStatus.active
    live_stream.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)


@router.post("/{live_stream_id}/end", response_model=LiveStreamBroadcastInfoOut)
def end_my_live_stream(
    live_stream_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marks the broadcast as not-currently-live WITHOUT destroying the
    underlying Mux resource — the same RTMP URL + Stream Key stay valid,
    so pointing OBS (or similar) at them again later goes live under
    this exact same event, no need to create a new one. This is the
    same thing that happens automatically when the encoder disconnects
    (see webhooks.py's video.live_stream.idle handling) — this endpoint
    is just a manual "hide it from Live Now right now" in case the
    webhook is delayed, or the broadcaster forgot to stop OBS.

    Use DELETE /videos/live/{id} instead for a genuinely permanent end
    (that one does destroy the Mux resource).
    """
    live_stream = (
        db.query(LiveStream)
        .filter(LiveStream.id == live_stream_id, LiveStream.uploaded_by_user_id == current_user.id)
        .first()
    )
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")

    live_stream.status = LiveStreamStatus.idle
    live_stream.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(live_stream)
    return _to_broadcast_info(live_stream)


@router.delete("/{live_stream_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_live_stream(
    live_stream_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently removes this live event — unlike /end above, THIS
    does destroy the Mux resource (the RTMP URL + Stream Key stop
    working after this). Use when the event is genuinely over for
    good, not just paused between sessions.
    """
    live_stream = (
        db.query(LiveStream)
        .filter(LiveStream.id == live_stream_id, LiveStream.uploaded_by_user_id == current_user.id)
        .first()
    )
    if not live_stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live stream not found")
    delete_mux_live_stream(live_stream.mux_live_stream_id)
    db.delete(live_stream)
    db.commit()
