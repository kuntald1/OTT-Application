"""The reminder sent a few days BEFORE an auto-renew charge.

The thing that can go wrong here is not that the message is ugly — it is
that the job polls, so a customer three days from a charge could be told
every hour until it happens. That, and telling the wrong people: someone
who already cancelled, or someone whose charge is months away.

So these tests are mostly about who gets it, once.
"""

import os
import types
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DB_PASSWORD", "x")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

import pytest
from sqlalchemy import CHAR, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator
from sqlalchemy.dialects.postgresql import ARRAY as PGARRAY, JSONB
from sqlalchemy.ext.compiler import compiles

from app import scheduler
from app.models import (
    AuthProvider, AutopayRenewalReminder, AutopaySubscription, Base,
    Subscription, User, UserRole,
)


@compiles(JSONB, "sqlite")
def _jsonb_as_json_on_sqlite(_type, _compiler, **_kw):
    return "JSON"


@compiles(PGARRAY, "sqlite")
def _array_as_json_on_sqlite(_type, _compiler, **_kw):
    return "JSON"


class _TolerantUUID(TypeDecorator):
    """Test-database shim only (see test_family.py)."""
    impl = CHAR(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else uuid.UUID(str(value)).hex

    def process_result_value(self, value, dialect):
        return None if value is None else uuid.UUID(value)


for _table in Base.metadata.tables.values():
    for _col in _table.columns:
        if type(_col.type).__name__ in ("UUID", "Uuid"):
            _col.type = _TolerantUUID()


GRACE = timedelta(days=scheduler.AUTOPAY_GRACE_DAYS)


@pytest.fixture()
def world(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(scheduler, "SessionLocal", Session)

    sent = types.SimpleNamespace(whatsapp=[], email=[])
    monkeypatch.setattr(
        scheduler, "send_autopay_reminder_whatsapp",
        lambda phone, plan, amount, renewal_at: sent.whatsapp.append((phone, plan, amount, renewal_at)),
    )
    monkeypatch.setattr(
        scheduler, "send_autopay_reminder_email",
        lambda email, plan, amount, duration, renewal_at: sent.email.append((email, plan, renewal_at)),
    )

    db = Session()
    now = datetime.now(timezone.utc)

    def mk(days_until_charge, status="active", phone="auto", with_subscription=True):
        """One customer whose charge falls `days_until_charge` from now."""
        suffix = uuid.uuid4().hex[:8]
        # Phone numbers are unique in the real schema, so each test
        # customer needs their own rather than a shared literal.
        if phone == "auto":
            phone = f"98{uuid.uuid4().int % 100000000:08d}"
        user = User(
            name="Watcher", email=f"w{suffix}@example.com", hashed_password="x",
            auth_provider=AuthProvider.local, role=UserRole.user, country="India",
            is_active=True, phone=phone,
        )
        db.add(user); db.commit(); db.refresh(user)

        subscription = None
        if with_subscription:
            subscription = Subscription(
                user_id=user.id, plan_name="Contemporary", duration_label="1 Month",
                screens=1, price=12, is_active=True,
                # expires_at carries the grace days; the charge is earlier.
                expires_at=now + timedelta(days=days_until_charge) + GRACE,
            )
            db.add(subscription); db.commit(); db.refresh(subscription)

        autopay = AutopaySubscription(
            user_id=user.id,
            subscription_id=subscription.id if subscription else None,
            razorpay_plan_id="plan_x", razorpay_subscription_id=f"sub_{suffix}",
            plan_name="Contemporary", duration_label="1 Month", screens=1,
            base_amount=10, tax_amount=2, total_amount=12, status=status,
        )
        db.add(autopay); db.commit(); db.refresh(autopay)
        return types.SimpleNamespace(user=user, autopay=autopay, subscription=subscription)

    yield types.SimpleNamespace(db=db, sent=sent, mk=mk, now=now)
    db.close()


# ------------------------------------------------------------ who gets it

def test_a_charge_inside_the_window_gets_a_reminder(world):
    who = world.mk(days_until_charge=2)

    scheduler.send_due_autopay_reminders()

    assert len(world.sent.email) == 1
    assert len(world.sent.whatsapp) == 1
    assert world.sent.email[0][0] == who.user.email


def test_the_reminder_names_the_charge_date_not_the_access_end_date(world):
    # expires_at is 3 grace days later than the charge. Telling someone
    # the wrong date is worse than telling them nothing.
    who = world.mk(days_until_charge=2)

    scheduler.send_due_autopay_reminders()

    _phone, _plan, _amount, renewal_at = world.sent.whatsapp[0]
    expires_at = who.subscription.expires_at
    if expires_at.tzinfo is None:  # SQLite hands timestamps back naive
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    assert abs((renewal_at - (expires_at - GRACE)).total_seconds()) < 1


def test_a_charge_beyond_the_window_is_left_alone(world):
    world.mk(days_until_charge=scheduler.AUTOPAY_REMINDER_DAYS + 5)

    scheduler.send_due_autopay_reminders()

    assert world.sent.email == []


def test_a_charge_already_in_the_past_is_not_warned_about(world):
    # A mandate whose charge date has gone by — the server was down, or
    # Razorpay is retrying. Warning about it now would be nonsense.
    world.mk(days_until_charge=-1)

    scheduler.send_due_autopay_reminders()

    assert world.sent.email == []


def test_a_cancelled_mandate_gets_nothing(world):
    world.mk(days_until_charge=2, status="cancelled")

    scheduler.send_due_autopay_reminders()

    assert world.sent.email == []


def test_a_halted_mandate_gets_nothing(world):
    world.mk(days_until_charge=2, status="halted")

    scheduler.send_due_autopay_reminders()

    assert world.sent.email == []


def test_a_mandate_with_no_subscription_yet_gets_nothing(world):
    # Checkout opened, never authorised. There is no charge coming.
    world.mk(days_until_charge=2, status="created", with_subscription=False)

    scheduler.send_due_autopay_reminders()

    assert world.sent.email == []


def test_email_still_goes_out_when_there_is_no_phone_number(world):
    world.mk(days_until_charge=2, phone=None)

    scheduler.send_due_autopay_reminders()

    assert len(world.sent.email) == 1
    assert world.sent.whatsapp == []


# ------------------------------------------------------------ exactly once

def test_running_the_job_again_does_not_message_the_same_person_twice(world):
    world.mk(days_until_charge=2)

    scheduler.send_due_autopay_reminders()
    scheduler.send_due_autopay_reminders()
    scheduler.send_due_autopay_reminders()

    # This is the whole reason the reminders table exists: the job polls
    # hourly, so without it this customer gets told every hour for days.
    assert len(world.sent.email) == 1
    assert len(world.sent.whatsapp) == 1


def test_a_reminder_is_recorded_against_the_charge_it_was_about(world):
    who = world.mk(days_until_charge=2)

    scheduler.send_due_autopay_reminders()

    rows = world.db.query(AutopayRenewalReminder).all()
    assert len(rows) == 1
    assert rows[0].autopay_id == who.autopay.id
    assert rows[0].user_id == who.user.id


def test_the_next_cycle_is_reminded_about_separately(world):
    who = world.mk(days_until_charge=2)
    scheduler.send_due_autopay_reminders()
    assert len(world.sent.email) == 1

    # The charge went through; the subscription now runs a month longer.
    # Wind it back to just inside the window to stand in for next month.
    who.subscription.expires_at = world.now + timedelta(days=1) + GRACE
    world.db.commit()

    scheduler.send_due_autopay_reminders()

    # A new charge date is a new reminder — the guard must not silence
    # every future cycle just because one was sent.
    assert len(world.sent.email) == 2


def test_several_customers_are_each_reminded_once(world):
    world.mk(days_until_charge=1)
    world.mk(days_until_charge=2)
    world.mk(days_until_charge=scheduler.AUTOPAY_REMINDER_DAYS + 10)  # too far off

    scheduler.send_due_autopay_reminders()
    scheduler.send_due_autopay_reminders()

    assert len(world.sent.email) == 2


# --------------------------------------------------------------- failures

def test_a_failing_send_does_not_stop_the_rest_of_the_run(world, monkeypatch):
    world.mk(days_until_charge=1)
    world.mk(days_until_charge=2)

    calls = []

    def flaky(email, plan, amount, duration, renewal_at):
        calls.append(email)
        if len(calls) == 1:
            raise RuntimeError("smtp down")

    monkeypatch.setattr(scheduler, "send_autopay_reminder_email", flaky)

    scheduler.send_due_autopay_reminders()

    # One blew up; the other still had to be attempted.
    assert len(calls) == 2


def test_the_job_never_raises(world, monkeypatch):
    # It runs inside APScheduler. An exception escaping here kills the
    # job quietly and nobody is reminded again until a redeploy.
    def boom(*_a, **_k):
        raise RuntimeError("database gone")

    monkeypatch.setattr(scheduler, "SessionLocal", boom)

    scheduler.send_due_autopay_reminders()
