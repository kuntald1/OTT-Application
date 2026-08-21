from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

import stripe
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, Payment, PaymentStatus, PaymentGateway,
    SubscriptionPlan, Subscription, ExchangeRateConfig,
)
from app.notifications import send_payment_whatsapp, send_payment_email
from app.schemas import PaymentOut, StripeCreateSessionRequest, StripeCreateSessionResponse, StripeConfirmRequest

router = APIRouter(prefix="/payments/stripe", tags=["payments"])

# Same duration/discount table as the Razorpay flow — kept in sync manually
_DURATION_MONTHS = {
    "1 Month": (1, Decimal("0")),
    "6 Months": (6, Decimal("0.10")),
    "1 Year": (12, Decimal("0.20")),
}


def _round2(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _compute_usd_pricing(plan: SubscriptionPlan, duration_label: str, screens: int, reward_points_requested: int, inr_per_usd: Decimal):
    """Server-side price recomputation in USD. GST does not apply outside
    India, so unlike the Razorpay flow there's no tax line here — the INR
    plan price is converted to USD via the fixed exchange rate, then the
    same screens/duration/reward logic applies on top, in USD.

    Reward points are still redeemed at 1 point = ₹1 (that's how they're
    earned, on the INR side of the business), so the redemption is
    converted to its USD-equivalent discount here.
    """
    months, discount = _DURATION_MONTHS.get(duration_label, (1, Decimal("0")))
    monthly_inr = plan.base_price + plan.per_extra_screen * (screens - 1)
    pre_rewards_inr = (monthly_inr * months * (1 - discount)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    reward_used_inr = min(max(reward_points_requested, 0), int(pre_rewards_inr))
    total_inr = pre_rewards_inr - reward_used_inr

    total_usd = _round2(Decimal(total_inr) / inr_per_usd)
    return total_usd


@router.post("/create-checkout-session", response_model=StripeCreateSessionResponse)
def create_stripe_checkout_session(
    payload: StripeCreateSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.country == "India":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="India accounts pay via Razorpay in INR, not Stripe.",
        )

    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == payload.plan_name, SubscriptionPlan.is_active == True  # noqa: E712
    ).first()
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    rate_row = db.query(ExchangeRateConfig).first()
    inr_per_usd = rate_row.inr_per_usd if rate_row else Decimal("83.5")

    amount_usd = _compute_usd_pricing(plan, payload.duration_label, payload.screens, payload.reward_points_requested, inr_per_usd)
    if amount_usd <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Total amount must be greater than zero.")

    payment = Payment(
        user_id=current_user.id,
        gateway=PaymentGateway.stripe,
        plan_name=plan.name,
        duration_label=payload.duration_label,
        screens=payload.screens,
        base_amount=amount_usd,
        tax_amount=Decimal("0"),
        total_amount=amount_usd,
        reward_points_used=0,
        currency="USD",
        status=PaymentStatus.created,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    stripe.api_key = settings.STRIPE_SECRET_KEY
    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {"name": f"theomy — {plan.name} ({payload.duration_label})"},
                "unit_amount": int(amount_usd * 100),  # Stripe uses cents
            },
            "quantity": 1,
        }],
        success_url=f"{settings.FRONTEND_URL}/stripe/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.FRONTEND_URL}/",
        metadata={"payment_id": str(payment.id), "user_id": str(current_user.id)},
    )

    payment.gateway_order_id = session.id
    db.commit()

    return StripeCreateSessionResponse(
        payment_id=payment.id,
        checkout_url=session.url,
        amount_usd=amount_usd,
        plan_name=plan.name,
        duration_label=payload.duration_label,
        screens=payload.screens,
    )


@router.post("/confirm", response_model=PaymentOut)
def confirm_stripe_payment(
    payload: StripeConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        session = stripe.checkout.Session.retrieve(payload.session_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe session.")

    payment = (
        db.query(Payment)
        .filter(Payment.gateway_order_id == payload.session_id, Payment.user_id == current_user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    # Trust Stripe's own record of the session, retrieved server-side with
    # our secret key — not anything the client claims about payment status.
    if session.payment_status != "paid":
        payment.status = PaymentStatus.failed
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment was not completed.")

    if payment.status == PaymentStatus.paid:
        # Already confirmed earlier (e.g. user refreshed the success page)
        return payment

    payment.status = PaymentStatus.paid
    payment.gateway_payment_id = session.payment_intent

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
        currency="USD",
        is_active=True,
        expires_at=expires_at,
    )
    db.add(subscription)
    db.flush()
    payment.subscription_id = subscription.id

    db.commit()
    db.refresh(payment)

    if current_user.phone:
        send_payment_whatsapp(current_user.phone, payment.plan_name, payment.total_amount, payment.duration_label)
    send_payment_email(
        current_user.email, payment.plan_name, payment.total_amount,
        payment.tax_amount, payment.duration_label, payment.screens,
    )

    return payment
