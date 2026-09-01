from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, User, Subscription, Payment, PaymentStatus
from app.schemas import AdminSubscriptionTransactionOut

router = APIRouter(prefix="/admin/subscriptions", tags=["admin-subscriptions"])


def _bucket_for(payment: Payment, subscription: Subscription | None) -> str:
    if payment.status == PaymentStatus.failed:
        return "failed"
    if payment.status == PaymentStatus.created:
        return "pending"
    # status == paid
    if subscription and subscription.is_active and subscription.expires_at > datetime.now(timezone.utc):
        return "active"
    return "expired"


@router.get("", response_model=list[AdminSubscriptionTransactionOut])
def list_subscription_transactions(
    status_filter: str | None = None,
    search: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """One row per checkout attempt (Payment), across every customer —
    `status_filter` narrows by the same bucket _bucket_for() computes:
    "active" | "expired" | "completed" (paid, regardless of whether the
    subscription has since expired -- i.e. active + expired combined) |
    "failed" | "pending". `search` matches customer name or email.
    """
    query = db.query(Payment, User).join(User, Payment.user_id == User.id)
    if search:
        pattern = f"%{search}%"
        query = query.filter((User.name.ilike(pattern)) | (User.email.ilike(pattern)))
    rows = query.order_by(Payment.created_at.desc()).all()

    subscription_ids = {p.subscription_id for p, _ in rows if p.subscription_id}
    subs_by_id = {}
    if subscription_ids:
        for s in db.query(Subscription).filter(Subscription.id.in_(subscription_ids)).all():
            subs_by_id[s.id] = s

    out = []
    for payment, user in rows:
        sub = subs_by_id.get(payment.subscription_id) if payment.subscription_id else None
        bucket = _bucket_for(payment, sub)

        if status_filter and status_filter != "all":
            if status_filter == "completed":
                if bucket not in ("active", "expired"):
                    continue
            elif bucket != status_filter:
                continue

        out.append(AdminSubscriptionTransactionOut(
            payment_id=payment.id, user_id=user.id, customer_name=user.name, customer_email=user.email,
            plan_name=payment.plan_name, duration_label=payment.duration_label, screens=payment.screens,
            total_amount=payment.total_amount, currency=payment.currency, gateway=payment.gateway.value,
            bucket=bucket, subscription_expires_at=sub.expires_at if sub else None,
            created_at=payment.created_at,
        ))
    return out
