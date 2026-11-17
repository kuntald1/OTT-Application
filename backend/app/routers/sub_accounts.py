from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.identity_utils import email_equals
from app.models import User, UserRole, AuthProvider, FamilyPin, Subscription, UserDemographics
from app.notifications import (
    send_minor_flag_removed_email,
    send_minor_flag_removed_whatsapp,
)
from app.schemas import (
    SubAccountCreate, SubAccountOut, MySubAccountsOut, MyParentOut, SubAccountMinorUpdate,
)
from app.security import hash_password
# The Family PIN machinery — attempt counter, lockout, FOR UPDATE row
# lock — is reused rather than reimplemented, so there is one PIN policy
# on this site and not two that can drift apart.
from app.routers.family import _pin_row_for_update, _verify_pin_or_raise

router = APIRouter(prefix="/sub-accounts", tags=["sub-accounts"])


def _my_max_screens(user: User, db: Session) -> int:
    """The highest screens count across this user's own active,
    unexpired subscriptions — 0 if they have none. Sub-accounts never
    reach this (routers/videos.py's _billing_owner means a sub-account
    has no subscriptions of its own to find here anyway, but the
    endpoints below also short-circuit to 0 explicitly for clarity).
    """
    best = (
        db.query(func.max(Subscription.screens))
        .filter(
            Subscription.user_id == user.id,
            Subscription.is_active == True,  # noqa: E712
            Subscription.expires_at > datetime.now(timezone.utc),
        )
        .scalar()
    )
    return best or 0


