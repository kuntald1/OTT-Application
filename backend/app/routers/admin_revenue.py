from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.date_range import parse_date_range
from app.deps import get_current_admin, get_current_superadmin
from app.models import (
    AdminUser, User, Video, VideoWatchRecord, WithdrawalRequest, WithdrawalStatus, CreatorEarnings,
    RevenueRateConfig, RevenueLedgerEntry,
)
from app.notifications import send_withdrawal_paid_email, send_withdrawal_paid_whatsapp, send_withdrawal_rejected_email
from app.schemas import (
    AdminWithdrawalOut, AdminWithdrawalActionRequest, AdminContentPerformanceOut,
    AdminRevenueConfigUpdate, RevenueByDayOut, RevenueByCountryOut, RevenueRateOut,
    AdminRevenueSummaryOut, AdminRevenueByCreatorOut,
)
from app.models import VideoStatus

router = APIRouter(prefix="/admin/revenue", tags=["admin-revenue"])


def _to_admin_withdrawal_out(w: WithdrawalRequest, creator: User) -> AdminWithdrawalOut:
    return AdminWithdrawalOut(
        id=w.id,
        creator_user_id=w.creator_user_id,
        creator_name=creator.name if creator else "Unknown",
        creator_email=creator.email if creator else "unknown@theomy.com",
        amount_rupees=Decimal(w.amount_paisa) / 100,
        status=w.status.value,
        admin_note=w.admin_note,
        requested_at=w.requested_at,
        processed_at=w.processed_at,
    )


@router.get("/withdrawals", response_model=list[AdminWithdrawalOut])
def list_withdrawals(
    status_filter: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Withdrawal request & payment tracking — the admin side of the
    creator's /revenue/withdrawals list. status_filter (pending/
    approved/rejected/paid) narrows the list; omitted shows everything.
    Scoped to [start_date, end_date] against requested_at — no dates
    given defaults to the last 1 month (see app/date_range.py). Most
    recent request first.
    """
    start, end = parse_date_range(start_date, end_date)
    query = (
        db.query(WithdrawalRequest, User)
        .join(User, User.id == WithdrawalRequest.creator_user_id)
        .filter(WithdrawalRequest.requested_at >= start, WithdrawalRequest.requested_at <= end)
    )
    if status_filter:
        try:
            query = query.filter(WithdrawalRequest.status == WithdrawalStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter.")
    rows = query.order_by(WithdrawalRequest.requested_at.desc()).all()
    return [_to_admin_withdrawal_out(w, u) for w, u in rows]


def _get_withdrawal_or_404(withdrawal_id: str, db: Session) -> WithdrawalRequest:
    w = db.query(WithdrawalRequest).filter(WithdrawalRequest.id == withdrawal_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Withdrawal request not found")
    return w


@router.post("/withdrawals/{withdrawal_id}/approve", response_model=AdminWithdrawalOut)
def approve_withdrawal(
    withdrawal_id: str,
    payload: AdminWithdrawalActionRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Marks the request approved — this is an acknowledgement that the
    admin will pay the creator manually OUTSIDE the platform (bank
    transfer, UPI, etc., since RazorpayX payout automation isn't wired
    up yet). It does NOT move money by itself; call mark-paid below
    once the manual transfer is actually done, so "approved" and "paid"
    stay honestly distinct states rather than collapsing into one click.
    """
    w = _get_withdrawal_or_404(withdrawal_id, db)
    if w.status != WithdrawalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Withdrawal is already {w.status.value}.")
    w.status = WithdrawalStatus.approved
    w.admin_note = payload.admin_note
    w.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(w)
    creator = db.query(User).filter(User.id == w.creator_user_id).first()
    return _to_admin_withdrawal_out(w, creator)


