import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

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

    # Optional (null allowed — required only for India registrations, see
    # UserRegister). Unique when set: Postgres unique constraints allow
    # any number of NULLs, they only reject duplicate non-null values, so
    # this doesn't conflict with phone being optional for other countries.
    phone = Column(String(20), unique=True, nullable=True, index=True)

    # Null for users who only ever sign in via Google/Facebook
    hashed_password = Column(String(255), nullable=True)

    # Relative URL to the uploaded profile photo, e.g. "/api/uploads/profile_photos/<uuid>.jpg"
    # Null until the user uploads one.
    profile_photo_url = Column(String(500), nullable=True)
    country = Column(String(100), nullable=False, default="India")

    # Real per-user reward balance. 1 point = ₹1. Earned automatically on
    # successful payments (see RewardConfig below for the earn rate),
    # deducted automatically when redeemed at checkout. Starts at 0 for
    # everyone — no demo starting balance anymore.
    reward_points_balance = Column(Integer, nullable=False, default=0)

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
    currency = Column(String(3), nullable=False, default="INR")

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

    # Explicit USD pricing — set directly by the admin, NOT computed from
    # base_price via an exchange rate. This lets pricing outside India be
    # deliberately chosen (e.g. rounded to a market-appropriate $ price)
    # rather than always being a mechanical INR/rate conversion.
    base_price_usd = Column(Numeric(10, 2), nullable=False, default=0)
    per_extra_screen_usd = Column(Numeric(10, 2), nullable=False, default=0)

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



class EnquiryStatus(str, enum.Enum):
    pending = "pending"
    reviewed = "reviewed"
    approved = "approved"
    rejected = "rejected"


class EventEnquiry(Base):
    """Event listing enquiry -- Content Creator / Plays Organiser only.
    Only becomes a real, publicly visible event once status='approved' --
    the Super Admin reviews these manually (no admin panel yet -- status
    changes via direct DB update for now, same pattern as
    WithdrawalRequest) and, if approved, the future public Events listing
    page filters on status='approved' to decide what's visible.

    event_category deliberately reuses the SAME category values as the
    site's existing Category menu (Bengali Theatre, Drama, Comedy,
    Musical Theatre, Classical Theatre, Experimental Theatre, Popular
    Shows) rather than free text, so a future public listing page can
    filter approved events by category using the exact same taxonomy
    already in use elsewhere on theomy.
    """
    __tablename__ = "event_enquiries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submitted_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Organisation & contact details
    org_name = Column(String(255), nullable=False)
    org_about = Column(Text, nullable=True)
    contact_person = Column(String(255), nullable=False)
    contact_email = Column(String(255), nullable=False)
    contact_phone = Column(String(20), nullable=False)

    # Event information
    event_title = Column(String(255), nullable=False)
    event_category = Column(String(100), nullable=False)
    event_description = Column(Text, nullable=True)
    proposed_date = Column(DateTime(timezone=True), nullable=False)
    proposed_time = Column(String(20), nullable=True)  # free-text, e.g. "7:00 PM"
    venue = Column(String(255), nullable=False)

    remarks = Column(Text, nullable=True)

    status = Column(Enum(EnquiryStatus), nullable=False, default=EnquiryStatus.pending)
    admin_note = Column(String(500), nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class EventTicketTier(Base):
    """A single ticket category for an event enquiry, e.g. Normal ₹250 x40,
    Executive ₹300 x35, Premium ₹350 x25. Multiple rows per enquiry.
    """
    __tablename__ = "event_ticket_tiers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enquiry_id = Column(UUID(as_uuid=True), ForeignKey("event_enquiries.id"), nullable=False, index=True)
    tier_name = Column(String(100), nullable=False)  # e.g. "Normal", "Executive", "Premium"
    price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False)


class EventEnquiryAttachment(Base):
    __tablename__ = "event_enquiry_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enquiry_id = Column(UUID(as_uuid=True), ForeignKey("event_enquiries.id"), nullable=False, index=True)
    file_url = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=False)
    uploaded_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class OtpPurpose(str, enum.Enum):
    registration = "registration"
    login = "login"


class OtpVerification(Base):
    """Short-lived WhatsApp OTP codes. India-only feature — phone-based
    registration/login verification for other countries isn't required
    (phone stays optional there), so this table is only ever written to
    for phone numbers tied to an India-country registration or an OTP
    login attempt.

    A new /otp/send call for the same phone+purpose invalidates any
    previous unconsumed code for that pair (is_verified stays False on
    the old row, but only the newest row is ever checked against, since
    lookups always take the most recent one).
    """
    __tablename__ = "otp_verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone = Column(String(20), nullable=False, index=True)
    otp_code = Column(String(6), nullable=False)
    purpose = Column(Enum(OtpPurpose), nullable=False)
    is_verified = Column(Boolean, nullable=False, default=False)
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ExchangeRateConfig(Base):
    """Single-row table holding the fixed INR-per-USD rate used to convert
    displayed/charged prices for non-India accounts. This is a fixed rate
    YOU set (not a live market feed) — update this row whenever you want
    to adjust it; the Subscription page always reads the latest value.
    """
    __tablename__ = "exchange_rate_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inr_per_usd = Column(Numeric(10, 4), nullable=False, default=Decimal("83.5000"))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class RewardConfig(Base):
    """Single-row master table defining how many reward points get
    earned, as a percentage of the amount paid. 1 point = ₹1.

    subscription_reward_percent — applied on successful subscription
    payments (wired up now, Razorpay/India path — the Stripe/non-India
    path doesn't earn points yet since points are ₹-denominated and
    Stripe checkout is currently paused).

    ticket_reward_percent — intended for ticket booking purchases. NOT
    wired to anything yet: theomy doesn't have a real ticket
    booking/payment flow built currently (the Theater/Ticketing section
    is demo content). This column exists so the rate is ready to use the
    moment that feature gets built, without another schema change.
    """
    __tablename__ = "reward_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_reward_percent = Column(Numeric(5, 2), nullable=False, default=20)
    ticket_reward_percent = Column(Numeric(5, 2), nullable=False, default=5)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AdminRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"


class AdminUser(Base):
    """Staff/admin accounts — deliberately a SEPARATE table from `users`,
    not another role value on the customer User model. This means an
    admin's JWT and a regular user's JWT are naturally isolated from each
    other: each auth dependency queries its own table, so a token issued
    for one can never resolve to an account in the other, even by
    accident.

    superadmin — full access: manage other admin accounts, edit
    config/rate tables (tax, revenue share, exchange rate, rewards).
    admin — day-to-day operational access: approve/reject event
    enquiries, process withdrawal requests, etc. Cannot manage other
    admin accounts or touch financial config.

    No public registration endpoint exists for this table — the first
    superadmin is created via a one-time script (see app/create_admin.py),
    and every admin account after that is created by an existing
    superadmin through the admin panel itself.
    """
    __tablename__ = "admin_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(AdminRole), nullable=False, default=AdminRole.admin)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
