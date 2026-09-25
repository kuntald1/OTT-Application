import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import OtpVerification, OtpPurpose, EmailOtpVerification, User
from app.notifications import send_otp_whatsapp
from app.email_utils import send_registration_otp_email
from app.schemas import SendOtpRequest, SendEmailOtpRequest, MessageResponse

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


@router.post("/send-email", response_model=MessageResponse)
def send_email_otp(payload: SendEmailOtpRequest, db: Session = Depends(get_db)):
    """Email-based OTP for India registration — replaces the WhatsApp/phone
    OTP there (Admin decision, Sept 2026; see EmailOtpVerification's
    docstring in models.py). Not tied to an existing user: registration
    hasn't created the account yet, so this is looked up by the raw email
    string, exactly like the phone version above is looked up by phone.

    Checks email — and phone, when given — for an existing account BEFORE
    sending anything (Admin decision, Sept 2026): catching a duplicate
    here means the person is told immediately, at "Send verification
    code", instead of only after they've received the email, copied the
    code back, and submitted the whole form. register() (routers/auth.py)
    still re-checks both at the final step regardless — this is strictly
    an earlier, friendlier warning, not a replacement for that check
    (someone else could register the same email in between, however
    unlikely in practice).
    """
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists")
    if payload.phone and db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this phone number already exists")

    otp_code = f"{random.randint(0, 999999):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    record = EmailOtpVerification(
        email=payload.email,
        otp_code=otp_code,
        purpose=OtpPurpose(payload.purpose),
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()

    try:
        send_registration_otp_email(payload.email, otp_code, settings.OTP_EXPIRE_MINUTES)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Couldn't send the verification code. Please check the email address and try again.",
        )

    return MessageResponse(message="Verification code sent to your email.")
