from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Subscription
from app.routers.videos import _billing_owner
from app.duration_pricing import get_duration_months_and_discount
from app.schemas import SubscriptionCreate, SubscriptionOut

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


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

    months, _ = get_duration_months_and_discount(payload.duration_label, db)
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
    """A sub-account (User.parent_id set) has no Subscription rows of
    its own — it shares whichever plan its parent holds (same
    _billing_owner resolution as video access/screens, see
    routers/videos.py), so the "You're on plan X" state and the
    Subscribe button match reality for them too.
    """
    owner = _billing_owner(current_user, db)
    return (
        db.query(Subscription)
        .filter(Subscription.user_id == owner.id, Subscription.is_active == True)  # noqa: E712
        .order_by(Subscription.started_at.desc())
        .first()
    )


@router.get("", response_model=list[SubscriptionOut])
def list_my_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Full history — active AND past subscriptions, most recent first.
    # "Previous subscriptions" on the Subscription details page is just
    # this list with the current one (is_active=True) filtered out
    # client-side, or shown at the top — no separate table needed since
    # Subscription already carries is_active as the status flag.
    return (
        db.query(Subscription)
        .filter(Subscription.user_id == current_user.id)
        .order_by(Subscription.started_at.desc())
        .all()
    )
