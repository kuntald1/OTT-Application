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

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AdminUser, Referral, ReferralCode, RewardTransaction, User,
)

router = APIRouter(prefix="/admin/referrals", tags=["admin-referrals"])

# Ledger sources that mean "they bought something", as opposed to
# "somebody they referred bought something".
_PURCHASE_SOURCES = ("subscription", "autopay", "video", "live_stream", "ticket")
_REFERRAL_SOURCES = ("referral_referrer", "referral_referred")


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
    referral_points: int
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
    if status_filter in ("registered", "rewarded"):
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
        bucket = per_user.setdefault(user_id, {"referral": 0, "purchase": 0, "spent": 0})
        points = int(total_points or 0)
        if source in _REFERRAL_SOURCES:
            bucket["referral"] += points
        elif source in _PURCHASE_SOURCES:
            bucket["purchase"] += points
        else:
            bucket["spent"] += points

    top_ids = sorted(
        per_user,
        key=lambda uid: per_user[uid]["referral"] + per_user[uid]["purchase"],
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
            referral_points=b["referral"], purchase_points=b["purchase"],
            spent_points=abs(b["spent"]),
            balance=u.reward_points_balance or 0,
        ))

    return ReferralReport(
        summary=summary, referrals=referral_rows, total=total, top_earners=top_earners,
    )
