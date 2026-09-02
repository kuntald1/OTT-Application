import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import UserRole, TicketStatus, PaymentStatus, PaymentGateway


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=20)
    country: str = Field(default="India", max_length=100)
    otp: Optional[str] = Field(default=None, max_length=6)
    role: UserRole = UserRole.user

    @field_validator("phone")
    @classmethod
    def empty_phone_to_none(cls, v):
        # Treat blank string from the form the same as "not provided"
        if v is not None and v.strip() == "":
            return None
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    """Self-service, from an already-logged-in session (Manage Profile) —
    distinct from ResetPasswordRequest above (forgot-password email
    link, no active session) and from AdminUserSetPasswordRequest (an
    admin resetting someone ELSE's password, no old_password needed
    since the admin already has elevated trust). This one requires the
    current password precisely because the person IS logged in and
    could otherwise silently take over the account from an unattended
    session.
    """
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("phone")
    @classmethod
    def empty_phone_to_none(cls, v):
        if v is not None and v.strip() == "":
            return None
        return v


# This is the ONLY shape a user is ever returned in. There is no
# hashed_password field here at all, so it can never leak into a
# response payload no matter which endpoint returns a User.
class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    phone: Optional[str] = None
    country: str
    role: UserRole
    auth_provider: str
    profile_photo_url: Optional[str] = None
    reward_points_balance: int
    can_live_stream: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MessageResponse(BaseModel):
    message: str


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    source: str = Field(default="complaint")  # "message" | "complaint" — see TicketSource


class TicketOut(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: Optional[str] = None
    status: TicketStatus
    source: str
    image_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminTicketOut(BaseModel):
    """Same as TicketOut, plus who filed it — powers Admin > Help Center."""
    id: uuid.UUID
    ticket_number: str
    customer_name: str
    customer_email: str
    subject: str
    description: Optional[str] = None
    status: TicketStatus
    source: str
    image_url: Optional[str] = None
    created_at: datetime


class AdminTicketStatusUpdate(BaseModel):
    status: TicketStatus


class SubscriptionCreate(BaseModel):
    plan_name: str = Field(min_length=1, max_length=50)
    duration_label: str = Field(min_length=1, max_length=50)
    screens: int = Field(default=1, ge=1, le=10)
    price: Decimal = Field(gt=0)


class SubscriptionOut(BaseModel):
    id: uuid.UUID
    plan_name: str
    duration_label: str
    screens: int
    price: Decimal
    currency: str
    is_active: bool
    started_at: datetime
    expires_at: datetime

    model_config = {"from_attributes": True}


class MenuOut(BaseModel):
    id: uuid.UUID
    label: str
    view: Optional[str] = None
    category_param: Optional[str] = None
    parent_menu_id: Optional[uuid.UUID] = None
    requires_auth: bool
    display_order: int
    is_active: bool = True

    model_config = {"from_attributes": True}


class AdOut(BaseModel):
    id: uuid.UUID
    name: str
    vast_tag_url: str
    is_active: bool

    model_config = {"from_attributes": True}


class AdCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    vast_tag_url: str = Field(min_length=1, max_length=2000)


class AdUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    vast_tag_url: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    is_active: Optional[bool] = None


class AdCuePointOut(BaseModel):
    id: uuid.UUID
    ad_id: uuid.UUID
    ad_name: str
    offset_seconds: int


class AdCuePointCreate(BaseModel):
    ad_id: uuid.UUID
    offset_seconds: int = Field(ge=0)


# Minimal shape exposed to the PLAYER on a video it's actually loading —
# just enough to schedule Google IMA SDK ad requests (offset + VAST tag),
# nothing about the underlying Ad's internal id/name.
class PlayerAdCuePointOut(BaseModel):
    offset_seconds: int
    vast_tag_url: str


class AIMetadataSuggestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)


class AIMetadataSuggestResponse(BaseModel):
    suggested_title: str
    suggested_description: str
    suggested_categories: list[str]
    reasoning: str


class AIInsightsResponse(BaseModel):
    insights: str
    generated_at: datetime
    cached: bool


class AIConfigOut(BaseModel):
    insight_cache_hours: int

    model_config = {"from_attributes": True}


class AIConfigUpdate(BaseModel):
    insight_cache_hours: int = Field(ge=1, le=168)  # 1 hour to 1 week


class AdminUserAccountOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    role: str
    is_active: bool
    can_live_stream: bool
    created_at: datetime
    parent_id: Optional[uuid.UUID] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None

    model_config = {"from_attributes": True}


class AdminUserSetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=200)


class AdminUserToggleRequest(BaseModel):
    enabled: bool


class SpecialCategoryCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    visible_from: date
    visible_to: date
    section: str = Field(default="play")  # "play" | "archive" | "both"


class SpecialCategoryUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    visible_from: Optional[date] = None
    visible_to: Optional[date] = None
    section: Optional[str] = None


class SpecialCategoryVideoCardOut(BaseModel):
    """Minimal video card shape for rendering inside a special
    category row — same fields the browse-page card components
    already expect (id, title, poster, trailer for hover-preview).
    """
    id: uuid.UUID
    title: str
    poster_image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    trailer_playback_url: Optional[str] = None


class SpecialCategoryOut(BaseModel):
    id: uuid.UUID
    title: str
    visible_from: date
    visible_to: date
    section: str
    is_disabled: bool
    video_count: int
    videos: List[SpecialCategoryVideoCardOut] = []

    model_config = {"from_attributes": True}


class LiveStreamCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    section: str = Field(default="play")


class LiveStreamUpdate(BaseModel):
    """Only theomy-side metadata is editable — never the Mux-linked
    fields (mux_live_stream_id/playback_id/stream_key), since those
    are tied to the actual Mux resource created at broadcast-creation
    time and can't be changed after the fact without creating a new
    Mux live stream entirely.
    """
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    section: Optional[str] = None


class LiveStreamOut(BaseModel):
    """Public-facing shape — never includes mux_stream_key. Only ever
    populated when the current viewer is logged in (see the "skip
    subscription-gating for now" decision in LiveStream's docstring).
    """
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    section: str
    poster_image_url: Optional[str] = None
    status: str
    playback_url: Optional[str] = None
    started_at: Optional[datetime] = None


class LiveStreamBroadcastInfoOut(BaseModel):
    """The owner-only shape — includes the RTMP details needed to
    actually go live. Never returned to anyone except the stream's own
    creator/admin, or a superadmin looking it up for support purposes.
    """
    id: uuid.UUID
    title: str
    status: str
    rtmp_url: str
    stream_key: str
    playback_url: str


class AdminCategoryCreate(BaseModel):
    """Admin creates a new Category sub-menu item. label and
    category_param are kept in sync (same value) so a category always
    matches exactly what shows in the nav dropdown AND what's offered
    as a checkbox on the video upload form.
    """
    label: str = Field(min_length=1, max_length=100)
    display_order: Optional[int] = None


class AdminCategoryUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=100)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class SubscriptionPlanOut(BaseModel):
    id: uuid.UUID
    name: str
    tagline: Optional[str] = None
    base_price: Decimal
    per_extra_screen: Decimal
    base_price_usd: Decimal
    per_extra_screen_usd: Decimal
    features: List[str]
    grants_play: bool
    grants_archive: bool
    highlighted: bool
    display_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class SubscriptionPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    tagline: Optional[str] = None
    base_price: Decimal = Field(ge=0)
    per_extra_screen: Decimal = Field(default=0, ge=0)
    base_price_usd: Decimal = Field(default=0, ge=0)
    per_extra_screen_usd: Decimal = Field(default=0, ge=0)
    features: List[str] = Field(default_factory=list)
    grants_play: bool = False
    grants_archive: bool = False
    highlighted: bool = False
    display_order: int = 0


