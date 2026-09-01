from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SubscriptionPlan, SubscriptionDuration
from app.schemas import SubscriptionPlanOut, SubscriptionDurationOut

router = APIRouter(prefix="/subscription-plans", tags=["subscription-plans"])
durations_router = APIRouter(prefix="/subscription-durations", tags=["subscription-plans"])


@router.get("", response_model=list[SubscriptionPlanOut])
def list_subscription_plans(db: Session = Depends(get_db)):
    # Public, no auth — plan pricing needs to be visible before login too.
    return (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.is_active == True)  # noqa: E712
        .order_by(SubscriptionPlan.display_order)
        .all()
    )


@durations_router.get("", response_model=list[SubscriptionDurationOut])
def list_subscription_durations(db: Session = Depends(get_db)):
    # Public, no auth — same reasoning as list_subscription_plans above;
    # powers the Subscription page's duration picker (Admin > Subscription
    # Plans > Durations tab is where these get created/edited).
    return (
        db.query(SubscriptionDuration)
        .filter(SubscriptionDuration.is_active == True)  # noqa: E712
        .order_by(SubscriptionDuration.display_order)
        .all()
    )
