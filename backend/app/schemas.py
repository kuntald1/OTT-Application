import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import UserRole, TicketStatus


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

