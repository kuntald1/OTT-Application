"""UPI Autopay (recurring) subscriptions through Razorpay Subscriptions.

How it differs from the one-time flow in payments.py:
  - The customer authorises a recurring mandate in their UPI app once;
    Razorpay then charges the same amount every `duration` automatically.
  - Razorpay tells us about every charge (the first one included) through
    the `subscription.charged` WEBHOOK — the browser only reports the very
    first one. So /razorpay/webhook below is what keeps access alive.
  - Every charge, first or renewal, funnels through _apply_charge(), which
    is idempotent on the Razorpay payment id, so the browser's verify call
    and the webhook racing each other for the first charge is harmless.

Auto-renew is opt-in (a checkbox at checkout) and India/Razorpay only.
Reward points can't be redeemed on an auto-renew purchase: a Razorpay Plan
has ONE fixed recurring amount, so a first-charge-only discount isn't
possible. Points are still EARNED on every charge.
"""
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, ensure_can_buy_plan
from app.duration_pricing import get_duration_months_and_discount
from app.models import (
    AutopaySubscription, Payment, PaymentGateway, PaymentStatus,
    RewardConfig, Subscription, SubscriptionPlan, TaxConfig, User,
)
from app.notifications import send_payment_email, send_payment_whatsapp
from app.routers.payments import _compute_pricing

router = APIRouter(prefix="/payments", tags=["autopay"])

# How far ahead the recurring mandate is set up, in years. Razorpay needs a
# fixed number of billing cycles (total_count) up front. The customer can
# cancel any time; this is only the ceiling. Change here if Razorpay or the
# UPI mandate rules turn out to cap tenure lower.
AUTOPAY_MAX_YEARS = 5


def _client() -> razorpay.Client:
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


class AutopayCreateRequest(BaseModel):
    plan_name: str = Field(min_length=1, max_length=50)
    duration_label: str = Field(min_length=1, max_length=50)
    screens: int = Field(default=1, ge=1, le=10)


class AutopayCreateResponse(BaseModel):
    autopay_id: uuid.UUID
    razorpay_subscription_id: str
    razorpay_key_id: str
    base_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    currency: str
    plan_name: str
    duration_label: str
    screens: int
    cycle_months: int


class AutopayVerifyRequest(BaseModel):
    autopay_id: uuid.UUID
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


class AutopayVerifyOut(BaseModel):
    # False = the signature checked out but the payment Razorpay returned is
    # not (yet) the full first billing charge; the subscription.charged
    # webhook will activate the plan moments later.
    activated: bool
    payment_id: Optional[uuid.UUID] = None


class AutopayStatusOut(BaseModel):
    active: bool
    plan_name: Optional[str] = None
    duration_label: Optional[str] = None
    screens: Optional[int] = None
    total_amount: Optional[Decimal] = None
    next_renewal_at: Optional[datetime] = None