@router.get("/mine", response_model=MySubAccountsOut)
def my_sub_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Powers Manage Profile's "Family Accounts" section for the
    parent — how many additional logins their current plan allows
    (screens - 1) and the ones they've already created.
    """
    if current_user.parent_id:
        return MySubAccountsOut(max_allowed=0, sub_accounts=[])

    max_allowed = max(0, _my_max_screens(current_user, db) - 1)
    sub_accounts = (
        db.query(User)
        .filter(User.parent_id == current_user.id)
        .order_by(User.created_at.asc())
        .all()
    )
    # is_minor lives in UserDemographics, not on User — see that model's
    # docstring for why. A missing row (only possible for a sub-account
    # created before this feature shipped) defaults to "minor", the safe
    # side, until the parent explicitly says otherwise (there's no UI to
    # change it yet — flag if that's needed).
    minor_by_id = {
        row.user_id: row.is_declared_minor
        for row in db.query(UserDemographics).filter(
            UserDemographics.user_id.in_([s.id for s in sub_accounts])
        )
    }
    out = [
        SubAccountOut(
            id=s.id, name=s.name, email=s.email, is_active=s.is_active,
            created_at=s.created_at, is_minor=minor_by_id.get(s.id, True),
        )
        for s in sub_accounts
    ]
    return MySubAccountsOut(max_allowed=max_allowed, sub_accounts=out)


@router.get("/my-parent", response_model=MyParentOut)
def my_parent(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """What a sub-account's OWN Manage Profile checks to show "Managed
    by <parent>" instead of the family-accounts section.
    """
    if not current_user.parent_id:
        return MyParentOut(has_parent=False)
    parent = db.query(User).filter(User.id == current_user.parent_id).first()
    if not parent:
        return MyParentOut(has_parent=False)
    return MyParentOut(has_parent=True, parent_name=parent.name, parent_email=parent.email)


@router.post("", response_model=SubAccountOut, status_code=status.HTTP_201_CREATED)
def create_sub_account(
    payload: SubAccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.parent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A sub-account can't create further sub-accounts.")

    max_allowed = max(0, _my_max_screens(current_user, db) - 1)
    created_count = (
        db.query(User)
        .filter(User.parent_id == current_user.id, User.is_active == True)  # noqa: E712
        .count()
    )
    if created_count >= max_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You've used all the additional accounts your current plan allows.",
        )

    existing = db.query(User).filter(email_equals(User.email, payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists")

    sub_account = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        auth_provider=AuthProvider.local,
        role=UserRole.user,
        country=current_user.country,
        parent_id=current_user.id,
    )
    db.add(sub_account)
    db.commit()
    db.refresh(sub_account)

    # The parent's minor/adult declaration, recorded immediately either way
    # (see UserDemographics' docstring). A minor's date_of_birth/city stay
    # NULL forever; an adult's stay NULL until THEY complete their own
    # profile on first login (routers/users.py's complete_demographics).
    db.add(UserDemographics(user_id=sub_account.id, is_declared_minor=payload.is_minor))
    db.commit()

    return SubAccountOut(
        id=sub_account.id, name=sub_account.name, email=sub_account.email,
        is_active=sub_account.is_active, created_at=sub_account.created_at,
        is_minor=payload.is_minor,
    )


@router.patch("/{sub_account_id}/minor", response_model=SubAccountOut)
def set_sub_account_minor(
    sub_account_id: str,
    payload: SubAccountMinorUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The parent changing whether a family account is for someone under
    18. Added Nov 2026 with the age restriction — until then the
    declaration was fixed at creation, which left every sub-account made
    before UserDemographics existed stuck on the safe "minor" default
    with no way out.

    Only the parent can call this, and only for their own sub-account.

    TURNING THE FLAG OFF is the direction that matters: it opens
    age-restricted content up, so it is protected twice.

      * If the family has a Family PIN set, that PIN is required here —
        the same PIN, lockout and attempt counter that already guard
        getting back into the parent's own account from a child's (see
        routers/family.py). A child who knows the household password
        still doesn't get past it.
      * Either way the parent is told, by WhatsApp and by email. Not
        every account has a phone number (it is optional outside India),
        and an alert nobody receives is no alert, so both are sent
        rather than one or the other.

    Turning it back ON needs neither: re-declaring a profile as a child
    is the safe direction, and nothing should discourage it.
    """
    if current_user.parent_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the main account holder can change this.",
        )

    sub_account = (
        db.query(User)
        .filter(User.id == sub_account_id, User.parent_id == current_user.id)
        .first()
    )
    if not sub_account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-account not found")

    row = (
        db.query(UserDemographics)
        .filter(UserDemographics.user_id == sub_account.id)
        .first()
    )
    # No row means a sub-account created before UserDemographics existed;
    # those count as minors everywhere else (see age_gate.is_minor_viewer),
    # so they count as minors here too.
    was_minor = row.is_declared_minor if row else True
    if was_minor == payload.is_minor:
        return SubAccountOut(
            id=sub_account.id, name=sub_account.name, email=sub_account.email,
            is_active=sub_account.is_active, created_at=sub_account.created_at,
            is_minor=was_minor,
        )

    removing_minor = was_minor and not payload.is_minor
    if removing_minor:
        pin_row = _pin_row_for_update(current_user.id, db)
        if pin_row is not None:
            if not payload.pin:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Enter your Family PIN to change this.",
                )
            # Raises on a wrong PIN or while locked out, having already
            # committed the attempt counter — see family._verify_pin_or_raise.
            _verify_pin_or_raise(pin_row, payload.pin, db)

    if row is None:
        row = UserDemographics(user_id=sub_account.id, is_declared_minor=payload.is_minor)
        db.add(row)
    else:
        row.is_declared_minor = payload.is_minor
        if payload.is_minor:
            # A minor never has a date of birth or city stored (see
            # UserDemographics' docstring). If this profile had filled
            # them in while it was declared an adult, they go now rather
            # than sitting in the database unused.
            row.date_of_birth = None
            row.city = None
        row.updated_at = datetime.now(timezone.utc)
    db.commit()

    if removing_minor:
        # After the commit, and never allowed to fail the request: the
        # change has happened, and a Twilio or SMTP outage must not make
        # the parent think otherwise. Both senders swallow their own
        # errors; this guard is for anything they don't.
        try:
            send_minor_flag_removed_whatsapp(current_user.phone, current_user.name, sub_account.name)
        except Exception:
            pass
        try:
            send_minor_flag_removed_email(current_user.email, current_user.name, sub_account.name)
        except Exception:
            pass

    return SubAccountOut(
        id=sub_account.id, name=sub_account.name, email=sub_account.email,
        is_active=sub_account.is_active, created_at=sub_account.created_at,
        is_minor=payload.is_minor,
    )


@router.patch("/{sub_account_id}/deactivate", response_model=SubAccountOut)
def deactivate_sub_account(
    sub_account_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub_account = (
        db.query(User)
        .filter(User.id == sub_account_id, User.parent_id == current_user.id)
        .first()
    )
    if not sub_account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-account not found")
    sub_account.is_active = False
    db.commit()
    db.refresh(sub_account)
    # is_minor lives in UserDemographics, not on User, so returning the
    # ORM row directly would fall back to SubAccountOut's default and
    # report every deactivated child as an adult. It is a real flag now
    # that it drives the age restriction, so it is read properly here.
    row = (
        db.query(UserDemographics)
        .filter(UserDemographics.user_id == sub_account.id)
        .first()
    )
    return SubAccountOut(
        id=sub_account.id, name=sub_account.name, email=sub_account.email,
        is_active=sub_account.is_active, created_at=sub_account.created_at,
        is_minor=row.is_declared_minor if row else True,
    )
