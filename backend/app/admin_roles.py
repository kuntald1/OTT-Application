"""Role-based /admin permissions for the plays_organiser admin role.

Background (Sept 2026): a Plays Organiser can also be given a login to the
admin portal (Admin > User Management > Create organiser > "Give access to
Admin Portal"). That creates an `admin_users` row with role
plays_organiser in ADDITION to the ordinary `users` row.

Why enforcement lives here and not in the frontend: the existing per-account
"Manage Permissions" (AdminUser.allowed_menu_keys) only hides sidebar
entries — no backend route ever checks it, and ~140 admin routes accept any
admin token, including withdrawal approve/mark-paid. That is tolerable for
trusted staff, not for an outside partner: hiding a menu would not stop an
organiser calling those APIs directly. So this role is DENY-BY-DEFAULT at
the API: deps.get_current_admin refuses every request from a
plays_organiser admin unless it falls under a granted menu (below).
Existing `admin` / `superadmin` accounts are not affected in any way.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AdminRole, AdminRoleMenu, AdminUser

# The ONLY menus that can ever be granted to the plays_organiser role. The
# powerful staff menus (users, revenue sharing, subscriptions, reports...)
# are deliberately not in this list, so no permissions mistake — or a
# hand-crafted request to the role-permissions API — can hand them over.
ORGANISER_MENUS = {
    "organiser-add-video": "Organiser Add Video",
    "organiser-revenue": "Revenue",
    "organiser-event-listing": "Organiser Event Listing",
}

# Which admin API routes each menu covers, as URL-path prefixes WITHOUT the
# "/api" mount prefix. EMPTY ON PURPOSE: the three pages are still to be
# built. When one is, add its endpoints' prefix here — until then granting
# a menu changes what the sidebar can show, but the organiser-admin can
# still call nothing. Those endpoints must also scope data to the caller's
# own videos/revenue/enquiries; a prefix here only opens the door.
ORGANISER_MENU_ROUTES: dict = {key: () for key in ORGANISER_MENUS}

# Reachable by an organiser-admin whatever is granted: reading its own profile
# (the admin shell calls it to learn which menus to draw).
ALWAYS_ALLOWED_PATHS = ("/admin/auth/me",)

# role -> the menu keys that may be assigned to it.
ROLE_ASSIGNABLE = {AdminRole.plays_organiser.value: set(ORGANISER_MENUS)}
ROLE_LABELS = {AdminRole.plays_organiser.value: "Plays Organiser"}


def menus_for_role(db: Session, role: str) -> list:
    rows = db.query(AdminRoleMenu.menu_key).filter(AdminRoleMenu.role == role).all()
    # Only keys still assignable to this role count — a key removed from the
    # registry later must not linger as an active grant.
    allowed = ROLE_ASSIGNABLE.get(role, set())
    return sorted(key for (key,) in rows if key in allowed)


def effective_menu_keys(admin: AdminUser, db: Session) -> Optional[list]:
    """What the admin shell should show for this account. None means "use
    the account's own list / unrestricted" (superadmin, admin) — the
    plays_organiser role always gets a list, possibly empty."""
    if admin.role == AdminRole.plays_organiser:
        return menus_for_role(db, admin.role.value)
    return None


def _strip_api_prefix(path: str) -> str:
    return path[4:] if path.startswith("/api/") else path


def _covers(prefix: str, path: str) -> bool:
    prefix = prefix.rstrip("/")
    return path == prefix or path.startswith(prefix + "/")


def organiser_path_allowed(admin: AdminUser, path: str, db: Session) -> bool:
    path = _strip_api_prefix(path)
    if any(_covers(p, path) for p in ALWAYS_ALLOWED_PATHS):
        return True
    for menu in menus_for_role(db, admin.role.value):
        if any(_covers(p, path) for p in ORGANISER_MENU_ROUTES.get(menu, ())):
            return True
    return False