@router.post("/autopay/create", response_model=AutopayCreateResponse)
def create_autopay(
    payload: AutopayCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_can_buy_plan(current_user, db)

    if current_user.country != "India":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-renew is only available for India accounts.",
        )

    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == payload.plan_name, SubscriptionPlan.is_active == True  # noqa: E712
    ).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    tax_row = db.query(TaxConfig).first()
    if not tax_row:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tax config is not set up. Run the seed script or insert a row into tax_config.",
        )

    # Only one auto-renew at a time. An ACTIVE one must be cancelled by the
    # customer first — silently replacing it could leave two mandates
    # charging. Abandoned ("created", never authorised) attempts are just
    # retired locally; Razorpay can't charge a mandate nobody authorised.
    now = datetime.now(timezone.utc)
    for row in db.query(AutopaySubscription).filter(
        AutopaySubscription.user_id == current_user.id,
        AutopaySubscription.status.in_(("created", "active")),
    ).all():
        if row.status == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Auto-renew is already on for your account. Cancel it first to set up a different plan.",
            )
        row.status = "cancelled"
        row.cancelled_at = now
    db.commit()

    months, _ = get_duration_months_and_discount(payload.duration_label, db)
    # reward_points_requested=0: no reward redemption on auto-renew (see the
    # module docstring for why).
    base_amount, _, tax_amount, total = _compute_pricing(
        plan, payload.duration_label, payload.screens, 0, tax_row.gst_percent, db
    )
    if total <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total amount must be greater than zero.",
        )

    client = _client()
    try:
        # A Razorpay Plan has one fixed amount + billing interval, so one is
        # created per setup to match this exact plan/screens/duration price.
        rp_plan = client.plan.create({
            "period": "monthly",
            "interval": months,
            "item": {
                "name": f"{plan.name} - {payload.duration_label}, {payload.screens} screen(s)",
                "amount": int(total * 100),
                "currency": "INR",
            },
            "notes": {
                "plan_name": plan.name,
                "duration_label": payload.duration_label,
                "screens": str(payload.screens),
            },
        })
        rp_sub = client.subscription.create({
            "plan_id": rp_plan["id"],
            "total_count": max(1, (AUTOPAY_MAX_YEARS * 12) // months),
            "customer_notify": 1,
            "notes": {
                "user_id": str(current_user.id),
                "plan_name": plan.name,
                "duration_label": payload.duration_label,
                "screens": str(payload.screens),
            },
        })
    except Exception as exc:  # razorpay.errors.* — the message is for the server log only
        print(f"ERROR: Razorpay autopay setup failed for user {current_user.id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't set up auto-renew right now. Please try again, or pay without auto-renew.",
        )

    autopay = AutopaySubscription(
        user_id=current_user.id,
        razorpay_plan_id=rp_plan["id"],
        razorpay_subscription_id=rp_sub["id"],
        plan_name=plan.name,
        duration_label=payload.duration_label,
        screens=payload.screens,
        base_amount=base_amount,
        tax_amount=tax_amount,
        total_amount=total,
        status="created",
    )
    db.add(autopay)
    db.commit()
    db.refresh(autopay)

    return AutopayCreateResponse(
        autopay_id=autopay.id,
        razorpay_subscription_id=rp_sub["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        base_amount=base_amount,
        tax_amount=tax_amount,
        total_amount=total,
        currency="INR",
        plan_name=plan.name,
        duration_label=payload.duration_label,
        screens=payload.screens,
        cycle_months=months,
    )


def _apply_charge(db: Session, autopay_id: uuid.UUID, razorpay_payment_id: str) -> Optional[Payment]:
    """Records one successful Razorpay charge for an auto-renew and extends
    access. Used by BOTH the browser's verify call (first charge) and the
    webhook (every charge) — idempotent on the Razorpay payment id.
    """
    # Lock the autopay row so the browser's verify call and the webhook for
    # the SAME first charge can't both create a subscription: the second one
    # waits here, then finds the payment already recorded below.
    autopay = (
        db.query(AutopaySubscription)
        .filter(AutopaySubscription.id == autopay_id)
        .with_for_update()
        .first()
    )
    if autopay is None:
        return None

    existing = db.query(Payment).filter(Payment.gateway_payment_id == razorpay_payment_id).first()
    if existing:
        db.rollback()  # release the row lock
        return existing

    user = db.query(User).filter(User.id == autopay.user_id).first()
    months, _ = get_duration_months_and_discount(autopay.duration_label, db)
    now = datetime.now(timezone.utc)

    subscription = None
    if autopay.subscription_id:
        subscription = db.query(Subscription).filter(Subscription.id == autopay.subscription_id).first()

    if subscription is None:
        # First charge — same rule as a one-time purchase: only one active
        # subscription per user.
        db.query(Subscription).filter(
            Subscription.user_id == user.id, Subscription.is_active == True  # noqa: E712
        ).update({"is_active": False})
        subscription = Subscription(
            user_id=user.id,
            plan_name=autopay.plan_name,
            duration_label=autopay.duration_label,
            screens=autopay.screens,
            price=autopay.total_amount,
            is_active=True,
            expires_at=now + timedelta(days=months * 30),
        )
        db.add(subscription)
        db.flush()
        autopay.subscription_id = subscription.id
    else:
        # Renewal — extend from whichever is later, now or the current
        # expiry, so an early or late charge never shortens paid time.
        current_expiry = subscription.expires_at
        if current_expiry.tzinfo is None:  # defensive: treat a naive timestamp as UTC
            current_expiry = current_expiry.replace(tzinfo=timezone.utc)
        subscription.expires_at = max(now, current_expiry) + timedelta(days=months * 30)
        subscription.is_active = True

    autopay.status = "active"

    payment = Payment(
        user_id=user.id,
        subscription_id=subscription.id,
        gateway=PaymentGateway.razorpay,
        # For autopay charges this holds the Razorpay SUBSCRIPTION id (there
        # is no order id) — kept in the existing column to avoid an ALTER TABLE.
        gateway_order_id=autopay.razorpay_subscription_id,
        gateway_payment_id=razorpay_payment_id,
        plan_name=autopay.plan_name,
        duration_label=autopay.duration_label,
        screens=autopay.screens,
        base_amount=autopay.base_amount,
        tax_amount=autopay.tax_amount,
        total_amount=autopay.total_amount,
        reward_points_used=0,
        currency="INR",
        status=PaymentStatus.paid,
    )
    db.add(payment)

    # Reward points EARNED on this charge — same rule as verify_razorpay_payment
    # (never raise here: the customer has already paid).
    reward_config = db.query(RewardConfig).first()
    if reward_config:
        points_earned = int(
            (payment.total_amount * reward_config.subscription_reward_percent / 100)
            .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        )
    else:
        points_earned = 0
        print(
            f"WARNING: reward_config table is empty — autopay charge {razorpay_payment_id} for "
            f"user {user.id} earned 0 reward points."
        )
    user.reward_points_balance = (user.reward_points_balance or 0) + points_earned

    db.commit()
    db.refresh(payment)

    # Best-effort notifications — never fail the charge over these.
    try:
        if user.phone:
            send_payment_whatsapp(user.phone, payment.plan_name, payment.total_amount, payment.duration_label)
        send_payment_email(
            user.email, payment.plan_name, payment.total_amount,
            payment.tax_amount, payment.duration_label, payment.screens,
        )
    except Exception as exc:
        print(f"WARNING: autopay notification failed for payment {payment.id}: {exc}")

    return payment


@router.post("/autopay/verify", response_model=AutopayVerifyOut)
def verify_autopay(
    payload: AutopayVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    autopay = (
        db.query(AutopaySubscription)
        .filter(AutopaySubscription.id == payload.autopay_id, AutopaySubscription.user_id == current_user.id)
        .first()
    )
    if not autopay:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-renew setup not found")

    # Razorpay's rule for subscriptions: HMAC-SHA256 of
    # "<payment_id>|<subscription_id>" with the key secret — payment id FIRST
    # (the opposite order from one-time orders), and the subscription id must
    # come from OUR database, not from what Checkout sent back.
    expected_signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{payload.razorpay_payment_id}|{autopay.razorpay_subscription_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment verification failed.")

    # The payment id Checkout returns is the AUTHORISATION payment. Only
    # activate here if Razorpay confirms it is a captured payment for the
    # full plan amount (the first billing charge). If it is anything else
    # (e.g. a small refundable mandate-verification amount) activating on it
    # would grant access for a charge that never happened — leave it to the
    # subscription.charged webhook instead.
    try:
        rp_payment = _client().payment.fetch(payload.razorpay_payment_id)
    except Exception as exc:
        print(f"WARNING: couldn't fetch autopay payment {payload.razorpay_payment_id}: {exc}")
        return AutopayVerifyOut(activated=False)

    if rp_payment.get("status") != "captured" or rp_payment.get("amount") != int(autopay.total_amount * 100):
        return AutopayVerifyOut(activated=False)

    payment = _apply_charge(db, autopay.id, payload.razorpay_payment_id)
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Auto-renew setup not found")
    return AutopayVerifyOut(activated=True, payment_id=payment.id)


@router.get("/autopay/me", response_model=AutopayStatusOut)
def my_autopay(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    autopay = (
        db.query(AutopaySubscription)
        .filter(AutopaySubscription.user_id == current_user.id, AutopaySubscription.status == "active")
        .order_by(AutopaySubscription.created_at.desc())
        .first()
    )
    if not autopay:
        return AutopayStatusOut(active=False)

    subscription = None
    if autopay.subscription_id:
        subscription = db.query(Subscription).filter(Subscription.id == autopay.subscription_id).first()

    return AutopayStatusOut(
        active=True,
        plan_name=autopay.plan_name,
        duration_label=autopay.duration_label,
        screens=autopay.screens,
        total_amount=autopay.total_amount,
        next_renewal_at=subscription.expires_at if subscription else None,
    )


@router.post("/autopay/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_autopay(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stops all FUTURE charges. The plan the customer already paid for stays
    active until its own expires_at (access is driven by our subscription row,
    not by the Razorpay mandate).
    """
    autopay = (
        db.query(AutopaySubscription)
        .filter(AutopaySubscription.user_id == current_user.id, AutopaySubscription.status == "active")
        .order_by(AutopaySubscription.created_at.desc())
        .first()
    )
    if not autopay:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active auto-renew to cancel")

    client = _client()
    try:
        client.subscription.cancel(autopay.razorpay_subscription_id)
    except Exception as exc:
        # If Razorpay already shows it as finished (e.g. cancelled from their
        # dashboard), treat that as success; otherwise don't pretend it worked.
        try:
            remote_status = client.subscription.fetch(autopay.razorpay_subscription_id).get("status")
        except Exception:
            remote_status = None
        if remote_status not in ("cancelled", "completed", "expired"):
            print(f"ERROR: Razorpay autopay cancel failed for {autopay.razorpay_subscription_id}: {exc}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Couldn't turn off auto-renew right now. Please try again in a moment.",
            )

    autopay.status = "cancelled"
    autopay.cancelled_at = datetime.now(timezone.utc)
    db.commit()


def _handle_webhook_event(event: dict, db: Session) -> None:
    event_name = event.get("event", "")
    payload = event.get("payload", {})
    rp_sub_id = payload.get("subscription", {}).get("entity", {}).get("id")
    if not rp_sub_id:
        return  # not a subscription event — nothing for us to do

    autopay = db.query(AutopaySubscription).filter(
        AutopaySubscription.razorpay_subscription_id == rp_sub_id
    ).first()
    if autopay is None:
        return  # not one of ours (e.g. created elsewhere) — acknowledge, don't retry

    if event_name == "subscription.charged":
        payment_entity = payload.get("payment", {}).get("entity", {})
        payment_id = payment_entity.get("id")
        pay_status = payment_entity.get("status")
        if payment_id and pay_status in (None, "captured"):
            _apply_charge(db, autopay.id, payment_id)
    elif event_name in ("subscription.halted", "subscription.cancelled", "subscription.completed"):
        autopay.status = event_name.split(".", 1)[1]
        if event_name == "subscription.cancelled" and autopay.cancelled_at is None:
            autopay.cancelled_at = datetime.now(timezone.utc)
        db.commit()
    # authenticated / activated / pending / updated / paused / resumed need
    # no action: status becomes "active" on the first captured charge.


@router.post("/razorpay/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not secret:
        # Never accept unsigned events just because the secret isn't set up.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay webhook secret is not configured.",
        )

    raw_body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature.")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook body.")

    # A failure here propagates as a 500 on purpose: Razorpay retries
    # non-2xx webhooks, so a transient DB error doesn't lose a renewal.
    await run_in_threadpool(_handle_webhook_event, event, db)
    return {"status": "ok"}
