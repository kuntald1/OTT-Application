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
    role: UserRole
    auth_provider: str
    profile_photo_url: Optional[str] = None
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
    author_name: str
    text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PostOut(BaseModel):
    id: uuid.UUID
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
