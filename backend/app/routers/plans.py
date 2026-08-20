from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SubscriptionPlan
from app.schemas import SubscriptionPlanOut

router = APIRouter(prefix="/subscription-plans", tags=["subscription-plans"])


@router.get("", response_model=list[SubscriptionPlanOut])
def list_subscription_plans(db: Session = Depends(get_db)):
    # Public, no auth — plan pricing needs to be visible before login too.
    return (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.is_active == True)  # noqa: E712
        .order_by(SubscriptionPlan.display_order)
        .all()
    )
