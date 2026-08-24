import secrets
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.email_utils import send_password_reset_email
from app.models import User, AuthProvider, OtpVerification, OtpPurpose
from app.schemas import (
    UserRegister,
    UserLogin,
    UserOut,
    Token,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    MessageResponse,
    UserUpdate,
    VerifyOtpLoginRequest,
)
from app.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    if payload.phone:
        existing_phone = db.query(User).filter(User.phone == payload.phone).first()
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this phone number already exists",
            )

    # India requires a verified phone number via WhatsApp OTP. Other
    # countries keep phone optional with no OTP step — this mirrors what
    # the frontend enforces, but re-checked here since the frontend can't
    # be trusted to enforce it on its own.
    if payload.country == "India":
        if not payload.phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is required for India.",
            )
        if not payload.otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP verification is required for India.",
            )

        otp_record = (
            db.query(OtpVerification)
            .filter(
                OtpVerification.phone == payload.phone,
                OtpVerification.purpose == OtpPurpose.registration,
                OtpVerification.is_verified == False,  # noqa: E712
            )
            .order_by(OtpVerification.created_at.desc())
            .first()
        )
        invalid_otp = HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code.",
        )
        if not otp_record:
            raise invalid_otp

        otp_record.attempts += 1
        if otp_record.attempts > 5:
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many attempts. Please request a new code.",
            )

        expires_at = otp_record.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc) or otp_record.otp_code != payload.otp:
            db.commit()
            raise invalid_otp

        otp_record.is_verified = True
        db.commit()

    user = User(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        country=payload.country,
        # Password is hashed here — the plaintext from the request body
        # is never written to the DB and never returned in any response.
        hashed_password=hash_password(payload.password),
        auth_provider=AuthProvider.local,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    # Same error for "no such user" and "wrong password" — don't reveal
    # which one it was, that would let someone enumerate valid emails.
    invalid_creds = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
    )

    if not user or not user.hashed_password:
        raise invalid_creds
    if not verify_password(payload.password, user.hashed_password):
        raise invalid_creds
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact support if you believe this is a mistake.",
        )

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login-otp", response_model=Token)
def login_with_otp(payload: VerifyOtpLoginRequest, db: Session = Depends(get_db)):
    otp_record = (
        db.query(OtpVerification)
        .filter(
            OtpVerification.phone == payload.phone,
            OtpVerification.purpose == OtpPurpose.login,
            OtpVerification.is_verified == False,  # noqa: E712
        )
        .order_by(OtpVerification.created_at.desc())
        .first()
    )
    invalid_otp = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired verification code.",
    )
    if not otp_record:
        raise invalid_otp

    otp_record.attempts += 1
    if otp_record.attempts > 5:
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many attempts. Please request a new code.",
        )

    expires_at = otp_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc) or otp_record.otp_code != payload.otp:
        db.commit()
        raise invalid_otp

    otp_record.is_verified = True

    user = db.query(User).filter(User.phone == payload.phone, User.is_active == True).first()  # noqa: E712
    if not user:
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this phone number. Please register first.",
        )

    db.commit()
    token = create_access_token(subject=str(user.id))
    return Token(access_token=token, user=UserOut.model_validate(user))
@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_current_user(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.name is not None:
        current_user.name = payload.name

    if payload.email is not None and payload.email != current_user.email:
        existing = (
            db.query(User)
            .filter(User.email == payload.email, User.id != current_user.id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="That email is already in use by another account",
            )
        current_user.email = payload.email

    if payload.phone is not None:
        current_user.phone = payload.phone

    db.commit()
    db.refresh(current_user)
    return current_user


# Where uploaded photos live on disk. This path is bind-mounted from the
# host in docker-compose.yml (./uploads:/app/uploads) so files survive
# container rebuilds — without that mount, this would be wiped every time
# `docker compose up -d --build` runs.
UPLOAD_DIR = Path("uploads/profile_photos")
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/me/photo", response_model=UserOut)
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, WEBP, or GIF images are allowed.",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must be smaller than 5MB.",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as f:
        f.write(contents)

    # Delete the old photo file, if one exists, so orphaned uploads don't
    # pile up on disk every time someone changes their photo.
    if current_user.profile_photo_url:
        old_filename = current_user.profile_photo_url.rsplit("/", 1)[-1]
        old_path = UPLOAD_DIR / old_filename
        if old_path.exists() and old_path.is_file():
            old_path.unlink(missing_ok=True)

    current_user.profile_photo_url = f"/api/uploads/profile_photos/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Always return the same generic message whether or not the email
    # exists — otherwise this endpoint could be used to check which emails
    # are registered on theomy.
    generic_response = MessageResponse(
        message="If an account exists for that email, a reset link has been sent."
    )

    user = db.query(User).filter(User.email == payload.email).first()

    # No account, or a social-only account with no password to reset —
    # silently do nothing but still return the generic message.
    if not user or not user.hashed_password:
        return generic_response

    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.RESET_TOKEN_EXPIRE_MINUTES
    )
    db.commit()

    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    try:
        send_password_reset_email(user.email, reset_link)
    except Exception:
        # Don't leak SMTP errors to the client — from their side, the
        # response looks identical either way. Real deployments should log
        # this exception somewhere for the operator to notice.
        pass

    return generic_response


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(User.reset_token == payload.token)
        .first()
    )

    invalid_token = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This reset link is invalid or has expired.",
    )

    if not user or not user.reset_token_expires:
        raise invalid_token

    expires_at = user.reset_token_expires
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise invalid_token

    user.hashed_password = hash_password(payload.new_password)
    # Single-use — clear the token immediately so the same link can't be
    # replayed to reset the password again.
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return MessageResponse(message="Password reset successfully. You can now log in.")
