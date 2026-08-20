import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Enum, Boolean, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

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

    # Relative URL to the uploaded profile photo, e.g. "/api/uploads/profile_photos/<uuid>.jpg"
    # Null until the user uploads one.
    profile_photo_url = Column(String(500), nullable=True)

    auth_provider = Column(
        Enum(AuthProvider), nullable=False, default=AuthProvider.local
    )
    # The unique id Google/Facebook assigns this user (null for local accounts)
    provider_id = Column(String(255), nullable=True)

    role = Column(Enum(UserRole), nullable=False, default=UserRole.user)

    is_active = Column(Boolean, default=True, nullable=False)

    # Password-reset flow: a random token is stored here (hashed values are
    # overkill for a short-lived, single-use link, but we still invalidate
    # it immediately after use and it expires on its own regardless).
    reset_token = Column(String(255), nullable=True, index=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class TicketStatus(str, enum.Enum):
    open = "Open"
    in_progress = "In Progress"
    resolved = "Resolved"
    closed = "Closed"


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Human-friendly ticket number shown to the user, e.g. "TCK-482913" —
    # separate from the internal UUID primary key.
    ticket_number = Column(String(20), unique=True, nullable=False, index=True)

    subject = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(TicketStatus), nullable=False, default=TicketStatus.open)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    plan_name = Column(String(50), nullable=False)  # "Play" | "Archive" | "Both"
    duration_label = Column(String(50), nullable=False)  # "1 Month" | "6 Months" | "1 Year"
    screens = Column(Integer, nullable=False, default=1)
    price = Column(Numeric(10, 2), nullable=False)

    is_active = Column(Boolean, nullable=False, default=True)
    started_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at = Column(DateTime(timezone=True), nullable=False)


class Menu(Base):
    """Site navigation, admin-editable. Top-level items (Plays, Archive,
    Category, Ticketing, ...) have parent_menu_id = NULL. Sub-menu items
    (the Category dropdown's Bengali Theatre, Drama, ...) have
    parent_menu_id pointing at the "Category" menu's id.

    `view` and `category_param` map to the frontend's existing router
    concepts (App.jsx's route.view, and CategoryPage's initialCategory) —
    the frontend builds its own tree from this flat list using
    parent_menu_id, it does not come pre-nested from the API.
    """
    __tablename__ = "menus"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label = Column(String(100), nullable=False)

    # Matches a route.view value in App.jsx (e.g. "hero", "accordion",
    # "mylist", "community", "theater", "category"). Null for a menu item
    # that's purely a dropdown trigger with no direct destination of its
    # own (e.g. "Category").
    view = Column(String(50), nullable=True)

    # Only set on sub-menu items whose view is "category" — the specific
    # category name to filter by (e.g. "Bengali Theatre").
    category_param = Column(String(100), nullable=True)

    parent_menu_id = Column(UUID(as_uuid=True), ForeignKey("menus.id"), nullable=True, index=True)

    requires_auth = Column(Boolean, nullable=False, default=False)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class SubscriptionPlan(Base):
    """Master catalog of subscription plans (Play / Archive / Both today),
    admin-editable. This is the plan DEFINITION — separate from the
    `Subscription` table above, which records what a specific user actually
    activated.
    """
    __tablename__ = "subscription_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), nullable=False, unique=True)  # "Play" | "Archive" | "Both"
    tagline = Column(String(255), nullable=True)

    base_price = Column(Numeric(10, 2), nullable=False)
    per_extra_screen = Column(Numeric(10, 2), nullable=False, default=0)

    # List of feature bullet strings, e.g. ["Unlimited access to all Play content", ...]
    features = Column(JSONB, nullable=False, default=list)

    highlighted = Column(Boolean, nullable=False, default=False)  # shows "Best Value" badge
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