@router.post("/withdrawals/{withdrawal_id}/mark-paid", response_model=AdminWithdrawalOut)
def mark_withdrawal_paid(
    withdrawal_id: str,
    payload: AdminWithdrawalActionRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Confirms the manual payment has actually gone out. Allowed from
    either pending or approved, since a small operation may pay
    directly without a separate approve step.
    """
    w = _get_withdrawal_or_404(withdrawal_id, db)
    if w.status not in (WithdrawalStatus.pending, WithdrawalStatus.approved):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Withdrawal is already {w.status.value}.")
    w.status = WithdrawalStatus.paid
    if payload.admin_note:
        w.admin_note = payload.admin_note
    w.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(w)
    creator = db.query(User).filter(User.id == w.creator_user_id).first()

    # Notifications — best-effort, never block the response on these,
    # same non-fatal pattern used everywhere else in this codebase.
    amount_rupees = Decimal(w.amount_paisa) / 100
    if creator:
        if creator.phone:
            send_withdrawal_paid_whatsapp(creator.phone, amount_rupees)
        send_withdrawal_paid_email(creator.email, creator.name, amount_rupees)

    return _to_admin_withdrawal_out(w, creator)


@router.post("/withdrawals/{withdrawal_id}/reject", response_model=AdminWithdrawalOut)
def reject_withdrawal(
    withdrawal_id: str,
    payload: AdminWithdrawalActionRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Rejecting refunds the reserved amount back to the creator's
    available_balance_paisa — the withdrawal request flow deducted it
    upfront on submission (see routers/withdrawals.py) specifically so
    the same balance can't be requested twice while pending; rejecting
    without refunding would silently destroy that balance.
    """
    if not payload.admin_note:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin_note is required when rejecting.")
    w = _get_withdrawal_or_404(withdrawal_id, db)
    if w.status != WithdrawalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Withdrawal is already {w.status.value}.")

    earnings = db.query(CreatorEarnings).filter(CreatorEarnings.creator_user_id == w.creator_user_id).first()
    if earnings:
        earnings.available_balance_paisa += w.amount_paisa

    w.status = WithdrawalStatus.rejected
    w.admin_note = payload.admin_note
    w.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(w)
    creator = db.query(User).filter(User.id == w.creator_user_id).first()

    if creator:
        send_withdrawal_rejected_email(creator.email, creator.name, Decimal(w.amount_paisa) / 100, payload.admin_note)

    return _to_admin_withdrawal_out(w, creator)


def _config_to_out(config: RevenueRateConfig) -> RevenueRateOut:
    rate_paisa = config.rate_paisa_per_minute
    rupees = Decimal(rate_paisa) / 100
    display = f"₹{int(rupees)}/min" if rate_paisa % 100 == 0 else f"{rate_paisa} paisa/min (₹{rupees}/min)"
    return RevenueRateOut(
        rate_paisa_per_minute=rate_paisa,
        rate_rupees_per_minute=rupees,
        rate_display=display,
        platform_commission_percent=config.platform_commission_percent,
    )


@router.get("/config", response_model=RevenueRateOut)
def get_revenue_config(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin-scoped read of the same config the public /revenue-rate
    endpoint exposes — kept separate so the edit form below has a
    consistent auth-gated pair (GET+PUT) instead of mixing a public
    read with an admin-only write.
    """
    config = db.query(RevenueRateConfig).first()
    if not config:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Revenue config is not set up.")
    return _config_to_out(config)


@router.put("/config", response_model=RevenueRateOut)
def update_revenue_config(
    payload: AdminRevenueConfigUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """The "Platform default rate" / commission % editor — superadmin
    only, same financial-config restriction as tax/reward rates
    elsewhere in this codebase. This is the first of theomy's
    admin-editable config tables to actually get a write endpoint
    instead of requiring direct SQL.

    Only affects videos with NO custom Revenue-Share Tiers of their
    own — a video with tiers always uses those instead (see
    routers/watch.py's _compute_gross_revenue_paisa).
    """
    config = db.query(RevenueRateConfig).first()
    if not config:
        config = RevenueRateConfig()
        db.add(config)
    config.rate_paisa_per_minute = payload.rate_paisa_per_minute
    config.platform_commission_percent = payload.platform_commission_percent
    db.commit()
    db.refresh(config)
    return _config_to_out(config)


@router.get("/analytics/by-day", response_model=list[RevenueByDayOut])
def get_revenue_by_day(
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Real day-by-day revenue trend — built from RevenueLedgerEntry,
    which logs every individual crediting event (not the running totals
    VideoWatchRecord holds). Scoped to [start_date, end_date] — no
    dates given defaults to the last 1 month (see app/date_range.py).
    Platform-wide, most recent day last.
    """
    start, end = parse_date_range(start_date, end_date)
    rows = (
        db.query(
            func.date(RevenueLedgerEntry.created_at).label("day"),
            func.sum(RevenueLedgerEntry.delta_creator_paisa).label("creator_paisa"),
            func.sum(RevenueLedgerEntry.delta_gross_paisa).label("gross_paisa"),
        )
        .filter(RevenueLedgerEntry.created_at >= start, RevenueLedgerEntry.created_at <= end)
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


@router.get("/analytics/by-country", response_model=list[RevenueByCountryOut])
def get_revenue_by_country(
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Viewer breakdown by country — sourced from viewer_country on each
    RevenueLedgerEntry, which is a copy of the viewer's registered
    User.country at the moment they were credited (NOT IP-based
    geolocation; theomy doesn't do that). viewer_count is distinct
    viewers per country, not raw event rows. Scoped to [start_date,
    end_date] — no dates given defaults to the last 1 month.
    """
    start, end = parse_date_range(start_date, end_date)
    rows = (
        db.query(
            func.coalesce(RevenueLedgerEntry.viewer_country, "Unknown").label("country"),
            func.count(func.distinct(RevenueLedgerEntry.user_id)).label("viewer_count"),
            func.sum(RevenueLedgerEntry.delta_creator_paisa).label("creator_paisa"),
        )
        .filter(RevenueLedgerEntry.created_at >= start, RevenueLedgerEntry.created_at <= end)
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


@router.get("/summary", response_model=AdminRevenueSummaryOut)
def get_revenue_summary(
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide KPI cards, scoped to [start_date, end_date] — no
    dates given defaults to the last 1 month (see app/date_range.py).

    gross/platform/creator revenue and total_viewer_records come from
    RevenueLedgerEntry (one row per actual crediting event, so these
    are genuinely date-scoped). total_watch_minutes and
    avg_revenue_per_1000_minutes_rupees, and total_published_videos
    stay ALL-TIME regardless of the date picker — the ledger tracks
    money credited, not seconds watched, so there's no reliable way to
    attribute watch-duration to a specific window (and the rate itself
    can change over time, so back-computing minutes from money would
    be inaccurate — see the by-creator docstring below for the same
    reasoning).
    """
    start, end = parse_date_range(start_date, end_date)

    ledger_totals = db.query(
        func.coalesce(func.sum(RevenueLedgerEntry.delta_gross_paisa), 0).label("gross_paisa"),
        func.coalesce(func.sum(RevenueLedgerEntry.delta_creator_paisa), 0).label("creator_paisa"),
        func.count(RevenueLedgerEntry.id).label("viewer_records"),
    ).filter(RevenueLedgerEntry.created_at >= start, RevenueLedgerEntry.created_at <= end).first()

    all_time_totals = db.query(
        func.coalesce(func.sum(VideoWatchRecord.max_session_seconds), 0).label("total_seconds"),
        func.coalesce(func.sum(VideoWatchRecord.gross_revenue_paisa), 0).label("all_time_gross_paisa"),
    ).first()

    total_videos = db.query(func.count(Video.id)).filter(Video.status == VideoStatus.published).scalar() or 0

    gross_paisa = ledger_totals.gross_paisa or 0
    creator_paisa = ledger_totals.creator_paisa or 0
    platform_paisa = gross_paisa - creator_paisa
    total_minutes = Decimal(all_time_totals.total_seconds or 0) / 60

    avg_rpm = (
        (Decimal(all_time_totals.all_time_gross_paisa or 0) / 100) / total_minutes * 1000
        if total_minutes > 0 else Decimal("0")
    )

    return AdminRevenueSummaryOut(
        gross_revenue_rupees=(Decimal(gross_paisa) / 100).quantize(Decimal("0.01")),
        platform_share_rupees=(Decimal(platform_paisa) / 100).quantize(Decimal("0.01")),
        creator_share_rupees=(Decimal(creator_paisa) / 100).quantize(Decimal("0.01")),
        total_watch_minutes=total_minutes.quantize(Decimal("0.01")),
        total_viewer_records=ledger_totals.viewer_records or 0,
        total_published_videos=total_videos,
        avg_revenue_per_1000_minutes_rupees=avg_rpm.quantize(Decimal("0.01")),
    )


@router.get("/by-creator", response_model=list[AdminRevenueByCreatorOut])
def get_revenue_by_creator(
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """The "Revenue Share Report" — one row per creator showing the
    full Gross → Platform/Creator Share → Paid → Pending chain. Gross/
    platform/creator share are scoped to [start_date, end_date] (via
    RevenueLedgerEntry.creator_user_id, which is already denormalized
    onto each ledger row); paid/pending stay ALL-TIME, since a
    withdrawal payout isn't tied to any one earning period — a creator
    can withdraw earnings from months ago at any time, so scoping
    "paid" to the selected window would misrepresent their real
    running balance. Most gross revenue first.
    """
    start, end = parse_date_range(start_date, end_date)

    gross_rows = (
        db.query(
            RevenueLedgerEntry.creator_user_id,
            func.coalesce(func.sum(RevenueLedgerEntry.delta_gross_paisa), 0).label("gross_paisa"),
            func.coalesce(func.sum(RevenueLedgerEntry.delta_creator_paisa), 0).label("creator_paisa"),
        )
        .filter(
            RevenueLedgerEntry.creator_user_id.isnot(None),
            RevenueLedgerEntry.created_at >= start, RevenueLedgerEntry.created_at <= end,
        )
        .group_by(RevenueLedgerEntry.creator_user_id)
        .all()
    )
    paid_rows = (
        db.query(
            WithdrawalRequest.creator_user_id,
            func.coalesce(func.sum(WithdrawalRequest.amount_paisa), 0).label("paid_paisa"),
        )
        .filter(WithdrawalRequest.status == WithdrawalStatus.paid)
        .group_by(WithdrawalRequest.creator_user_id)
        .all()
    )
    paid_by_creator = {r.creator_user_id: r.paid_paisa for r in paid_rows}

    creator_ids = [r.creator_user_id for r in gross_rows]
    creators = {u.id: u for u in db.query(User).filter(User.id.in_(creator_ids)).all()} if creator_ids else {}

    results = []
    for r in gross_rows:
        creator = creators.get(r.creator_user_id)
        gross_paisa = r.gross_paisa or 0
        creator_paisa = r.creator_paisa or 0
        platform_paisa = gross_paisa - creator_paisa
        paid_paisa = paid_by_creator.get(r.creator_user_id, 0)
        pending_paisa = max(0, creator_paisa - paid_paisa)
        results.append(AdminRevenueByCreatorOut(
            creator_user_id=r.creator_user_id,
            creator_name=creator.name if creator else "Unknown",
            creator_email=creator.email if creator else "unknown@theomy.com",
            gross_revenue_rupees=(Decimal(gross_paisa) / 100).quantize(Decimal("0.01")),
            platform_share_rupees=(Decimal(platform_paisa) / 100).quantize(Decimal("0.01")),
            creator_share_rupees=(Decimal(creator_paisa) / 100).quantize(Decimal("0.01")),
            paid_rupees=(Decimal(paid_paisa) / 100).quantize(Decimal("0.01")),
            pending_rupees=(Decimal(pending_paisa) / 100).quantize(Decimal("0.01")),
        ))
    results.sort(key=lambda x: x.gross_revenue_rupees, reverse=True)
    return results


@router.get("/content-performance", response_model=list[AdminContentPerformanceOut])
def get_all_content_performance(
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide "Content performance analytics" — same shape as a
    creator's own /videos/content-performance/mine, but across every
    uploaded video, with the creator's name attached. unique_viewers,
    gross_revenue, and creator_earned are scoped to [start_date,
    end_date] via RevenueLedgerEntry; total_watch_minutes stays
    ALL-TIME (see get_revenue_summary's docstring for why — the ledger
    tracks money credited per event, not seconds watched).
    """
    start, end = parse_date_range(start_date, end_date)

    ledger_rows = (
        db.query(
            RevenueLedgerEntry.video_id,
            func.count(func.distinct(RevenueLedgerEntry.user_id)).label("unique_viewers"),
            func.coalesce(func.sum(RevenueLedgerEntry.delta_gross_paisa), 0).label("gross_paisa"),
            func.coalesce(func.sum(RevenueLedgerEntry.delta_creator_paisa), 0).label("credited_paisa"),
        )
        .filter(RevenueLedgerEntry.created_at >= start, RevenueLedgerEntry.created_at <= end)
        .group_by(RevenueLedgerEntry.video_id)
        .all()
    )
    ledger_by_video = {r.video_id: r for r in ledger_rows}

    watch_minutes_rows = (
        db.query(
            VideoWatchRecord.video_id,
            func.coalesce(func.sum(VideoWatchRecord.max_session_seconds), 0).label("total_seconds"),
        )
        .group_by(VideoWatchRecord.video_id)
        .all()
    )
    minutes_by_video = {r.video_id: Decimal(r.total_seconds) / 60 for r in watch_minutes_rows}

    videos = (
        db.query(Video.id, Video.title, User.name.label("creator_name"))
        .outerjoin(User, User.id == Video.uploaded_by_user_id)
        .filter(Video.id.in_(list(ledger_by_video.keys())))
        .all()
    ) if ledger_by_video else []

    results = []
    for v in videos:
        ledger = ledger_by_video.get(v.id)
        results.append(AdminContentPerformanceOut(
            video_id=v.id,
            title=v.title,
            creator_name=v.creator_name or "Admin-uploaded",
            unique_viewers=ledger.unique_viewers if ledger else 0,
            total_watch_minutes=minutes_by_video.get(v.id, Decimal("0")).quantize(Decimal("0.01")),
            gross_revenue_rupees=(Decimal(ledger.gross_paisa) / 100).quantize(Decimal("0.01")) if ledger else Decimal("0.00"),
            creator_earned_rupees=(Decimal(ledger.credited_paisa) / 100).quantize(Decimal("0.01")) if ledger else Decimal("0.00"),
        ))
    results.sort(key=lambda x: x.creator_earned_rupees, reverse=True)
    return results