class SubscriptionPlanUpdate(BaseModel):
    """All-optional — admin_plans.py only applies fields actually sent."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    tagline: Optional[str] = None
    base_price: Optional[Decimal] = Field(default=None, ge=0)
    per_extra_screen: Optional[Decimal] = Field(default=None, ge=0)
    base_price_usd: Optional[Decimal] = Field(default=None, ge=0)
    per_extra_screen_usd: Optional[Decimal] = Field(default=None, ge=0)
    features: Optional[List[str]] = None
    grants_play: Optional[bool] = None
    grants_archive: Optional[bool] = None
    highlighted: Optional[bool] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class SubscriptionDurationOut(BaseModel):
    id: uuid.UUID
    label: str
    months: int
    discount_percent: Decimal
    display_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class SubscriptionDurationCreate(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    months: int = Field(ge=1, le=60)
    discount_percent: Decimal = Field(default=0, ge=0, le=100)
    display_order: int = 0


class SubscriptionDurationUpdate(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=50)
    months: Optional[int] = Field(default=None, ge=1, le=60)
    discount_percent: Optional[Decimal] = Field(default=None, ge=0, le=100)
    display_order: Optional[int] = None
    is_active: Optional[bool] = None



class PaymentOut(BaseModel):
    id: uuid.UUID
    subscription_id: Optional[uuid.UUID] = None
    gateway: PaymentGateway
    gateway_payment_id: Optional[str] = None
    plan_name: str
    duration_label: str
    screens: int
    base_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    reward_points_used: int
    currency: str
    status: PaymentStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class TaxConfigOut(BaseModel):
    gst_percent: Decimal

    model_config = {"from_attributes": True}


class AdminSubscriptionTransactionOut(BaseModel):
    """One row per Payment (checkout attempt), joined with the customer
    and the resulting Subscription's current state — powers Admin >
    Subscription Management's "active, expired, completed, failed"
    filters. `bucket` is the friendly, filterable status:
    - "pending"   Payment.status == created (checkout not finished)
    - "failed"    Payment.status == failed
    - "active"    paid AND the linked subscription is currently active + unexpired
    - "expired"   paid AND the linked subscription has lapsed/been replaced
    """
    payment_id: uuid.UUID
    user_id: uuid.UUID
    customer_name: str
    customer_email: str
    plan_name: str
    duration_label: str
    screens: int
    total_amount: Decimal
    currency: str
    gateway: str
    gateway_order_id: Optional[str] = None
    gateway_payment_id: Optional[str] = None
    bucket: str
    subscription_expires_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaxConfigUpdate(BaseModel):
    gst_percent: Decimal = Field(ge=0, le=100)


class CreateOrderRequest(BaseModel):
    plan_name: str = Field(min_length=1, max_length=50)
    duration_label: str = Field(min_length=1, max_length=50)
    screens: int = Field(default=1, ge=1, le=10)
    reward_points_requested: int = Field(default=0, ge=0)


class CreateOrderResponse(BaseModel):
    payment_id: uuid.UUID
    razorpay_order_id: str
    razorpay_key_id: str
    base_amount: Decimal
    reward_points_used: int
    tax_amount: Decimal
    total_amount: Decimal
    currency: str
    plan_name: str
    duration_label: str
    screens: int


class VerifyPaymentRequest(BaseModel):
    payment_id: uuid.UUID
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class BlogListItemOut(BaseModel):
    id: uuid.UUID
    title: str
    excerpt: str
    author_name: str
    published_at: datetime
    cover_image_url: Optional[str] = None
    is_published: bool = True
    likes_count: int = 0
    liked_by_me: bool = False
    comment_count: int = 0

    model_config = {"from_attributes": True}


class BlogDetailOut(BaseModel):
    id: uuid.UUID
    title: str
    excerpt: str
    body: str
    author_name: str
    published_at: datetime
    cover_image_url: Optional[str] = None
    is_published: bool = True
    likes_count: int = 0
    liked_by_me: bool = False
    comment_count: int = 0

    model_config = {"from_attributes": True}


class BlogCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    excerpt: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1)
    author_name: str = Field(default="theomy Team", max_length=100)
    is_published: bool = True


class BlogUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    excerpt: Optional[str] = Field(default=None, min_length=1, max_length=500)
    body: Optional[str] = None
    author_name: Optional[str] = Field(default=None, max_length=100)
    is_published: Optional[bool] = None


class BlogCommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class BlogCommentUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class BlogCommentOut(BaseModel):
    id: uuid.UUID
    blog_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    user_name: str
    is_admin: bool = False
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BlogLikeToggleOut(BaseModel):
    liked: bool
    likes_count: int


class ReplyOut(BaseModel):
    id: uuid.UUID
    author_user_id: uuid.UUID
    author_name: str
    text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PostOut(BaseModel):
    id: uuid.UUID
    author_user_id: Optional[uuid.UUID] = None
    author_name: str
    is_admin: bool = False
    text: str
    image_url: Optional[str] = None
    likes_count: int
    liked_by_me: bool
    replies: List[ReplyOut]
    created_at: datetime


class RoomSummaryOut(BaseModel):
    id: uuid.UUID
    title: str
    created_by_name: str
    is_admin_created: bool = False
    post_count: int
    created_at: datetime


class RoomDetailOut(BaseModel):
    id: uuid.UUID
    title: str
    created_by_name: str
    is_admin_created: bool = False
    posts: List[PostOut]
    created_at: datetime


class RoomCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class PostCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ReplyCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class LikeToggleOut(BaseModel):
    liked: bool
    likes_count: int


class OrganiserOut(BaseModel):
    id: uuid.UUID
    name: str
    profile_photo_url: Optional[str] = None

    model_config = {"from_attributes": True}


class DonationCreateOrderRequest(BaseModel):
    organiser_user_id: uuid.UUID
    amount: Decimal = Field(gt=0)


class DonationCreateOrderResponse(BaseModel):
    donation_id: uuid.UUID
    razorpay_order_id: str
    razorpay_key_id: str
    amount: Decimal
    currency: str
    organiser_name: str


class DonationVerifyRequest(BaseModel):
    donation_id: uuid.UUID
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class DonationOut(BaseModel):
    id: uuid.UUID
    organiser_name: str
    amount: Decimal
    gateway: PaymentGateway
    status: PaymentStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class RevenueRateOut(BaseModel):
    rate_paisa_per_minute: int
    rate_rupees_per_minute: Decimal
    rate_display: str
    platform_commission_percent: Decimal

    model_config = {"from_attributes": True}


class RevenueSummaryOut(BaseModel):
    total_earned_rupees: Decimal
    available_balance_rupees: Decimal
    pending_withdrawals_rupees: Decimal


class WithdrawalRequestCreate(BaseModel):
    amount_rupees: Decimal = Field(gt=0)


class WithdrawalRequestOut(BaseModel):
    id: uuid.UUID
    amount_rupees: Decimal
    status: str
    admin_note: Optional[str] = None
    requested_at: datetime
    processed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}



class EventEnquiryAttachmentOut(BaseModel):
    id: uuid.UUID
    file_url: str
    original_filename: str

    model_config = {"from_attributes": True}


class TicketTierIn(BaseModel):
    tier_name: str = Field(min_length=1, max_length=100)
    price: Decimal = Field(gt=0)
    quantity: int = Field(gt=0)


class TicketTierOut(BaseModel):
    id: uuid.UUID
    tier_name: str
    price: Decimal
    quantity: int

    model_config = {"from_attributes": True}


class DonationRegistrationOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    group_name: str
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    document_url: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MyDonationRegistrationStatusOut(BaseModel):
    """What the "Register for Donation" link checks before showing
    itself — same hide-on-pending-or-approved rule as
    MyOrganiserRequestStatusOut. Also backs the status card shown on
    the Donation page itself, so an applied user can see where their
    registration stands without visiting the admin panel.
    """
    has_pending_or_approved: bool
    latest_status: Optional[str] = None
    rejection_reason: Optional[str] = None


class DonationRegistrationRejectRequest(BaseModel):
    reason: str = Field(min_length=1)


class OrganiserRequestCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    group_name: str = Field(min_length=1, max_length=255)
    phone: str = Field(min_length=1, max_length=20)
    email: str = Field(min_length=1, max_length=255)
    remarks: Optional[str] = None


class OrganiserRequestRejectRequest(BaseModel):
    reason: Optional[str] = None


class OrganiserRequestOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    subject: str
    group_name: str
    phone: str
    email: str
    remarks: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MyOrganiserRequestStatusOut(BaseModel):
    """What the profile dropdown checks to decide whether to show
    "Request as Organiser" at all — has_pending_or_approved covers
    both cases the link should hide for (a decision already approved,
    or one still awaiting review); it stays visible only when the
    latest request was rejected or none exists yet.
    """
    has_pending_or_approved: bool
    latest_status: Optional[str] = None


class EventEnquiryOut(BaseModel):
    id: uuid.UUID
    org_name: str
    org_about: Optional[str] = None
    contact_person: str
    contact_email: str
    contact_phone: str
    event_title: str
    event_category: str
    event_description: Optional[str] = None
    proposed_date: datetime
    proposed_time: Optional[str] = None
    venue: str
    poster_image_url: Optional[str] = None
    remarks: Optional[str] = None
    status: str
    admin_note: Optional[str] = None
    ticket_tiers: List[TicketTierOut]
    attachments: List[EventEnquiryAttachmentOut]
    created_at: datetime


class PublicEventListingOut(BaseModel):
    """The public-facing shape — deliberately excludes internal fields
    (submitted_by_user_id, admin_note, attachments, remarks, contact
    details) that aren't anyone else's business once an event is public.
    Used both for the shareable single-event link and the Ticketing
    page's listing.
    """
    id: uuid.UUID
    event_title: str
    event_category: str
    event_description: Optional[str] = None
    proposed_date: datetime
    proposed_time: Optional[str] = None
    venue: str
    poster_image_url: Optional[str] = None
    org_name: str
    ticket_tiers: List[TicketTierOut]


class SendOtpRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    purpose: str = Field(pattern="^(registration|login)$")


class VerifyOtpLoginRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    otp: str = Field(min_length=4, max_length=6)


class ExchangeRateOut(BaseModel):
    inr_per_usd: Decimal


class StripeCreateSessionRequest(BaseModel):
    plan_name: str = Field(min_length=1, max_length=50)
    duration_label: str = Field(min_length=1, max_length=50)
    screens: int = Field(default=1, ge=1, le=10)
    reward_points_requested: int = Field(default=0, ge=0)


class StripeCreateSessionResponse(BaseModel):
    payment_id: uuid.UUID
    checkout_url: str
    amount_usd: Decimal
    plan_name: str
    duration_label: str
    screens: int


class StripeConfirmRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=255)


class RewardConfigOut(BaseModel):
    subscription_reward_percent: Decimal
    ticket_reward_percent: Decimal


class WatchProgressUpdate(BaseModel):
    position_seconds: int = Field(ge=0)


class ContinueWatchingOut(BaseModel):
    video_id: uuid.UUID
    title: str
    poster_image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    trailer_playback_url: Optional[str] = None
    position_seconds: int
    duration_seconds: Optional[int] = None
    progress_percent: Optional[int] = None
    updated_at: datetime


class WatchHistoryOut(BaseModel):
    video_id: uuid.UUID
    title: str
    poster_image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    position_seconds: int
    duration_seconds: Optional[int] = None
    finished: bool
    updated_at: datetime


class WatchHeartbeatRequest(BaseModel):
    # Cumulative seconds watched in THIS single continuous play session —
    # resets to 0 whenever the player restarts (new page load / re-open),
    # never carried over between separate sessions. The backend only
    # ever credits revenue when this beats the viewer's previous best
    # for this video (see VideoWatchRecord).
    session_seconds: int = Field(ge=0)
    # Optional — when present, also refreshes this device's
    # PlaybackSession.last_heartbeat_at so the screens-limit check keeps
    # counting this device as active for as long as it keeps watching.
    playback_session_token: Optional[str] = Field(default=None, max_length=100)


class PlaybackSessionStartRequest(BaseModel):
    session_token: str = Field(min_length=1, max_length=100)


class PlaybackSessionStartResponse(BaseModel):
    allowed: bool
    active_screens: int
    max_screens: int
    reason: Optional[str] = None


class PlaybackSessionEndRequest(BaseModel):
    session_token: str = Field(min_length=1, max_length=100)


class WatchHeartbeatResponse(BaseModel):
    max_session_minutes: Decimal
    credited_this_call_rupees: Decimal
    total_creator_credited_rupees: Decimal


class ContentPerformanceOut(BaseModel):
    video_id: uuid.UUID
    title: str
    unique_viewers: int
    total_watch_minutes: Decimal
    gross_revenue_rupees: Decimal
    creator_earned_rupees: Decimal


class AdminRevenueConfigUpdate(BaseModel):
    rate_paisa_per_minute: int = Field(ge=0)
    platform_commission_percent: Decimal = Field(ge=0, le=100)


class RevenueByDayOut(BaseModel):
    date: str  # YYYY-MM-DD
    creator_earned_rupees: Decimal
    gross_revenue_rupees: Decimal


class RevenueByCountryOut(BaseModel):
    country: str
    viewer_count: int
    creator_earned_rupees: Decimal


class AdminRevenueSummaryOut(BaseModel):
    """Platform-wide KPI cards — the theomy equivalent of a "Revenue
    Summary" dashboard, built from real data (VideoWatchRecord,
    published Video count), not YouTube-style ad metrics that don't
    apply here (theomy hosts its own video, not on YouTube).
    """
    gross_revenue_rupees: Decimal
    platform_share_rupees: Decimal
    creator_share_rupees: Decimal
    total_watch_minutes: Decimal
    total_viewer_records: int  # count of distinct (viewer, video) pairs with any watch time
    total_published_videos: int
    avg_revenue_per_1000_minutes_rupees: Decimal  # theomy's RPM-equivalent


class AdminRevenueByCreatorOut(BaseModel):
    """One row per creator — the "Revenue Share Report": gross revenue
    their content generated, theomy's cut, their cut, what's actually
    been paid out (WithdrawalRequest status='paid'), and what's earned
    but not yet paid.
    """
    creator_user_id: uuid.UUID
    creator_name: str
    creator_email: EmailStr
    gross_revenue_rupees: Decimal
    platform_share_rupees: Decimal
    creator_share_rupees: Decimal
    paid_rupees: Decimal
    pending_rupees: Decimal


class AdminContentPerformanceOut(BaseModel):
    video_id: uuid.UUID
    title: str
    creator_name: str
    unique_viewers: int
    total_watch_minutes: Decimal
    gross_revenue_rupees: Decimal
    creator_earned_rupees: Decimal


class AdminWithdrawalOut(BaseModel):
    id: uuid.UUID
    creator_user_id: uuid.UUID
    creator_name: str
    creator_email: EmailStr
    amount_rupees: Decimal
    status: str
    admin_note: Optional[str] = None
    requested_at: datetime
    processed_at: Optional[datetime] = None


class AdminWithdrawalActionRequest(BaseModel):
    admin_note: Optional[str] = Field(default=None, max_length=500)


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class AdminOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminOut


class AdminCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(superadmin|admin)$", default="admin")


class MyListItemIn(BaseModel):
    item_id: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=255)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    meta: Optional[str] = Field(default=None, max_length=255)
    section: Optional[str] = Field(default=None, max_length=100)


class MyListItemOut(BaseModel):
    id: uuid.UUID
    item_id: str
    title: str
    image_url: Optional[str] = None
    meta: Optional[str] = None
    section: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MyListToggleResponse(BaseModel):
    saved: bool


class VideoLikeToggleResponse(BaseModel):
    liked: bool
    likes_count: int


class VideoRevenueTierIn(BaseModel):
    min_minutes: int = Field(ge=1)
    max_minutes: Optional[int] = Field(default=None, ge=1)
    rate_per_minute_inr: Decimal = Field(gt=0)


class VideoRevenueTierOut(BaseModel):
    id: uuid.UUID
    min_minutes: int
    max_minutes: Optional[int] = None
    rate_per_minute_inr: Decimal

    model_config = {"from_attributes": True}


class VideoSubtitleOut(BaseModel):
    id: uuid.UUID
    language_code: str
    language_label: str
    url: str  # GET /videos/{video_id}/subtitles/{language_code}.vtt

    model_config = {"from_attributes": True}


class PersonOut(BaseModel):
    id: uuid.UUID
    name: str
    photo_url: Optional[str] = None
    occupation: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    birthplace: Optional[str] = None
    about: Optional[str] = None
    early_life: Optional[str] = None
    personal_life: Optional[str] = None
    debut_initial_years: Optional[str] = None
    breakthrough_beyond: Optional[str] = None
    recent_projects: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PersonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    occupation: Optional[str] = Field(default=None, max_length=255)
    date_of_birth: Optional[datetime] = None
    birthplace: Optional[str] = Field(default=None, max_length=255)
    about: Optional[str] = None
    early_life: Optional[str] = None
    personal_life: Optional[str] = None
    debut_initial_years: Optional[str] = None
    breakthrough_beyond: Optional[str] = None
    recent_projects: Optional[str] = None


class PersonUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    occupation: Optional[str] = Field(default=None, max_length=255)
    date_of_birth: Optional[datetime] = None
    birthplace: Optional[str] = Field(default=None, max_length=255)
    about: Optional[str] = None
    early_life: Optional[str] = None
    personal_life: Optional[str] = None
    debut_initial_years: Optional[str] = None
    breakthrough_beyond: Optional[str] = None
    recent_projects: Optional[str] = None


class VideoCastIn(BaseModel):
    # person_id, when provided and matching an existing cast member on
    # this same video, tells the backend to UPDATE that Person's fields
    # in place rather than delete-and-recreate — critical for edits,
    # since recreating would wipe photo_url every time, even for an edit
    # that never touched cast/crew at all. Creation always sends None
    # here (there's nothing existing yet to match against).
    person_id: Optional[uuid.UUID] = None
    name: str = Field(min_length=1, max_length=255)
    character_role: Optional[str] = Field(default=None, max_length=255)
    occupation: Optional[str] = Field(default=None, max_length=255)
    date_of_birth: Optional[datetime] = None
    birthplace: Optional[str] = Field(default=None, max_length=255)
    about: Optional[str] = None
    early_life: Optional[str] = None
    personal_life: Optional[str] = None
    debut_initial_years: Optional[str] = None
    breakthrough_beyond: Optional[str] = None
    recent_projects: Optional[str] = None


class VideoCastOut(BaseModel):
    id: uuid.UUID
    person: PersonOut
    character_role: Optional[str] = None


class VideoCrewIn(BaseModel):
    person_id: Optional[uuid.UUID] = None
    role: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    occupation: Optional[str] = Field(default=None, max_length=255)
    date_of_birth: Optional[datetime] = None
    birthplace: Optional[str] = Field(default=None, max_length=255)
    about: Optional[str] = None
    early_life: Optional[str] = None
    personal_life: Optional[str] = None
    debut_initial_years: Optional[str] = None
    breakthrough_beyond: Optional[str] = None
    recent_projects: Optional[str] = None


class VideoCrewOut(BaseModel):
    id: uuid.UUID
    role: str
    person: PersonOut


class VideoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    section: str = Field(pattern="^(play|archive)$")
    categories: List[str] = Field(min_length=1, max_length=3)
    release_year: int = Field(ge=1900, le=2100)
    age_rating: str = Field(pattern="^(U|UA7\\+|UA13\\+|UA16\\+|A)$")
    languages: Optional[List[str]] = None
    has_ads: bool = True
    monetization_type: str = Field(pattern="^(subscription_only|pay_per_video)$", default="subscription_only")
    price_inr: Optional[Decimal] = Field(default=None, gt=0)
    price_usd: Optional[Decimal] = Field(default=None, gt=0)
    revenue_tiers: List[VideoRevenueTierIn] = Field(min_length=1, max_length=5)
    cast: List[VideoCastIn] = Field(default=[], max_length=10)
    crew: List[VideoCrewIn] = Field(default=[], max_length=5)


class VideoPricingOut(BaseModel):
    price_inr: Decimal
    price_usd: Decimal

    model_config = {"from_attributes": True}


class VideoOut(BaseModel):
    id: uuid.UUID
    uploaded_by_name: str
    title: str
    description: Optional[str] = None
    section: str
    categories: List[str]
    release_year: int
    age_rating: str
    languages: List[str]
    poster_image_url: Optional[str] = None
    duration_seconds: Optional[int] = None
    has_ads: bool
    monetization_type: str
    status: str
    admin_note: Optional[str] = None
    pricing: Optional[VideoPricingOut] = None
    revenue_tiers: List[VideoRevenueTierOut]
    cast: List[VideoCastOut]
    crew: List[VideoCrewOut]
    has_file: bool
    playback_url: Optional[str] = None
    embed_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    # Never access-gated (unlike playback_url/embed_url above) — a
    # trailer is meant to be freely watchable to entice a subscription/
    # purchase, so this populates regardless of has_access.
    trailer_playback_url: Optional[str] = None
    # One entry per uploaded language — see VideoSubtitle model.
    subtitles: List[VideoSubtitleOut] = []
    created_at: datetime
    published_at: Optional[datetime] = None

    # Real, server-computed access gate — see routers/videos.py's
    # _check_video_access(). playback_url/embed_url above are only ever
    # populated when has_access is True; a viewer without access gets
    # every other field (poster, cast, description, etc.) so the detail
    # page still works as a preview, just with no way to actually stream.
    # access_reason lets the frontend show the right CTA without
    # re-deriving the logic: "login_required" | "subscription_required"
    # | "purchase_required" | None (None means access is already granted).
    has_access: bool = False
    access_reason: Optional[str] = None

    # Real, persisted engagement — see VideoLike/MyListItem models.
    # liked_by_me/in_my_list are only ever true for a logged-in viewer;
    # both default False for a logged-out or unauthenticated view.
    # in_my_list is looked up against the general MyListItem table
    # (item_id == this video's id), the same table every other section
    # of the site's "+" button already saves to.
    likes_count: int = 0
    liked_by_me: bool = False
    in_my_list: bool = False

    # The resume offset baked into embed_url's t= param above (0 if no
    # resume point, or the video is essentially finished). The frontend
    # needs this as a base to ADD to its own elapsed-since-play-pressed
    # counter when saving progress — otherwise a resumed session's
    # first heartbeat would overwrite position_seconds back down to a
    # small number instead of correctly continuing forward from where
    # playback actually resumed.
    resume_position_seconds: int = 0

    # Only populated when has_access is True AND the video's own
    # has_ads is True — empty otherwise (ad-free video, no access yet,
    # or logged out). The player's Google IMA SDK integration schedules
    # one ad request per entry: offset_seconds=0 is pre-roll, anything
    # higher is a mid-roll at that point in the content.
    ad_cue_points: list[PlayerAdCuePointOut] = []


class VideoPurchaseOut(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    amount: Decimal
    currency: str
    status: PaymentStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class VideoPurchaseDetailOut(BaseModel):
    """Same as VideoPurchaseOut but with the video's title/poster joined
    in — what the account page's "Pay-Per-Video" history tab actually
    needs to render a real entry per purchase, not just raw IDs.
    """
    id: uuid.UUID
    video_id: uuid.UUID
    video_title: str
    video_poster_url: Optional[str] = None
    amount: Decimal
    currency: str
    gateway: PaymentGateway
    gateway_payment_id: Optional[str] = None
    status: PaymentStatus
    created_at: datetime


class CreateVideoOrderResponse(BaseModel):
    purchase_id: uuid.UUID
    razorpay_order_id: str
    razorpay_key_id: str
    amount: Decimal
    currency: str
    video_title: str


class VerifyVideoPaymentRequest(BaseModel):
    purchase_id: uuid.UUID
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class AdminVideoRejectRequest(BaseModel):
    admin_note: str = Field(min_length=1, max_length=500)


class CreatorAccountOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    role: str

    model_config = {"from_attributes": True}


class AdminVideoCreate(VideoCreate):
    # If set, the video is attributed to this existing Content Creator or
    # Plays Organiser account instead of the admin who's adding it — for
    # cases like migrating a creator's back-catalog or helping a
    # less tech-savvy creator upload on their behalf. Must reference an
    # account with role content_creator or plays_organiser; validated
    # server-side, not just trusted from the request.
    attributed_user_id: Optional[uuid.UUID] = None


class EventEnquiryEdit(BaseModel):
    """Admin edit — same fields as submission, minus file attachments
    (attachment editing isn't built in this pass; still viewable/
    deletable, just not re-uploadable from the edit form).
    """
    org_name: str = Field(min_length=1, max_length=255)
    org_about: Optional[str] = None
    contact_person: str = Field(min_length=1, max_length=255)
    contact_email: str = Field(min_length=1, max_length=255)
    contact_phone: str = Field(min_length=1, max_length=20)
    event_title: str = Field(min_length=1, max_length=255)
    event_category: str = Field(min_length=1, max_length=100)
    event_description: Optional[str] = None
    proposed_date: datetime
    proposed_time: Optional[str] = None
    venue: str = Field(min_length=1, max_length=255)
    remarks: Optional[str] = None
    ticket_tiers: List[TicketTierIn] = Field(min_length=1)


class SubAccountCreate(BaseModel):
    """Created by an already-logged-in parent from Manage Profile — no
    OTP/phone step, unlike the main UserRegister flow, since the parent
    is already a verified account vouching for this one.
    """
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class SubAccountOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MySubAccountsOut(BaseModel):
    """Powers the parent's Manage Profile "Family Accounts" section —
    max_allowed is (their active subscription's screens - 1); 0 for a
    sub-account itself (no nested chains) or a parent with no
    multi-screen plan.
    """
    max_allowed: int
    sub_accounts: List[SubAccountOut]


class MyParentOut(BaseModel):
    """What a sub-account's OWN Manage Profile checks to show "Managed
    by <parent>" instead of the family-accounts section.
    """
    has_parent: bool
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None


class AdminDashboardOut(BaseModel):
    """Admin's landing page KPI cards. "Bookings/ticket sales" aren't
    included — there's no purchase-tracking model for event tickets
    yet (only EventTicketTier, which defines prices, not actual
    purchases), same gap flagged for Customer Management earlier.
    """
    total_customers: int
    active_customers: int
    active_subscriptions: int
    expired_subscriptions: int
    published_videos: int
    pending_review_videos: int
    approved_events: int
    pending_enquiries: int
    total_transactions: int
    total_revenue_rupees: Decimal


class PageHeroMediaOut(BaseModel):
    id: uuid.UUID
    media_url: str
    display_order: int

    model_config = {"from_attributes": True}


class PageHeroOut(BaseModel):
    page_key: str
    content_type: str
    media: List[PageHeroMediaOut] = []
    eyebrow: Optional[str] = None
    headline: str
    subtext: Optional[str] = None

    model_config = {"from_attributes": True}


class TheaterHeroSlideOut(BaseModel):
    id: uuid.UUID
    image_url: str
    category: Optional[str] = None
    venue: Optional[str] = None
    title: str
    synopsis: Optional[str] = None
    display_order: int

    model_config = {"from_attributes": True}


class TheaterHeroSlideTextUpdate(BaseModel):
    category: Optional[str] = None
    venue: Optional[str] = None
    title: str = Field(min_length=1, max_length=255)
    synopsis: Optional[str] = None


class ArchiveHeroSlideOut(BaseModel):
    id: uuid.UUID
    image_url: str
    eyebrow: Optional[str] = None
    headline: str
    subtext: Optional[str] = None
    display_order: int

    model_config = {"from_attributes": True}


class ArchiveHeroSlideTextUpdate(BaseModel):
    eyebrow: Optional[str] = None
    headline: str = Field(min_length=1, max_length=255)
    subtext: Optional[str] = None


class SitePageOut(BaseModel):
    slug: str
    title: str
    content: str

    model_config = {"from_attributes": True}


class SitePageUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = ""


class FaqItemOut(BaseModel):
    id: uuid.UUID
    question: str
    answer: str
    display_order: int

    model_config = {"from_attributes": True}


class FaqItemCreate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)


class FaqItemUpdate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1)
