from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import (
    AdminUser, User, Video, VideoWatchRecord, WithdrawalRequest, WithdrawalStatus, CreatorEarnings,
    RevenueRateConfig, RevenueLedgerEntry, VideoRevenueTier, UserDemographics,
)
from app.demographics_utils import age_group_label, user_ids_matching
from app.notifications import send_withdrawal_paid_email, send_withdrawal_paid_whatsapp, send_withdrawal_rejected_email
from app.routers.watch import _compute_tier_breakdown_paisa
from app.schemas import (
    AdminWithdrawalOut, AdminWithdrawalActionRequest, AdminContentPerformanceOut,
    AdminRevenueConfigUpdate, RevenueByDayOut, RevenueByCountryOut, RevenueByCityOut, RevenueByAgeGroupOut,
    RevenueRateOut, AdminRevenueSummaryOut, AdminRevenueByCreatorOut,
    ContentPerformanceViewerBreakdownOut, ContentPerformanceTierBreakdownOut,
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


@router.get("/analytics/by-city", response_model=list[RevenueByCityOut])
def get_revenue_by_city(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide city breakdown — see RevenueByCityOut's docstring for
    the India-only / "Unknown" caveat. Groups by DISTINCT viewer first
    (mirrors by-country's func.count(distinct(...))), since city/age
    aren't denormalized onto RevenueLedgerEntry the way viewer_country is.
    """
    rows = (
        db.query(
            RevenueLedgerEntry.user_id,
            func.sum(RevenueLedgerEntry.delta_creator_paisa).label("creator_paisa"),
        )
        .group_by(RevenueLedgerEntry.user_id)
        .all()
    )
    demo_by_user = {
        d.user_id: d for d in
        db.query(UserDemographics).filter(UserDemographics.user_id.in_([r.user_id for r in rows]))
    }
    buckets: dict = {}
    for r in rows:
        demo = demo_by_user.get(r.user_id)
        key = demo.city if (demo and demo.city) else "Unknown"
        b = buckets.setdefault(key, {"viewers": 0, "paisa": 0})
        b["viewers"] += 1
        b["paisa"] += r.creator_paisa
    return sorted(
        (RevenueByCityOut(city=k, viewer_count=v["viewers"],
                           creator_earned_rupees=(Decimal(v["paisa"]) / 100).quantize(Decimal("0.01")))
         for k, v in buckets.items()),
        key=lambda r: r.creator_earned_rupees, reverse=True,
    )


@router.get("/analytics/by-age-group", response_model=list[RevenueByAgeGroupOut])
def get_revenue_by_age_group(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide age-group breakdown. Buckets come from
    demographics_utils so they're identical to a creator's own version.
    """
    today = datetime.now(timezone.utc).date()
    rows = (
        db.query(
            RevenueLedgerEntry.user_id,
            func.sum(RevenueLedgerEntry.delta_creator_paisa).label("creator_paisa"),
        )
        .group_by(RevenueLedgerEntry.user_id)
        .all()
    )
    demo_by_user = {
        d.user_id: d for d in
        db.query(UserDemographics).filter(UserDemographics.user_id.in_([r.user_id for r in rows]))
    }
    buckets: dict = {}
    for r in rows:
        demo = demo_by_user.get(r.user_id)
        key = age_group_label(demo.date_of_birth if demo else None, today)
        b = buckets.setdefault(key, {"viewers": 0, "paisa": 0})
        b["viewers"] += 1
        b["paisa"] += r.creator_paisa
    return sorted(
        (RevenueByAgeGroupOut(age_group=k, viewer_count=v["viewers"],
                               creator_earned_rupees=(Decimal(v["paisa"]) / 100).quantize(Decimal("0.01")))
         for k, v in buckets.items()),
        key=lambda r: r.creator_earned_rupees, reverse=True,
    )


@router.get("/summary", response_model=AdminRevenueSummaryOut)
def get_revenue_summary(
    creator_id: str | None = None,
    city: str | None = None,
    age_group: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide KPI cards. gross_revenue is what all watched
    minutes were worth before commission; platform/creator share split
    that using the real per-video/per-viewer credited amounts (not a
    single flat commission % applied after the fact, since older
    records could in principle have used a different rate at the time).
    All-time — Revenue Sharing Management deliberately isn't scoped to
    a date range (unlike Dashboard/Reports & Analytics, which are).

    creator_id, when given, scopes every number on this card row to
    just that one creator's videos — the whole Content Performance tab
    (this, /by-creator, and /content-performance) filters together off
    the same selection.

    city / age_group (Admin decision, Sept 2026) narrow every number
    here to only the watch records from viewers matching that filter —
    same viewer-matching as /content-performance. Unlike creator_id,
    these do NOT narrow total_published_videos: that figure answers
    "how big is the catalog", which doesn't change based on who watched
    it, only on who's uploaded it.
    """
    totals_query = db.query(
        func.coalesce(func.sum(VideoWatchRecord.gross_revenue_paisa), 0).label("gross_paisa"),
        func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).label("creator_paisa"),
        func.coalesce(func.sum(VideoWatchRecord.max_session_seconds), 0).label("total_seconds"),
        func.count(VideoWatchRecord.id).label("viewer_records"),
    )
    videos_query = db.query(func.count(Video.id)).filter(Video.status == VideoStatus.published)
    if creator_id:
        totals_query = totals_query.join(Video, Video.id == VideoWatchRecord.video_id).filter(Video.uploaded_by_user_id == creator_id)
        videos_query = videos_query.filter(Video.uploaded_by_user_id == creator_id)
    if city is not None or age_group is not None:
        today = datetime.now(timezone.utc).date()
        matching_ids = user_ids_matching(db, today, city=city, age_group=age_group)
        totals_query = totals_query.filter(VideoWatchRecord.user_id.in_(matching_ids))
    totals = totals_query.first()

    total_videos = videos_query.scalar() or 0

    gross_paisa = totals.gross_paisa or 0
    creator_paisa = totals.creator_paisa or 0
    platform_paisa = gross_paisa - creator_paisa
    total_minutes = Decimal(totals.total_seconds or 0) / 60

    avg_rpm = (
        (Decimal(gross_paisa) / 100) / total_minutes * 1000
        if total_minutes > 0 else Decimal("0")
    )

    return AdminRevenueSummaryOut(
        gross_revenue_rupees=(Decimal(gross_paisa) / 100).quantize(Decimal("0.01")),
        platform_share_rupees=(Decimal(platform_paisa) / 100).quantize(Decimal("0.01")),
        creator_share_rupees=(Decimal(creator_paisa) / 100).quantize(Decimal("0.01")),
        total_watch_minutes=total_minutes.quantize(Decimal("0.01")),
        total_viewer_records=totals.viewer_records or 0,
        total_published_videos=total_videos,
        avg_revenue_per_1000_minutes_rupees=avg_rpm.quantize(Decimal("0.01")),
    )


@router.get("/by-creator", response_model=list[AdminRevenueByCreatorOut])
def get_revenue_by_creator(
    creator_id: str | None = None,
    city: str | None = None,
    age_group: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """The "Revenue Share Report" — one row per creator showing the
    full Gross → Platform/Creator Share → Paid → Pending chain.
    All-time. Most gross revenue first. creator_id, when given,
    narrows this to that one creator's single row.

    city / age_group (Admin decision, Sept 2026) narrow the Gross/
    Platform/Owner Share figures to only watch records from viewers
    matching that filter — same viewer-matching as /content-performance
    and /summary. Unlike those two, a creator with NO matching watch
    records simply doesn't appear here at all (this report already
    omits creators with zero revenue full-stop, via the inner join
    below — this is the same rule, just narrower).

    Pending here is CreatorEarnings.available_balance_paisa — the same
    number the Dashboard's "Revenue Pending Pay" card uses — NOT a
    naive (creator_share - paid) calculation. Those two differ
    whenever a withdrawal request is currently sitting pending: the
    request flow reserves that amount out of available_balance the
    moment it's submitted (see routers/withdrawals.py), before an
    admin has approved or rejected it, specifically so the same money
    can't be requested twice. A naive (creator_share - paid) doesn't
    know about that in-flight reservation, so it would overstate what's
    actually still available — using available_balance_paisa here
    keeps this report and the Dashboard always in agreement.
    """
    gross_query = (
        db.query(
            Video.uploaded_by_user_id.label("creator_user_id"),
            func.coalesce(func.sum(VideoWatchRecord.gross_revenue_paisa), 0).label("gross_paisa"),
            func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).label("creator_paisa"),
        )
        .join(VideoWatchRecord, VideoWatchRecord.video_id == Video.id)
        .filter(Video.uploaded_by_user_id.isnot(None))
    )
    if creator_id:
        gross_query = gross_query.filter(Video.uploaded_by_user_id == creator_id)
    if city is not None or age_group is not None:
        today = datetime.now(timezone.utc).date()
        matching_ids = user_ids_matching(db, today, city=city, age_group=age_group)
        gross_query = gross_query.filter(VideoWatchRecord.user_id.in_(matching_ids))
    gross_rows = gross_query.group_by(Video.uploaded_by_user_id).all()
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
    earnings_by_creator = (
        {e.creator_user_id: e.available_balance_paisa for e in db.query(CreatorEarnings).filter(CreatorEarnings.creator_user_id.in_(creator_ids)).all()}
        if creator_ids else {}
    )

    results = []
    for r in gross_rows:
        creator = creators.get(r.creator_user_id)
        gross_paisa = r.gross_paisa or 0
        creator_paisa = r.creator_paisa or 0
        platform_paisa = gross_paisa - creator_paisa
        paid_paisa = paid_by_creator.get(r.creator_user_id, 0)
        pending_paisa = max(0, earnings_by_creator.get(r.creator_user_id, 0))
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
    creator_id: str | None = None,
    city: str | None = None,
    age_group: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide "Content performance analytics" — same shape as a
    creator's own /videos/content-performance/mine, but across every
    uploaded video, with the creator's name attached so an admin can
    see who's generating what. All-time. creator_id, when given,
    narrows this to just that one creator's videos.

    city / age_group (Admin decision, Sept 2026) narrow each video's
    numbers to only the viewers matching that filter — a video with
    viewers but none matching still appears, at zero, rather than
    disappearing (see the join predicate below: the filter lives in the
    JOIN's ON clause, not a WHERE clause, so it decides which
    VideoWatchRecord rows count without dropping the Video row itself
    when none do). Passing both filters together requires a viewer to
    match BOTH (an AND, not an OR).

    Scoped to published/disabled videos only — pending/scheduled/
    rejected ones can never have accrued real watch time (the
    heartbeat endpoint only credits VideoStatus.published videos), so
    including them here would just be permanent zero-row noise.
    """
    watch_join_conditions = [VideoWatchRecord.video_id == Video.id]
    if city is not None or age_group is not None:
        today = datetime.now(timezone.utc).date()
        matching_ids = user_ids_matching(db, today, city=city, age_group=age_group)
        watch_join_conditions.append(VideoWatchRecord.user_id.in_(matching_ids))

    query = (
        db.query(
            Video.id,
            Video.title,
            User.name.label("creator_name"),
            func.count(VideoWatchRecord.id).label("unique_viewers"),
            func.coalesce(func.sum(VideoWatchRecord.max_session_seconds), 0).label("total_seconds"),
            func.coalesce(func.sum(VideoWatchRecord.gross_revenue_paisa), 0).label("gross_paisa"),
            func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).label("credited_paisa"),
        )
        .filter(Video.status.in_([VideoStatus.published, VideoStatus.disabled]))
        .outerjoin(VideoWatchRecord, and_(*watch_join_conditions))
        .outerjoin(User, User.id == Video.uploaded_by_user_id)
    )
    if creator_id:
        query = query.filter(Video.uploaded_by_user_id == creator_id)
    rows = (
        query
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


@router.get("/content-performance/{video_id}/breakdown", response_model=list[ContentPerformanceViewerBreakdownOut])
def get_admin_content_performance_breakdown(
    video_id: str,
    city: str | None = None,
    age_group: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin equivalent of a creator's own
    /videos/{video_id}/content-performance-breakdown — same per-viewer,
    then per-tier drill-down (see that endpoint's docstring for the
    exact-reconciliation logic), just without the "must own this
    video" restriction, since an admin can inspect any video's.

    city / age_group (Admin decision, Sept 2026) — same viewer-matching
    as /content-performance, so expanding a video's row while a filter
    is active shows exactly the viewers counted in that row's numbers,
    not every viewer of the video. Without this, the row said "2
    viewers" under a filter while the expanded list still showed all 5
    — a real gap caught by a client walkthrough, Sept 2026.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")

    tiers = db.query(VideoRevenueTier).filter(VideoRevenueTier.video_id == video.id).all()
    rate_config = db.query(RevenueRateConfig).first()
    fallback_rate = rate_config.rate_paisa_per_minute if rate_config else 7

    records_query = (
        db.query(VideoWatchRecord, User)
        .join(User, User.id == VideoWatchRecord.user_id)
        .filter(VideoWatchRecord.video_id == video.id)
    )
    if city is not None or age_group is not None:
        today = datetime.now(timezone.utc).date()
        matching_ids = user_ids_matching(db, today, city=city, age_group=age_group)
        records_query = records_query.filter(VideoWatchRecord.user_id.in_(matching_ids))
    records = records_query.order_by(VideoWatchRecord.max_session_seconds.desc()).all()

    result = []
    for record, viewer in records:
        tier_rows = _compute_tier_breakdown_paisa(record.max_session_seconds, tiers, fallback_rate)
        total_gross_paisa = sum(t["gross_paisa"] for t in tier_rows)

        tier_out = []
        allocated_paisa = 0
        for idx, t in enumerate(tier_rows):
            is_last = idx == len(tier_rows) - 1
            if is_last:
                tier_creator_paisa = record.creator_credited_paisa - allocated_paisa
            elif total_gross_paisa > 0:
                tier_creator_paisa = int(
                    (Decimal(record.creator_credited_paisa) * t["gross_paisa"] / total_gross_paisa)
                    .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                )
            else:
                tier_creator_paisa = 0
            allocated_paisa += tier_creator_paisa
            tier_out.append(ContentPerformanceTierBreakdownOut(
                range_label=t["range_label"],
                minutes_in_tier=t["minutes_in_tier"],
                creator_earned_rupees=(Decimal(tier_creator_paisa) / 100).quantize(Decimal("0.01")),
                rate_per_minute_rupees=t["rate_per_minute_rupees"],
            ))

        result.append(ContentPerformanceViewerBreakdownOut(
            viewer_label=viewer.name,
            watch_minutes=(Decimal(record.max_session_seconds) / 60).quantize(Decimal("0.01")),
            creator_earned_rupees=(Decimal(record.creator_credited_paisa) / 100).quantize(Decimal("0.01")),
            tier_breakdown=tier_out,
        ))
    return result
