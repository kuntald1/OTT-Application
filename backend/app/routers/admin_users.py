from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, User, Subscription, Payment
from app.schemas import AdminUserAccountOut, AdminUserSetPasswordRequest, AdminUserToggleRequest, SubscriptionOut, PaymentOut
from app.security import hash_password
from app.notifications import send_live_streaming_enabled_email, send_live_streaming_enabled_whatsapp

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("", response_model=list[AdminUserAccountOut])
def list_users(
    search: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every regular platform account (User/Content Creator/Plays
    Organiser role) — distinct from Admin Accounts, which is a
    separate table entirely. `search` matches name or email
    case-insensitively.
    """
    query = db.query(User)
    if search:
        pattern = f"%{search}%"
        query = query.filter((User.name.ilike(pattern)) | (User.email.ilike(pattern)))
    users = query.order_by(User.created_at.desc()).all()

    parent_ids = {u.parent_id for u in users if u.parent_id}
    parents_by_id = {}
    if parent_ids:
        for p in db.query(User).filter(User.id.in_(parent_ids)).all():
            parents_by_id[p.id] = p

    out = []
    for u in users:
        parent = parents_by_id.get(u.parent_id) if u.parent_id else None
        out.append(AdminUserAccountOut(
            id=u.id, name=u.name, email=u.email, role=u.role.value, is_active=u.is_active,
            can_live_stream=u.can_live_stream, created_at=u.created_at,
            parent_id=u.parent_id, parent_name=parent.name if parent else None,
            parent_email=parent.email if parent else None,
        ))
    return out


def _get_user_or_404(user_id: str, db: Session) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.put("/{user_id}/password", response_model=AdminUserAccountOut)
def set_user_password(
    user_id: str,
    payload: AdminUserSetPasswordRequest,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Direct password reset — superadmin only, same restriction as
    every account-security-affecting admin action in this codebase.
    Does not require the old password (admin support flow, not a
    self-service change), so this is deliberately narrow.
    """
    user = _get_user_or_404(user_id, db)
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}/live-streaming", response_model=AdminUserAccountOut)
def set_live_streaming_permission(
    user_id: str,
    payload: AdminUserToggleRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Toggles User.can_live_stream — the permission
    routers/live_streams.py checks before letting a Creator/Organiser
    create a broadcast.
    """
    user = _get_user_or_404(user_id, db)
    user.can_live_stream = payload.enabled
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}/active", response_model=AdminUserAccountOut)
def set_user_active(
    user_id: str,
    payload: AdminUserToggleRequest,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Deactivate/reactivate an account — superadmin only. Deactivating
    doesn't delete anything; it's enforced at login (see routers/
    auth.py's User.is_active check already used there).
    """
    user = _get_user_or_404(user_id, db)
    user.is_active = payload.enabled
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/notify-live-streaming", status_code=status.HTTP_204_NO_CONTENT)
def notify_user_about_live_streaming(
    user_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Sends the user an email + WhatsApp message telling them live
    streaming is enabled on their account and pointing them to "My
    Live Events" to create one themselves. Doesn't (and can't) send an
    actual RTMP URL/Stream Key here — those only come into existence
    once THIS user creates their own live event, so there's nothing
    stream-specific to hand over at this point, only the pointer.
    """
    user = _get_user_or_404(user_id, db)
    send_live_streaming_enabled_email(user.email, user.name)
    send_live_streaming_enabled_whatsapp(user.phone, user.name)


@router.get("/{user_id}/subscriptions", response_model=list[SubscriptionOut])
def get_user_subscriptions(
    user_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Powers Customer Management's per-customer detail view — full
    subscription history (active AND past), most recent first.
    """
    _get_user_or_404(user_id, db)
    return (
        db.query(Subscription)
        .filter(Subscription.user_id == user_id)
        .order_by(Subscription.started_at.desc())
        .all()
    )


@router.get("/{user_id}/payments", response_model=list[PaymentOut])
def get_user_payments(
    user_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Powers Customer Management's per-customer detail view — full
    payment/transaction history, most recent first.
    """
    _get_user_or_404(user_id, db)
    return (
        db.query(Payment)
        .filter(Payment.user_id == user_id)
        .order_by(Payment.created_at.desc())
        .all()
    )
