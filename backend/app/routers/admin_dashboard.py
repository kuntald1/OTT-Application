from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AdminUser, User, Subscription, Video, VideoStatus, EventEnquiry, EnquiryStatus,
    Payment, PaymentStatus,
)
from app.schemas import AdminDashboardOut

router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])


@router.get("/summary", response_model=AdminDashboardOut)
def get_dashboard_summary(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    total_customers = db.query(func.count(User.id)).scalar() or 0
    active_customers = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0  # noqa: E712

    active_subscriptions = (
        db.query(func.count(Subscription.id))
        .filter(Subscription.is_active == True, Subscription.expires_at > now)  # noqa: E712
        .scalar() or 0
    )
    expired_subscriptions = (
        db.query(func.count(Subscription.id))
        .filter((Subscription.is_active == False) | (Subscription.expires_at <= now))  # noqa: E712
        .scalar() or 0
    )

    published_videos = db.query(func.count(Video.id)).filter(Video.status == VideoStatus.published).scalar() or 0
    pending_review_videos = db.query(func.count(Video.id)).filter(Video.status == VideoStatus.pending).scalar() or 0

    approved_events = db.query(func.count(EventEnquiry.id)).filter(EventEnquiry.status == EnquiryStatus.approved).scalar() or 0
    pending_enquiries = db.query(func.count(EventEnquiry.id)).filter(EventEnquiry.status == EnquiryStatus.pending).scalar() or 0

    total_transactions = db.query(func.count(Payment.id)).filter(Payment.status == PaymentStatus.paid).scalar() or 0
    # INR only — summing INR (Razorpay) and USD (Stripe) rows together
    # would silently mix currencies into one meaningless number. USD
    # revenue isn't shown separately here; the Reports page's
    # "transactions" export includes every row with its own currency.
    total_revenue_rupees = (
        db.query(func.coalesce(func.sum(Payment.total_amount), 0))
        .filter(Payment.status == PaymentStatus.paid, Payment.currency == "INR")
        .scalar() or 0
    )

    return AdminDashboardOut(
        total_customers=total_customers, active_customers=active_customers,
        active_subscriptions=active_subscriptions, expired_subscriptions=expired_subscriptions,
        published_videos=published_videos, pending_review_videos=pending_review_videos,
        approved_events=approved_events, pending_enquiries=pending_enquiries,
        total_transactions=total_transactions, total_revenue_rupees=Decimal(total_revenue_rupees),
    )
