import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

import razorpay
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, Payment, PaymentStatus, PaymentGateway,
    SubscriptionPlan, Subscription, TaxConfig, RewardConfig,
)
from app.notifications import send_payment_whatsapp, send_payment_email
from app.schemas import PaymentOut, CreateOrderRequest, CreateOrderResponse, VerifyPaymentRequest

router = APIRouter(prefix="/payments", tags=["payments"])

# Matches the duration options on the frontend's Subscription page
_DURATION_MONTHS = {
    "1 Month": (1, Decimal("0")),
    "6 Months": (6, Decimal("0.10")),
    "1 Year": (12, Decimal("0.20")),
}


def _round(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _compute_pricing(plan: SubscriptionPlan, duration_label: str, screens: int, reward_points_requested: int, gst_percent: Decimal):
    """Server-side price recomputation — never trusts a price sent by the
    client. Mirrors SubscriptionPage.jsx's priceFor() logic (screens
    scaling + duration discount), then adds GST on top of the
    reward-discounted amount.
    """
    months, discount = _DURATION_MONTHS.get(duration_label, (1, Decimal("0")))
    monthly = plan.base_price + plan.per_extra_screen * (screens - 1)
    pre_rewards = _round(monthly * months * (1 - discount))

    reward_used = min(max(reward_points_requested, 0), int(pre_rewards))
    taxable_amount = pre_rewards - reward_used

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
    gst_percent = tax_row.gst_percent if tax_row else Decimal("18")

    base_amount, reward_used, tax_amount, total = _compute_pricing(
        plan, payload.duration_label, payload.screens, payload.reward_points_requested, gst_percent
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

    months, _ = _DURATION_MONTHS.get(payment.duration_label, (1, Decimal("0")))
    expires_at = datetime.now(timezone.utc) + timedelta(days=months * 30)

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
    # table, defaults to 20% if no row exists yet). Both happen only here,
    # on confirmed payment — never at order creation, so an
    # abandoned/failed checkout never touches the balance.
    reward_config = db.query(RewardConfig).first()
    earn_percent = reward_config.subscription_reward_percent if reward_config else Decimal("20")
    points_earned = int((payment.total_amount * earn_percent / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

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
