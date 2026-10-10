import hashlib
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.config import settings
from app.email_utils import send_admin_password_reset_email

from app.admin_roles import ROLE_ASSIGNABLE, ROLE_LABELS, ORGANISER_MENUS, effective_menu_keys, menus_for_role
from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.identity_utils import email_equals
from app.models import AdminUser, AdminRole, AdminRoleMenu
from app.schemas import (
    AdminLoginRequest, AdminToken, AdminOut, AdminCreateRequest, AdminMenuPermissionsUpdate,
    AdminRolePermissionsOut, AdminRolePermissionsUpdate, AdminRoleMenuOption,
    AdminSetPasswordRequest, AdminResetPasswordRequest, ForgotPasswordRequest, MessageResponse,
)
from app.security import hash_password, verify_password, create_access_token

logger = logging.getLogger("admin_auth")

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])

# Mirrors the non-superadmin-only entries in AdminLayout.jsx's sidebar
# (superadmin-exclusive items like "admins", "ads", "categories",
# "subscription-plans" are never assignable here — those stay
# superadmin-only regardless of any admin's menu permissions).
ASSIGNABLE_MENU_KEYS = {
    "dashboard", "reports", "videos", "add-video", "cast-crew", "special-categories",
    "blog", "community", "donation-registrations", "subscriptions", "help-center",
    "page-heroes", "theater-hero-slides", "archive-hero-slides", "content-policy",
    "ad-banners", "discovery-settings", "enquiries", "revenue", "live", "users",
}


def _admin_out(admin: AdminUser, db: Session) -> AdminOut:
    """AdminOut for the admin shell. For a role-based account
    (plays_organiser) the menu list is the ROLE's, never the account's own
    column; superadmin/admin are returned exactly as stored."""
    out = AdminOut.model_validate(admin)
    update = {"has_site_account": admin.linked_user_id is not None}
    keys = effective_menu_keys(admin, db)
    if keys is not None:
        update["allowed_menu_keys"] = keys
    return out.model_copy(update=update)


@router.post("/login", response_model=AdminToken)
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)):
    # Case-insensitive: an organiser who was given admin access types the
    # same email they use on the main site, in whatever capitalisation.
    admin = db.query(AdminUser).filter(email_equals(AdminUser.email, payload.email)).first()

    # Same error for "no such admin" and "wrong password" — don't reveal
    # which one it was.
    invalid_creds = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
    )
    if not admin or not admin.is_active:
        raise invalid_creds
    if not verify_password(payload.password, admin.hashed_password):
        raise invalid_creds

    token = create_access_token(subject=str(admin.id))
    return AdminToken(access_token=token, admin=_admin_out(admin, db))


# ------------------------------------------------ forgot / reset password
# Stateless, signed reset token (no extra DB column). It is signed with a key
# DERIVED from the JWT secret, so it can never be accepted as an admin login
# token (those use the plain secret). "fp" is a fingerprint of the current
# password hash, so the link stops working the moment the password changes —
# i.e. it is single-use.
def _reset_key() -> str:
    return settings.JWT_SECRET_KEY + ":admin-password-reset"


def _pw_fingerprint(hashed_password: str) -> str:
    return hashlib.sha256(hashed_password.encode()).hexdigest()[:24]


def _make_reset_token(admin: AdminUser) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(admin.id), "fp": _pw_fingerprint(admin.hashed_password), "exp": exp, "purpose": "admin_reset"},
        _reset_key(), algorithm=settings.JWT_ALGORITHM,
    )


@router.post("/forgot-password", response_model=MessageResponse)
def admin_forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Same generic answer whether or not the account exists.
    generic = MessageResponse(message="If an account exists for that email, a reset link has been sent.")
    admin = db.query(AdminUser).filter(email_equals(AdminUser.email, payload.email)).first()
    if not admin or not admin.is_active:
        logger.warning("admin forgot-password: no active admin_users row for %r - no email sent", payload.email)
        return generic
    reset_link = f"{settings.FRONTEND_URL}/admin/reset-password?token={_make_reset_token(admin)}"
    try:
        send_admin_password_reset_email(admin.email, reset_link)
        logger.info("admin forgot-password: reset email sent to %s", admin.email)
    except Exception:
        # Client still gets the generic answer, but the real reason (SMTP
        # login/auth failure etc.) is now visible in `docker logs`.
        logger.exception("admin forgot-password: SMTP send FAILED for %s", admin.email)
    return generic


