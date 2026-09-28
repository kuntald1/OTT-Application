from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.identity_utils import email_equals, phone_equals
from app.models import AdminRole, AdminUser, User, Subscription, Payment, FamilyPin, AuthProvider, UserRole
from app.schemas import AdminUserAccountOut, AdminUserSetPasswordRequest, AdminUserToggleRequest, AdminCreateOrganiserRequest, SubscriptionOut, PaymentOut
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

    users_with_pin = {row.user_id for row in db.query(FamilyPin.user_id).all()}
    linked_user_ids = {
        row.linked_user_id for row in db.query(AdminUser.linked_user_id).filter(AdminUser.linked_user_id.isnot(None)).all()
    }

    out = []
    for u in users:
        parent = parents_by_id.get(u.parent_id) if u.parent_id else None
        out.append(AdminUserAccountOut(
            id=u.id, name=u.name, email=u.email, role=u.role.value, is_active=u.is_active,
            can_live_stream=u.can_live_stream, created_at=u.created_at,
            parent_id=u.parent_id, parent_name=parent.name if parent else None,
            parent_email=parent.email if parent else None,
            has_family_pin=u.id in users_with_pin,
            has_admin_access=u.id in linked_user_ids,
        ))
    return out


@router.post("/organiser", response_model=AdminUserAccountOut, status_code=status.HTTP_201_CREATED)
def create_organiser(
    payload: AdminCreateOrganiserRequest,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Create a Plays Organiser account directly. Superadmin only — same
    restriction as creating Admin Accounts, since this too hands out a
    new login.

    Saved in `users` (role = plays_organiser), never `admin_users`: an
    organiser's videos, revenue ledger, withdrawals, event enquiries and
    donations are all foreign keys to users.id, and a partner must not
    sit in the staff table where a permissions mistake could expose the
    admin portal. No email/phone OTP here (the admin vouches for the
    address), so a mistyped email creates an account nobody can reach —
    the admin UI says so. Date of birth/city are NOT collected: the new
    organiser is prompted for them on first login (needs_profile is true
    for any account without them), which also runs the 18+ check.

    Duplicate email/phone messages match /auth/register exactly.
    """
    if db.query(User).filter(email_equals(User.email, payload.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists")
    if payload.phone and db.query(User).filter(phone_equals(User.phone, payload.phone)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this phone number already exists")
    if payload.give_admin_access and db.query(AdminUser).filter(email_equals(AdminUser.email, payload.email)).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An admin account with this email already exists")

    user = User(
        name=payload.name.strip(),
        email=payload.email,
        phone=payload.phone,
        country=payload.country,
        hashed_password=hash_password(payload.password),
        auth_provider=AuthProvider.local,
        role=UserRole.plays_organiser,
    )
    db.add(user)
    if payload.give_admin_access:
        db.flush()  # assigns user.id, saved below as the admin login's linked_user_id
        # "Give access to Admin Portal": a SECOND row, in admin_users, with the
        # same email and the same starting password hash (the two logins are
        # separate afterwards — changing one password doesn't change the
        # other). Same commit as the users row, so a failure can't leave an
        # organiser with a site login but a half-made admin one, or the
        # reverse. Its menus come from the role, never from this row
        # (allowed_menu_keys stays NULL and is ignored for this role); until a
        # menu is granted under Role permissions it can open nothing.
        db.add(AdminUser(
            name=payload.name.strip(), email=payload.email,
            hashed_password=user.hashed_password, role=AdminRole.plays_organiser,
            linked_user_id=user.id,
        ))
    db.commit()
    db.refresh(user)
    return AdminUserAccountOut(
        id=user.id, name=user.name, email=user.email, role=user.role.value, is_active=user.is_active,
        can_live_stream=user.can_live_stream, created_at=user.created_at,
        parent_id=None, parent_name=None, parent_email=None, has_family_pin=False,
        has_admin_access=payload.give_admin_access,
    )


def _get_user_or_404(user_id: str, db: Session) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.post("/{user_id}/admin-access", response_model=AdminUserAccountOut)
def give_admin_access(
    user_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """"Give admin access" on an existing Plays Organiser row — superadmin
    only. Same result as ticking "Give access to Admin Portal" when creating
    the organiser: an admin_users login (role plays_organiser) LINKED to this
    users row (linked_user_id), so the organiser can run their own videos /
    revenue / event enquiries from /admin.

    If an admin_users row with this email already exists it is linked only
    when it is an unlinked plays_organiser one (this click is the explicit
    superadmin decision — the server never links by email on its own);
    anything else is refused. Its password is left as it is.
    """
    user = _get_user_or_404(user_id, db)
    if user.role != UserRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only a Plays Organiser can be given admin portal access.")
    if db.query(AdminUser).filter(AdminUser.linked_user_id == user.id).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This organiser already has admin portal access.")

    existing = db.query(AdminUser).filter(email_equals(AdminUser.email, user.email)).first()
    if existing is not None:
        if existing.role != AdminRole.plays_organiser or existing.linked_user_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An admin account with this email already exists")
        existing.linked_user_id = user.id
    else:
        db.add(AdminUser(
            name=user.name, email=user.email, hashed_password=user.hashed_password,
            role=AdminRole.plays_organiser, is_active=user.is_active, linked_user_id=user.id,
        ))
    db.commit()
    db.refresh(user)
    return AdminUserAccountOut(
        id=user.id, name=user.name, email=user.email, role=user.role.value, is_active=user.is_active,
        can_live_stream=user.can_live_stream, created_at=user.created_at,
        parent_id=user.parent_id, parent_name=None, parent_email=None, has_family_pin=False,
        has_admin_access=True,
    )


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


@router.delete("/{user_id}/family-pin", status_code=status.HTTP_204_NO_CONTENT)
def reset_family_pin(
    user_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Clears a parent's Family PIN (someone forgot it) — superadmin only,
    like the password reset above. The parent then sets a new one from
    Manage Profile. Until they do, their sub-accounts can't switch back
    into the parent, which is the safe default.
    """
    user = _get_user_or_404(user_id, db)
    db.query(FamilyPin).filter(FamilyPin.user_id == user.id).delete()
    db.commit()


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
    if user.role == UserRole.plays_organiser:
        # An organiser who was given admin-portal access has a SECOND login
        # (admin_users, same email). Deactivating only the site account would
        # leave that one working, so the two switch together.
        for admin_row in db.query(AdminUser).filter(
            AdminUser.role == AdminRole.plays_organiser,
            or_(AdminUser.linked_user_id == user.id, email_equals(AdminUser.email, user.email)),
        ).all():
            admin_row.is_active = payload.enabled
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
