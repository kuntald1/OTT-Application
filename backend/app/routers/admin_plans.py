from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, SubscriptionPlan, SubscriptionDuration, TaxConfig
from app.schemas import (
    SubscriptionPlanOut, SubscriptionPlanCreate, SubscriptionPlanUpdate,
    SubscriptionDurationOut, SubscriptionDurationCreate, SubscriptionDurationUpdate,
    TaxConfigOut, TaxConfigUpdate,
)

router = APIRouter(prefix="/admin/subscription-plans", tags=["admin-subscription-plans"])


# --------------------------------------------------------------------- Plans

@router.get("", response_model=list[SubscriptionPlanOut])
def list_plans_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin view — INCLUDES inactive plans (unlike the public GET
    /subscription-plans, which only ever returns active ones), so an
    admin can see and re-enable something they deactivated.
    """
    return db.query(SubscriptionPlan).order_by(SubscriptionPlan.display_order).all()


@router.post("", response_model=SubscriptionPlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: SubscriptionPlanCreate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    existing = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A plan with this name already exists.")
    plan = SubscriptionPlan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


# ---------------------------------------------------------------- Durations

@router.get("/durations", response_model=list[SubscriptionDurationOut])
def list_durations_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(SubscriptionDuration).order_by(SubscriptionDuration.display_order).all()


@router.post("/durations", response_model=SubscriptionDurationOut, status_code=status.HTTP_201_CREATED)
def create_duration(
    payload: SubscriptionDurationCreate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    existing = db.query(SubscriptionDuration).filter(SubscriptionDuration.label == payload.label).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A duration with this label already exists.")
    duration = SubscriptionDuration(**payload.model_dump())
    db.add(duration)
    db.commit()
    db.refresh(duration)
    return duration


@router.put("/durations/{duration_id}", response_model=SubscriptionDurationOut)
def update_duration(
    duration_id: str,
    payload: SubscriptionDurationUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Renaming a duration's label is safe going forward the same way a
    plan rename is (see update_plan) — existing Subscription/Payment
    rows keep whatever label string they were bought under; the
    get_duration_months_and_discount() lookup used at checkout falls
    back to a safe 1-month/0%-discount default if a stale label is
    ever looked up again, it never raises.
    """
    duration = db.query(SubscriptionDuration).filter(SubscriptionDuration.id == duration_id).first()
    if not duration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Duration not found")

    data = payload.model_dump(exclude_unset=True)
    if "label" in data and data["label"] != duration.label:
        duplicate = db.query(SubscriptionDuration).filter(SubscriptionDuration.label == data["label"], SubscriptionDuration.id != duration.id).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A duration with this label already exists.")
    for field, value in data.items():
        setattr(duration, field, value)

    db.commit()
    db.refresh(duration)
    return duration


@router.patch("/durations/{duration_id}/toggle", response_model=SubscriptionDurationOut)
def toggle_duration(
    duration_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    duration = db.query(SubscriptionDuration).filter(SubscriptionDuration.id == duration_id).first()
    if not duration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Duration not found")
    duration.is_active = not duration.is_active
    db.commit()
    db.refresh(duration)
    return duration


# --------------------------------------------------------------------- Tax

@router.get("/tax", response_model=TaxConfigOut)
def get_tax_config_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    config = db.query(TaxConfig).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tax config is not set up. Run the seed script or insert a row into tax_config.",
        )
    return config


@router.put("/tax", response_model=TaxConfigOut)
def update_tax_config(
    payload: TaxConfigUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Single-row table — updates the one existing row, or creates it
    if it somehow doesn't exist yet (normally seeded once via
    seed_data.py). Every checkout (Razorpay and Stripe) reads this
    live, so a change here applies to the very next checkout with no
    redeploy needed.
    """
    config = db.query(TaxConfig).first()
    if not config:
        config = TaxConfig(gst_percent=payload.gst_percent)
        db.add(config)
    else:
        config.gst_percent = payload.gst_percent
    db.commit()
    db.refresh(config)
    return config


# ------------------------------------------------------- Plans (catch-all)
# Declared LAST — "/{plan_id}" is a single-segment catch-all that must
# not risk shadowing any literal path above it (see route-ordering note
# at the top of this file).

@router.put("/{plan_id}", response_model=SubscriptionPlanOut)
def update_plan(
    plan_id: str,
    payload: SubscriptionPlanUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Renaming a plan is safe for FUTURE purchases (the name is what
    gets snapshotted onto new Subscription rows going forward) — access
    for EXISTING subscribers who bought under the old name still works,
    since routers/videos.py's _subscription_grants_section falls back
    to the old Play/Archive/Both convention only if the name can no
    longer be found here at all (e.g. the plan is later deleted, which
    this endpoint doesn't offer — only deactivate).
    """
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] != plan.name:
        duplicate = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == data["name"], SubscriptionPlan.id != plan.id).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A plan with this name already exists.")
    for field, value in data.items():
        setattr(plan, field, value)

    db.commit()
    db.refresh(plan)
    return plan


@router.patch("/{plan_id}/toggle", response_model=SubscriptionPlanOut)
def toggle_plan(
    plan_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Activate/deactivate — deliberately no delete endpoint. Existing
    Subscription rows reference a plan by name (see update_plan's
    docstring), so removing the catalog row entirely would be a real
    foreign-key/history risk for anyone still subscribed; deactivating
    just hides it from new purchases (GET /subscription-plans already
    filters to is_active=True) without touching access for current
    subscribers.
    """
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    plan.is_active = not plan.is_active
    db.commit()
    db.refresh(plan)
    return plan
