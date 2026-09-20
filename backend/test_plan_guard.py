import os
import types
import uuid
from datetime import datetime, timedelta, timezone

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
from app.models import (
    AuthProvider, Subscription, SubscriptionDuration, SubscriptionPlan, User, UserRole,
)
from app.routers import payments, stripe_payments, subscriptions
from app.schemas import UserOut
from app.security import create_access_token


from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles


@compiles(JSONB, "sqlite")
def _jsonb_as_json_on_sqlite(_type, _compiler, **_kw):
    # Test-database shim only: subscription_plans.features is JSONB (PostgreSQL).
    return "JSON"


class _TolerantUUID(TypeDecorator):
    """Test-database shim only (see test_family.py): lets SQLite accept UUIDs
    given as strings, the way PostgreSQL+psycopg2 does in production."""
    impl = CHAR(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else uuid.UUID(str(value)).hex

    def process_result_value(self, value, dialect):
        return None if value is None else uuid.UUID(value)


TABLES = (User.__table__, Subscription.__table__, SubscriptionPlan.__table__, SubscriptionDuration.__table__)
for _table in TABLES:
    for _col in _table.columns:
        if type(_col.type).__name__ in ("UUID", "Uuid"):
            _col.type = _TolerantUUID()

ORDER = {"plan_name": "Archive", "duration_label": "1 Month", "screens": 2, "reward_points_requested": 0}


@pytest.fixture()
def world():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    for t in TABLES:
        t.create(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    app = FastAPI()
    for r in (payments.router, stripe_payments.router, subscriptions.router):
        app.include_router(r, prefix="/api")

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = _db

    db = Session()
    db.add(SubscriptionDuration(label="1 Month", months=1, discount_percent=0, display_order=1, is_active=True))

    def mk(name, email, parent=None, country="India", active=True):
        u = User(name=name, email=email, hashed_password="x", auth_provider=AuthProvider.local,
                 role=UserRole.user, country=country,
                 parent_id=parent.id if parent else None, is_active=active)
        db.add(u); db.commit(); db.refresh(u)
        return u

    w = types.SimpleNamespace(db=db, Session=Session)
    w.parent = mk("Kuntal Das", "kuntald1@gmail.com")
    w.child = mk("Samir Dey", "samir@gmail.com", parent=w.parent)
    w.us_parent = mk("US Parent", "us@x.com", country="USA")
    w.us_child = mk("US Child", "usc@x.com", parent=w.us_parent, country="USA")
    w.client = TestClient(app, raise_server_exceptions=False)
    w.h = lambda u: {"Authorization": f"Bearer {create_access_token(str(u.id))}"}

    def give_plan(user, plan="Archive", screens=2):
        s = Subscription(user_id=user.id, plan_name=plan, duration_label="1 Month", screens=screens, price=189,
                         is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(days=30))
        db.add(s); db.commit(); db.refresh(s)
        return s
    w.give_plan = give_plan

    def subs_of(user):
        db.expire_all()
        return db.query(Subscription).filter(Subscription.user_id == user.id).all()
    w.subs_of = subs_of
    yield w
    db.close()


# ------------------------------------------------------ a sub-account is blocked
def test_sub_account_cannot_create_a_razorpay_order(world):
    r = world.client.post("/api/payments/razorpay/create-order", json=ORDER, headers=world.h(world.child))
    assert r.status_code == 403
    assert r.json()["detail"] == "This account's plan is managed by Kuntal Das. Ask them to change the plan."


def test_sub_account_cannot_create_a_stripe_checkout(world):
    r = world.client.post("/api/payments/stripe/create-checkout-session", json=ORDER, headers=world.h(world.us_child))
    assert r.status_code == 403
    assert "managed by US Parent" in r.json()["detail"]


def test_sub_account_cannot_directly_activate_a_plan_either(world):
    body = {"plan_name": "Both", "duration_label": "1 Month", "screens": 10, "price": "1"}
    r = world.client.post("/api/subscriptions", json=body, headers=world.h(world.child))
    assert r.status_code == 403
    assert world.subs_of(world.child) == []          # nothing was created for the child


def test_the_parents_subscription_is_never_touched_by_a_childs_attempt(world):
    parent_sub = world.give_plan(world.parent, "Archive", 2)
    for url, hdr in (("/api/payments/razorpay/create-order", world.h(world.child)),):
        assert world.client.post(url, json=ORDER, headers=hdr).status_code == 403
    world.client.post("/api/subscriptions", json={"plan_name": "Both", "duration_label": "1 Month", "screens": 9, "price": "1"}, headers=world.h(world.child))
    subs = world.subs_of(world.parent)
    assert len(subs) == 1 and subs[0].id == parent_sub.id and subs[0].is_active
    assert (subs[0].plan_name, subs[0].screens) == ("Archive", 2)
    assert world.subs_of(world.child) == []


# ------------------------------------------- everyone else is unaffected
def test_the_parent_and_regular_users_get_past_the_guard(world):
    # No such plan exists in this empty test database, so a request that gets
    # PAST the guard ends at 404 "Plan not found" — proof it wasn't blocked.
    for user in (world.parent,):
        r = world.client.post("/api/payments/razorpay/create-order", json=ORDER, headers=world.h(user))
        assert r.status_code == 404 and r.json()["detail"] == "Plan not found"
    r = world.client.post("/api/payments/stripe/create-checkout-session", json=ORDER, headers=world.h(world.us_parent))
    assert r.status_code == 404 and r.json()["detail"] == "Plan not found"


def test_the_parent_can_still_activate_their_own_plan(world):
    r = world.client.post("/api/subscriptions", json={"plan_name": "Archive", "duration_label": "1 Month", "screens": 2, "price": "189"}, headers=world.h(world.parent))
    assert r.status_code == 201
    assert [(s.plan_name, s.screens) for s in world.subs_of(world.parent)] == [("Archive", 2)]


def test_a_parent_changing_the_plan_is_what_the_child_shares(world):
    # Documenting the rule the guard protects: the ONLY way a plan changes is via the parent.
    world.give_plan(world.parent, "Archive", 1)
    world.client.post("/api/subscriptions", json={"plan_name": "Both", "duration_label": "1 Month", "screens": 3, "price": "300"}, headers=world.h(world.parent))
    active = [s for s in world.subs_of(world.parent) if s.is_active]
    assert [(s.plan_name, s.screens) for s in active] == [("Both", 3)]
    me = world.client.get("/api/subscriptions/me", headers=world.h(world.child)).json()
    assert (me["plan_name"], me["screens"]) == ("Both", 3)       # the child sees the parent's new plan


def test_orphaned_sub_account_is_not_blocked(world):
    orphan = User(name="Orphan", email="o@x.com", hashed_password="x", auth_provider=AuthProvider.local,
                  role=UserRole.user, country="India", parent_id=uuid.uuid4())     # parent row doesn't exist
    world.db.add(orphan); world.db.commit(); world.db.refresh(orphan)
    r = world.client.post("/api/payments/razorpay/create-order", json=ORDER, headers=world.h(orphan))
    assert r.status_code == 404                     # got past the guard (no plan in the test DB)


def test_a_deactivated_parent_still_blocks_its_children(world):
    world.parent.is_active = False; world.db.commit()
    r = world.client.post("/api/payments/razorpay/create-order", json=ORDER, headers=world.h(world.child))
    assert r.status_code == 403


# --------------------------------------------------------- what the apps get at login
def test_user_out_carries_parent_id_for_sub_accounts_only(world):
    assert UserOut.model_validate(world.child).parent_id == world.parent.id
    assert UserOut.model_validate(world.parent).parent_id is None


def test_requires_login(world):
    assert world.client.post("/api/payments/razorpay/create-order", json=ORDER).status_code == 401
