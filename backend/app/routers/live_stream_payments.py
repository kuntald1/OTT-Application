import hashlib
import hmac
from decimal import Decimal, ROUND_HALF_UP

import razorpay
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, LiveStream, LiveStreamMonetization, LiveStreamPurchase,
    PaymentStatus, PaymentGateway, RewardConfig,
)
from app.notifications import send_video_purchase_whatsapp, send_video_purchase_email
from app.schemas import (
    CreateLiveStreamOrderResponse, VerifyLiveStreamPaymentRequest, LiveStreamPurchaseOut,
)

router = APIRouter(prefix="/videos/live", tags=["live-stream-payments"])


@router.post("/{live_stream_id}/purchase/razorpay/create-order", response_model=CreateLiveStreamOrderResponse)
def create_live_stream_purchase_order(
    live_stream_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pay Per Streaming checkout — deliberately a near-copy of
    video_payments.py's pay-per-video flow (same Razorpay order ->
    HMAC verify -> paid lifecycle), with ONE rule changed:

    pay-per-VIDEO requires an active subscription before you may buy.
    A live show does NOT. A ticketed show isn't tied to any plan —
    whoever pays gets in — which is why its section is forced to
    "both" and no subscription is checked here. Same reason
    _check_live_access never consults a subscription for a
    pay_per_stream event.

    India/Razorpay only for now, matching every other checkout on the
    site; overseas ticket sales need Stripe and aren't built yet.
    """
    if current_user.country != "India":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Buying a show is only available for India accounts right now.",
        )

    live_stream = db.query(LiveStream).filter(LiveStream.id == live_stream_id).first()
    if not live_stream or live_stream.is_disabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live event not found")
    if live_stream.monetization_type != LiveStreamMonetization.pay_per_stream:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This show isn't Pay Per Streaming.",
        )
    if live_stream.price_inr is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="This show has no price set yet.",
        )

    # There's a UNIQUE (user_id, live_stream_id) on this table, so there
    # is at most one row per viewer per show — a second INSERT would
    # fail outright. That matters because abandoning the Razorpay modal
    # leaves a "created" row behind, and the viewer will very reasonably
    # press Buy again. So: look the row up once, refuse only if it's
    # already PAID, and otherwise reuse it for the new order.
    existing = (
        db.query(LiveStreamPurchase)
        .filter(
            LiveStreamPurchase.user_id == current_user.id,
            LiveStreamPurchase.live_stream_id == live_stream.id,
        )
        .first()
    )
    if existing and existing.status == PaymentStatus.paid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a ticket for this show.")

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    razorpay_order = client.order.create({
        "amount": int(live_stream.price_inr * 100),  # paise
        "currency": "INR",
        "notes": {
            "user_id": str(current_user.id),
            "live_stream_id": str(live_stream.id),
            "kind": "pay_per_stream",
        },
    })

    if existing:
        # Reusing the abandoned/failed attempt. The price is re-read from
        # the event, so a retry after a price change charges the new one.
        purchase = existing
        purchase.gateway = PaymentGateway.razorpay
        purchase.gateway_order_id = razorpay_order["id"]
        purchase.gateway_payment_id = None
        purchase.amount = live_stream.price_inr
        purchase.currency = "INR"
        purchase.status = PaymentStatus.created
    else:
        purchase = LiveStreamPurchase(
            user_id=current_user.id,
            live_stream_id=live_stream.id,
            gateway=PaymentGateway.razorpay,
            gateway_order_id=razorpay_order["id"],
            amount=live_stream.price_inr,
            currency="INR",
            status=PaymentStatus.created,
        )
        db.add(purchase)
    db.commit()
    db.refresh(purchase)

    return CreateLiveStreamOrderResponse(
        purchase_id=purchase.id,
        razorpay_order_id=razorpay_order["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        amount=live_stream.price_inr,
        currency="INR",
        live_stream_title=live_stream.title,
    )


@router.post("/purchase/razorpay/verify", response_model=LiveStreamPurchaseOut)
def verify_live_stream_purchase_payment(
    payload: VerifyLiveStreamPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    purchase = (
        db.query(LiveStreamPurchase)
        .filter(
            LiveStreamPurchase.id == payload.purchase_id,
            LiveStreamPurchase.user_id == current_user.id,
        )
        .first()
    )
    if not purchase:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")

    expected_signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
        purchase.status = PaymentStatus.failed
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment verification failed.")

    # Already verified (a double-submit, or the viewer refreshed mid-flow)
    # — don't award points twice for one payment.
    if purchase.status == PaymentStatus.paid:
        return purchase

    purchase.status = PaymentStatus.paid
    purchase.gateway_payment_id = payload.razorpay_payment_id

    # Reward points at the same rate as every other successful payment —
    # see video_payments.py for why there's no separate rate. Missing
    # config means 0 points and a loud log, never a failed payment.
    live_stream = db.query(LiveStream).filter(LiveStream.id == purchase.live_stream_id).first()
    reward_config = db.query(RewardConfig).first()
    if reward_config:
        earn_percent = reward_config.subscription_reward_percent
        points_earned = int((purchase.amount * earn_percent / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    else:
        points_earned = 0
        print(
            f"WARNING: reward_config table is empty — live purchase {purchase.id} for user "
            f"{current_user.id} earned 0 reward points instead of the intended rate. "
            f"Fix: docker compose exec theomy-backend python -m app.seed_data"
        )
    current_user.reward_points_balance = (current_user.reward_points_balance or 0) + points_earned

    db.commit()
    db.refresh(purchase)

    # Best-effort notifications, reusing the video-purchase templates —
    # from the buyer's side a show and a video read the same ("you
    # bought X for ₹Y"), so a second pair of templates would only drift.
    title = live_stream.title if live_stream else "your show"
    if current_user.phone:
        send_video_purchase_whatsapp(current_user.phone, title, purchase.amount)
    send_video_purchase_email(current_user.email, title, purchase.amount, points_earned)

    return purchase


@router.get("/purchases/mine", response_model=list[LiveStreamPurchaseOut])
def list_my_live_stream_purchases(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(LiveStreamPurchase)
        .filter(
            LiveStreamPurchase.user_id == current_user.id,
            LiveStreamPurchase.status == PaymentStatus.paid,
        )
        .order_by(LiveStreamPurchase.created_at.desc())
        .all()
    )
