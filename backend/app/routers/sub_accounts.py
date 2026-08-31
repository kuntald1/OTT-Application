from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserRole, AuthProvider, Subscription
from app.schemas import SubAccountCreate, SubAccountOut, MySubAccountsOut, MyParentOut
from app.security import hash_password

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
    return MySubAccountsOut(max_allowed=max_allowed, sub_accounts=sub_accounts)


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

    existing = db.query(User).filter(User.email == payload.email).first()
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
    return sub_account


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
    return sub_account
