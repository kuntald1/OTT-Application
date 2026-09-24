import os
import types
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

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
from app.models import EmailOtpVerification, OtpPurpose, OtpVerification, User, UserDemographics
from app.routers import auth, otp


class _TolerantUUID(TypeDecorator):
    """Test-database shim only (see test_family.py): lets SQLite accept UUIDs
    given as strings, the way PostgreSQL+psycopg2 does in production."""
    impl = CHAR(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else uuid.UUID(str(value)).hex

    def process_result_value(self, value, dialect):
        return None if value is None else uuid.UUID(value)


TABLES = (User.__table__, UserDemographics.__table__, EmailOtpVerification.__table__, OtpVerification.__table__)
for _table in TABLES:
    for _col in _table.columns:
        if type(_col.type).__name__ in ("UUID", "Uuid"):
            _col.type = _TolerantUUID()

ADULT_DOB = date(2000, 1, 1)


@pytest.fixture()
def world():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for t in TABLES:
        t.create(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    app = FastAPI()
    app.include_router(auth.router, prefix="/api")
    app.include_router(otp.router, prefix="/api")

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = _db

    db = Session()
    w = types.SimpleNamespace(db=db)
    w.client = TestClient(app, raise_server_exceptions=False)

    def latest_otp(email):
        db.expire_all()
        return (
            db.query(EmailOtpVerification)
            .filter(EmailOtpVerification.email == email)
            .order_by(EmailOtpVerification.created_at.desc())
            .first()
        )
    w.latest_otp = latest_otp

    def register(**overrides):
        body = {
            "name": "Test User", "email": "reguser@x.com", "password": "pw-12345678",
            "country": "India", "phone": "+911111100000",
            "date_of_birth": ADULT_DOB.isoformat(), "city": "Kolkata",
        }
        body.update(overrides)
        return w.client.post("/api/auth/register", json=body)
    w.register = register

    yield w
    db.close()


def send_email_otp(world, email="reguser@x.com", mock_send=None):
    target = "app.routers.otp.send_registration_otp_email"
    with patch(target, mock_send or (lambda *a, **k: None)):
        return world.client.post("/api/auth/otp/send-email", json={"email": email, "purpose": "registration"})


# --------------------------------------------------------------- sending
def test_send_email_otp_creates_a_row_and_emails_the_code(world):
    captured = {}
    def fake_send(to_email, otp_code, expire_minutes):
        captured["to"], captured["code"], captured["mins"] = to_email, otp_code, expire_minutes
    r = send_email_otp(world, email="new@x.com", mock_send=fake_send)
    assert r.status_code == 200, r.text

    row = world.latest_otp("new@x.com")
    assert row is not None
    assert row.purpose == OtpPurpose.registration and row.is_verified is False
    assert captured["to"] == "new@x.com"
    assert row.otp_code == captured["code"]  # the emailed code IS the stored code
    assert len(captured["code"]) == 6 and captured["code"].isdigit()


def test_send_email_otp_rejects_non_registration_purpose(world):
    r = world.client.post("/api/auth/otp/send-email", json={"email": "x@x.com", "purpose": "login"})
    assert r.status_code == 422  # only "registration" is accepted for email OTP


def test_send_email_otp_failure_returns_502_and_does_not_pretend_success(world):
    def boom(*a, **k):
        raise RuntimeError("smtp down")
    r = send_email_otp(world, email="fail@x.com", mock_send=boom)
    assert r.status_code == 502


def test_a_second_send_creates_a_new_row_and_lookup_uses_the_newest(world):
    send_email_otp(world, email="dup@x.com")
    first = world.latest_otp("dup@x.com")
    send_email_otp(world, email="dup@x.com")
    second = world.latest_otp("dup@x.com")
    assert second.id != first.id
    # the registration flow only ever checks the newest unverified row for THIS email
    r = world.register(email="dup@x.com", phone="+911111100099", otp=first.otp_code)
    assert r.status_code == 400  # the OLD code no longer matches the newest row
    r2 = world.register(email="dup@x.com", phone="+911111100099", otp=second.otp_code)
    assert r2.status_code == 201, r2.text


# --------------------------------------------------------------- registration
def test_registration_still_requires_phone_for_india_but_it_is_not_verified(world):
    r = world.register(phone=None)
    assert r.status_code == 400 and r.json()["detail"] == "Phone number is required for India."


def test_registration_requires_an_email_otp_for_india(world):
    r = world.register(otp=None)
    assert r.status_code == 400 and r.json()["detail"] == "Email verification code is required for India."


def test_registration_succeeds_with_a_correct_email_otp_and_unverified_phone(world):
    send_email_otp(world, email="reguser@x.com")
    code = world.latest_otp("reguser@x.com").otp_code
    r = world.register(otp=code)
    assert r.status_code == 201, r.text
    user = world.db.query(User).filter(User.email == "reguser@x.com").first()
    assert user is not None and user.phone == "+911111100000"
    # the phone itself was never checked against any OTP table — it's just stored
    assert world.db.query(EmailOtpVerification).filter(EmailOtpVerification.email == "reguser@x.com").first().otp_code == code


def test_wrong_email_otp_is_rejected(world):
    send_email_otp(world, email="reguser@x.com")
    r = world.register(otp="000000")
    assert r.status_code == 400 and r.json()["detail"] == "Invalid or expired verification code."
    assert world.db.query(User).filter(User.email == "reguser@x.com").first() is None


def test_no_otp_ever_sent_is_rejected(world):
    r = world.register(otp="123456")
    assert r.status_code == 400 and r.json()["detail"] == "Invalid or expired verification code."


def test_expired_email_otp_is_rejected(world):
    send_email_otp(world, email="reguser@x.com")
    row = world.latest_otp("reguser@x.com")
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    world.db.commit()
    r = world.register(otp=row.otp_code)
    assert r.status_code == 400 and r.json()["detail"] == "Invalid or expired verification code."


def test_five_wrong_attempts_locks_out_further_tries_even_the_correct_code(world):
    send_email_otp(world, email="reguser@x.com")
    code = world.latest_otp("reguser@x.com").otp_code
    for _ in range(5):
        r = world.register(otp="000000")
        assert r.status_code == 400
    r = world.register(otp=code)  # correct code, but attempts exhausted
    assert r.status_code == 400 and r.json()["detail"] == "Too many attempts. Please request a new code."


def test_otp_is_single_use(world):
    send_email_otp(world, email="reguser@x.com")
    row = world.latest_otp("reguser@x.com")
    code = row.otp_code
    r1 = world.register(otp=code)
    assert r1.status_code == 201, r1.text
    assert world.latest_otp("reguser@x.com").is_verified is True
    # A second registration attempt for the SAME email is blocked by the
    # "email already exists" check before the OTP is even looked at — the
    # real single-use guarantee is the is_verified flip asserted above: the
    # lookup (filtered on is_verified == False) can never find this row
    # again, for this email or, since the code itself was only ever issued
    # for "reguser@x.com", for any other email either:
    r2 = world.register(email="another@x.com", phone="+911111100077", otp=code)
    assert r2.status_code == 400


def test_email_otp_is_scoped_to_its_own_email_not_reusable_for_another(world):
    send_email_otp(world, email="owner@x.com")
    code = world.latest_otp("owner@x.com").otp_code
    r = world.register(email="different@x.com", phone="+911111100003", otp=code)
    assert r.status_code == 400  # no EmailOtpVerification row for "different@x.com"


def test_non_india_registration_needs_neither_phone_nor_otp(world):
    r = world.register(country="USA", phone=None, otp=None, city=None, email="us@x.com")
    assert r.status_code == 201, r.text


def test_registration_no_longer_touches_the_phone_otp_table_at_all(world):
    # OtpVerification (the old phone/WhatsApp table) must stay completely
    # unused by registration now — only EmailOtpVerification is written to.
    from app.models import OtpVerification  # noqa: F811 (kept local for clarity at the assertion)
    send_email_otp(world, email="reguser@x.com")
    code = world.latest_otp("reguser@x.com").otp_code
    world.register(otp=code)
    assert world.db.query(OtpVerification).count() == 0
