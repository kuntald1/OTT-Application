import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

import razorpay
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, ensure_can_buy_plan
from app.models import (
    User, Payment, PaymentStatus, PaymentGateway,
    SubscriptionPlan, Subscription, TaxConfig, RewardConfig, AutopaySubscription,
)
from app.notifications import send_payment_whatsapp, send_payment_email
from app.rewards import max_points_redeemable, points_for_amount, rupees_for_points
from app.duration_pricing import get_duration_months_and_discount
from app.subscription_expiry import end_of_day_ist
from app.schemas import PaymentOut, CreateOrderRequest, CreateOrderResponse, VerifyPaymentRequest

router = APIRouter(prefix="/payments", tags=["payments"])


def _round(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _compute_pricing(plan: SubscriptionPlan, duration_label: str, screens: int, reward_points_requested: int, gst_percent: Decimal, db: Session, points_available: int = None):
    """Server-side price recomputation — never trusts a price sent by the
    client. Mirrors SubscriptionPage.jsx's priceFor() logic (screens
    scaling + duration discount), then adds GST on top of the
    reward-discounted amount.

    A point is no longer assumed to be worth ₹1: reward_config's
    point_value_rupees decides, so the same 100 points can be ₹100 or
    ₹25 off depending on what the admin set (see app/rewards.py).
    """
    months, discount = get_duration_months_and_discount(duration_label, db)
    monthly = plan.base_price + plan.per_extra_screen * (screens - 1)
    pre_rewards = _round(monthly * months * (1 - discount))

    reward_config = db.query(RewardConfig).first()
    # Cap by three things: what was asked for, what the person actually
    # has, and what this price can absorb. points_available is passed by
    # the caller; None means "don't check the balance" so nothing breaks
    # if some other caller appears without one.
    reward_used = min(
        max(reward_points_requested, 0),
        max_points_redeemable(reward_config, pre_rewards),
    )
    if points_available is not None:
        reward_used = min(reward_used, max(points_available, 0))
    taxable_amount = pre_rewards - rupees_for_points(reward_config, reward_used)

    tax_amount = _round(taxable_amount * gst_percent / 100)
    total = taxable_amount + tax_amount

    return pre_rewards, reward_used, tax_amount, total


@router.get("", response_model=list[PaymentOut])
def list_my_payments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Payment)
        .filter(Payment.user_id == current_user.id)
        .order_by(Payment.created_at.desc())
        .all()
    )


@router.post("/razorpay/create-order", response_model=CreateOrderResponse)
def create_razorpay_order(
    payload: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_can_buy_plan(current_user, db)  # a sub-account shares its parent's plan; see deps.py

    # A one-time purchase while an auto-renew (UPI Autopay) is active would
    # leave the old mandate charging for the OLD plan alongside the new one.
    # The customer cancels auto-renew first (Subscription page), then buys.
    if db.query(AutopaySubscription).filter(
        AutopaySubscription.user_id == current_user.id, AutopaySubscription.status == "active"
    ).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Auto-renew is on for your current plan. Turn off auto-renew first to buy a different plan.",
        )

    if current_user.country != "India":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Razorpay is only available for India accounts. Please use Stripe.",
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
    gst_percent = tax_row.gst_percent

    base_amount, reward_used, tax_amount, total = _compute_pricing(
        plan, payload.duration_label, payload.screens, payload.reward_points_requested, gst_percent, db,
        points_available=current_user.reward_points_balance or 0,
    )

    if total <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total amount must be greater than zero.",
        )

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    # Razorpay amounts are in the smallest currency unit (paise for INR)
    razorpay_order = client.order.create({
        "amount": int(total * 100),
        "currency": "INR",
        "notes": {
            "user_id": str(current_user.id),
            "plan_name": plan.name,
            "duration_label": payload.duration_label,
        },
    })

    payment = Payment(
        user_id=current_user.id,
        gateway=PaymentGateway.razorpay,
        gateway_order_id=razorpay_order["id"],
        plan_name=plan.name,
        duration_label=payload.duration_label,
        screens=payload.screens,
        base_amount=base_amount,
        tax_amount=tax_amount,
        total_amount=total,
        reward_points_used=reward_used,
        currency="INR",
        status=PaymentStatus.created,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return CreateOrderResponse(
        payment_id=payment.id,
        razorpay_order_id=razorpay_order["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        base_amount=base_amount,
        reward_points_used=reward_used,
        tax_amount=tax_amount,
        total_amount=total,
        currency="INR",
        plan_name=plan.name,
        duration_label=payload.duration_label,
        screens=payload.screens,
    )


@router.post("/razorpay/verify", response_model=PaymentOut)
def verify_razorpay_payment(
    payload: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = (
        db.query(Payment)
        .filter(Payment.id == payload.payment_id, Payment.user_id == current_user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    # Verify the signature ourselves rather than trusting the client's
    # word that payment succeeded — standard Razorpay HMAC-SHA256
    # verification: order_id|payment_id signed with the key secret.
    expected_signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
        payment.status = PaymentStatus.failed
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment verification failed.",
        )

    payment.status = PaymentStatus.paid
    payment.gateway_payment_id = payload.razorpay_payment_id

    # Activate the subscription now that payment is confirmed. Only one
    # active subscription per user — deactivate any existing one first.
    db.query(Subscription).filter(
        Subscription.user_id == current_user.id, Subscription.is_active == True  # noqa: E712
    ).update({"is_active": False})

    months, _ = get_duration_months_and_discount(payment.duration_label, db)
    expires_at = end_of_day_ist(datetime.now(timezone.utc) + timedelta(days=months * 30))

    subscription = Subscription(
        user_id=current_user.id,
        plan_name=payment.plan_name,
        duration_label=payment.duration_label,
        screens=payment.screens,
        price=payment.total_amount,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(subscription)
    db.flush()
    payment.subscription_id = subscription.id

    # Reward points — deduct what was redeemed for this purchase, then
    # award new points earned from it (rate from the reward_config master
    # table). This runs AFTER payment is already confirmed and the
    # subscription already created, so unlike the pre-payment checks
    # above, we deliberately do NOT raise an error here if the config
    # row is missing — a customer who already paid should never see a
    # 500 error for something unrelated to their payment succeeding.
    # Instead: award 0 points and log it loudly, so this gets noticed and
    # fixed rather than silently pretending a percentage that isn't real.
    reward_config = db.query(RewardConfig).first()
    if reward_config:
        points_earned = points_for_amount(reward_config, payment.total_amount, "subscription")
    else:
        points_earned = 0
        print(
            f"WARNING: reward_config table is empty — payment {payment.id} for user "
            f"{current_user.id} earned 0 reward points instead of the intended rate. "
            f"Fix: docker compose exec theomy-backend python -m app.seed_data"
        )

    current_user.reward_points_balance = max(
        0, current_user.reward_points_balance - payment.reward_points_used
    ) + points_earned

    db.commit()
    db.refresh(payment)

    # Notifications — best-effort, never block the response on these
    if current_user.phone:
        send_payment_whatsapp(current_user.phone, payment.plan_name, payment.total_amount, payment.duration_label)
    send_payment_email(
        current_user.email, payment.plan_name, payment.total_amount,
        payment.tax_amount, payment.duration_label, payment.screens,
    )

    return payment
