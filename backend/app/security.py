from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """One-way bcrypt hash. The plain password is discarded immediately
    after this call — it is never stored or logged anywhere."""
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, session_token: str | None = None) -> str:
    """session_token, when given, is embedded as the "sid" claim — see
    User.active_session_token's docstring for what enforces it.
    """
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_EXPIRE_MINUTES
    )
    to_encode = {"sub": subject, "exp": expire}
    if session_token:
        to_encode["sid"] = session_token
    return jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


def decode_access_token(token: str) -> dict | None:
    """Returns the full JWT payload (so callers can read "sub" and, for
    regular users, "sid") — None if the token is missing/invalid/expired.
    """
    try:
        return jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        return None
