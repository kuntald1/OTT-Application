import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Column, String, DateTime, Date, Enum, Boolean, ForeignKey, Integer, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class AuthProvider(str, enum.Enum):
    local = "local"
    google = "google"
    facebook = "facebook"


class UserRole(str, enum.Enum):
    user = "user"
    content_creator = "content_creator"
    plays_organiser = "plays_organiser"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)

    # Set only for a sub-account created from a parent's Manage Profile
    # page (a "family account" sharing the parent's subscription — see
    # routers/sub_accounts.py). Null for every regular, self-registered
    # account. A sub-account can never itself have sub-accounts (no
    # nested chains) — enforced in routers/sub_accounts.py, not here.
    parent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

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

    # Netflix-style single-session enforcement: set to a fresh random
    # value on every login/register, and embedded in that login's JWT
    # (the "sid" claim — see security.py). get_current_user rejects any
    # token whose "sid" no longer matches this column, which is what
    # actually signs the OLD device out the moment a NEW login happens
    # elsewhere on the same account. Null means "no session-pinning yet"
    # (accounts that haven't logged in since this was added) — treated
    # as unrestricted, not as a mismatch.
    active_session_token = Column(String(64), nullable=True)

    # Admin-toggled permission (see Admin > Users) — a Content Creator or
    # Plays Organiser can only create a live stream if this is True.
    # False by default: live streaming is opt-in per account, not
    # automatic just from having the right role.
    can_live_stream = Column(Boolean, default=False, nullable=False)

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


