import secrets
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.email_utils import send_password_reset_email
from app.models import User, AuthProvider, OtpVerification, OtpPurpose, UserDemographics, EmailOtpVerification
from app.schemas import (
    UserRegister,
    UserLogin,
    UserOut,
    Token,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    MessageResponse,
    UserUpdate,
    VerifyOtpLoginRequest,
    DemographicsStatusOut,
    DemographicsUpdate,
)
from app.security import hash_password, verify_password, create_access_token

# Main accounts must be an adult — this mirrors how Netflix and similar
# services handle it: they don't do verifiable-parental-consent for a
# main/billing account, they simply require 18+ there and let anyone
# younger use a family sub-account instead (see routers/sub_accounts.py,
# which lets a parent mark a sub-account as a declared minor). Confirmed
# with the client, Sept 2026 — see the "Registration by users under 18"
# email thread. Raising this requires a new client decision, not just a
# code change, since it re-opens the parental-consent question.
MIN_REGISTRATION_AGE = 18


def _age_on(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))

router = APIRouter(prefix="/auth", tags=["auth"])


def _new_login_token(user: User, db: Session) -> str:
    """Issues a token for this login. The session token is still
    generated and stored on User.active_session_token, but it is NO
    LONGER enforced as "the one valid session" — see deps.py's
    get_current_user. An account can now be signed in on any number of
    devices; only concurrent PLAYBACK is capped, by the subscription's
    screens count (see routers/playback_sessions.py). The column is
    kept populated so previously-issued tokens and any future
    per-device auditing still have something meaningful to read.
    """
    session_token = secrets.token_urlsafe(32)
    user.active_session_token = session_token
    db.commit()
    return create_access_token(subject=str(user.id), session_token=session_token)


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

    today = datetime.now(timezone.utc).date()
    if payload.date_of_birth > today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date of birth can't be in the future.")
    if _age_on(payload.date_of_birth, today) < MIN_REGISTRATION_AGE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"You must be {MIN_REGISTRATION_AGE} or older to create an account. "
                "If this account is for someone younger, ask an adult to add them as a family account instead."
            ),
        )
    # City is only collected (and shown) for India — see UserRegister's docstring.
    if payload.country == "India" and not payload.city:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="City is required.")

    # India requires phone as a plain, required field, but the phone number
    # ITSELF is no longer OTP-verified (Admin decision, Sept 2026 — this
    # used to be a WhatsApp OTP to the phone; see EmailOtpVerification's
    # docstring in models.py for why). Instead, the person's EMAIL is
    # verified via a one-time code (routers/otp.py's "/send-email"). Other
    # countries need neither phone nor this verification — this mirrors
    # what the frontend enforces, but re-checked here since the frontend
    # can't be trusted to enforce it on its own.
    if payload.country == "India":
        if not payload.phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is required for India.",
            )
        if not payload.otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email verification code is required for India.",
            )

        otp_record = (
            db.query(EmailOtpVerification)
            .filter(
                EmailOtpVerification.email == payload.email,
                EmailOtpVerification.purpose == OtpPurpose.registration,
                EmailOtpVerification.is_verified == False,  # noqa: E712
            )
            .order_by(EmailOtpVerification.created_at.desc())
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
    # flush (not commit) — this sends the INSERT and assigns user.id within
    # the SAME open transaction as the UserDemographics insert below, so a
    # single db.commit() covers both. Two separate commits here previously
    # meant a failure while building UserDemographics (an AttributeError
    # from stale deployed code once did exactly this) left a real, permanent
    # User row with no demographics — a person who saw a failed
    # registration but actually got an account, silently, with no way to
    # tell from the error they got. get_db() (database.py) doesn't roll
    # back on its own, so this is the only thing that made it atomic.
    db.flush()

    # A main account is always an adult (enforced above), so
    # is_declared_minor is always False here — only a sub-account's PARENT
    # can set that flag, at sub-account creation (routers/sub_accounts.py).
    db.add(UserDemographics(
        user_id=user.id, date_of_birth=payload.date_of_birth,
        city=payload.city if payload.country == "India" else None,
        is_declared_minor=False,
    ))
    db.commit()
    db.refresh(user)

    token = _new_login_token(user, db)
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

    token = _new_login_token(user, db)
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
    token = _new_login_token(user, db)
    return Token(access_token=token, user=UserOut.model_validate(user))
@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me/password", response_model=MessageResponse)
def change_own_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account signed in with Google or Facebook and doesn't have a password to change.",
        )
    if not verify_password(payload.old_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password changed successfully.")


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


def _demographics_status(user: User, db: Session) -> DemographicsStatusOut:
    row = db.query(UserDemographics).filter(UserDemographics.user_id == user.id).first()
    # No row at all only happens for an account created before this feature
    # shipped (a pre-existing main account, or a social/OAuth signup — see
    # oauth.py, which doesn't collect date of birth). Default to "not a
    # declared minor" there ONLY if it isn't a sub-account: a pre-existing
    # SUB-account with no row defaults to declared-minor instead — the safe
    # side — until its parent explicitly marks it otherwise. (There's no UI
    # for a parent to change an existing sub-account's flag yet.)
    is_declared_minor = row.is_declared_minor if row else bool(user.parent_id)
    return DemographicsStatusOut(
        needs_profile=(not is_declared_minor) and (row is None or row.date_of_birth is None),
        is_declared_minor=is_declared_minor,
        date_of_birth=row.date_of_birth if row else None,
        city=row.city if row else None,
    )


@router.get("/me/demographics-status", response_model=DemographicsStatusOut)
def get_demographics_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Whether the app should show the one-time "Complete your profile"
    (date of birth + city) prompt for this account, and its current values.
    Covers every account created before this feature shipped, however it
    signed up (password, Google, Facebook, OTP) — see this function's
    docstring in _demographics_status.
    """
    return _demographics_status(current_user, db)


@router.put("/me/demographics", response_model=DemographicsStatusOut)
def complete_demographics(
    payload: DemographicsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-completion of date of birth + city — used for (a) a main account
    created before this feature shipped, and (b) a sub-account its parent
    declared an ADULT at creation (routers/sub_accounts.py) filling in its
    own details on first login. A declared-minor sub-account can never call
    this, even by guessing the request shape — enforced here, not just
    hidden in the UI.
    """
    existing = db.query(UserDemographics).filter(UserDemographics.user_id == current_user.id).first()
    is_declared_minor = existing.is_declared_minor if existing else bool(current_user.parent_id)
    if is_declared_minor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is set up for someone under 18 and can't add these details.",
        )

    today = datetime.now(timezone.utc).date()
    if payload.date_of_birth > today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date of birth can't be in the future.")
    if _age_on(payload.date_of_birth, today) < MIN_REGISTRATION_AGE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"This date of birth is under {MIN_REGISTRATION_AGE}. If this account is for someone "
                "younger, ask the main account holder to set it up as a family account for a minor instead."
            ),
        )
    if current_user.country == "India" and not payload.city:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="City is required.")

    city = payload.city if current_user.country == "India" else None
    if existing:
        existing.date_of_birth = payload.date_of_birth
        existing.city = city
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(UserDemographics(
            user_id=current_user.id, date_of_birth=payload.date_of_birth,
            city=city, is_declared_minor=False,
        ))
    db.commit()

    return _demographics_status(current_user, db)
