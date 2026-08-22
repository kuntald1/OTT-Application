import uuid
from datetime import datetime
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


class TicketOut(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    description: Optional[str] = None
    status: TicketStatus
    created_at: datetime

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}


class SubscriptionPlanOut(BaseModel):
    id: uuid.UUID
    name: str
    tagline: Optional[str] = None
    base_price: Decimal
    per_extra_screen: Decimal
    base_price_usd: Decimal
    per_extra_screen_usd: Decimal
    features: List[str]
    highlighted: bool
    display_order: int

    model_config = {"from_attributes": True}



class PaymentOut(BaseModel):
    id: uuid.UUID
    gateway: PaymentGateway
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

    model_config = {"from_attributes": True}


class BlogDetailOut(BaseModel):
    id: uuid.UUID
    title: str
    excerpt: str
    body: str
    author_name: str
    published_at: datetime

    model_config = {"from_attributes": True}


class ReplyOut(BaseModel):
    id: uuid.UUID
    author_user_id: uuid.UUID
    author_name: str
    text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PostOut(BaseModel):
    id: uuid.UUID
    author_user_id: uuid.UUID
    author_name: str
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
    post_count: int
    created_at: datetime


class RoomDetailOut(BaseModel):
    id: uuid.UUID
    title: str
    created_by_name: str
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
    remarks: Optional[str] = None
    status: str
    admin_note: Optional[str] = None
    ticket_tiers: List[TicketTierOut]
    attachments: List[EventEnquiryAttachmentOut]
    created_at: datetime


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


class VideoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    section: str = Field(pattern="^(play|archive)$")
    category: str = Field(min_length=1, max_length=100)
    has_ads: bool = True
    monetization_type: str = Field(pattern="^(subscription_only|pay_per_video)$", default="subscription_only")
    price_inr: Optional[Decimal] = Field(default=None, gt=0)
    price_usd: Optional[Decimal] = Field(default=None, gt=0)
    revenue_tiers: List[VideoRevenueTierIn] = Field(min_length=1, max_length=5)


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
    category: str
    has_ads: bool
    monetization_type: str
    status: str
    admin_note: Optional[str] = None
    pricing: Optional[VideoPricingOut] = None
    revenue_tiers: List[VideoRevenueTierOut]
    has_file: bool
    playback_url: Optional[str] = None
    embed_url: Optional[str] = None
    created_at: datetime
    published_at: Optional[datetime] = None


class AdminVideoRejectRequest(BaseModel):
    admin_note: str = Field(min_length=1, max_length=500)
