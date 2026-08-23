import hashlib
import hmac

import razorpay
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, Video, VideoStatus, VideoMonetization, VideoPricing,
    VideoPurchase, PaymentStatus, PaymentGateway,
)
from app.routers.videos import _has_active_subscription_any
from app.schemas import CreateVideoOrderResponse, VerifyVideoPaymentRequest, VideoPurchaseOut

router = APIRouter(prefix="/videos", tags=["video-payments"])


@router.post("/{video_id}/purchase/razorpay/create-order", response_model=CreateVideoOrderResponse)
def create_video_purchase_order(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pay-Per-Video checkout — Razorpay/India only in this pass, same
    scope as the subscription and donation flows. Reuses Payment's
    HMAC-verification pattern via VideoPurchase instead of Payment,
    since a video purchase isn't tied to a subscription plan.
    """
    if current_user.country != "India":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pay-Per-Video checkout is only available for India accounts right now.",
        )

    video = db.query(Video).filter(Video.id == video_id, Video.status == VideoStatus.published).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    if video.monetization_type != VideoMonetization.pay_per_video:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This video isn't Pay-Per-Video.")

    # Subscription is the prerequisite — a user with no active plan can't
    # buy pay-per-video content regardless of price (see Video model
    # docstring). Checked again server-side, never trusted from the client.
    if not _has_active_subscription_any(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An active subscription is required before you can purchase Pay-Per-Video content.",
        )

    already_purchased = (
        db.query(VideoPurchase)
        .filter(
            VideoPurchase.user_id == current_user.id,
            VideoPurchase.video_id == video.id,
            VideoPurchase.status == PaymentStatus.paid,
        )
        .first()
    )
    if already_purchased:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already own this video.")

    pricing = db.query(VideoPricing).filter(VideoPricing.video_id == video.id).first()
    if not pricing:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="This video has no price set yet.")

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    razorpay_order = client.order.create({
        "amount": int(pricing.price_inr * 100),  # paise
        "currency": "INR",
        "notes": {
            "user_id": str(current_user.id),
            "video_id": str(video.id),
            "kind": "pay_per_video",
        },
    })

    purchase = VideoPurchase(
        user_id=current_user.id,
        video_id=video.id,
        gateway=PaymentGateway.razorpay,
        gateway_order_id=razorpay_order["id"],
        amount=pricing.price_inr,
        currency="INR",
        status=PaymentStatus.created,
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)

    return CreateVideoOrderResponse(
        purchase_id=purchase.id,
        razorpay_order_id=razorpay_order["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        amount=pricing.price_inr,
        currency="INR",
        video_title=video.title,
    )


@router.post("/purchase/razorpay/verify", response_model=VideoPurchaseOut)
def verify_video_purchase_payment(
    payload: VerifyVideoPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    purchase = (
        db.query(VideoPurchase)
        .filter(VideoPurchase.id == payload.purchase_id, VideoPurchase.user_id == current_user.id)
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

    purchase.status = PaymentStatus.paid
    purchase.gateway_payment_id = payload.razorpay_payment_id
    db.commit()
    db.refresh(purchase)
    return purchase