@router.post("/reset-password", response_model=MessageResponse)
def admin_reset_password(payload: AdminResetPasswordRequest, db: Session = Depends(get_db)):
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This reset link is invalid or has expired.")
    try:
        data = jwt.decode(payload.token, _reset_key(), algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise invalid
    if data.get("purpose") != "admin_reset":
        raise invalid
    admin = db.query(AdminUser).filter(AdminUser.id == data.get("sub")).first()
    if not admin or not admin.is_active or data.get("fp") != _pw_fingerprint(admin.hashed_password):
        raise invalid
    admin.hashed_password = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password reset successfully. You can now log in.")


@router.get("/me", response_model=AdminOut)
def read_current_admin(current_admin: AdminUser = Depends(get_current_admin), db: Session = Depends(get_db)):
    return _admin_out(current_admin, db)


@router.get("/admins", response_model=list[AdminOut])
def list_admins(
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    return [_admin_out(a, db) for a in db.query(AdminUser).order_by(AdminUser.created_at.desc()).all()]


@router.post("/admins", response_model=AdminOut, status_code=status.HTTP_201_CREATED)
def create_admin(
    payload: AdminCreateRequest,
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    existing = db.query(AdminUser).filter(email_equals(AdminUser.email, payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An admin account with this email already exists",
        )

    # role "plays_organiser" is created HERE as an admin_users row ONLY —
    # deliberately no `users` row (Admin decision, Sept 2026). Such an account
    # is an Admin Portal login, nothing more: it owns no videos/revenue and
    # doesn't appear on the site as an organiser. To create a full organiser
    # (site account + optional admin login) use User Management > Create
    # organiser. Its menus come from the role (admin_roles.py), and its API
    # access is deny-by-default (deps.get_current_admin).
    admin = AdminUser(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=AdminRole(payload.role),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return _admin_out(admin, db)


@router.put("/admins/{admin_id}/menu-permissions", response_model=AdminOut)
def update_admin_menu_permissions(
    admin_id: str,
    payload: AdminMenuPermissionsUpdate,
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Admin Accounts > Manage Permissions — restricts which sidebar
    menus an admin (role=admin) account can see. Superadmin accounts
    can't be restricted this way (they always see everything) — this
    only ever applies to role=admin.
    """
    admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin account not found.")
    if admin.role == AdminRole.superadmin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Superadmin accounts always have full access and can't be restricted.")
    if admin.role == AdminRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This account's menus come from its role — edit them under Role permissions.")

    if payload.allowed_menu_keys is not None:
        invalid = set(payload.allowed_menu_keys) - ASSIGNABLE_MENU_KEYS
        if invalid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown menu key(s): {sorted(invalid)}")

    admin.allowed_menu_keys = payload.allowed_menu_keys
    db.commit()
    db.refresh(admin)
    return admin


@router.put("/admins/{admin_id}/password", response_model=MessageResponse)
def set_admin_password(
    admin_id: str,
    payload: AdminSetPasswordRequest,
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Admin Accounts > Change password — superadmin sets a new password for
    an Admin or Plays Organiser account (admin_users.hashed_password).
    Superadmin accounts are excluded (incl. your own)."""
    admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin account not found.")
    if admin.role not in (AdminRole.admin, AdminRole.plays_organiser):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only Admin and Plays Organiser passwords can be changed here.")
    admin.hashed_password = hash_password(payload.new_password)
    db.commit()
    return MessageResponse(message="Password updated.")


@router.delete("/admins/{admin_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_admin(
    admin_id: str,
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    if str(current_superadmin.id) == admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )
    admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    admin.is_active = False
    db.commit()


# ------------------------------------------------ role-based menu permissions
def _role_or_404(role: str) -> str:
    if role not in ROLE_ASSIGNABLE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown role.")
    return role


def _role_permissions_out(role: str, db: Session) -> AdminRolePermissionsOut:
    return AdminRolePermissionsOut(
        role=role,
        role_label=ROLE_LABELS.get(role, role),
        menu_keys=menus_for_role(db, role),
        available=[AdminRoleMenuOption(key=k, label=ORGANISER_MENUS[k]) for k in sorted(ROLE_ASSIGNABLE[role])],
    )


@router.get("/role-permissions/{role}", response_model=AdminRolePermissionsOut)
def get_role_permissions(
    role: str,
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Admin Accounts > Role permissions — which menus every account of this
    role sees. Superadmin only."""
    return _role_permissions_out(_role_or_404(role), db)


@router.put("/role-permissions/{role}", response_model=AdminRolePermissionsOut)
def update_role_permissions(
    role: str,
    payload: AdminRolePermissionsUpdate,
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Replaces the role's whole menu set. Only keys registered for THIS role
    (admin_roles.ROLE_ASSIGNABLE) are accepted — the powerful staff menus
    (users, revenue sharing, subscriptions...) can never be granted to an
    organiser this way, whatever is sent. Delete + insert in one commit, so
    a failure can't leave the role half-updated.
    """
    role = _role_or_404(role)
    requested = set(payload.menu_keys)
    invalid = requested - ROLE_ASSIGNABLE[role]
    if invalid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown menu key(s) for this role: {sorted(invalid)}")

    db.query(AdminRoleMenu).filter(AdminRoleMenu.role == role).delete(synchronize_session=False)
    for key in sorted(requested):
        db.add(AdminRoleMenu(role=role, menu_key=key))
    db.commit()
    return _role_permissions_out(role, db)
