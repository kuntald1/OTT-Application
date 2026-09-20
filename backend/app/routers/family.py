"""Family account switching — the backend of the "Who's watching?" screen.

Rules:
  * A PARENT can enter any of its own ACTIVE sub-accounts, no PIN needed.
  * A SUB-ACCOUNT can get back into its PARENT only with the parent's
    4-digit Family PIN (see models.FamilyPin).
  * Nobody can switch to a sibling or to an unrelated account.
  * A switch is a real login of the target account: it returns exactly the
    same kind of token `POST /auth/login` does (auth._new_login_token), so
    everything downstream — per-account watch history, revenue, My List,
    the shared subscription/screens pool — works unchanged.

A 4-digit PIN has only 10,000 possibilities, so what actually protects it is
the lockout: MAX_WRONG_PINS wrong tries in a row lock every PIN check on
that family for LOCK_MINUTES. Wrong tries are counted per FAMILY (on the
parent's row), no matter which sub-account or device is guessing.
"""
import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, FamilyPin
from app.routers.auth import _new_login_token
from app.schemas import (
    FamilyAccountOut, FamilyAccountsOut, FamilySwitchRequest, FamilyPinSetRequest,
    FamilyPinStatusOut, Token, UserOut,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/family", tags=["family"])

MAX_WRONG_PINS = 5
LOCK_MINUTES = 15


def _aware(dt: datetime | None) -> datetime | None:
    # Postgres hands back timezone-aware values; be tolerant of naive ones.
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _mask_email(email: str) -> str:
    """kuntald1@gmail.com -> k***1@gmail.com (the picker never shows a full
    address of another account)."""
    local, _, domain = email.partition("@")
    masked = local[:1] + "***" if len(local) <= 2 else local[0] + "***" + local[-1]
    return f"{masked}@{domain}"


def _is_weak_pin(pin: str) -> bool:
    """Repeated digits (0000, 7777) and straight runs (1234, 4321) — the first
    things anyone tries, and there are only MAX_WRONG_PINS tries."""
    if len(set(pin)) == 1:
        return True
    digits = [int(c) for c in pin]
    steps = {b - a for a, b in zip(digits, digits[1:])}
    return steps == {1} or steps == {-1}


def _tile(user: User, current: User, requires_pin: bool) -> FamilyAccountOut:
    return FamilyAccountOut(
        id=user.id,
        name=user.name,
        photo_url=user.profile_photo_url,
        masked_email=_mask_email(user.email),
        is_parent=user.parent_id is None,
        is_current=user.id == current.id,
        requires_pin=requires_pin,
    )


def _lock_error(locked_until: datetime, now: datetime) -> HTTPException:
    seconds = max(1, math.ceil((locked_until - now).total_seconds()))
    minutes = math.ceil(seconds / 60)
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many wrong PINs. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        headers={"Retry-After": str(seconds)},
    )


def _pin_row_for_update(owner_id, db: Session) -> FamilyPin | None:
    # FOR UPDATE serialises simultaneous guesses on the same family, so
    # parallel requests can't sneak extra attempts past the counter.
    return db.query(FamilyPin).filter(FamilyPin.user_id == owner_id).with_for_update().first()


def _verify_pin_or_raise(row: FamilyPin, pin: str, db: Session) -> None:
    """Checks `pin` against the family's PIN, enforcing the lockout. Returns
    on success (counters reset); raises otherwise. Counter changes are
    committed BEFORE raising, otherwise the failed attempt would be rolled
    back along with the request and could be retried forever."""
    now = datetime.now(timezone.utc)
    locked_until = _aware(row.locked_until)
    if locked_until and locked_until > now:
        raise _lock_error(locked_until, now)

    if verify_password(pin, row.pin_hash):
        row.failed_attempts = 0
        row.locked_until = None
        db.commit()
        return

    row.failed_attempts = (row.failed_attempts or 0) + 1
    if row.failed_attempts >= MAX_WRONG_PINS:
        row.failed_attempts = 0
        row.locked_until = now + timedelta(minutes=LOCK_MINUTES)
        db.commit()
        raise _lock_error(_aware(row.locked_until), now)
    left = MAX_WRONG_PINS - row.failed_attempts
    db.commit()
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Incorrect PIN. {left} attempt{'s' if left != 1 else ''} left.",
    )


@router.get("/accounts", response_model=FamilyAccountsOut)
def list_family_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every account this person can pick from — themselves first. A parent
    sees its active sub-accounts; a sub-account sees only its parent (never
    its siblings). A single-entry list means "no family": the client skips
    the "Who's watching?" screen for those accounts.
    """
    accounts = [_tile(current_user, current_user, requires_pin=False)]

    if current_user.parent_id:
        owner_id = current_user.parent_id
        parent = db.query(User).filter(User.id == owner_id, User.is_active == True).first()  # noqa: E712
        if parent:
            accounts.append(_tile(parent, current_user, requires_pin=True))
    else:
        owner_id = current_user.id
        children = (
            db.query(User)
            .filter(User.parent_id == current_user.id, User.is_active == True)  # noqa: E712
            .order_by(User.created_at.asc())
            .all()
        )
        accounts.extend(_tile(c, current_user, requires_pin=False) for c in children)

    pin_set = db.query(FamilyPin.user_id).filter(FamilyPin.user_id == owner_id).first() is not None
    return FamilyAccountsOut(accounts=accounts, pin_set=pin_set)


@router.post("/switch", response_model=Token)
def switch_account(
    payload: FamilySwitchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.target_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You're already on this account.")

    target = db.query(User).filter(User.id == payload.target_id).first()
    live = target is not None and target.is_active
    is_my_child = live and target.parent_id == current_user.id
    is_my_parent = live and current_user.parent_id == target.id

    # One identical answer for "no such account", "deactivated" and "not in
    # your family" — this endpoint must not reveal which accounts exist.
    if not (is_my_child or is_my_parent):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

    if is_my_parent:
        # The only route from a sub-account into a parent: the Family PIN.
        if payload.pin is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter the Family PIN to switch to this account.")
        row = _pin_row_for_update(target.id, db)
        if row is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The main account hasn't set a Family PIN yet.")
        _verify_pin_or_raise(row, payload.pin, db)

    token = _new_login_token(target, db)
    return Token(access_token=token, user=UserOut.model_validate(target))


@router.put("/pin", response_model=FamilyPinStatusOut)
def set_family_pin(
    payload: FamilyPinSetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sets the Family PIN (first time) or changes it (needs the current
    one, with the same lockout as a switch). Main accounts only — a
    sub-account can never set or change the PIN that guards its parent.
    """
    if current_user.parent_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the main account can set the Family PIN.")

    if _is_weak_pin(payload.new_pin):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a PIN that's harder to guess — not repeated digits (1111) or a straight run (1234).",
        )

    row = _pin_row_for_update(current_user.id, db)
    if row is None:
        db.add(FamilyPin(user_id=current_user.id, pin_hash=hash_password(payload.new_pin), failed_attempts=0))
        db.commit()
        return FamilyPinStatusOut(pin_set=True)

    if payload.current_pin is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter your current PIN to change it.")
    _verify_pin_or_raise(row, payload.current_pin, db)

    row.pin_hash = hash_password(payload.new_pin)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return FamilyPinStatusOut(pin_set=True)