class TicketSource(str, enum.Enum):
    message = "message"       # Help Center > Message tab — quick, informal contact
    complaint = "complaint"   # Help Center > Complain tab — formal, tracked issue


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

    # Distinguishes Help Center's two async channels (Message vs Complain)
    # so Admin > Help Center can tell them apart at a glance — both land
    # in the exact same table/workflow otherwise. Defaults to "complaint"
    # for backward compatibility with rows created before this column
    # existed (all of which came from the Complain tab).
    source = Column(Enum(TicketSource), nullable=False, default=TicketSource.complaint)

    # Optional screenshot/photo the person attaches when filing —
    # e.g. proof of a billing issue or a broken-video screenshot.
    image_url = Column(String(500), nullable=True)

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

    # Content access this plan grants — replaces the old convention of
    # inferring access from the literal strings "Play"/"Archive"/"Both"
    # in the plan's name (see routers/videos.py's _has_active_subscription_
    # for_section), so an admin can freely rename or add plans without
    # breaking what they unlock. "Both" is simply grants_play=grants_archive=True.
    grants_play = Column(Boolean, nullable=False, default=False)
    grants_archive = Column(Boolean, nullable=False, default=False)

    highlighted = Column(Boolean, nullable=False, default=False)  # shows "Best Value" badge
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class SubscriptionDuration(Base):
    """Admin-editable billing-cycle options (1 Month, 6 Months -10%, ...)
    shown on the Subscription page's duration picker — previously a
    hardcoded array on both the frontend and backend.
    """
    __tablename__ = "subscription_durations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label = Column(String(50), nullable=False, unique=True)  # "1 Month", "6 Months", ...
    months = Column(Integer, nullable=False)
    discount_percent = Column(Numeric(5, 2), nullable=False, default=0)  # e.g. 10 for "-10%"
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)



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
    """Blog posts — published by an admin, read by everyone.
    is_published lets a post be prepared as a draft before going live.
    """
    __tablename__ = "blogs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    excerpt = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    author_name = Column(String(100), nullable=False, default="theomy Team")
    cover_image_url = Column(String(500), nullable=True)

    is_published = Column(Boolean, nullable=False, default=True)
    published_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class BlogComment(Base):
    """One row per comment on a blog post. Visible to everyone on the
    public post; admin can see every comment across every post in one
    place for moderation, and can edit or delete any of them (see
    admin_blogs.py) — the commenting user themselves can also delete
    their own (not edit, to keep a comment's history honest once
    others may have replied to/read it — same reasoning as most
    platforms only allowing delete, not edit, on a public comment).

    Exactly one of user_id / admin_id is set — admin and public-site
    accounts are separate tables (see AdminUser's docstring), so a
    comment made by an admin (from the admin panel's own Like/Comment
    UI) records admin_id instead of user_id.
    """
    __tablename__ = "blog_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blog_id = Column(UUID(as_uuid=True), ForeignKey("blogs.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BlogLike(Base):
    """One row per (user-or-admin, blog) like. A unique constraint
    only on (blog_id, user_id) can't also cover the admin case
    cleanly with a single constraint (user_id is null for
    admin-authored likes), so uniqueness for admin likes is enforced
    in application code instead (see admin_blogs.py's toggle handler).
    """
    __tablename__ = "blog_likes"
    __table_args__ = (UniqueConstraint("blog_id", "user_id", name="uq_blog_like_per_user"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blog_id = Column(UUID(as_uuid=True), ForeignKey("blogs.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CommunityRoom(Base):
    """A discussion room within Community. Exactly one of
    created_by_user_id / created_by_admin_id is set — admin and
    public-site accounts are separate login systems (see AdminUser's
    docstring), so a room created from the admin panel records
    created_by_admin_id instead.
    """
    __tablename__ = "community_rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class RoomPost(Base):
    __tablename__ = "room_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("community_rooms.id"), nullable=False, index=True)
    author_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    author_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)
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

    rate_paisa_per_minute is only the FALLBACK rate — used when a video
    has no VideoRevenueTier rows of its own (uploader didn't set custom
    tiers at upload time). A video with tiers always uses its own tiers
    first (see routers/watch.py's _compute_gross_revenue_paisa).

    platform_commission_percent is theomy's cut of whatever gross
    revenue a view generates, taken BEFORE crediting the creator —
    e.g. 20 means the creator keeps 80% of the tier-calculated amount.
    Same admin-editable-via-SQL pattern as every other config table
    here; no admin panel UI edits this yet.
    """
    __tablename__ = "revenue_rate_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rate_paisa_per_minute = Column(Integer, nullable=False, default=7)
    platform_commission_percent = Column(Numeric(5, 2), nullable=False, default=20)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class VideoWatchRecord(Base):
    """Phase 3 — one row per (user, video) pair, tracking that viewer's
    LONGEST single continuous watch session ever, in seconds. This is
    the "max single-session view" rule confirmed earlier: revenue is
    calculated from the longest session a viewer has ever watched, not
    the sum of every session — re-watching the same video 10 times
    doesn't 10x the creator's earnings, since that would reward
    refresh-farming rather than genuine engagement.

    gross_revenue_paisa is the tier-calculated amount (VideoRevenueTier,
    or the RevenueRateConfig fallback) for max_session_seconds, computed
    fresh every time max_session_seconds grows. creator_credited_paisa
    is what's actually been added to CreatorEarnings so far — always
    <= gross_revenue_paisa, since it's gross minus the platform's
    commission (see RevenueRateConfig.platform_commission_percent).
    Kept as two separate running totals (rather than recomputing from
    scratch) so a heartbeat only ever credits the INCREMENTAL amount
    when a session beats the previous best, never double-credits.
    """
    __tablename__ = "video_watch_records"
    __table_args__ = (UniqueConstraint("user_id", "video_id", name="uq_user_video_watch_record"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)

    max_session_seconds = Column(Integer, nullable=False, default=0)
    gross_revenue_paisa = Column(Integer, nullable=False, default=0)
    creator_credited_paisa = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class WatchProgress(Base):
    """One row per (user, video) — where they last left off. This is
    the real data behind "Continue Watching" and "History".

    position_seconds is an APPROXIMATION, not a precise player
    timestamp — the Bunny embed is a cross-origin iframe with no
    postMessage wiring here (same honest limitation as the
    watch-heartbeat revenue engine, see routers/watch.py), so this is
    wall-clock elapsed time since Play was pressed, saved periodically.
    It's accurate for straight-through watching, less so if someone
    pauses for a long time without closing the player or seeks around.

    Resuming uses Bunny Stream's embed URL `t=<seconds>` start-time
    parameter — see routers/videos.py's _to_out, which appends it to
    embed_url whenever this row exists and playback isn't essentially
    finished.
    """
    __tablename__ = "watch_progress"
    __table_args__ = (UniqueConstraint("user_id", "video_id", name="uq_user_video_watch_progress"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    position_seconds = Column(Integer, nullable=False, default=0)

    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        index=True,
    )
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PlaybackSession(Base):
    """One row per (user, browser/device) currently watching something —
    the real enforcement behind the "screens" a subscription is priced
    for. session_token is generated once per browser and persisted in
    localStorage, so the same device reuses the same row across
    different videos/visits rather than spawning a new one each time.

    A session counts as ACTIVE only if last_heartbeat_at is recent
    (see routers/playback_sessions.py's ACTIVE_WINDOW_SECONDS) — closing
    a tab or losing connection lets the slot free itself automatically
    within that window, without needing an explicit "log out this
    device" action.
    """
    __tablename__ = "playback_sessions"
    __table_args__ = (UniqueConstraint("user_id", "session_token", name="uq_user_session_token"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    session_token = Column(String(100), nullable=False, index=True)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=True)

    last_heartbeat_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class RevenueLedgerEntry(Base):
    """One row per moment a heartbeat actually credited a creator —
    i.e. every time VideoWatchRecord's high-water-mark grew and
    produced a positive delta. VideoWatchRecord alone only holds a
    running total per (user, video), which can't answer "how much
    revenue came in yesterday" or "which countries watched this video"
    — this ledger exists specifically to make those real, queryable
    (not estimated) analytics possible.

    viewer_country is copied from User.country at the moment of
    crediting — the account's registered country, NOT IP-based
    geolocation (theomy doesn't do IP geolocation). It's real data, just
    a proxy for "where the viewer is" rather than a precise location.
    """
    __tablename__ = "revenue_ledger_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    creator_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

    viewer_country = Column(String(100), nullable=True)
    delta_gross_paisa = Column(Integer, nullable=False)
    delta_creator_paisa = Column(Integer, nullable=False)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
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


class OrganiserRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class OrganiserRequest(Base):
    """A regular User's request to be upgraded to Plays Organiser —
    reachable from the profile dropdown's "Request as Organiser" link.
    On approval, the requester's User.role is changed to
    UserRole.plays_organiser and the link disappears from their
    dropdown going forward (the frontend checks GET
    /organiser-requests/mine's status). On rejection, the link stays
    available so they can submit again — rejection_reason is optional,
    matching event enquiries' same optional-reason pattern.
    """
    __tablename__ = "organiser_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String(255), nullable=False)
    group_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)
    email = Column(String(255), nullable=False)
    remarks = Column(Text, nullable=True)
    status = Column(Enum(OrganiserRequestStatus), nullable=False, default=OrganiserRequestStatus.pending)
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    reviewed_at = Column(DateTime(timezone=True), nullable=True)


class DonationRegistrationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    disabled = "disabled"


class DonationRegistration(Base):
    """A Plays Organiser's request to register payout details so
    supporters can donate to them — reachable from the "Support a
    Plays Organiser" page's "Register for Donation" link, which only
    shows for accounts with role plays_organiser (see UserRole).

    Payout details are given as EITHER bank account + IFSC OR a QR
    code image, not necessarily both — both fields stay nullable and
    the submit endpoint validates that at least one form is present.
    disabled is a separate state from rejected: an admin can disable a
    previously-APPROVED registration later (e.g. suspicious activity)
    without it looking like the original submission was rejected.
    """
    __tablename__ = "donation_registrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    group_name = Column(String(255), nullable=False)
    account_number = Column(String(50), nullable=True)
    ifsc_code = Column(String(20), nullable=True)
    qr_code_url = Column(String(500), nullable=True)
    document_url = Column(String(500), nullable=True)
    status = Column(Enum(DonationRegistrationStatus), nullable=False, default=DonationRegistrationStatus.pending)
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    reviewed_at = Column(DateTime(timezone=True), nullable=True)


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
    # 3:4 poster — shown on the public share link and, once approved, on
    # the Ticketing/Theater listing page.
    poster_image_url = Column(String(500), nullable=True)

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


class AgeRating(str, enum.Enum):
    u = "U"
    ua7 = "UA7+"
    ua13 = "UA13+"
    ua16 = "UA16+"
    a = "A"


class VideoSection(str, enum.Enum):
    play = "play"
    archive = "archive"
    # Live-stream-only option — a live event tagged "both" shows up on
    # BOTH the Play and Archive "Live Now" rows, regardless of which
    # section a viewer is browsing. VOD video uploads don't offer this
    # (their form is still Play/Archive only), so this value only ever
    # appears on LiveStream rows in practice.
    both = "both"


class VideoStatus(str, enum.Enum):
    pending = "pending"
    published = "published"
    disabled = "disabled"  # approved once, hidden from public without deleting anything
    rejected = "rejected"


class VideoMonetization(str, enum.Enum):
    subscription_only = "subscription_only"
    pay_per_video = "pay_per_video"


class Video(Base):
    """Video Phase 1 — metadata, pricing, and the admin approval workflow
    only. No actual video FILE is stored yet — bunny_video_id stays null
    until Phase 2 wires in real Bunny Stream upload + HLS playback.

    A video only becomes visible on Play/Archive once status='published'
    — set by an admin (via direct SQL for now, same pattern as event
    enquiries and withdrawal requests, until the Admin Module grows an
    approval UI in a later phase).

    monetization_type='pay_per_video' means: even a subscriber must pay
    the video's own separate price to watch it — subscription is only
    the PREREQUISITE that unlocks the ability to buy pay-per-video
    content at all, never a free pass to it. A user with no subscription
    can't purchase pay-per-video content regardless of price.
    """
    __tablename__ = "videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # A video is uploaded by EITHER a Creator/Organiser account OR an
    # admin directly — exactly one of these two is set, never both.
    # Nullable because Admin accounts live in a completely separate
    # table (admin_users) from regular users, by design (see AdminUser
    # docstring) — a video can't have a single non-nullable FK that
    # covers both possible uploader types.
    uploaded_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    uploaded_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True, index=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    section = Column(Enum(VideoSection), nullable=False)
    # Same taxonomy as the Event Enquiry category and the site's Category
    # menu (Bengali Theatre, Drama, Comedy, etc.) — kept as plain String
    # rather than a DB enum so the category list can be extended later
    # without a migration; validated against the shared list server-side.
    # DEPRECATED as of multi-category support — kept only so this column
    # (already NOT NULL on existing rows) doesn't need a destructive
    # migration. Always auto-populated with categories[0] for backward
    # compatibility. VideoCategory below is the real source of truth now.
    category = Column(String(100), nullable=False)

    release_year = Column(Integer, nullable=False)
    # values_callable makes this store the actual human-readable value
    # (U, UA7+, UA13+...) rather than SQLAlchemy's default of the
    # internal Python enum name (u, ua7, ua13...) — critical here since
    # this column gets edited via raw SQL, and anyone typing 'UA16+'
    # directly should have it just work, not silently mismatch.
    age_rating = Column(Enum(AgeRating, values_callable=lambda x: [e.value for e in x]), nullable=False)
    # Comma-separated, e.g. "Bengali, English" — simple list, no per-item
    # attributes needed (unlike categories/cast/crew below), so a single
    # column is enough rather than a whole related table.
    languages = Column(String(255), nullable=True)
    # Custom poster image, uploaded separately from the video file itself
    # — distinct from Bunny's auto-grabbed thumbnail, since a real poster
    # is usually purpose-designed, not just a random video frame.
    poster_image_url = Column(String(500), nullable=True)

    # True = ads play during this video; False = ad-free. Can be toggled
    # by the uploader at any time — ads stop immediately once set False.
    has_ads = Column(Boolean, nullable=False, default=True)

    monetization_type = Column(Enum(VideoMonetization), nullable=False, default=VideoMonetization.subscription_only)

    status = Column(Enum(VideoStatus), nullable=False, default=VideoStatus.pending)
    admin_note = Column(String(500), nullable=True)

    # Filled in during Phase 2, once real Bunny Stream upload exists
    bunny_video_id = Column(String(255), nullable=True)
    # A SEPARATE Bunny video upload (its own bunny_video_id), used only
    # for the silent hover-preview on video cards — never the same
    # asset as the real feature (bunny_video_id above). Never
    # ad-gated: has_ads/ad cue points only ever apply to the real
    # content, a trailer plays clean regardless of that setting.
    trailer_bunny_video_id = Column(String(255), nullable=True)
    # Subtitle text, stored directly as WebVTT — NOT hosted on Bunny.
    # theomy serves this itself (see GET /videos/{id}/subtitle.vtt) so
    # the native ad-enabled player can attach a real <track> element.
    # This only ever works for the native-player path (AdEnabledVideoPlayer);
    # the plain Bunny iframe embed (ad-free videos) has no subtitle
    # hook we control — Bunny owns that player entirely.
    subtitle_vtt_text = Column(Text, nullable=True)
    # Real runtime, fetched from Bunny once encoding finishes — never a
    # manually-typed value, since a Creator guessing/mistyping a runtime
    # would be less trustworthy than the actual file's real duration.
    # Stays null until Bunny reports a non-zero length; populated lazily
    # on read (see _to_out) rather than requiring a separate poll/webhook.
    duration_seconds = Column(Integer, nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    published_at = Column(DateTime(timezone=True), nullable=True)


class VideoPricing(Base):
    """Pay-Per-Video price — only present when Video.monetization_type is
    'pay_per_video'. Both currencies set explicitly by the uploader, same
    reasoning as subscription_plans.base_price_usd: not auto-converted,
    a deliberate price for each market.
    """
    __tablename__ = "video_pricing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, unique=True)
    price_inr = Column(Numeric(10, 2), nullable=False)
    price_usd = Column(Numeric(10, 2), nullable=False)


class VideoRevenueTier(Base):
    """One row per view-length tier for a single video's revenue-share
    rate, e.g. 1-500 min => ₹1.50/min, 501-1500 => ₹1.00/min, etc. Set by
    the Content Creator / Plays Organiser at upload time, up to 5 tiers
    per video. max_minutes NULL means "and above" (an unbounded top
    tier, e.g. "1-unlimited => ₹1.20/min").

    Actual revenue calculation from real watch-time (Phase 3) will use
    these tiers together with the "max single-session view" rule
    confirmed earlier — not simply summing every session's minutes.
    """
    __tablename__ = "video_revenue_tiers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    min_minutes = Column(Integer, nullable=False)
    max_minutes = Column(Integer, nullable=True)  # null = unbounded top tier
    rate_per_minute_inr = Column(Numeric(10, 2), nullable=False)


class VideoSubtitle(Base):
    """One row per subtitle language for a video — replaces the earlier
    single-language design (a lone subtitle_vtt_text column on Video,
    now unused/deprecated but left in place rather than dropped, since
    it may already hold data in production). Multiple rows per video
    are expected (English, Bengali, Hindi, etc.), each independently
    add/replace/delete-able. vtt_text is the converted WebVTT content,
    stored directly (see the old column's original docstring for why —
    not hosted on Bunny by default, though _sync_caption_to_bunny
    ALSO relays each one to Bunny's own native captions API so the
    plain iframe embed path gets them too).
    """
    __tablename__ = "video_subtitles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    language_code = Column(String(10), nullable=False)  # e.g. "en", "bn", "hi" — ISO 639-1 where possible
    language_label = Column(String(50), nullable=False)  # e.g. "English", "Bengali", "Hindi"
    vtt_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class VideoCategory(Base):
    """Multiple categories/genres per video (up to 3), e.g. "Bengali
    Theatre" + "Classical Theatre" — replaces the old single-category
    limitation. Video.category (singular) stays populated with
    categories[0] for backward compatibility, but this table is the
    real source of truth going forward.

    menu_id links this row to the actual Menu category row (see
    routers/admin_menus.py) — this is what makes a category rename
    propagate live to every video already tagged with it, instead of
    the video staying frozen on the name it had at upload time.
    `category` (plain text) is kept as a fallback display value for
    rows created before this link existed, or if the linked Menu row
    is later deleted; _to_out prefers the live Menu name via menu_id
    whenever it's present and still resolves.
    """
    __tablename__ = "video_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    menu_id = Column(UUID(as_uuid=True), ForeignKey("menus.id"), nullable=True, index=True)
    category = Column(String(100), nullable=False)


class Person(Base):
    """A real, reusable profile for an actor/crew member — deliberately
    its OWN entity, not free text repeated on every video. The same
    person appearing in multiple videos should have ONE bio that stays
    consistent, not a separate copy per video that can drift out of sync.

    KNOWN LIMITATION (documented, not silently glossed over): there's no
    search/reuse step yet when adding cast/crew to a video — every entry
    currently creates a fresh Person row, even if that person already
    exists from an earlier video. A search-and-select step is a
    reasonable follow-up, not built in this pass.
    """
    __tablename__ = "people"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    photo_url = Column(String(500), nullable=True)
    occupation = Column(String(255), nullable=True)  # e.g. "Actor, Writer"
    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    birthplace = Column(String(255), nullable=True)
    about = Column(Text, nullable=True)
    early_life = Column(Text, nullable=True)
    personal_life = Column(Text, nullable=True)
    debut_initial_years = Column(Text, nullable=True)
    breakthrough_beyond = Column(Text, nullable=True)
    recent_projects = Column(Text, nullable=True)
    # Same either/or ownership as Video — a Person profile created via
    # the Admin "Add Video" flow has no regular user account behind it.
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class VideoCast(Base):
    """One row per cast member, up to 10 per video. character_role is
    per-video (the same actor plays different characters in different
    productions) — everything else about who they are lives on Person.
    """
    __tablename__ = "video_cast"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    character_role = Column(String(255), nullable=True)
    display_order = Column(Integer, nullable=False, default=0)


class VideoCrew(Base):
    """One row per crew member (Director, Writer, etc.), up to 5 per
    video. role is per-video free text (Director on one production,
    Writer on another) — everything else about who they are lives on
    Person.
    """
    __tablename__ = "video_crew"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=False)
    role = Column(String(100), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)


class MyListItem(Base):
    """A user's "My List" (saved-for-later) entries — deliberately NOT
    a strict FK to Video, because My List is shared across every
    section on theomy (Video Streaming, Movies, Theater, Archive), and
    most of those sections are still demo/static content with no real
    backend row behind them at all. Storing the exact card shape the
    frontend already uses (id/title/image/meta/section) instead of a
    video_id FK means this works identically for a real uploaded video
    and a demo card, with no special-casing either — the previous
    implementation kept this only in React state, so it vanished on
    every refresh/logout despite the "+" button looking like it saved
    something permanently.
    """
    __tablename__ = "my_list_items"
    __table_args__ = (UniqueConstraint("user_id", "item_id", name="uq_user_my_list_item"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    item_id = Column(String(255), nullable=False)  # the frontend card's own id, real or demo
    title = Column(String(255), nullable=False)
    image_url = Column(String(1000), nullable=True)
    meta = Column(String(255), nullable=True)
    section = Column(String(100), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class VideoEmbedding(Base):
    """One row per video — a Voyage AI embedding vector computed from
    the video's title + description + categories + cast/crew names,
    powering "More like this" and "Recommended for you" via cosine
    similarity. Stored as a plain JSON array of floats rather than
    using the pgvector Postgres extension — theomy's catalog is small
    enough that computing similarity in Python at request time is fine,
    and this avoids depending on a Postgres extension that may not be
    installed. Recomputed whenever a video is published/approved, or
    on demand via the admin "Recompute" action.
    """
    __tablename__ = "video_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, unique=True, index=True)
    vector_json = Column(Text, nullable=False)  # JSON-encoded list[float]
    model = Column(String(50), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AnalyticsInsightCache(Base):
    """Single-row cache for the AI Insights box on the admin Analytics
    tab. Without this, every time an admin opens/refreshes that tab
    triggers a real Claude API call — real cost for something that
    doesn't need to be regenerated every single view, since the
    underlying revenue/performance numbers don't change second to
    second. See routers/admin_ai.py for the freshness-window logic
    (only regenerates if the cache is older than INSIGHT_CACHE_HOURS,
    or an admin explicitly forces a refresh).
    """
    __tablename__ = "analytics_insight_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    insights = Column(Text, nullable=False)
    generated_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AIConfig(Base):
    """Single-row table for AI-feature settings that should be
    admin-editable without a redeploy — same single-row pattern as
    RevenueRateConfig. Currently just the AI Insights cache duration;
    more AI-related settings can live here later without a new table.
    """
    __tablename__ = "ai_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    insight_cache_hours = Column(Integer, nullable=False, default=6)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class LiveStreamStatus(str, enum.Enum):
    idle = "idle"          # created, not broadcasting yet
    active = "active"      # currently receiving RTMP input, viewers can watch
    ended = "ended"        # broadcast finished (or manually ended/deleted)


class SpecialCategory(Base):
    """An admin-curated featured row (e.g. "Sunday Special") that shows
    at the very top of the Play and/or Archive page — above every
    other row — only while today falls within [visible_from,
    visible_to]. Outside that window (or while is_disabled), it's
    simply not returned by the public listing endpoint, so no
    separate cron/cleanup job is needed — visibility is computed at
    read time from the current date. Delete removes it and its video
    links entirely; is_disabled is the softer "hide without deleting"
    toggle, same End-vs-Delete distinction used for live streams.
    """
    __tablename__ = "special_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    visible_from = Column(Date, nullable=False)
    visible_to = Column(Date, nullable=False)
    section = Column(Enum(VideoSection), nullable=False, default=VideoSection.play)
    is_disabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class SpecialCategoryVideo(Base):
    """One row per video included in a SpecialCategory — a simple
    many-to-many join, since one video could plausibly appear in more
    than one special row and a special row holds many videos.
    """
    __tablename__ = "special_category_videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    special_category_id = Column(UUID(as_uuid=True), ForeignKey("special_categories.id"), nullable=False, index=True)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    added_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class LiveStream(Base):
    """A live event, backed by Mux (Bunny Stream has no live-streaming
    support — see routers/mux_services.py). mux_stream_key is the RTMP
    broadcast secret — shown to the creator/admin who owns this stream
    ONLY, never in any public-facing response. Anyone with this key
    could push a fake broadcast under this stream's identity, same
    sensitivity as a password.

    status starts "idle" right after creation via the Mux API, flips to
    "active" the moment Mux's video.live_stream.active webhook fires
    (real broadcast started), and "ended" either when the encoder
    disconnects (video.live_stream.idle webhook) or the owner/admin
    manually ends it. Mux auto-records every session to a VOD asset,
    but wiring that recording into theomy's own Video catalog is a
    later step, not part of this pass.

    Viewer access is intentionally NOT gated by subscription in this
    first pass (explicitly deferred) — any logged-in user can watch a
    live stream that's currently active. Tightening this later doesn't
    require a schema change, just a check in the read endpoint.
    """
    __tablename__ = "live_streams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    section = Column(Enum(VideoSection), nullable=False, default=VideoSection.play)
    poster_image_url = Column(String(500), nullable=True)

    uploaded_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    uploaded_by_admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)

    status = Column(Enum(LiveStreamStatus), nullable=False, default=LiveStreamStatus.idle)

    mux_live_stream_id = Column(String(255), nullable=False)
    mux_playback_id = Column(String(255), nullable=False)
    mux_stream_key = Column(String(255), nullable=False)

    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Ad(Base):
    """A reusable ad definition — just a name and a VAST tag URL (from
    Google Ad Manager, or any VAST-compliant ad network). theomy doesn't
    host ad creatives itself; the VAST tag is what the player's Google
    IMA SDK integration actually requests at playback time to get the
    real ad creative, tracking pixels, and skip-button rules. One Ad
    can be reused as a cue point across many videos.
    """
    __tablename__ = "ads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    vast_tag_url = Column(String(2000), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AdCuePoint(Base):
    """Where a given Ad plays within a specific video. offset_seconds=0
    is a pre-roll (plays before the content starts); any positive value
    is a mid-roll at that point in the video. Only ever takes effect
    when the video's own has_ads is True — toggling has_ads off hides
    every cue point for that video without deleting them, so re-
    enabling ads later doesn't require re-entering the schedule.
    """
    __tablename__ = "ad_cue_points"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    ad_id = Column(UUID(as_uuid=True), ForeignKey("ads.id"), nullable=False)
    offset_seconds = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class VideoLike(Base):
    """One row per (user, video) — existence means that user likes that
    video. Same toggle-by-row-existence pattern as PostLike above. Real
    videos only (unlike MyListItem) — the thumbs-up on demo cards stays
    decorative since there's no real Video row to attach a like to.
    """
    __tablename__ = "video_likes"
    __table_args__ = (UniqueConstraint("user_id", "video_id", name="uq_user_video_like"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class VideoPurchase(Base):
    """Phase 4 — one row per successful Pay-Per-Video purchase. A user
    only gets playback access to a pay_per_video Video once a row exists
    here with status='paid' for that (user, video) pair. Deliberately
    mirrors Payment's created->paid/failed lifecycle and Razorpay
    signature-verification pattern (see routers/payments.py) rather than
    inventing a new one.

    Access granted here is permanent (buy-once-watch-forever), matching
    how the Video model's docstring frames Pay-Per-Video as a purchase,
    not a timed rental — there's no expires_at by design. Only INR/
    Razorpay is wired up in this pass, same India-only scope as the
    donation flow; USD/Stripe pay-per-video checkout is not built yet
    even though VideoPricing already stores a price_usd for display.
    """
    __tablename__ = "video_purchases"
    __table_args__ = (UniqueConstraint("user_id", "video_id", name="uq_user_video_purchase"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id"), nullable=False, index=True)

    gateway = Column(Enum(PaymentGateway), nullable=False, default=PaymentGateway.razorpay)
    gateway_order_id = Column(String(255), nullable=True)
    gateway_payment_id = Column(String(255), nullable=True)

    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="INR")
    status = Column(Enum(PaymentStatus), nullable=False, default=PaymentStatus.created)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PageHeroContentType(str, enum.Enum):
    image = "image"
    video = "video"
    text = "text"


class PageHero(Base):
    """Admin-editable hero banner shown at the top of Plays, Archive,
    Community, and Ticketing — replaces what used to be hardcoded
    image/video files bundled straight into the frontend build (e.g.
    src/assets/HeroVideo/, src/Archive/assets/ArchiveVideo/), which
    required a developer to drop in a file and rebuild. One row per
    page_key ("plays" | "archive" | "community" | "ticketing").
    content_type picks what's shown as the background: uploaded
    image(s), uploaded video(s) — see PageHeroMedia, which holds the
    (possibly several) media files for a slideshow/rotation, matching
    the old multi-file HeroVideo folder / multi-poster fallback
    behavior — or no media at all (a plain-color background with just
    the text). `media_url` is legacy from before multi-media support
    and is no longer written to; PageHeroMedia is the source of truth.
    """
    __tablename__ = "page_heroes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_key = Column(String(20), unique=True, nullable=False, index=True)
    content_type = Column(Enum(PageHeroContentType), nullable=False, default=PageHeroContentType.text)
    media_url = Column(String(500), nullable=True)  # legacy, unused — see PageHeroMedia

    eyebrow = Column(String(100), nullable=True)
    headline = Column(String(255), nullable=False)
    subtext = Column(Text, nullable=True)

    updated_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    media = relationship("PageHeroMedia", order_by="PageHeroMedia.display_order", cascade="all, delete-orphan")


class PageHeroMedia(Base):
    """One image or video file belonging to a PageHero — a hero can hold
    several (a slideshow of images, or several videos played one after
    another), matching the old file-drop behavior where multiple files
    in src/assets/HeroVideo/ all played in sequence, or multiple poster
    images cross-faded. All items under one PageHero share that hero's
    content_type (never mixed image+video within one page's hero).
    display_order controls playback/slideshow order — lowest first.
    """
    __tablename__ = "page_hero_media"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_hero_id = Column(UUID(as_uuid=True), ForeignKey("page_heroes.id", ondelete="CASCADE"), nullable=False, index=True)
    media_url = Column(String(500), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class TheaterHeroSlide(Base):
    """Replaces the old hardcoded SHOWS array (src/Theater/showsData.js)
    that powered TheaterHero.jsx — the auto-advancing full-bleed
    carousel at the top of Ticketing, with its bottom row of small
    circular thumbnails to jump between slides. Was previously 8
    baked-in demo shows with a "large" and "small" copy of the same
    photo per show (src/Theater/assets/portraits/{large,small}/); now
    fully admin-managed (Admin > Ticketing Hero Slides). One uploaded
    image serves both the large background AND the small circular
    thumbnail — resized by CSS, no need for two separate files.
    """
    __tablename__ = "theater_hero_slides"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_url = Column(String(500), nullable=False)
    category = Column(String(100), nullable=True)
    venue = Column(String(255), nullable=True)
    title = Column(String(255), nullable=False)
    synopsis = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ArchiveHeroSlide(Base):
    """The Archive page's hero — same auto-advancing slideshow-with-
    thumbnail-picker pattern as TheaterHeroSlide, but each Archive
    slide gets its own eyebrow/headline/subtext text (Theater's
    category/venue/title/synopsis don't map cleanly to Archive, which
    has no venue). Fully admin-managed (Admin > Archive Hero Slides) —
    replaces the older single-shared-text PageHero record for
    page_key="archive", now that each slide needs its own caption.
    """
    __tablename__ = "archive_hero_slides"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_url = Column(String(500), nullable=False)
    eyebrow = Column(String(100), nullable=True)
    headline = Column(String(255), nullable=False)
    subtext = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class SitePage(Base):
    """Static content pages (About Us, Contact Us, and the "applicable
    policies" — Privacy, Terms, Cookie Policy) — admin-editable from
    Admin > Content & Policy Management instead of being hardcoded
    text in the frontend. slug is the fixed identifier used to fetch a
    given page ("about" | "contact" | "privacy" | "terms" | "cookies").
    """
    __tablename__ = "site_pages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(30), unique=True, nullable=False, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")

    updated_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class FaqItem(Base):
    """One question/answer pair on the FAQs page — admin-managed
    (Admin > Content & Policy Management), add/edit/delete/reorder any
    time.
    """
    __tablename__ = "faq_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question = Column(String(500), nullable=False)
    answer = Column(Text, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class AdBanner(Base):
    """Promotional image banner shown at the very top of a page, right
    below the nav and above that page's own hero — auto-slides through
    every currently-active banner assigned to that page (see
    AdBannerPage). Fully admin-managed (Admin > Ad Banners): upload an
    image, set where it opens (redirect_url, always in a new tab),
    which page(s) it should appear on, and a start/end date window.
    Only shown while is_active is on AND today falls within
    [start_date, end_date] inclusive — both checked server-side in the
    public endpoint, not left to the frontend to filter. is_active is
    a manual override for "pause this without deleting or fiddling
    with dates" — a banner can be within its date window and still be
    switched off.
    """
    __tablename__ = "ad_banners"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_url = Column(String(500), nullable=False)
    redirect_url = Column(String(2000), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    pages = relationship("AdBannerPage", cascade="all, delete-orphan")


class AdBannerPage(Base):
    """One page this AdBanner should appear on — page_key is one of
    "plays" | "archive" | "mylist" | "community" | "ticketing". A
    banner assigned to all 5 is just 5 rows here; there's no separate
    "ALL" sentinel value — Admin's "select all" checkbox is purely a
    UI convenience that ticks every individual page checkbox.
    """
    __tablename__ = "ad_banner_pages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ad_banner_id = Column(UUID(as_uuid=True), ForeignKey("ad_banners.id", ondelete="CASCADE"), nullable=False, index=True)
    page_key = Column(String(20), nullable=False, index=True)
