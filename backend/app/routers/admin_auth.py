from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, AdminRole
from app.schemas import AdminLoginRequest, AdminToken, AdminOut, AdminCreateRequest, AdminMenuPermissionsUpdate
from app.security import hash_password, verify_password, create_access_token

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


@router.post("/login", response_model=AdminToken)
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)):
    admin = db.query(AdminUser).filter(AdminUser.email == payload.email).first()

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
    return AdminToken(access_token=token, admin=AdminOut.model_validate(admin))


@router.get("/me", response_model=AdminOut)
def read_current_admin(current_admin: AdminUser = Depends(get_current_admin)):
    return current_admin


@router.get("/admins", response_model=list[AdminOut])
def list_admins(
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    return db.query(AdminUser).order_by(AdminUser.created_at.desc()).all()


@router.post("/admins", response_model=AdminOut, status_code=status.HTTP_201_CREATED)
def create_admin(
    payload: AdminCreateRequest,
    current_superadmin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    existing = db.query(AdminUser).filter(AdminUser.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An admin account with this email already exists",
        )

    admin = AdminUser(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=AdminRole(payload.role),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


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

    if payload.allowed_menu_keys is not None:
        invalid = set(payload.allowed_menu_keys) - ASSIGNABLE_MENU_KEYS
        if invalid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown menu key(s): {sorted(invalid)}")

    admin.allowed_menu_keys = payload.allowed_menu_keys
    db.commit()
    db.refresh(admin)
    return admin


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
