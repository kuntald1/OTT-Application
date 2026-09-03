import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User, AuthProvider
from app.security import create_access_token

router = APIRouter(prefix="/auth", tags=["oauth"])


def _find_or_create_social_user(
    db: Session, provider: AuthProvider, provider_id: str, email: str, name: str
) -> User:
    # Match on provider_id first (same social account logging in again),
    # then fall back to email (e.g. they registered locally, now also
    # using Google with the same address) so we don't create duplicates.
    user = (
        db.query(User)
        .filter(User.auth_provider == provider, User.provider_id == provider_id)
        .first()
    )
    if user:
        return user

    user = db.query(User).filter(User.email == email).first()
    if user:
        return user

    user = User(
        name=name,
        email=email,
        hashed_password=None,
        auth_provider=provider,
        provider_id=provider_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _issue_token_and_redirect(user: User, db: Session) -> RedirectResponse:
    """Same single-session pinning as regular login (see
    User.active_session_token / auth.py's _new_login_token) — a Google/
    Facebook login also signs out any other active session on this account.
    """
    session_token = secrets.token_urlsafe(32)
    user.active_session_token = session_token
    db.commit()
    token = create_access_token(subject=str(user.id), session_token=session_token)
    # Frontend reads ?token=... on this page and stores it (e.g. in memory
    # or secure storage), then clears it from the URL.
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?token={token}")


def _issue_token_and_redirect_mobile(user: User, db: Session) -> RedirectResponse:
    """Mobile counterpart to _issue_token_and_redirect above — same
    single-session pinning, but redirects to the theomy React Native
    app's custom URL scheme instead of the web frontend. name/email are
    urlencoded (via urlencode, which also covers token/user_id/role —
    none of those need it, but doing all five through one urlencode
    call is simpler than hand-picking which fields to quote).
    """
    session_token = secrets.token_urlsafe(32)
    user.active_session_token = session_token
    db.commit()
    token = create_access_token(subject=str(user.id), session_token=session_token)
    params = urlencode({
        "token": token,
        "user_id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
    })
    return RedirectResponse(url=f"theomy://auth-callback?{params}")


# ---------------------------------------------------------------- Google ---

@router.get("/google/login")
def google_login():
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/google/callback"
    params = (
        "response_type=code"
        f"&client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        "&scope=openid%20email%20profile"
        "&access_type=online"
        "&prompt=select_account"
    )
    return RedirectResponse(
        url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}"
    )


def _exchange_google_code_for_user(code: str, redirect_uri: str, db: Session) -> User:
    """Shared by both the web and mobile Google callbacks below — same
    reasoning as _exchange_facebook_code_for_user above: redirect_uri
    must be the EXACT one Google used to reach whichever callback
    called this, so the mobile app's own Google login flow must open
    the consent screen with redirect_uri set to
    .../auth/google/callback/mobile, not the web one.
    """
    with httpx.Client() as client:
        token_resp = client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange Google authorization code",
            )
        access_token = token_resp.json()["access_token"]

        userinfo_resp = client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        info = userinfo_resp.json()

    return _find_or_create_social_user(
        db,
        provider=AuthProvider.google,
        provider_id=info["sub"],
        email=info["email"],
        name=info.get("name", info["email"]),
    )


@router.get("/google/callback")
def google_callback(code: str, db: Session = Depends(get_db)):
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/google/callback"
    user = _exchange_google_code_for_user(code, redirect_uri, db)
    return _issue_token_and_redirect(user, db)


@router.get("/google/callback/mobile")
def google_callback_mobile(code: str, db: Session = Depends(get_db)):
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/google/callback/mobile"
    user = _exchange_google_code_for_user(code, redirect_uri, db)
    return _issue_token_and_redirect_mobile(user, db)


# -------------------------------------------------------------- Facebook ---

@router.get("/facebook/login")
def facebook_login():
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/facebook/callback"
    params = (
        f"client_id={settings.FACEBOOK_APP_ID}"
        f"&redirect_uri={redirect_uri}"
        "&scope=email,public_profile"
    )
    return RedirectResponse(
        url=f"https://www.facebook.com/v19.0/dialog/oauth?{params}"
    )


def _exchange_facebook_code_for_user(code: str, redirect_uri: str, db: Session) -> User:
    """Shared by both the web and mobile Facebook callbacks below — code
    exchange, profile fetch, and find-or-create, stopping right before
    token issuance (that part differs: web redirects to FRONTEND_URL,
    mobile redirects to the theomy:// custom scheme). redirect_uri must
    be the EXACT one Facebook used to reach whichever callback called
    this — OAuth requires the token-exchange redirect_uri to match the
    one from the original authorize request, so the mobile app's own
    Facebook login flow must open the dialog with redirect_uri set to
    .../auth/facebook/callback/mobile, not the web one.
    """
    with httpx.Client() as client:
        token_resp = client.get(
            "https://graph.facebook.com/v19.0/oauth/access_token",
            params={
                "client_id": settings.FACEBOOK_APP_ID,
                "client_secret": settings.FACEBOOK_APP_SECRET,
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange Facebook authorization code",
            )
        access_token = token_resp.json()["access_token"]

        userinfo_resp = client.get(
            "https://graph.facebook.com/me",
            params={"fields": "id,name,email", "access_token": access_token},
        )
        info = userinfo_resp.json()

    if "email" not in info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Facebook account has no email available",
        )

    return _find_or_create_social_user(
        db,
        provider=AuthProvider.facebook,
        provider_id=info["id"],
        email=info["email"],
        name=info.get("name", info["email"]),
    )


@router.get("/facebook/callback")
def facebook_callback(code: str, db: Session = Depends(get_db)):
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/facebook/callback"
    user = _exchange_facebook_code_for_user(code, redirect_uri, db)
    return _issue_token_and_redirect(user, db)


@router.get("/facebook/callback/mobile")
def facebook_callback_mobile(code: str, db: Session = Depends(get_db)):
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/facebook/callback/mobile"
    user = _exchange_facebook_code_for_user(code, redirect_uri, db)
    return _issue_token_and_redirect_mobile(user, db)
