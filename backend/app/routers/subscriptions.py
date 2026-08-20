from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Subscription
from app.schemas import SubscriptionCreate, SubscriptionOut

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

# Matches the duration options on the frontend's Subscription page
_DURATION_MONTHS = {
    "1 Month": 1,
    "6 Months": 6,
    "1 Year": 12,
}


def _months_to_days(months: int) -> int:
    # Simple approximation (30 days/month) — fine for a subscription expiry
    # date, no need for calendar-accurate month arithmetic here.
    return months * 30


@router.post("", response_model=SubscriptionOut, status_code=201)
def activate_subscription(
    payload: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # No payment gateway yet — this directly activates the plan. Only one
    # active subscription per user, so deactivate any existing one first.
    db.query(Subscription).filter(
        Subscription.user_id == current_user.id, Subscription.is_active == True  # noqa: E712
    ).update({"is_active": False})

    months = _DURATION_MONTHS.get(payload.duration_label, 1)
    expires_at = datetime.now(timezone.utc) + timedelta(days=_months_to_days(months))

    subscription = Subscription(
        user_id=current_user.id,
        plan_name=payload.plan_name,
        duration_label=payload.duration_label,
        screens=payload.screens,
        price=payload.price,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


@router.get("/me", response_model=Optional[SubscriptionOut])
def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Subscription)
        .filter(Subscription.user_id == current_user.id, Subscription.is_active == True)  # noqa: E712
        .order_by(Subscription.started_at.desc())
        .first()
    )
