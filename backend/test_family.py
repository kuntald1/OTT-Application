import os
import sys
import types
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DB_PASSWORD", "x")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from passlib.context import CryptContext
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.security as security
from sqlalchemy import CHAR
from sqlalchemy.types import TypeDecorator
from app.database import get_db
from app.models import AuthProvider, FamilyPin, User, UserRole
from app.routers import family
from app.security import create_access_token, decode_access_token, verify_password

GOOD_PIN = "4829"


class _TolerantUUID(TypeDecorator):
    """Test-database shim only. PostgreSQL+psycopg2 (production) happily
    accepts a UUID given as a string — which is how the existing
    get_current_user filters (User.id == payload["sub"]) — but SQLite's
    generic UUID type insists on uuid.UUID objects. This makes SQLite behave
    like Postgres in that one respect so the REAL router code can run
    unchanged against the REAL models."""
    impl = CHAR(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else uuid.UUID(str(value)).hex

    def process_result_value(self, value, dialect):
        return None if value is None else uuid.UUID(value)


for _table in (User.__table__, FamilyPin.__table__):
    for _col in _table.columns:
        if type(_col.type).__name__ in ("UUID", "Uuid"):
            _col.type = _TolerantUUID()


@pytest.fixture(autouse=True)
def fast_bcrypt(monkeypatch):
    # Same bcrypt, fewer rounds — only so the test suite runs in seconds.
    monkeypatch.setattr(security, "pwd_context", CryptContext(schemes=["bcrypt"], bcrypt__rounds=4))


@pytest.fixture()
def world():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    User.__table__.create(engine)
    FamilyPin.__table__.create(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    app = FastAPI()
    app.include_router(family.router, prefix="/api")

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db

    db = Session()
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def mk(name, email, parent=None, active=True, minutes=0):
        u = User(
            name=name, email=email, hashed_password=security.hash_password("pw-12345678"),
            auth_provider=AuthProvider.local, role=UserRole.user, country="India",
            parent_id=parent.id if parent else None, is_active=active,
            created_at=t0 + timedelta(minutes=minutes),
        )
        db.add(u); db.commit(); db.refresh(u)
        return u

    w = types.SimpleNamespace()
    w.parent = mk("Kuntal Das", "kuntald1@gmail.com")
    w.child1 = mk("Samir Dey", "samir@gmail.com", parent=w.parent, minutes=1)
    w.child2 = mk("Riya Das", "riya@gmail.com", parent=w.parent, minutes=2)
    w.gone = mk("Old Child", "old@gmail.com", parent=w.parent, active=False, minutes=3)
    w.stranger = mk("Stranger", "stranger@gmail.com")
    w.other_parent = mk("Other Parent", "op@gmail.com")
    w.other_child = mk("Other Child", "oc@gmail.com", parent=w.other_parent, minutes=4)
    w.db, w.engine, w.Session, w.app = db, engine, Session, app
    w.client = TestClient(app)
    w.h = lambda user: {"Authorization": f"Bearer {create_access_token(str(user.id))}"}

    def pin_row():
        db.expire_all()
        return db.query(FamilyPin).filter(FamilyPin.user_id == w.parent.id).first()
    w.pin_row = pin_row

    def set_pin(pin=GOOD_PIN):
        r = w.client.put("/api/family/pin", json={"new_pin": pin}, headers=w.h(w.parent))
        assert r.status_code == 200, r.text
    w.set_pin = set_pin

    def switch(as_user, target, pin=None):
        body = {"target_id": str(target.id)}
        if pin is not None:
            body["pin"] = pin
        return w.client.post("/api/family/switch", json=body, headers=w.h(as_user))
    w.switch = switch
    yield w
    db.close()


# ----------------------------------------------------------- the picker list
def test_parent_sees_self_first_then_active_children_only(world):
    r = world.client.get("/api/family/accounts", headers=world.h(world.parent))
    assert r.status_code == 200
    body = r.json()
    assert [a["name"] for a in body["accounts"]] == ["Kuntal Das", "Samir Dey", "Riya Das"]  # inactive child hidden
    assert [a["is_current"] for a in body["accounts"]] == [True, False, False]
    assert [a["is_parent"] for a in body["accounts"]] == [True, False, False]
    assert all(a["requires_pin"] is False for a in body["accounts"])   # parent never needs a PIN in the picker
    assert body["pin_set"] is False


def test_child_sees_self_and_parent_only_never_siblings(world):
    r = world.client.get("/api/family/accounts", headers=world.h(world.child1))
    accounts = r.json()["accounts"]
    assert [a["name"] for a in accounts] == ["Samir Dey", "Kuntal Das"]      # no "Riya Das"
    assert accounts[0]["is_current"] and not accounts[1]["is_current"]
    assert accounts[1]["requires_pin"] is True and accounts[1]["is_parent"] is True


def test_emails_are_masked_never_full(world):
    raw = world.client.get("/api/family/accounts", headers=world.h(world.child1)).text
    assert "k***1@gmail.com" in raw
    assert "kuntald1@gmail.com" not in raw
    assert "samir@gmail.com" not in raw          # even the caller's own is masked in this list


def test_account_without_family_gets_a_single_entry(world):
    body = world.client.get("/api/family/accounts", headers=world.h(world.stranger)).json()
    assert len(body["accounts"]) == 1


def test_child_list_omits_deactivated_parent(world):
    world.parent.is_active = False; world.db.commit()
    accounts = world.client.get("/api/family/accounts", headers=world.h(world.child1)).json()["accounts"]
    assert [a["name"] for a in accounts] == ["Samir Dey"]


def test_pin_set_flag_reflects_the_parents_pin_for_parent_and_child(world):
    world.set_pin()
    assert world.client.get("/api/family/accounts", headers=world.h(world.parent)).json()["pin_set"] is True
    assert world.client.get("/api/family/accounts", headers=world.h(world.child1)).json()["pin_set"] is True
    assert world.client.get("/api/family/accounts", headers=world.h(world.other_child)).json()["pin_set"] is False


# ------------------------------------------------------------- parent -> child
def test_parent_enters_child_without_any_pin_and_gets_a_real_login_token(world):
    r = world.switch(world.parent, world.child1)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["id"] == str(world.child1.id) and body["user"]["email"] == "samir@gmail.com"
    assert decode_access_token(body["access_token"])["sub"] == str(world.child1.id)   # usable token for the CHILD
    # ...and that token really authenticates as the child:
    me = world.client.get("/api/family/accounts", headers={"Authorization": f"Bearer {body['access_token']}"}).json()
    assert me["accounts"][0]["name"] == "Samir Dey" and me["accounts"][0]["is_current"]


def test_parent_can_also_enter_child_when_a_pin_exists_and_a_stray_pin_is_ignored(world):
    world.set_pin()
    assert world.switch(world.parent, world.child2).status_code == 200
    assert world.switch(world.parent, world.child2, pin="0000").status_code == 200   # ignored, not counted
    assert world.pin_row().failed_attempts == 0


def test_cannot_switch_to_deactivated_child_or_unrelated_or_sibling_or_missing(world):
    assert world.switch(world.parent, world.gone).status_code == 404          # deactivated
    assert world.switch(world.parent, world.stranger).status_code == 404      # unrelated
    assert world.switch(world.parent, world.other_child).status_code == 404   # someone else's child
    world.set_pin()
    assert world.switch(world.child1, world.child2, pin=GOOD_PIN).status_code == 404   # sibling — even with the PIN
    assert world.switch(world.child1, world.other_parent, pin=GOOD_PIN).status_code == 404
    ghost = types.SimpleNamespace(id=uuid.uuid4())
    assert world.switch(world.parent, ghost).status_code == 404


def test_all_the_404s_are_indistinguishable(world):
    bodies = {world.switch(world.parent, u).text for u in (world.gone, world.stranger, types.SimpleNamespace(id=uuid.uuid4()))}
    assert len(bodies) == 1     # no way to tell "doesn't exist" from "not yours"


def test_switching_to_yourself_is_rejected(world):
    assert world.switch(world.parent, world.parent).status_code == 400


# ------------------------------------------------------------- child -> parent
def test_child_to_parent_needs_the_pin(world):
    world.set_pin()
    r = world.switch(world.child1, world.parent)                 # no pin at all
    assert r.status_code == 400 and "Family PIN" in r.json()["detail"]
    assert world.pin_row().failed_attempts == 0                  # a missing PIN is not a wrong guess


def test_child_to_parent_with_correct_pin_returns_a_parent_token(world):
    world.set_pin()
    r = world.switch(world.child1, world.parent, pin=GOOD_PIN)
    assert r.status_code == 200, r.text
    assert decode_access_token(r.json()["access_token"])["sub"] == str(world.parent.id)


def test_child_to_parent_when_no_pin_is_set_is_refused_with_a_clear_message(world):
    r = world.switch(world.child1, world.parent, pin=GOOD_PIN)
    assert r.status_code == 400 and "hasn't set" in r.json()["detail"]


def test_wrong_pin_reports_attempts_left(world):
    world.set_pin()
    r = world.switch(world.child1, world.parent, pin="1357")
    assert r.status_code == 400 and r.json()["detail"] == "Incorrect PIN. 4 attempts left."
    r = world.switch(world.child1, world.parent, pin="1357")
    assert r.json()["detail"] == "Incorrect PIN. 3 attempts left."


def test_fifth_wrong_pin_locks_and_even_the_right_pin_is_then_refused(world):
    world.set_pin()
    for _ in range(4):
        assert world.switch(world.child1, world.parent, pin="1357").status_code == 400
    r = world.switch(world.child1, world.parent, pin="1357")               # 5th wrong
    assert r.status_code == 429 and "15 minutes" in r.json()["detail"] and int(r.headers["Retry-After"]) > 0
    ok = world.switch(world.child1, world.parent, pin=GOOD_PIN)            # correct PIN, still locked
    assert ok.status_code == 429


def test_lock_covers_every_child_of_the_family_not_just_the_guesser(world):
    world.set_pin()
    second = types.SimpleNamespace()
    other_child_of_same_parent = world.child2
    for _ in range(5):
        world.switch(world.child1, world.parent, pin="1357")
    assert world.switch(other_child_of_same_parent, world.parent, pin=GOOD_PIN).status_code == 429


def test_lock_expires_then_the_right_pin_works_and_counters_reset(world):
    world.set_pin()
    for _ in range(5):
        world.switch(world.child1, world.parent, pin="1357")
    row = world.pin_row(); row.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1); world.db.commit()
    r = world.switch(world.child1, world.parent, pin=GOOD_PIN)
    assert r.status_code == 200
    row = world.pin_row()
    assert row.failed_attempts == 0 and row.locked_until is None


def test_after_a_lock_expires_you_get_a_fresh_set_of_five_tries(world):
    world.set_pin()
    for _ in range(5):
        world.switch(world.child1, world.parent, pin="1357")
    row = world.pin_row(); row.locked_until = datetime.now(timezone.utc) - timedelta(seconds=1); world.db.commit()
    r = world.switch(world.child1, world.parent, pin="1357")
    assert r.status_code == 400 and "4 attempts left" in r.json()["detail"]


def test_a_success_resets_the_wrong_counter(world):
    world.set_pin()
    for _ in range(3):
        world.switch(world.child1, world.parent, pin="1357")
    assert world.switch(world.child1, world.parent, pin=GOOD_PIN).status_code == 200
    for _ in range(4):
        assert world.switch(world.child1, world.parent, pin="1357").status_code == 400   # would be locked without the reset
    assert world.pin_row().failed_attempts == 4


def test_families_are_isolated_from_each_other(world):
    world.set_pin()
    for _ in range(5):
        world.switch(world.child1, world.parent, pin="1357")
    # the OTHER family's PIN flow is unaffected by the first family's lock
    r = world.client.put("/api/family/pin", json={"new_pin": "2580"}, headers=world.h(world.other_parent))
    assert r.status_code == 200
    assert world.switch(world.other_child, world.other_parent, pin="2580").status_code == 200


# --------------------------------------------------------------- setting a pin
def test_parent_sets_a_pin_and_it_is_stored_hashed(world):
    r = world.client.put("/api/family/pin", json={"new_pin": GOOD_PIN}, headers=world.h(world.parent))
    assert r.status_code == 200 and r.json() == {"pin_set": True}
    row = world.pin_row()
    assert row.pin_hash != GOOD_PIN and GOOD_PIN not in row.pin_hash
    assert verify_password(GOOD_PIN, row.pin_hash)


def test_a_child_can_never_set_or_change_the_parents_pin(world):
    r = world.client.put("/api/family/pin", json={"new_pin": GOOD_PIN}, headers=world.h(world.child1))
    assert r.status_code == 403 and world.pin_row() is None
    world.set_pin()
    r = world.client.put("/api/family/pin", json={"new_pin": "9051", "current_pin": GOOD_PIN}, headers=world.h(world.child1))
    assert r.status_code == 403
    assert verify_password(GOOD_PIN, world.pin_row().pin_hash)     # unchanged


@pytest.mark.parametrize("weak", ["0000", "1111", "7777", "1234", "4321", "2345", "9876", "0123"])
def test_obvious_pins_are_rejected(world, weak):
    r = world.client.put("/api/family/pin", json={"new_pin": weak}, headers=world.h(world.parent))
    assert r.status_code == 400 and "harder to guess" in r.json()["detail"]
    assert world.pin_row() is None


# includes Arabic-Indic and BENGALI digits: \\d would have accepted those
@pytest.mark.parametrize("bad", ["12", "12345", "abcd", "12 4", "", "٤٨٢٩", "৪৮২৯"])
def test_malformed_pins_are_rejected_by_validation(world, bad):
    r = world.client.put("/api/family/pin", json={"new_pin": bad}, headers=world.h(world.parent))
    assert r.status_code == 422


def test_changing_an_existing_pin_needs_the_current_one(world):
    world.set_pin()
    r = world.client.put("/api/family/pin", json={"new_pin": "9051"}, headers=world.h(world.parent))
    assert r.status_code == 400 and "current PIN" in r.json()["detail"]
    r = world.client.put("/api/family/pin", json={"new_pin": "9051", "current_pin": "1357"}, headers=world.h(world.parent))
    assert r.status_code == 400 and "Incorrect PIN" in r.json()["detail"]
    assert verify_password(GOOD_PIN, world.pin_row().pin_hash)     # still the old one
    r = world.client.put("/api/family/pin", json={"new_pin": "9051", "current_pin": GOOD_PIN}, headers=world.h(world.parent))
    assert r.status_code == 200
    assert world.switch(world.child1, world.parent, pin=GOOD_PIN).status_code == 400    # old PIN dead
    assert world.switch(world.child1, world.parent, pin="9051").status_code == 200      # new PIN works


def test_guessing_via_the_change_pin_endpoint_hits_the_same_lockout(world):
    world.set_pin()
    for _ in range(5):
        world.client.put("/api/family/pin", json={"new_pin": "9051", "current_pin": "1357"}, headers=world.h(world.parent))
    assert world.switch(world.child1, world.parent, pin=GOOD_PIN).status_code == 429   # switching is locked too


def test_a_weak_new_pin_does_not_burn_an_attempt(world):
    world.set_pin()
    world.client.put("/api/family/pin", json={"new_pin": "1111", "current_pin": "1357"}, headers=world.h(world.parent))
    assert world.pin_row().failed_attempts == 0


# ------------------------------------------------------------------ auth needed
@pytest.mark.parametrize("method,url,body", [
    ("get", "/api/family/accounts", None),
    ("post", "/api/family/switch", {"target_id": str(uuid.uuid4())}),
    ("put", "/api/family/pin", {"new_pin": "4829"}),
])
def test_every_endpoint_requires_login(world, method, url, body):
    r = getattr(world.client, method)(url, **({"json": body} if body else {}))
    assert r.status_code == 401


# ---------------------------------------- the "no manual ALTER TABLE" guarantee
def test_new_table_appears_beside_an_existing_users_table_without_touching_it():
    engine = create_engine("sqlite://")
    User.__table__.create(engine)                                   # the production database as it is today
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, name, email, country, reward_points_balance, auth_provider, role, is_active, can_live_stream) "
                       "VALUES ('11111111111111111111111111111111', 'Old User', 'old@x.com', 'India', 0, 'local', 'user', 1, 0)"))
    before = [c["name"] for c in inspect(engine).get_columns("users")]
    assert "family_pins" not in inspect(engine).get_table_names()

    FamilyPin.__table__.create(engine, checkfirst=True)             # what create_all does on the next startup

    assert "family_pins" in inspect(engine).get_table_names()
    assert [c["name"] for c in inspect(engine).get_columns("users")] == before   # users: not a single column added
    with engine.begin() as c:
        assert c.execute(text("SELECT name FROM users")).scalar() == "Old User"   # data intact


