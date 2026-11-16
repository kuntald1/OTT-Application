"""Refer & Earn — the customer's own side of it.

Two things happen here:

  GET  /referrals/me     hands the signed-in user their code and link,
                         issuing a fresh one if they have none or theirs
                         has expired, plus how their referrals are doing.
  POST /referrals/claim  records that this account signed up through
                         somebody's code. Nobody is paid yet — the points
                         land only when this account pays for its first
                         subscription (app/rewards.award_referral_if_due,
                         called from the subscription payment paths).

Claiming is deliberately a separate call from registering rather than a
field on the register endpoint: that way one path covers email signups
and Google/Facebook signups alike, and registration itself is left
untouched. The frontend keeps the ?ref= code from the shared link and
posts it here once the account exists.
"""

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.identity_utils import normalize_email, normalize_phone
from app.models import (
    Payment, PaymentStatus, Referral, ReferralCode, ReferralInvite, RewardConfig, User,
)
from app.notifications import send_referral_invite_email, send_referral_invite_whatsapp

router = APIRouter(prefix="/referrals", tags=["referrals"])

# No O/0/I/1 — these get read off a phone screen and typed by hand, and
# a code nobody can transcribe is worse than a longer one.
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 8


class ClaimRequest(BaseModel):
    code: str = Field(min_length=4, max_length=16)


class ReferralCodeOut(BaseModel):
    code: str
    share_url: str
    expires_at: datetime
    validity_days: int
    referrer_reward_points: int
    referred_reward_points: int
    # How this user's own referrals are going
    signed_up: int
    rewarded: int
    points_earned: int


def _aware(dt):
    """Postgres hands back tz-aware datetimes, but a row written before
    the column was timezone-aware can come back naive — comparing the two
    raises. Treat a naive value as UTC, which is what was stored.
    """
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _config_or_503(db: Session) -> RewardConfig:
    config = db.query(RewardConfig).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Reward config is not set up. Run: docker compose exec theomy-backend python -m app.seed_data",
        )
    return config


def _new_code(db: Session) -> str:
    """A code nobody else holds. Collisions are vanishingly unlikely at
    32^8, but 'unlikely' isn't 'never' and the column is UNIQUE, so a
    collision would otherwise surface as a 500 on someone's first visit
    to the Refer & Earn page.
    """
    for _ in range(10):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
        if not db.query(ReferralCode).filter(ReferralCode.code == code).first():
            return code
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not generate a referral code. Please try again.",
    )


def _active_code_for(db: Session, user: User, config: RewardConfig) -> ReferralCode:
    """This user's live code, issuing a new one if theirs has run out.

    The expired row is marked inactive rather than deleted, so a code
    that is already circulating in a WhatsApp message can still be traced
    to its owner after it stops working.
    """
    now = datetime.now(timezone.utc)
    existing = (
        db.query(ReferralCode)
        .filter(ReferralCode.user_id == user.id, ReferralCode.is_active == True)  # noqa: E712
        .order_by(ReferralCode.created_at.desc())
        .first()
    )
    if existing and _aware(existing.expires_at) > now:
        return existing

    if existing:
        existing.is_active = False

    validity = int(config.referral_code_validity_days or 30)
    fresh = ReferralCode(
        user_id=user.id,
        code=_new_code(db),
        is_active=True,
        created_at=now,
        expires_at=now + timedelta(days=validity),
    )
    db.add(fresh)
    db.commit()
    db.refresh(fresh)
    return fresh


@router.get("/me", response_model=ReferralCodeOut)
def my_referral_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    config = _config_or_503(db)
    if not config.referral_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Refer & Earn is not available right now.",
        )

    code = _active_code_for(db, current_user, config)

    mine = db.query(Referral).filter(Referral.referrer_user_id == current_user.id).all()
    rewarded = [r for r in mine if r.status == "rewarded"]

    return ReferralCodeOut(
        code=code.code,
        share_url=f"{settings.FRONTEND_URL.rstrip('/')}/register?ref={code.code}",
        expires_at=_aware(code.expires_at),
        validity_days=int(config.referral_code_validity_days or 30),
        referrer_reward_points=int(config.referrer_reward_points or 0),
        referred_reward_points=int(config.referred_reward_points or 0),
        signed_up=len(mine),
        rewarded=len(rewarded),
        points_earned=sum(r.referrer_points_awarded for r in rewarded),
    )


