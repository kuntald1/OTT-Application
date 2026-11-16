"""Admin > Referrals — who referred whom, where it stands, what it cost.

Read-only. Nothing here changes a balance; the rates themselves live in
Admin > Reward Points (routers/admin_reward_config.py).

Three things the client asked to be able to see:
  * who referred someone, and whether that person signed up
  * codes that were handed out and expired with nobody using them
  * for a given person, how many points came from referring and how many
    from their own purchases
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.deps import get_current_admin, get_current_superadmin
from app.identity_utils import normalize_email, normalize_phone
from app.models import (
    AdminUser, Referral, ReferralCode, ReferralInvite, RewardConfig,
    RewardTransaction, User,
)
from app.notifications import send_referral_invite_email, send_referral_invite_whatsapp

router = APIRouter(prefix="/admin/referrals", tags=["admin-referrals"])

# Ledger sources, grouped the way the report reads them. The two
# referral sources are kept APART on purpose: lumping them together
# labelled a newly referred customer as having referred somebody, which
# is the opposite of what happened to them.
_PURCHASE_SOURCES = ("subscription", "autopay", "video", "live_stream", "ticket")
_REFERRED_OTHERS_SOURCE = "referral_referrer"   # they brought someone in
_WAS_REFERRED_SOURCE = "referral_referred"      # someone brought them in


class ReferralRow(BaseModel):
    id: str
    code: str
    status: str
    referrer_name: str
    referrer_email: str
    referred_name: str
    referred_email: str
    registered_at: Optional[datetime]
    subscribed_at: Optional[datetime]
    referrer_points_awarded: int
    referred_points_awarded: int


class EarnerRow(BaseModel):
    user_id: str
    name: str
    email: str
    referred_others_points: int
    was_referred_points: int
    purchase_points: int
    spent_points: int
    balance: int


class ReferralSummary(BaseModel):
    codes_issued: int
    codes_active: int
    codes_expired: int
    signed_up: int
    awaiting_subscription: int
    rewarded: int
    cancelled: int
    points_paid_out: int


class ReferralReport(BaseModel):
    summary: ReferralSummary
    referrals: list[ReferralRow]
    total: int
    top_earners: list[EarnerRow]


def _aware(dt):
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("", response_model=ReferralReport)
def referral_report(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    # --- codes --------------------------------------------------------
    codes_issued = db.query(func.count(ReferralCode.id)).scalar() or 0
    # "Expired" counts codes nobody used before they ran out, which is
    # the number worth looking at — a code that expired AFTER doing its
    # job isn't a failure. Codes with a referral against them are
    # therefore excluded.
    used_code_ids = {r[0] for r in db.query(Referral.referral_code_id).distinct() if r[0]}
    expired_unused = 0
    active_now = 0
    for code_id, expires_at in db.query(ReferralCode.id, ReferralCode.expires_at):
        if _aware(expires_at) > now:
            active_now += 1
        elif code_id not in used_code_ids:
            expired_unused += 1

    # --- referrals ----------------------------------------------------
    base = db.query(Referral)
    if status_filter in ("registered", "rewarded", "cancelled"):
        base = base.filter(Referral.status == status_filter)

    total = base.count()
    rows = (
        base.order_by(Referral.registered_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # One query for every user mentioned, instead of two per row.
    user_ids = set()
    for r in rows:
        user_ids.add(r.referrer_user_id)
        user_ids.add(r.referred_user_id)
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids))} if user_ids else {}

    def _name(uid):
        u = users.get(uid)
        return (u.name if u else "(deleted user)"), (u.email if u else "—")

    referral_rows = []
    for r in rows:
        rn, re_ = _name(r.referrer_user_id)
        dn, de = _name(r.referred_user_id)
        referral_rows.append(ReferralRow(
            id=str(r.id),
            code=r.code,
            status=r.status,
            referrer_name=rn, referrer_email=re_,
            referred_name=dn, referred_email=de,
            registered_at=_aware(r.registered_at),
            subscribed_at=_aware(r.subscribed_at),
            referrer_points_awarded=r.referrer_points_awarded or 0,
            referred_points_awarded=r.referred_points_awarded or 0,
        ))

    all_counts = dict(
        db.query(Referral.status, func.count(Referral.id)).group_by(Referral.status).all()
    )
    points_paid = db.query(
        func.coalesce(func.sum(Referral.referrer_points_awarded), 0)
        + func.coalesce(func.sum(Referral.referred_points_awarded), 0)
    ).scalar() or 0

    summary = ReferralSummary(
        codes_issued=codes_issued,
        codes_active=active_now,
        codes_expired=expired_unused,
        signed_up=sum(all_counts.values()),
        awaiting_subscription=all_counts.get("registered", 0),
        rewarded=all_counts.get("rewarded", 0),
        cancelled=all_counts.get("cancelled", 0),
        points_paid_out=int(points_paid),
    )

    # --- points by source --------------------------------------------
    # Straight from the ledger, so "earned by referring" and "earned by
    # buying" are real numbers rather than a guess. Only movements since
    # the ledger went live are here — balances earned before that show as
    # a balance with no lines behind it, which is expected.
    per_user = {}
    for user_id, source, total_points in (
        db.query(RewardTransaction.user_id, RewardTransaction.source,
                 func.sum(RewardTransaction.points))
        .group_by(RewardTransaction.user_id, RewardTransaction.source)
        .all()
    ):
        bucket = per_user.setdefault(
            user_id, {"referred_others": 0, "was_referred": 0, "purchase": 0, "spent": 0},
        )
        points = int(total_points or 0)
        if source == _REFERRED_OTHERS_SOURCE:
            bucket["referred_others"] += points
        elif source == _WAS_REFERRED_SOURCE:
            bucket["was_referred"] += points
        elif source in _PURCHASE_SOURCES:
            bucket["purchase"] += points
        else:
            bucket["spent"] += points

    top_ids = sorted(
        per_user,
        key=lambda uid: (per_user[uid]["referred_others"] + per_user[uid]["was_referred"]
                         + per_user[uid]["purchase"]),
        reverse=True,
    )[:20]
    earner_users = (
        {u.id: u for u in db.query(User).filter(User.id.in_(top_ids))} if top_ids else {}
    )
    top_earners = []
    for uid in top_ids:
        u = earner_users.get(uid)
        if not u:
            continue
        b = per_user[uid]
        top_earners.append(EarnerRow(
            user_id=str(uid), name=u.name, email=u.email,
            referred_others_points=b["referred_others"],
            was_referred_points=b["was_referred"],
            purchase_points=b["purchase"],
            spent_points=abs(b["spent"]),
            balance=u.reward_points_balance or 0,
        ))

    return ReferralReport(
        summary=summary, referrals=referral_rows, total=total, top_earners=top_earners,
    )


# ------------------------------------------------------- codes & actions


class CodeRow(BaseModel):
    id: str
    code: str
    owner_name: str
    owner_email: str
    is_active: bool
    expired: bool
    expires_at: Optional[datetime]
    signups: int
    invites_sent: int


class InviteRow(BaseModel):
    id: str
    code: str
    channel: str
    destination: str
    status: str
    sent_by: str
    created_at: Optional[datetime]


class SendRequest(BaseModel):
    code: str = Field(min_length=4, max_length=16)
    channel: str = Field(pattern="^(email|whatsapp)$")
    to: str = Field(min_length=3, max_length=255)


@router.get("/codes", response_model=list[CodeRow])
def list_codes(
    only_live: bool = Query(default=True),
    limit: int = Query(default=200, ge=1, le=500),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Codes that exist, so an admin can send one on or cancel it.

    only_live hides codes that are already dead — the default, since a
    cancelled or expired code is nothing anyone needs to act on.
    """
    now = datetime.now(timezone.utc)
    rows = db.query(ReferralCode).order_by(ReferralCode.created_at.desc()).limit(limit).all()

    owner_ids = {r.user_id for r in rows}
    owners = {u.id: u for u in db.query(User).filter(User.id.in_(owner_ids))} if owner_ids else {}

    signups = dict(
        db.query(Referral.referral_code_id, func.count(Referral.id))
        .group_by(Referral.referral_code_id).all()
    )
    invites = dict(
        db.query(ReferralInvite.referral_code_id, func.count(ReferralInvite.id))
        .filter(ReferralInvite.status == "sent")
        .group_by(ReferralInvite.referral_code_id).all()
    )

    out = []
    for r in rows:
        expired = _aware(r.expires_at) <= now
        if only_live and (expired or not r.is_active):
            continue
        owner = owners.get(r.user_id)
        out.append(CodeRow(
            id=str(r.id), code=r.code,
            owner_name=owner.name if owner else "(deleted user)",
            owner_email=owner.email if owner else "—",
            is_active=bool(r.is_active), expired=expired,
            expires_at=_aware(r.expires_at),
            signups=signups.get(r.id, 0),
            invites_sent=invites.get(r.id, 0),
        ))
    return out