# ------------------------------------------------------------- admin PIN reset
def test_admin_can_reset_a_forgotten_pin_and_only_then_the_child_is_locked_out(world, monkeypatch):
    stub = types.ModuleType("app.notifications")
    stub.send_live_streaming_enabled_email = lambda *a, **k: None
    stub.send_live_streaming_enabled_whatsapp = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "app.notifications", stub)
    from app.deps import get_current_admin, get_current_superadmin
    from app.routers import admin_users
    world.app.include_router(admin_users.router, prefix="/api")
    world.app.dependency_overrides[get_current_admin] = lambda: object()
    world.app.dependency_overrides[get_current_superadmin] = lambda: object()

    world.set_pin()
    listing = {u["email"]: u for u in world.client.get("/api/admin/users").json()}
    assert listing["kuntald1@gmail.com"]["has_family_pin"] is True
    assert listing["stranger@gmail.com"]["has_family_pin"] is False

    r = world.client.delete(f"/api/admin/users/{world.parent.id}/family-pin")
    assert r.status_code == 204 and world.pin_row() is None
    listing = {u["email"]: u for u in world.client.get("/api/admin/users").json()}
    assert listing["kuntald1@gmail.com"]["has_family_pin"] is False
    # after a reset the child can't get back into the parent until a new PIN is set (the safe default)
    assert world.switch(world.child1, world.parent, pin=GOOD_PIN).status_code == 400
    # the parent can still enter the child, and set a new PIN
    assert world.switch(world.parent, world.child1).status_code == 200
    world.set_pin("2580")
    assert world.switch(world.child1, world.parent, pin="2580").status_code == 200
    # deleting for a user with no PIN is harmless, and unknown users 404
    assert world.client.delete(f"/api/admin/users/{world.stranger.id}/family-pin").status_code == 204
    assert world.client.delete(f"/api/admin/users/{uuid.uuid4()}/family-pin").status_code == 404
