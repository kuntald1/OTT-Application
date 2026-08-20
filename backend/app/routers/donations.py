import hashlib
import hmac
from decimal import Decimal, ROUND_HALF_UP

import razorpay
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserRole, Donation, PaymentGateway, PaymentStatus
from app.schemas import (
    DonationCreateOrderRequest, DonationCreateOrderResponse,
    DonationVerifyRequest, DonationOut,
)

router = APIRouter(prefix="/donations", tags=["donations"])


@router.get("", response_model=list[DonationOut])
def list_my_donations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    donations = (
        db.query(Donation)
        .filter(Donation.donor_user_id == current_user.id)
        .order_by(Donation.created_at.desc())
        .all()
    )
    out = []
    for d in donations:
        organiser = db.query(User).filter(User.id == d.organiser_user_id).first()
        out.append(DonationOut(
            id=d.id,
            organiser_name=organiser.name if organiser else "Unknown",
            amount=d.amount,
            gateway=d.gateway,
            status=d.status,
            created_at=d.created_at,
        ))
    return out


@router.post("/razorpay/create-order", response_model=DonationCreateOrderResponse)
def create_donation_order(
    payload: DonationCreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    organiser = (
        db.query(User)
        .filter(User.id == payload.organiser_user_id, User.role == UserRole.plays_organiser)
        .first()
    )
    if not organiser:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organiser not found")

    amount = payload.amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    razorpay_order = client.order.create({
        "amount": int(amount * 100),
        "currency": "INR",
        "notes": {
            "donor_user_id": str(current_user.id),
            "organiser_user_id": str(organiser.id),
            "type": "donation",
        },
    })

    donation = Donation(
        donor_user_id=current_user.id,
        organiser_user_id=organiser.id,
        amount=amount,
        currency="INR",
        gateway=PaymentGateway.razorpay,
        gateway_order_id=razorpay_order["id"],
        status=PaymentStatus.created,
    )
    db.add(donation)
    db.commit()
    db.refresh(donation)

    return DonationCreateOrderResponse(
        donation_id=donation.id,
        razorpay_order_id=razorpay_order["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        amount=amount,
        currency="INR",
        organiser_name=organiser.name,
    )


@router.post("/razorpay/verify", response_model=DonationOut)
def verify_donation_payment(
    payload: DonationVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    donation = (
        db.query(Donation)
        .filter(Donation.id == payload.donation_id, Donation.donor_user_id == current_user.id)
        .first()
    )
    if not donation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donation not found")

    expected_signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
        donation.status = PaymentStatus.failed
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment verification failed.",
        )

    donation.status = PaymentStatus.paid
    donation.gateway_payment_id = payload.razorpay_payment_id
    db.commit()
    db.refresh(donation)

    organiser = db.query(User).filter(User.id == donation.organiser_user_id).first()
    return DonationOut(
        id=donation.id,
        organiser_name=organiser.name if organiser else "Unknown",
        amount=donation.amount,
        gateway=donation.gateway,
        status=donation.status,
        created_at=donation.created_at,
    )