@router.get("/invites", response_model=list[InviteRow])
def list_invites(
    limit: int = Query(default=100, ge=1, le=500),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ReferralInvite)
        .order_by(ReferralInvite.created_at.desc())
        .limit(limit)
        .all()
    )
    sender_ids = {r.sent_by_user_id for r in rows if r.sent_by_user_id}
    senders = {u.id: u for u in db.query(User).filter(User.id.in_(sender_ids))} if sender_ids else {}
    return [
        InviteRow(
            id=str(r.id), code=r.code, channel=r.channel,
            destination=r.destination, status=r.status,
            sent_by=(senders[r.sent_by_user_id].name
                     if r.sent_by_user_id in senders else "Admin"),
            created_at=_aware(r.created_at),
        )
        for r in rows
    ]


@router.post("/codes/{code_id}/cancel")
def cancel_code(
    code_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Kill a code that is already out in the world.

    is_active goes false AND the expiry is pulled back to now: the claim
    endpoint checks both, and a reader of the row later can see it was
    stopped rather than having simply run its course.

    Anyone who already signed up with it keeps their referral — that
    bargain was struck before the code was cancelled. Cancel the referral
    itself below if that is what's wanted.
    """
    record = db.query(ReferralCode).filter(ReferralCode.id == code_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found.")

    record.is_active = False
    record.expires_at = datetime.now(timezone.utc)
    db.commit()
    return {"cancelled": True, "code": record.code}


@router.post("/{referral_id}/cancel")
def cancel_referral(
    referral_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Stop a pending referral from ever paying out.

    Only a referral still waiting on its first subscription can be
    cancelled. One already rewarded is left alone: the points are in
    somebody's balance and may already have been spent, so quietly
    reversing it here would make a balance that no longer adds up.
    """
    referral = db.query(Referral).filter(Referral.id == referral_id).first()
    if not referral:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Referral not found.")
    if referral.status != "registered":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a referral that hasn't paid out yet can be cancelled.",
        )

    referral.status = "cancelled"
    db.commit()
    return {"cancelled": True}


