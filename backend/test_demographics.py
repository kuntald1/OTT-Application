import os
import uuid
from datetime import date, datetime, timedelta, timezone

os.environ.setdefault("DB_PASSWORD", "x")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import CHAR, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

from app.database import get_db
from app.models import AuthProvider, EmailOtpVerification, OtpPurpose, OtpVerification, Subscription, User, UserDemographics, UserRole
from app.routers import auth, sub_accounts
from app.security import create_access_token, hash_password


class _TolerantUUID(TypeDecorator):
    """Test-database shim only (see test_family.py): lets SQLite accept UUIDs
    given as strings, the way PostgreSQL+psycopg2 does in production."""
    impl = CHAR(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else uuid.UUID(str(value)).hex

    def process_result_value(self, value, dialect):
        return None if value is None else uuid.UUID(value)


TABLES = (User.__table__, UserDemographics.__table__, OtpVerification.__table__, EmailOtpVerification.__table__, Subscription.__table__)
for _table in TABLES:
    for _col in _table.columns:
        if type(_col.type).__name__ in ("UUID", "Uuid"):
            _col.type = _TolerantUUID()

TODAY = date(2026, 9, 24)  # matches "today" used throughout this conversation
ADULT_DOB = date(2000, 1, 1)          # 26 on TODAY
UNDER_18_DOB = date(2010, 1, 1)       # 16 on TODAY
EXACTLY_18_DOB = date(2008, 9, 24)    # 18th birthday is TODAY
ONE_DAY_SHORT_OF_18 = date(2008, 9, 25)  # turns 18 tomorrow


@pytest.fixture()
def world():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for t in TABLES:
        t.create(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    app = FastAPI()
    app.include_router(auth.router, prefix="/api")
    app.include_router(sub_accounts.router, prefix="/api")

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = _db

    db = Session()

    def mk(name, email, parent=None, country="India"):
        u = User(name=name, email=email, hashed_password=hash_password("pw-12345678"),
                  auth_provider=AuthProvider.local, role=UserRole.user, country=country,
                  parent_id=parent.id if parent else None)
        db.add(u); db.commit(); db.refresh(u)
        if parent is None:
            # A generous plan so this account can create sub-accounts in
            # tests below — the plan itself isn't what these tests check.
            db.add(Subscription(user_id=u.id, plan_name="Both", duration_label="1 Month", screens=9,
                                 price=999, is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(days=30)))
            db.commit()
        return u

    import types
    w = types.SimpleNamespace(db=db)
    w.client = TestClient(app, raise_server_exceptions=False)
    w.h = lambda u: {"Authorization": f"Bearer {create_access_token(str(u.id))}"}
    w.mk = mk

    def demo(user):
        db.expire_all()
        return db.query(UserDemographics).filter(UserDemographics.user_id == user.id).first()
    w.demo = demo

    def register(**overrides):
        # Default country is USA on purpose: registration for India also
        # requires a verified phone OTP (a separate, already-tested rule),
        # which would otherwise obscure what THESE tests check. India-specific
        # behaviour is covered explicitly by register_india() below.
        body = {
            "name": "Test User", "email": "new@x.com", "password": "pw-12345678",
            "country": "USA", "date_of_birth": ADULT_DOB.isoformat(),
        }
        body.update(overrides)
        return w.client.post("/api/auth/register", json=body)
    w.register = register

    def register_india(phone, **overrides):
        # India registration is verified by EMAIL OTP now (Admin decision,
        # Sept 2026 — replaced the old WhatsApp/phone OTP; phone is still a
        # required plain field, just no longer itself verified). The row
        # must be keyed to whichever email ends up in the request body.
        email = overrides.get("email", "newindia@x.com")
        otp = EmailOtpVerification(
            email=email, otp_code="123456", purpose=OtpPurpose.registration,
            is_verified=False, expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        )
        db.add(otp); db.commit()
        body = {
            "name": "Test User", "email": email, "password": "pw-12345678",
            "country": "India", "phone": phone, "otp": "123456",
            "date_of_birth": ADULT_DOB.isoformat(), "city": "Kolkata",
        }
        body.update(overrides)
        return w.client.post("/api/auth/register", json=body)
    w.register_india = register_india

    yield w
    db.close()


# ------------------------------------------------------------------ registration
def test_registration_requires_date_of_birth(world):
    r = world.register(date_of_birth=None)
    assert r.status_code == 422  # missing/None on a required field


def test_registration_rejects_under_18(world):
    r = world.register(date_of_birth=UNDER_18_DOB.isoformat(), email="minor@x.com")
    assert r.status_code == 400
    assert "18" in r.json()["detail"]
    assert world.db.query(User).filter(User.email == "minor@x.com").first() is None  # nothing created


def test_registration_accepts_exactly_18_today(world):
    r = world.register(date_of_birth=EXACTLY_18_DOB.isoformat(), email="turns18today@x.com")
    assert r.status_code == 201, r.text


def test_registration_rejects_one_day_short_of_18(world):
    r = world.register(date_of_birth=ONE_DAY_SHORT_OF_18.isoformat(), email="almost18@x.com")
    assert r.status_code == 400


def test_registration_rejects_future_date_of_birth(world):
    future = (TODAY + timedelta(days=1)).isoformat()
    r = world.register(date_of_birth=future, email="future@x.com")
    assert r.status_code == 400 and "future" in r.json()["detail"]


def test_registration_requires_city_for_india(world):
    r = world.register_india(phone="+911111100001", city=None, email="nocity@x.com")
    assert r.status_code == 400 and r.json()["detail"] == "City is required."


def test_registration_does_not_require_city_outside_india(world):
    r = world.register(country="USA", city=None, email="us@x.com")
    assert r.status_code == 201, r.text
    user = world.db.query(User).filter(User.email == "us@x.com").first()
    assert world.demo(user).city is None


def test_registration_ignores_city_typed_for_a_non_india_country(world):
    # Even if the client somehow sends a city for a non-India account, it is
    # not stored — city is India-only by the confirmed decision.
    r = world.register(country="USA", city="Springfield", email="us2@x.com")
    assert r.status_code == 201
    user = world.db.query(User).filter(User.email == "us2@x.com").first()
    assert world.demo(user).city is None


def test_successful_registration_creates_a_demographics_row_not_a_declared_minor(world):
    r = world.register_india(phone="+911111100002", email="ok@x.com", gender="female")
    assert r.status_code == 201, r.text
    user = world.db.query(User).filter(User.email == "ok@x.com").first()
    row = world.demo(user)
    assert row is not None
    assert (row.date_of_birth, row.city, row.gender, row.is_declared_minor) == (ADULT_DOB, "Kolkata", "female", False)


def test_gender_is_optional_and_normalized(world):
    r = world.register(email="g1@x.com", gender="FEMALE")
    assert r.status_code == 201
    assert world.demo(world.db.query(User).filter(User.email == "g1@x.com").first()).gender == "female"

    r2 = world.register(email="g2@x.com")  # gender omitted entirely
    assert r2.status_code == 201
    assert world.demo(world.db.query(User).filter(User.email == "g2@x.com").first()).gender is None


def test_invalid_gender_rejected(world):
    r = world.register(email="badgender@x.com", gender="robot")
    assert r.status_code == 422


# ---------------------------------------------------------------- sub-accounts
def test_sub_account_creation_requires_is_minor_field(world):
    parent = world.mk("Parent", "parent@x.com")
    r = world.client.post("/api/sub-accounts", json={"name": "Kid", "email": "kid@x.com", "password": "pw-12345678"}, headers=world.h(parent))
    assert r.status_code == 422  # is_minor omitted entirely


def test_declared_minor_sub_account_gets_a_row_with_no_dob_ever(world):
    parent = world.mk("Parent", "parent2@x.com")
    r = world.client.post("/api/sub-accounts", json={"name": "Kid", "email": "kid2@x.com", "password": "pw-12345678", "is_minor": True}, headers=world.h(parent))
    assert r.status_code == 201, r.text
    assert r.json()["is_minor"] is True
    child = world.db.query(User).filter(User.email == "kid2@x.com").first()
    row = world.demo(child)
    assert row is not None
    assert (row.is_declared_minor, row.date_of_birth, row.city) == (True, None, None)


def test_declared_adult_sub_account_gets_a_row_awaiting_self_completion(world):
    parent = world.mk("Parent", "parent3@x.com")
    r = world.client.post("/api/sub-accounts", json={"name": "Adult Kid", "email": "adultkid@x.com", "password": "pw-12345678", "is_minor": False}, headers=world.h(parent))
    assert r.status_code == 201, r.text
    assert r.json()["is_minor"] is False
    child = world.db.query(User).filter(User.email == "adultkid@x.com").first()
    row = world.demo(child)
    assert (row.is_declared_minor, row.date_of_birth) == (False, None)


def test_my_sub_accounts_reports_is_minor_per_child(world):
    parent = world.mk("Parent", "parent4@x.com")
    world.client.post("/api/sub-accounts", json={"name": "A", "email": "a@x.com", "password": "pw-12345678", "is_minor": True}, headers=world.h(parent))
    world.client.post("/api/sub-accounts", json={"name": "B", "email": "b@x.com", "password": "pw-12345678", "is_minor": False}, headers=world.h(parent))
    r = world.client.get("/api/sub-accounts/mine", headers=world.h(parent))
    assert r.status_code == 200
    by_name = {a["name"]: a["is_minor"] for a in r.json()["sub_accounts"]}
    assert by_name == {"A": True, "B": False}


def test_pre_existing_sub_account_with_no_row_defaults_to_minor_in_the_list(world):
    parent = world.mk("Parent", "parent5@x.com")
    legacy_child = world.mk("Legacy Kid", "legacy@x.com", parent=parent)  # created directly, bypassing the API — no UserDemographics row
    r = world.client.get("/api/sub-accounts/mine", headers=world.h(parent))
    assert {a["name"]: a["is_minor"] for a in r.json()["sub_accounts"]} == {"Legacy Kid": True}


# --------------------------------------------------------- demographics status
def test_status_after_successful_registration_needs_no_profile(world):
    world.register_india(phone="+911111100003", email="done@x.com")
    user = world.db.query(User).filter(User.email == "done@x.com").first()
    r = world.client.get("/api/auth/me/demographics-status", headers=world.h(user))
    body = r.json()
    assert body["needs_profile"] is False
    assert body["is_declared_minor"] is False
    assert body["city"] == "Kolkata"


def test_status_for_legacy_main_account_with_no_row_needs_profile(world):
    legacy = world.mk("Legacy", "oldmain@x.com")   # bypasses registration entirely — no row
    r = world.client.get("/api/auth/me/demographics-status", headers=world.h(legacy))
    body = r.json()
    assert body["needs_profile"] is True and body["is_declared_minor"] is False


def test_status_for_declared_minor_sub_account_never_needs_profile(world):
    parent = world.mk("Parent", "parent6@x.com")
    world.client.post("/api/sub-accounts", json={"name": "Kid", "email": "kid6@x.com", "password": "pw-12345678", "is_minor": True}, headers=world.h(parent))
    child = world.db.query(User).filter(User.email == "kid6@x.com").first()
    r = world.client.get("/api/auth/me/demographics-status", headers=world.h(child))
    assert r.json() == {"needs_profile": False, "is_declared_minor": True, "date_of_birth": None, "city": None, "gender": None}


def test_status_for_declared_adult_sub_account_needs_profile_until_completed(world):
    parent = world.mk("Parent", "parent7@x.com")
    world.client.post("/api/sub-accounts", json={"name": "Adult Kid", "email": "adultkid7@x.com", "password": "pw-12345678", "is_minor": False}, headers=world.h(parent))
    child = world.db.query(User).filter(User.email == "adultkid7@x.com").first()
    r = world.client.get("/api/auth/me/demographics-status", headers=world.h(child))
    assert r.json()["needs_profile"] is True and r.json()["is_declared_minor"] is False


def test_status_requires_login(world):
    assert world.client.get("/api/auth/me/demographics-status").status_code == 401


# -------------------------------------------------------------- self-completion
def test_adult_sub_account_completes_its_own_profile(world):
    parent = world.mk("Parent", "parent8@x.com")
    world.client.post("/api/sub-accounts", json={"name": "Adult Kid", "email": "adultkid8@x.com", "password": "pw-12345678", "is_minor": False}, headers=world.h(parent))
    child = world.db.query(User).filter(User.email == "adultkid8@x.com").first()

    r = world.client.put("/api/auth/me/demographics", json={"date_of_birth": ADULT_DOB.isoformat(), "city": "Howrah", "gender": "male"}, headers=world.h(child))
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["needs_profile"], body["city"], body["gender"]) == (False, "Howrah", "male")

    row = world.demo(child)
    assert (row.date_of_birth, row.city, row.gender, row.is_declared_minor) == (ADULT_DOB, "Howrah", "male", False)


def test_declared_minor_sub_account_can_never_complete_a_profile(world):
    parent = world.mk("Parent", "parent9@x.com")
    world.client.post("/api/sub-accounts", json={"name": "Kid", "email": "kid9@x.com", "password": "pw-12345678", "is_minor": True}, headers=world.h(parent))
    child = world.db.query(User).filter(User.email == "kid9@x.com").first()

    r = world.client.put("/api/auth/me/demographics", json={"date_of_birth": ADULT_DOB.isoformat(), "city": "Kolkata"}, headers=world.h(child))
    assert r.status_code == 403
    assert world.demo(child).date_of_birth is None  # unchanged


def test_self_completion_rejects_under_18_with_a_pointer_to_the_minor_flow(world):
    parent = world.mk("Parent", "parent10@x.com")
    world.client.post("/api/sub-accounts", json={"name": "Adult Kid", "email": "adultkid10@x.com", "password": "pw-12345678", "is_minor": False}, headers=world.h(parent))
    child = world.db.query(User).filter(User.email == "adultkid10@x.com").first()

    r = world.client.put("/api/auth/me/demographics", json={"date_of_birth": UNDER_18_DOB.isoformat(), "city": "Kolkata"}, headers=world.h(child))
    assert r.status_code == 400
    assert "family account for a minor" in r.json()["detail"]
    assert world.demo(child).date_of_birth is None  # rejected, nothing saved


def test_self_completion_requires_city_for_india_account(world):
    legacy = world.mk("Legacy", "oldmain2@x.com", country="India")
    r = world.client.put("/api/auth/me/demographics", json={"date_of_birth": ADULT_DOB.isoformat()}, headers=world.h(legacy))
    assert r.status_code == 400 and r.json()["detail"] == "City is required."


def test_self_completion_ignores_city_for_non_india_account(world):
    legacy = world.mk("Legacy", "oldmain3@x.com", country="USA")
    r = world.client.put("/api/auth/me/demographics", json={"date_of_birth": ADULT_DOB.isoformat(), "city": "Springfield"}, headers=world.h(legacy))
    assert r.status_code == 200
    assert world.demo(legacy).city is None


def test_legacy_main_account_can_complete_its_own_profile(world):
    legacy = world.mk("Legacy", "oldmain4@x.com")
    r = world.client.put("/api/auth/me/demographics", json={"date_of_birth": ADULT_DOB.isoformat(), "city": "Kolkata"}, headers=world.h(legacy))
    assert r.status_code == 200
    status = world.client.get("/api/auth/me/demographics-status", headers=world.h(legacy)).json()
    assert status["needs_profile"] is False


def test_self_completion_can_update_an_already_completed_profile(world):
    user = world.mk("Legacy India User", "update@x.com", country="India")
    r = world.client.put("/api/auth/me/demographics", json={"date_of_birth": ADULT_DOB.isoformat(), "city": "Delhi", "gender": "male"}, headers=world.h(user))
    assert r.status_code == 200 and r.json()["city"] == "Delhi"


def test_self_completion_requires_login(world):
    assert world.client.put("/api/auth/me/demographics", json={"date_of_birth": ADULT_DOB.isoformat()}).status_code == 401
