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


def _issue_token_and_redirect(user: User) -> RedirectResponse:
    token = create_access_token(subject=str(user.id))
    # Frontend reads ?token=... on this page and stores it (e.g. in memory
    # or secure storage), then clears it from the URL.
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/auth/callback?token={token}")


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


@router.get("/google/callback")
def google_callback(code: str, db: Session = Depends(get_db)):
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/google/callback"

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

    user = _find_or_create_social_user(
        db,
        provider=AuthProvider.google,
        provider_id=info["sub"],
        email=info["email"],
        name=info.get("name", info["email"]),
    )
    return _issue_token_and_redirect(user)


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


@router.get("/facebook/callback")
def facebook_callback(code: str, db: Session = Depends(get_db)):
    redirect_uri = f"{settings.BACKEND_BASE_URL}/auth/facebook/callback"

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

    user = _find_or_create_social_user(
        db,
        provider=AuthProvider.facebook,
        provider_id=info["id"],
        email=info["email"],
        name=info.get("name", info["email"]),
    )
    return _issue_token_and_redirect(user)
