import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Enum, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AuthProvider(str, enum.Enum):
    local = "local"
    google = "google"
    facebook = "facebook"


class UserRole(str, enum.Enum):
    user = "User"
    content_creator = "Content Creator"
    plays_organiser = "Plays Organiser"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)

    # Optional, as requested — not mandatory at registration
    phone = Column(String(20), nullable=True)

    # Null for users who only ever sign in via Google/Facebook
    hashed_password = Column(String(255), nullable=True)

    auth_provider = Column(
        Enum(AuthProvider), nullable=False, default=AuthProvider.local
    )
    # The unique id Google/Facebook assigns this user (null for local accounts)
    provider_id = Column(String(255), nullable=True)

    role = Column(Enum(UserRole), nullable=False, default=UserRole.user)

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
