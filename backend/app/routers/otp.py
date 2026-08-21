import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import OtpVerification, OtpPurpose
from app.notifications import send_otp_whatsapp
from app.schemas import SendOtpRequest, MessageResponse

router = APIRouter(prefix="/auth/otp", tags=["otp"])


@router.post("/send", response_model=MessageResponse)
def send_otp(payload: SendOtpRequest, db: Session = Depends(get_db)):
    otp_code = f"{random.randint(0, 999999):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    record = OtpVerification(
        phone=payload.phone,
        otp_code=otp_code,
        purpose=OtpPurpose(payload.purpose),
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()

    sent = send_otp_whatsapp(payload.phone, otp_code, settings.OTP_EXPIRE_MINUTES)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send the verification code. Please check the number and try again.",
        )

    return MessageResponse(message="Verification code sent via WhatsApp.")
