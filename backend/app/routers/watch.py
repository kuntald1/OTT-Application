from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, Video, VideoStatus, VideoRevenueTier, VideoWatchRecord,
    RevenueRateConfig, CreatorEarnings, RevenueLedgerEntry,
)
from app.routers.videos import _check_video_access
from app.schemas import (
    WatchHeartbeatRequest, WatchHeartbeatResponse, ContentPerformanceOut,
    RevenueByDayOut, RevenueByCountryOut,
)

router = APIRouter(prefix="/videos", tags=["watch"])


def _compute_gross_revenue_paisa(session_seconds: int, tiers: list[VideoRevenueTier], fallback_rate_paisa_per_minute: int) -> int:
    """Graduated/tiered calculation — same logic as a progressive tax
    bracket, not a flat "whichever tier the total minutes lands in"
    lookup. Each tier only pays its own rate for the portion of the
    watch time that actually falls inside that tier's band, so e.g. a
    501-minute watch on tiers [1-500 => ₹1.50/min, 501+ => ₹1.00/min]
    pays 500*1.50 + 1*1.00, not 501*1.00.

    Falls back to the platform-wide RevenueRateConfig rate (flat, no
    bands) when the video has no VideoRevenueTier rows of its own —
    every video is required to have at least one tier at upload time
    (VideoCreate.revenue_tiers has min_length=1), so this fallback path
    is a safety net for data created before that requirement, not the
    common case.
    """
    minutes = Decimal(session_seconds) / Decimal(60)
    if not tiers:
        return int((minutes * fallback_rate_paisa_per_minute).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    total_paisa = Decimal("0")
    remaining = minutes
    for tier in sorted(tiers, key=lambda t: t.min_minutes):
        if remaining <= 0:
            break
        band_start = Decimal(tier.min_minutes) - 1  # min_minutes is 1-indexed and inclusive
        band_end = Decimal(tier.max_minutes) if tier.max_minutes is not None else None
        band_width = (band_end - band_start) if band_end is not None else remaining
        minutes_in_band = min(remaining, band_width)
        if minutes_in_band <= 0:
            continue
        total_paisa += minutes_in_band * tier.rate_per_minute_inr * 100
        remaining -= minutes_in_band
    return int(total_paisa.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


@router.post("/{video_id}/watch-heartbeat", response_model=WatchHeartbeatResponse)
def watch_heartbeat(
    video_id: str,
    payload: WatchHeartbeatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Called periodically by the player while a video is actually
    playing (see VideoBrowsePage.jsx's RealDetailModal). This is the
    real implementation of the previously-missing Phase 3 piece —
    watch-time session tracking feeding actual creator revenue,
    replacing the old state where CreatorEarnings rows only ever moved
    via manual SQL/seeding.
    """
    video = db.query(Video).filter(Video.id == video_id, Video.status == VideoStatus.published).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    # Never credit a creator for watching their own upload — same
    # self-farming concern as the Pay-Per-Video purchase flow.
    if video.uploaded_by_user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Watch-time isn't tracked on your own uploads.")

    has_access, _ = _check_video_access(video, current_user, db)
    if not has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this video.")

    record = (
        db.query(VideoWatchRecord)
        .filter(VideoWatchRecord.user_id == current_user.id, VideoWatchRecord.video_id == video.id)
        .first()
    )
    if not record:
        record = VideoWatchRecord(user_id=current_user.id, video_id=video.id)
        db.add(record)
        db.flush()

    credited_this_call_paisa = 0

    # Only the "max single-session view" ever grows revenue — a
    # heartbeat reporting fewer seconds than the existing best (e.g. a
    # short re-watch) is recorded but credits nothing further.
    if payload.session_seconds > record.max_session_seconds:
        tiers = (
            db.query(VideoRevenueTier)
            .filter(VideoRevenueTier.video_id == video.id)
            .all()
        )
        rate_config = db.query(RevenueRateConfig).first()
        fallback_rate = rate_config.rate_paisa_per_minute if rate_config else 7
        commission_percent = rate_config.platform_commission_percent if rate_config else Decimal("20")

        new_gross_paisa = _compute_gross_revenue_paisa(payload.session_seconds, tiers, fallback_rate)
        delta_gross_paisa = max(0, new_gross_paisa - record.gross_revenue_paisa)

        if delta_gross_paisa > 0:
            delta_creator_paisa = int(
                (Decimal(delta_gross_paisa) * (100 - commission_percent) / 100)
                .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            )
            if delta_creator_paisa > 0 and video.uploaded_by_user_id:
                earnings = (
                    db.query(CreatorEarnings)
                    .filter(CreatorEarnings.creator_user_id == video.uploaded_by_user_id)
                    .first()
                )
                if not earnings:
                    earnings = CreatorEarnings(creator_user_id=video.uploaded_by_user_id)
                    db.add(earnings)
                    db.flush()
                earnings.total_earned_paisa += delta_creator_paisa
                earnings.available_balance_paisa += delta_creator_paisa
                credited_this_call_paisa = delta_creator_paisa
                record.creator_credited_paisa += delta_creator_paisa

                db.add(RevenueLedgerEntry(
                    video_id=video.id,
                    user_id=current_user.id,
                    creator_user_id=video.uploaded_by_user_id,
                    viewer_country=current_user.country,
                    delta_gross_paisa=delta_gross_paisa,
                    delta_creator_paisa=delta_creator_paisa,
                ))

        record.gross_revenue_paisa = new_gross_paisa
        record.max_session_seconds = payload.session_seconds

    db.commit()
    db.refresh(record)

    return WatchHeartbeatResponse(
        max_session_minutes=(Decimal(record.max_session_seconds) / 60).quantize(Decimal("0.01")),
        credited_this_call_rupees=Decimal(credited_this_call_paisa) / 100,
        total_creator_credited_rupees=Decimal(record.creator_credited_paisa) / 100,
    )


@router.get("/content-performance/mine", response_model=list[ContentPerformanceOut])
def get_my_content_performance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Powers a Creator's "Content performance analytics" — per-video
    unique viewers, total watch minutes, gross revenue generated, and
    what's actually been credited to them after commission. Scoped to
    videos the current user uploaded.
    """
    rows = (
        db.query(
            Video.id,
            Video.title,
            func.count(VideoWatchRecord.id).label("unique_viewers"),
            func.coalesce(func.sum(VideoWatchRecord.max_session_seconds), 0).label("total_seconds"),
            func.coalesce(func.sum(VideoWatchRecord.gross_revenue_paisa), 0).label("gross_paisa"),
            func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).label("credited_paisa"),
        )
        .outerjoin(VideoWatchRecord, VideoWatchRecord.video_id == Video.id)
        .filter(Video.uploaded_by_user_id == current_user.id)
        .group_by(Video.id, Video.title)
        .order_by(func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).desc())
        .all()
    )
    return [
        ContentPerformanceOut(
            video_id=r.id,
            title=r.title,
            unique_viewers=r.unique_viewers,
            total_watch_minutes=(Decimal(r.total_seconds) / 60).quantize(Decimal("0.01")),
            gross_revenue_rupees=(Decimal(r.gross_paisa) / 100).quantize(Decimal("0.01")),
            creator_earned_rupees=(Decimal(r.credited_paisa) / 100).quantize(Decimal("0.01")),
        )
        for r in rows
    ]


@router.get("/revenue/by-day/mine", response_model=list[RevenueByDayOut])
def get_my_revenue_by_day(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A creator's own "Analytics" — same real, event-log-backed day-by-day
    trend as the admin panel's platform-wide version, just scoped to
    RevenueLedgerEntry rows where THIS creator was the one credited.
    """
    if days < 1 or days > 365:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="days must be between 1 and 365.")
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(
            func.date(RevenueLedgerEntry.created_at).label("day"),
            func.sum(RevenueLedgerEntry.delta_creator_paisa).label("creator_paisa"),
            func.sum(RevenueLedgerEntry.delta_gross_paisa).label("gross_paisa"),
        )
        .filter(
            RevenueLedgerEntry.creator_user_id == current_user.id,
            RevenueLedgerEntry.created_at >= since,
        )
        .group_by(func.date(RevenueLedgerEntry.created_at))
        .order_by(func.date(RevenueLedgerEntry.created_at).asc())
        .all()
    )
    return [
        RevenueByDayOut(
            date=str(r.day),
            creator_earned_rupees=(Decimal(r.creator_paisa) / 100).quantize(Decimal("0.01")),
            gross_revenue_rupees=(Decimal(r.gross_paisa) / 100).quantize(Decimal("0.01")),
        )
        for r in rows
    ]


@router.get("/revenue/by-country/mine", response_model=list[RevenueByCountryOut])
def get_my_revenue_by_country(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Same viewer-by-country breakdown as the admin panel, scoped to
    this creator's own content. viewer_country is the viewer's
    registered account country (not IP geolocation) — same caveat as
    the admin version.
    """
    rows = (
        db.query(
            func.coalesce(RevenueLedgerEntry.viewer_country, "Unknown").label("country"),
            func.count(func.distinct(RevenueLedgerEntry.user_id)).label("viewer_count"),
            func.sum(RevenueLedgerEntry.delta_creator_paisa).label("creator_paisa"),
        )
        .filter(RevenueLedgerEntry.creator_user_id == current_user.id)
        .group_by(func.coalesce(RevenueLedgerEntry.viewer_country, "Unknown"))
        .order_by(func.sum(RevenueLedgerEntry.delta_creator_paisa).desc())
        .all()
    )
    return [
        RevenueByCountryOut(
            country=r.country,
            viewer_count=r.viewer_count,
            creator_earned_rupees=(Decimal(r.creator_paisa) / 100).quantize(Decimal("0.01")),
        )
        for r in rows
    ]
