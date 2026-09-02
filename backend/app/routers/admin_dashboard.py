from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.date_range import parse_date_range
from app.deps import get_current_admin
from app.models import (
    AdminUser, User, Subscription, Video, VideoStatus, EventEnquiry, EnquiryStatus,
    Payment, PaymentStatus,
)
from app.schemas import AdminDashboardOut

router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])


@router.get("/summary", response_model=AdminDashboardOut)
def get_dashboard_summary(
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every count/sum here is scoped to [start_date, end_date] against
    each entity's own created_at (Subscription uses started_at) — no
    start_date/end_date defaults to the last 1 month (see
    app/date_range.py). The one deliberate exception is
    published_videos, which is the CURRENT catalog size (a snapshot),
    not "videos published in this window" — pending_review_videos is
    still date-scoped since new submissions are genuinely an activity
    metric.
    """
    start, end = parse_date_range(start_date, end_date)

    total_customers = (
        db.query(func.count(User.id))
        .filter(User.created_at >= start, User.created_at <= end)
        .scalar() or 0
    )
    active_customers = (
        db.query(func.count(User.id))
        .filter(User.created_at >= start, User.created_at <= end, User.is_active == True)  # noqa: E712
        .scalar() or 0
    )

    active_subscriptions = (
        db.query(func.count(Subscription.id))
        .filter(
            Subscription.started_at >= start, Subscription.started_at <= end,
            Subscription.is_active == True, Subscription.expires_at > end,  # noqa: E712
        )
        .scalar() or 0
    )
    expired_subscriptions = (
        db.query(func.count(Subscription.id))
        .filter(
            Subscription.started_at >= start, Subscription.started_at <= end,
            (Subscription.is_active == False) | (Subscription.expires_at <= end),  # noqa: E712
        )
        .scalar() or 0
    )

    published_videos = db.query(func.count(Video.id)).filter(Video.status == VideoStatus.published).scalar() or 0
    pending_review_videos = (
        db.query(func.count(Video.id))
        .filter(Video.status == VideoStatus.pending, Video.created_at >= start, Video.created_at <= end)
        .scalar() or 0
    )

    approved_events = (
        db.query(func.count(EventEnquiry.id))
        .filter(EventEnquiry.status == EnquiryStatus.approved, EventEnquiry.created_at >= start, EventEnquiry.created_at <= end)
        .scalar() or 0
    )
    pending_enquiries = (
        db.query(func.count(EventEnquiry.id))
        .filter(EventEnquiry.status == EnquiryStatus.pending, EventEnquiry.created_at >= start, EventEnquiry.created_at <= end)
        .scalar() or 0
    )

    total_transactions = (
        db.query(func.count(Payment.id))
        .filter(Payment.status == PaymentStatus.paid, Payment.created_at >= start, Payment.created_at <= end)
        .scalar() or 0
    )
    # INR only — summing INR (Razorpay) and USD (Stripe) rows together
    # would silently mix currencies into one meaningless number. USD
    # revenue isn't shown separately here; the Reports page's
    # "transactions" export includes every row with its own currency.
    total_revenue_rupees = (
        db.query(func.coalesce(func.sum(Payment.total_amount), 0))
        .filter(Payment.status == PaymentStatus.paid, Payment.currency == "INR", Payment.created_at >= start, Payment.created_at <= end)
        .scalar() or 0
    )

    return AdminDashboardOut(
        total_customers=total_customers, active_customers=active_customers,
        active_subscriptions=active_subscriptions, expired_subscriptions=expired_subscriptions,
        published_videos=published_videos, pending_review_videos=pending_review_videos,
        approved_events=approved_events, pending_enquiries=pending_enquiries,
        total_transactions=total_transactions, total_revenue_rupees=Decimal(total_revenue_rupees),
    )
