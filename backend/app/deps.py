from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, AdminUser, AdminRole
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )
    user_id = payload.get("sub")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )

    # NOTE: single-session enforcement (one active device per account)
    # was REMOVED here deliberately. The product rule is now the
    # Netflix/Hotstar one: an account may be signed in on as many
    # devices as it likes, and only CONCURRENT PLAYBACK is capped — by
    # the subscription's "screens" count, shared across the billing
    # owner and every sub-account under them (see
    # routers/playback_sessions.py's _get_max_screens). Login count is
    # no longer restricted at all.
    #
    # User.active_session_token is still written on login (see
    # routers/auth.py) but is no longer checked — kept so the column
    # and any old issued tokens stay harmless rather than needing a
    # coordinated migration + forced logout of everyone.
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Same as get_current_user but returns None instead of raising when
    there's no token — for endpoints that are viewable while logged out
    but personalize their response (e.g. "did I like this post") when a
    valid token is present.
    """
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        return None
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None
    # No single-session check here either — see get_current_user above.
    return user


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AdminUser:
    """Deliberately queries admin_users, never users. A token issued for a
    regular customer account can never satisfy this dependency, even if
    somehow presented here — its subject id simply won't exist in this
    table. Same isolation in the other direction for get_current_user.
    Admin tokens never carry a "sid" claim, so single-session enforcement
    (see User.active_session_token) doesn't apply here at all.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )
    admin_id = payload.get("sub")

    admin = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
    if admin is None or not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin account not found"
        )
    return admin


def get_current_superadmin(
    admin: AdminUser = Depends(get_current_admin),
) -> AdminUser:
    if admin.role != AdminRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires superadmin access.",
        )
    return admin