@router.post("/claim", status_code=status.HTTP_200_OK)
def claim_referral(
    payload: ClaimRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record that this account came in through someone's code.

    Called by the frontend right after a new account is created, with the
    code kept from the ?ref= link. Returns {"claimed": false, "reason":
    ...} rather than an error for the ordinary cases — a stale link in
    someone's browser shouldn't greet a brand new customer with a red
    error box on the screen after they have just signed up.
    """
    config = _config_or_503(db)
    if not config.referral_enabled:
        return {"claimed": False, "reason": "Refer & Earn is not available right now."}

    now = datetime.now(timezone.utc)
    code = payload.code.strip().upper()

    record = db.query(ReferralCode).filter(ReferralCode.code == code).first()
    if not record:
        return {"claimed": False, "reason": "That referral code doesn't exist."}
    # is_active goes false both when a code is replaced by a fresh one and
    # when an admin cancels it, so this covers cancellation too.
    if not record.is_active or _aware(record.expires_at) <= now:
        return {"claimed": False, "reason": "That referral code has expired."}

    # Self-referral, including a second account made by the same person
    # using their own link.
    if record.user_id == current_user.id:
        return {"claimed": False, "reason": "You can't use your own referral code."}

    # Already referred by someone — one referral per account, ever.
    if db.query(Referral).filter(Referral.referred_user_id == current_user.id).first():
        return {"claimed": False, "reason": "This account has already used a referral code."}

    # "Users who have previously subscribed are not eligible as new
    # referrals" — any completed payment disqualifies the account.
    already_paid = (
        db.query(Payment)
        .filter(Payment.user_id == current_user.id, Payment.status == PaymentStatus.paid)
        .first()
    )
    if already_paid:
        return {"claimed": False, "reason": "Referral codes are for new accounts only."}

    # A code is good for N days; a new account gets the same N days to use
    # one. Without this an account made years ago could still claim.
    validity = int(config.referral_code_validity_days or 30)
    created = _aware(current_user.created_at)
    if created and created < now - timedelta(days=validity):
        return {"claimed": False, "reason": "Referral codes are for new accounts only."}

    db.add(Referral(
        referrer_user_id=record.user_id,
        referred_user_id=current_user.id,
        referral_code_id=record.id,
        code=record.code,
        status="registered",
        registered_at=now,
    ))
    try:
        db.commit()
    except Exception:  # noqa: BLE001
        # referred_user_id is UNIQUE — two claims racing each other end
        # up here, and the one that lost simply reports what is already
        # true rather than a server error.
        db.rollback()
        return {"claimed": False, "reason": "This account has already used a referral code."}

    return {
        "claimed": True,
        "reward_points": int(config.referred_reward_points or 0),
        "message": (
            f"Referral applied. You'll get {int(config.referred_reward_points or 0)} "
            "reward points when you buy your first subscription."
        ),
    }


# ----------------------------------------------------------- sharing it

# One account can send this many invites a day. High enough that nobody
# sharing with real friends will ever notice, low enough that theomy
# can't be turned into a bulk-messaging service by someone with a list.
_DAILY_INVITE_LIMIT = 20


class ShareRequest(BaseModel):
    channel: str = Field(pattern="^(email|whatsapp)$")
    to: str = Field(min_length=3, max_length=255)


@router.post("/share", status_code=status.HTTP_200_OK)
def share_referral(
    payload: ShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send this user's invite to one email address or WhatsApp number."""
    config = _config_or_503(db)
    if not config.referral_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Refer & Earn is not available right now.",
        )

    destination = payload.to.strip()
    if payload.channel == "email":
        if "@" not in destination or " " in destination:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="That doesn't look like an email address.")
        destination = normalize_email(destination)
        if destination == normalize_email(current_user.email):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="That's your own address.")
    else:
        destination = normalize_phone(destination) or ""
        if not destination:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="That doesn't look like a phone number.")
        if current_user.phone and destination == current_user.phone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="That's your own number.")

    now = datetime.now(timezone.utc)
    sent_today = (
        db.query(ReferralInvite)
        .filter(ReferralInvite.sent_by_user_id == current_user.id,
                ReferralInvite.created_at >= now - timedelta(days=1))
        .count()
    )
    if sent_today >= _DAILY_INVITE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You've sent {_DAILY_INVITE_LIMIT} invites today. Try again tomorrow.",
        )

    code = _active_code_for(db, current_user, config)
    share_url = f"{settings.FRONTEND_URL.rstrip('/')}/register?ref={code.code}"
    expires_on = _aware(code.expires_at).strftime("%d %b %Y")
    points = int(config.referred_reward_points or 0)

    try:
        if payload.channel == "email":
            send_referral_invite_email(
                destination, current_user.name, code.code, share_url, points, expires_on,
            )
        else:
            send_referral_invite_whatsapp(
                destination, current_user.name, code.code, share_url, points,
            )
    except Exception as exc:  # noqa: BLE001
        # Record the attempt before reporting it, so a server that can't
        # send at all shows up in the admin's invite list as a row of
        # failures rather than as silence.
        db.add(ReferralInvite(
            referral_code_id=code.id, code=code.code,
            sent_by_user_id=current_user.id, channel=payload.channel,
            destination=destination, status="failed",
        ))
        db.commit()
        print(f"WARNING: referral invite to {destination} via {payload.channel} failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Couldn't send it just now. Copy the link and send it yourself instead."
                if payload.channel == "email"
                else "Couldn't send the WhatsApp message. Copy the link and send it yourself instead."
            ),
        )

    db.add(ReferralInvite(
        referral_code_id=code.id, code=code.code,
        sent_by_user_id=current_user.id, channel=payload.channel,
        destination=destination, status="sent",
    ))
    db.commit()

    return {"sent": True, "channel": payload.channel, "to": destination}
