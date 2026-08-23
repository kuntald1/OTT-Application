from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import (
    AdminUser, User, Video, VideoWatchRecord, WithdrawalRequest, WithdrawalStatus, CreatorEarnings,
    RevenueRateConfig, RevenueLedgerEntry,
)
from app.notifications import send_withdrawal_paid_email, send_withdrawal_paid_whatsapp, send_withdrawal_rejected_email
from app.schemas import (
    AdminWithdrawalOut, AdminWithdrawalActionRequest, AdminContentPerformanceOut,
    AdminRevenueConfigUpdate, RevenueByDayOut, RevenueByCountryOut, RevenueRateOut,
)

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
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Withdrawal request & payment tracking — the admin side of the
    creator's /revenue/withdrawals list. status_filter (pending/
    approved/rejected/paid) narrows the list; omitted shows everything,
    most recent request first.
    """
    query = db.query(WithdrawalRequest, User).join(User, User.id == WithdrawalRequest.creator_user_id)
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
    days: int = 30,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Real day-by-day revenue trend — built from RevenueLedgerEntry,
    which logs every individual crediting event (not the running totals
    VideoWatchRecord holds). Platform-wide, most recent day last.
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
        .filter(RevenueLedgerEntry.created_at >= since)
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
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Viewer breakdown by country — sourced from viewer_country on each
    RevenueLedgerEntry, which is a copy of the viewer's registered
    User.country at the moment they were credited (NOT IP-based
    geolocation; theomy doesn't do that). viewer_count is distinct
    viewers per country, not raw event rows.
    """
    rows = (
        db.query(
            func.coalesce(RevenueLedgerEntry.viewer_country, "Unknown").label("country"),
            func.count(func.distinct(RevenueLedgerEntry.user_id)).label("viewer_count"),
            func.sum(RevenueLedgerEntry.delta_creator_paisa).label("creator_paisa"),
        )
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
def get_all_content_performance(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide "Content performance analytics" — same shape as a
    creator's own /videos/content-performance/mine, but across every
    uploaded video, with the creator's name attached so an admin can
    see who's generating what.
    """
    rows = (
        db.query(
            Video.id,
            Video.title,
            User.name.label("creator_name"),
            func.count(VideoWatchRecord.id).label("unique_viewers"),
            func.coalesce(func.sum(VideoWatchRecord.max_session_seconds), 0).label("total_seconds"),
            func.coalesce(func.sum(VideoWatchRecord.gross_revenue_paisa), 0).label("gross_paisa"),
            func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).label("credited_paisa"),
        )
        .outerjoin(VideoWatchRecord, VideoWatchRecord.video_id == Video.id)
        .outerjoin(User, User.id == Video.uploaded_by_user_id)
        .group_by(Video.id, Video.title, User.name)
        .order_by(func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).desc())
        .all()
    )
    return [
        AdminContentPerformanceOut(
            video_id=r.id,
            title=r.title,
            creator_name=r.creator_name or "Admin-uploaded",
            unique_viewers=r.unique_viewers,
            total_watch_minutes=(Decimal(r.total_seconds) / 60).quantize(Decimal("0.01")),
            gross_revenue_rupees=(Decimal(r.gross_paisa) / 100).quantize(Decimal("0.01")),
            creator_earned_rupees=(Decimal(r.credited_paisa) / 100).quantize(Decimal("0.01")),
        )
        for r in rows
    ]