@router.post("/send")
def admin_send_invite(
    payload: SendRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Send an existing customer's code to someone, on their behalf.

    The invite goes out in the code owner's name, because that is whose
    code it is and whose name the recipient will recognise.
    """
    config = db.query(RewardConfig).first()
    if not config:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Reward config is not set up.")
    if not config.referral_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Refer & Earn is switched off in Admin > Reward Points.")

    now = datetime.now(timezone.utc)
    record = db.query(ReferralCode).filter(ReferralCode.code == payload.code.strip().upper()).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Code not found.")
    if not record.is_active or _aware(record.expires_at) <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="That code is cancelled or expired — it wouldn't work.")

    owner = db.query(User).filter(User.id == record.user_id).first()
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That code's owner no longer exists.")

    destination = payload.to.strip()
    if payload.channel == "email":
        if "@" not in destination or " " in destination:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="That doesn't look like an email address.")
        destination = normalize_email(destination)
    else:
        destination = normalize_phone(destination) or ""
        if not destination:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="That doesn't look like a phone number.")

    share_url = f"{settings.FRONTEND_URL.rstrip('/')}/register?ref={record.code}"
    expires_on = _aware(record.expires_at).strftime("%d %b %Y")
    points = int(config.referred_reward_points or 0)

    try:
        if payload.channel == "email":
            send_referral_invite_email(destination, owner.name, record.code,
                                       share_url, points, expires_on)
        else:
            send_referral_invite_whatsapp(destination, owner.name, record.code,
                                          share_url, points)
    except Exception as exc:  # noqa: BLE001
        db.add(ReferralInvite(
            referral_code_id=record.id, code=record.code,
            sent_by_admin_id=current_admin.id, channel=payload.channel,
            destination=destination, status="failed",
        ))
        db.commit()
        print(f"WARNING: admin referral invite to {destination} via {payload.channel} failed: {exc}")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Couldn't send it just now. Check the SMTP / Twilio settings.")

    db.add(ReferralInvite(
        referral_code_id=record.id, code=record.code,
        sent_by_admin_id=current_admin.id, channel=payload.channel,
        destination=destination, status="sent",
    ))
    db.commit()
    return {"sent": True, "channel": payload.channel, "to": destination, "on_behalf_of": owner.name}
