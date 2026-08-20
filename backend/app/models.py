import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Enum, Boolean, ForeignKey, Integer, Numeric, Text, UniqueConstraint
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



class PaymentStatus(str, enum.Enum):
    created = "created"
    paid = "paid"
    failed = "failed"


class PaymentGateway(str, enum.Enum):
    razorpay = "razorpay"
    stripe = "stripe"


class Payment(Base):
    """One row per checkout attempt. Created in "created" status when the
    checkout starts, updated to "paid" or "failed" once the gateway
    confirms the outcome. Phase 2 (Razorpay/Stripe integration) will add
    the endpoints that actually write to this table — for now it exists so
    the Subscription details page has a real (empty) source to read from.
    """
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id"), nullable=True)

    gateway = Column(Enum(PaymentGateway), nullable=False)
    gateway_order_id = Column(String(255), nullable=True)
    gateway_payment_id = Column(String(255), nullable=True)

    plan_name = Column(String(50), nullable=False)
    duration_label = Column(String(50), nullable=False, default="1 Month")
    screens = Column(Integer, nullable=False, default=1)
    base_amount = Column(Numeric(10, 2), nullable=False)
    tax_amount = Column(Numeric(10, 2), nullable=False, default=0)
    total_amount = Column(Numeric(10, 2), nullable=False)
    reward_points_used = Column(Integer, nullable=False, default=0)
    currency = Column(String(3), nullable=False, default="INR")

    status = Column(Enum(PaymentStatus), nullable=False, default=PaymentStatus.created)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class TaxConfig(Base):
    """Single-row table holding the current GST rate. Admin-editable
    (update the one row) — the checkout flow always reads the latest value,
    so changing it here takes effect on the next checkout with no
    redeploy needed.
    """
    __tablename__ = "tax_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gst_percent = Column(Numeric(5, 2), nullable=False, default=18)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Blog(Base):
    """Blog posts — published by an admin (once the admin panel exists),
    read by everyone. is_published lets a post be prepared as a draft
    before going live.
    """
    __tablename__ = "blogs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    excerpt = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    author_name = Column(String(100), nullable=False, default="theomy Team")

    is_published = Column(Boolean, nullable=False, default=True)
    published_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class CommunityRoom(Base):
    __tablename__ = "community_rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class RoomPost(Base):
    __tablename__ = "room_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("community_rooms.id"), nullable=False, index=True)
    author_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    # Relative URL, e.g. "/api/uploads/room_posts/<uuid>.jpg" — null if no
    # image attached. Video attachments aren't supported yet.
    image_url = Column(String(500), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PostReply(Base):
    __tablename__ = "post_replies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("room_posts.id"), nullable=False, index=True)
    author_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PostLike(Base):
    """One row per (post, user) — existence of a row means that user likes
    that post. Toggling a like creates/deletes the row, which is how we
    get an accurate per-user like state instead of the old local-only
    _liked flag that any browser tab could fake.
    """
    __tablename__ = "post_likes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_user_like"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("room_posts.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Donation(Base):
    """One-time donations to a Plays Organiser. Uses the same
    created/paid/failed status flow and gateway as Payment, but is kept as
    a separate table since a donation isn't tied to a subscription plan.
    """
    __tablename__ = "donations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    donor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    organiser_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="INR")

    gateway = Column(Enum(PaymentGateway), nullable=False)
    gateway_order_id = Column(String(255), nullable=True)
    gateway_payment_id = Column(String(255), nullable=True)

    status = Column(Enum(PaymentStatus), nullable=False, default=PaymentStatus.created)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class RevenueRateConfig(Base):
    """Single-row table holding the current creator revenue-share rate.
    Stored in PAISA per minute (integer) — never as a rupee decimal — so
    there's no floating-point ambiguity about the unit. 7 paisa/min is
    stored as 7; ₹1/min is stored as 100. Always divide by 100 to get
    rupees when displaying.
    """
    __tablename__ = "revenue_rate_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rate_paisa_per_minute = Column(Integer, nullable=False, default=7)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class WithdrawalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    paid = "paid"


class CreatorEarnings(Base):
    """One row per Content Creator / Plays Organiser — their running
    balance. All amounts in PAISA (integer), same precision reasoning as
    RevenueRateConfig. total_earned_paisa only ever grows (or is set by
    whoever's tracking real earnings once that exists); available_balance
    _paisa is what's left after withdrawal requests reserve/deduct funds.

    There is no automated process writing to this table yet — theomy has
    no real watch-time tracking. Rows here are seeded manually (SQL) for
    testing, or later by the admin panel / a real earnings pipeline.
    """
    __tablename__ = "creator_earnings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    total_earned_paisa = Column(Integer, nullable=False, default=0)
    available_balance_paisa = Column(Integer, nullable=False, default=0)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class WithdrawalRequest(Base):
    """A creator's request to cash out part of their available balance.
    Starts "pending" and stays that way until an admin acts on it — no
    admin panel exists yet, so for now that means updating this row's
    status directly in the database. When approved/rejected, funds should
    be adjusted in CreatorEarnings accordingly by whoever processes it
    (the future admin panel will do this as part of its workflow).
    """
    __tablename__ = "withdrawal_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creator_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    amount_paisa = Column(Integer, nullable=False)
    status = Column(Enum(WithdrawalStatus), nullable=False, default=WithdrawalStatus.pending)
    admin_note = Column(String(500), nullable=True)
    requested_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    processed_at = Column(DateTime(timezone=True), nullable=True)
