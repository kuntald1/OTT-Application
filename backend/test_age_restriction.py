"""Age restriction for under-18 profiles — see app/age_gate.py.

What these tests are really guarding is the SECOND half of each pair:
that an adult's experience is byte-for-byte what it was before this
feature existed, and that turning the master switch off restores the old
behaviour exactly. A restriction that also quietly breaks paying adults
is worse than no restriction.
"""

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
from sqlalchemy.dialects.postgresql import ARRAY as PGARRAY, JSONB
from sqlalchemy.ext.compiler import compiles

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import (
    AgeRating, AgeRestrictionConfig, AuthProvider, FamilyPin, MyListItem, Subscription,
    User, UserDemographics, UserRole, Video, VideoMonetization, VideoSection, VideoStatus,
    WatchProgress,
)
from app.routers import admin_age_restriction, my_list, playback_sessions, sub_accounts, videos, watch_progress
from app.security import create_access_token, hash_password


@compiles(JSONB, "sqlite")
def _jsonb_as_json_on_sqlite(_type, _compiler, **_kw):
    return "JSON"


@compiles(PGARRAY, "sqlite")
def _array_as_json_on_sqlite(_type, _compiler, **_kw):
    # Test-database shim only: a couple of columns are PostgreSQL ARRAY,
    # which SQLite has no equivalent for. Nothing in these tests reads
    # them; they just have to be creatable.
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


# _to_out touches a dozen related tables (pricing, tiers, categories,
# cast, crew, likes, subtitles, ads...), so this builds the WHOLE schema
# rather than hand-listing them — the realistic shape, and it can't drift
# as _to_out grows.
from app.models import Base

for _table in Base.metadata.tables.values():
    for _col in _table.columns:
        if type(_col.type).__name__ in ("UUID", "Uuid"):
            _col.type = _TolerantUUID()
TABLES = tuple(Base.metadata.sorted_tables)


@pytest.fixture()
def world():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    app = FastAPI()
    for r in (videos.router, my_list.router, watch_progress.router,
              playback_sessions.router, sub_accounts.router, admin_age_restriction.router):
        app.include_router(r, prefix="/api")

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()
    app.dependency_overrides[get_db] = _db
    # Admin identity isn't what's under test here; the age-restriction
    # settings endpoints just need to be reachable.
    app.dependency_overrides[get_current_admin] = lambda: types.SimpleNamespace(id=uuid.uuid4(), name="Admin")
    app.dependency_overrides[get_current_superadmin] = lambda: types.SimpleNamespace(id=uuid.uuid4(), name="Super")

    db = Session()

    def mk_user(name, email, parent=None, phone=None):
        u = User(name=name, email=email, hashed_password="x", auth_provider=AuthProvider.local,
                 role=UserRole.user, country="India", phone=phone,
                 parent_id=parent.id if parent else None, is_active=True)
        db.add(u); db.commit(); db.refresh(u)
        return u

    def mk_video(title, rating, section=VideoSection.play):
        v = Video(
            title=title, description="d", section=section, status=VideoStatus.published,
            monetization_type=VideoMonetization.subscription_only,
            age_rating=AgeRating(rating), release_year=2026, has_ads=False,
            published_at=datetime.now(timezone.utc),
        )
        db.add(v); db.commit(); db.refresh(v)
        return v

    w = types.SimpleNamespace(db=db, Session=Session)
    w.parent = mk_user("Kuntal Das", "kuntald1@gmail.com", phone="9830000000")
    w.child = mk_user("Samir Dey", "samir@gmail.com", parent=w.parent)
    w.grown_child = mk_user("Grown Up", "grown@gmail.com", parent=w.parent)
    # The parent is an adult by registration; the children are declared
    # explicitly, one each way — the two cases the restriction turns on.
    db.add(UserDemographics(user_id=w.child.id, is_declared_minor=True))
    db.add(UserDemographics(user_id=w.grown_child.id, is_declared_minor=False))
    # A sub-account from before UserDemographics existed: no row at all.
    w.legacy_child = mk_user("Legacy Kid", "legacy@gmail.com", parent=w.parent)
    db.commit()

    w.open_video = mk_video("A Doll's House", "U")
    w.teen_video = mk_video("Raktakarabi", "UA13+")
    w.restricted_video = mk_video("Nocturne", "UA16+")
    w.adult_video = mk_video("After Hours", "A")

    def give_plan(user):
        s = Subscription(user_id=user.id, plan_name="Plays", duration_label="1 Month", screens=4,
                         price=189, is_active=True,
                         expires_at=datetime.now(timezone.utc) + timedelta(days=30))
        db.add(s); db.commit()
        return s
    w.give_plan = give_plan
    give_plan(w.parent)

    def set_config(enabled=True, restricted="UA16+,A"):
        row = db.query(AgeRestrictionConfig).first()
        if row is None:
            row = AgeRestrictionConfig(enabled=enabled, restricted_ratings=restricted)
            db.add(row)
        else:
            row.enabled = enabled
            row.restricted_ratings = restricted
        db.commit()
        return row
    w.set_config = set_config

    w.client = TestClient(app, raise_server_exceptions=False)
    w.h = lambda u: {"Authorization": f"Bearer {create_access_token(str(u.id))}"}

    def titles(resp):
        return {item["title"] for item in resp.json()}
    w.titles = titles

    yield w
    db.close()


# --------------------------------------------------- browse and search

def test_a_minor_does_not_see_restricted_videos_in_browse(world):
    world.set_config()
    seen = world.titles(world.client.get("/api/videos", headers=world.h(world.child)))
    assert seen == {"A Doll's House", "Raktakarabi"}


def test_an_adult_still_sees_every_video_in_browse(world):
    world.set_config()
    seen = world.titles(world.client.get("/api/videos", headers=world.h(world.parent)))
    assert seen == {"A Doll's House", "Raktakarabi", "Nocturne", "After Hours"}


def test_an_adult_declared_sub_account_sees_every_video(world):
    """A family account the parent said is NOT a child is treated as an
    adult — that is the whole point of the declaration."""
    world.set_config()
    seen = world.titles(world.client.get("/api/videos", headers=world.h(world.grown_child)))
    assert seen == {"A Doll's House", "Raktakarabi", "Nocturne", "After Hours"}


def test_a_sub_account_with_no_demographics_row_is_treated_as_a_minor(world):
    """The safe default for accounts created before the flag existed."""
    world.set_config()
    seen = world.titles(world.client.get("/api/videos", headers=world.h(world.legacy_child)))
    assert seen == {"A Doll's House", "Raktakarabi"}


def test_a_logged_out_visitor_does_not_see_restricted_videos(world):
    world.set_config()
    seen = world.titles(world.client.get("/api/videos"))
    assert seen == {"A Doll's House", "Raktakarabi"}


def test_search_hides_restricted_videos_from_a_minor_but_not_an_adult(world):
    world.set_config()
    assert world.titles(world.client.get("/api/videos/search?q=Nocturne", headers=world.h(world.child))) == set()
    assert world.titles(world.client.get("/api/videos/search?q=Nocturne", headers=world.h(world.parent))) == {"Nocturne"}


# ------------------------------------------- direct links and playback

def test_a_minor_opening_a_restricted_video_by_id_gets_nothing(world):
    world.set_config()
    r = world.client.get(f"/api/videos/{world.restricted_video.id}", headers=world.h(world.child))
    assert r.status_code == 404
    # Wording matters: a parent should be able to tell a restriction
    # apart from a broken link.
    assert "isn't available on this profile" in r.json()["detail"]


def test_a_minor_gets_no_metadata_at_all_from_a_restricted_video(world):
    """Not just no playback URL — no title, poster or synopsis either,
    so a shared link leaks nothing."""
    world.set_config()
    body = world.client.get(f"/api/videos/{world.adult_video.id}", headers=world.h(world.child)).text
    assert "After Hours" not in body


def test_an_adult_opens_the_same_video_normally(world):
    world.set_config()
    r = world.client.get(f"/api/videos/{world.restricted_video.id}", headers=world.h(world.parent))
    assert r.status_code == 200
    assert r.json()["title"] == "Nocturne"


def test_a_minor_cannot_start_playback_of_a_restricted_video(world):
    world.set_config()
    r = world.client.post(
        f"/api/videos/{world.restricted_video.id}/playback-session/start",
        json={"session_token": "device-1"}, headers=world.h(world.child),
    )
    assert r.status_code == 403


def test_a_minor_can_still_watch_an_unrestricted_video(world):
    """The restriction must not become a blanket block."""
    world.set_config()
    r = world.client.get(f"/api/videos/{world.open_video.id}", headers=world.h(world.child))
    assert r.status_code == 200
    assert r.json()["title"] == "A Doll's House"


# -------------------------------------------------- lists carry it too

def test_my_list_hides_a_restricted_video_but_keeps_the_saved_row(world):
    world.set_config()
    world.db.add(MyListItem(user_id=world.child.id, item_id=str(world.restricted_video.id),
                            title="Nocturne", section="Video Streaming"))
    world.db.add(MyListItem(user_id=world.child.id, item_id=str(world.open_video.id),
                            title="A Doll's House", section="Video Streaming"))
    world.db.commit()

    seen = {i["title"] for i in world.client.get("/api/my-list", headers=world.h(world.child)).json()}
    assert seen == {"A Doll's House"}
    # Hidden, not deleted — it comes back if the restriction is lifted.
    assert world.db.query(MyListItem).filter(MyListItem.user_id == world.child.id).count() == 2


def test_continue_watching_and_history_hide_restricted_videos(world):
    world.set_config()
    for v in (world.restricted_video, world.open_video):
        world.db.add(WatchProgress(user_id=world.child.id, video_id=v.id, position_seconds=60))
    world.db.commit()

    cw = world.client.get("/api/videos/continue-watching/mine", headers=world.h(world.child)).json()
    hist = world.client.get("/api/videos/history/mine", headers=world.h(world.child)).json()
    assert {i["title"] for i in cw} == {"A Doll's House"}
    assert {i["title"] for i in hist} == {"A Doll's House"}


# ------------------------------------------------- the admin can change it

def test_the_restricted_list_is_whatever_the_admin_saved(world):
    """Nothing is hardcoded: adding UA13+ hides it from the next request
    with no deploy and no restart."""
    world.set_config(restricted="UA13+,UA16+,A")
    seen = world.titles(world.client.get("/api/videos", headers=world.h(world.child)))
    assert seen == {"A Doll's House"}


def test_turning_the_master_switch_off_restores_the_old_behaviour(world):
    world.set_config(enabled=False)
    for who in (world.child, world.legacy_child, world.parent):
        assert len(world.client.get("/api/videos", headers=world.h(who)).json()) == 4
    assert len(world.client.get("/api/videos").json()) == 4
    assert world.client.get(
        f"/api/videos/{world.adult_video.id}", headers=world.h(world.child)
    ).status_code == 200


def test_with_no_config_row_at_all_nothing_is_restricted(world):
    """A migration that ran without the seed must not lock anyone out."""
    assert world.db.query(AgeRestrictionConfig).first() is None
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 4


def test_admin_can_read_and_save_the_settings(world):
    before = world.client.get("/api/admin/age-restriction").json()
    assert before["enabled"] is False  # no row yet
    assert before["all_ratings"] == ["U", "UA7+", "UA13+", "UA16+", "A"]

    saved = world.client.put("/api/admin/age-restriction",
                             json={"enabled": True, "restricted_ratings": ["A", "UA16+"]}).json()
    # Stored in rating order however the screen sent it.
    assert saved["restricted_ratings"] == ["UA16+", "A"]
    assert saved["enabled"] is True
    # And it takes effect immediately.
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 2


def test_admin_cannot_save_a_rating_that_does_not_exist(world):
    r = world.client.put("/api/admin/age-restriction", json={"restricted_ratings": ["UA99+"]})
    assert r.status_code == 422


def test_the_master_switch_can_be_flipped_without_resending_the_ratings(world):
    world.set_config(restricted="UA16+,A")
    r = world.client.put("/api/admin/age-restriction", json={"enabled": False})
    assert r.json()["restricted_ratings"] == ["UA16+", "A"]
    assert r.json()["enabled"] is False


# ------------------------------------- the parent changing the declaration

def test_a_parent_can_mark_a_child_as_an_adult_and_the_videos_appear(world):
    world.set_config()
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 2

    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": False}, headers=world.h(world.parent))
    assert r.status_code == 200
    assert r.json()["is_minor"] is False
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 4


def test_a_parent_can_mark_an_adult_sub_account_back_as_a_child(world):
    world.set_config()
    r = world.client.patch(f"/api/sub-accounts/{world.grown_child.id}/minor",
                           json={"is_minor": True}, headers=world.h(world.parent))
    assert r.status_code == 200
    assert len(world.client.get("/api/videos", headers=world.h(world.grown_child)).json()) == 2


def test_a_legacy_sub_account_with_no_row_can_be_declared_an_adult(world):
    """The case that had no way out before this endpoint existed."""
    world.set_config()
    r = world.client.patch(f"/api/sub-accounts/{world.legacy_child.id}/minor",
                           json={"is_minor": False}, headers=world.h(world.parent))
    assert r.status_code == 200
    assert len(world.client.get("/api/videos", headers=world.h(world.legacy_child)).json()) == 4


def test_a_child_cannot_change_its_own_declaration(world):
    world.set_config()
    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": False}, headers=world.h(world.child))
    assert r.status_code == 403
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 2


def test_a_stranger_cannot_change_someone_elses_child(world):
    outsider = User(name="Outsider", email="out@x.com", hashed_password="x",
                    auth_provider=AuthProvider.local, role=UserRole.user, country="India")
    world.db.add(outsider); world.db.commit(); world.db.refresh(outsider)
    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": False}, headers=world.h(outsider))
    assert r.status_code == 404


# --------------------------------------------------- the Family PIN guard

def test_unchecking_minor_needs_the_family_pin_when_one_is_set(world):
    world.set_config()
    world.db.add(FamilyPin(user_id=world.parent.id, pin_hash=hash_password("4321"), failed_attempts=0))
    world.db.commit()

    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": False}, headers=world.h(world.parent))
    assert r.status_code == 400
    assert "Family PIN" in r.json()["detail"]
    # Nothing changed.
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 2


def test_a_wrong_family_pin_is_refused(world):
    world.set_config()
    world.db.add(FamilyPin(user_id=world.parent.id, pin_hash=hash_password("4321"), failed_attempts=0))
    world.db.commit()

    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": False, "pin": "0000"}, headers=world.h(world.parent))
    assert r.status_code == 400
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 2


def test_the_right_family_pin_lets_it_through(world):
    world.set_config()
    world.db.add(FamilyPin(user_id=world.parent.id, pin_hash=hash_password("4321"), failed_attempts=0))
    world.db.commit()

    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": False, "pin": "4321"}, headers=world.h(world.parent))
    assert r.status_code == 200
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 4


def test_marking_a_profile_back_as_a_child_needs_no_pin(world):
    """The safe direction should never be discouraged."""
    world.set_config()
    world.db.add(FamilyPin(user_id=world.parent.id, pin_hash=hash_password("4321"), failed_attempts=0))
    world.db.commit()

    r = world.client.patch(f"/api/sub-accounts/{world.grown_child.id}/minor",
                           json={"is_minor": True}, headers=world.h(world.parent))
    assert r.status_code == 200


# ------------------------------------------------------ the parent is told

def test_the_parent_is_alerted_on_both_channels_when_minor_is_unchecked(world, monkeypatch):
    world.set_config()
    sent = []
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_whatsapp",
                        lambda phone, parent, child: sent.append(("whatsapp", phone, child)))
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_email",
                        lambda email, parent, child: sent.append(("email", email, child)))

    world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                       json={"is_minor": False}, headers=world.h(world.parent))

    assert ("whatsapp", "9830000000", "Samir Dey") in sent
    assert ("email", "kuntald1@gmail.com", "Samir Dey") in sent


def test_no_alert_when_a_profile_is_marked_back_as_a_child(world, monkeypatch):
    world.set_config()
    sent = []
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_whatsapp", lambda *a: sent.append(a))
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_email", lambda *a: sent.append(a))

    world.client.patch(f"/api/sub-accounts/{world.grown_child.id}/minor",
                       json={"is_minor": True}, headers=world.h(world.parent))
    assert sent == []


def test_no_alert_when_nothing_actually_changed(world, monkeypatch):
    """Saving "still a child" on a child shouldn't fire an alarm."""
    world.set_config()
    sent = []
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_whatsapp", lambda *a: sent.append(a))
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_email", lambda *a: sent.append(a))

    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": True}, headers=world.h(world.parent))
    assert r.status_code == 200
    assert sent == []


def test_a_failing_whatsapp_does_not_undo_the_change(world, monkeypatch):
    """Twilio being down must not make the parent think the save failed."""
    world.set_config()

    def _boom(*_a):
        raise RuntimeError("twilio is down")
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_whatsapp", _boom)
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_email", _boom)

    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                           json={"is_minor": False}, headers=world.h(world.parent))
    assert r.status_code == 200
    assert len(world.client.get("/api/videos", headers=world.h(world.child)).json()) == 4


def test_a_parent_with_no_phone_still_gets_the_email(world, monkeypatch):
    """Phone is optional outside India — the alert must not vanish with it."""
    world.set_config()
    world.parent.phone = None
    world.db.commit()
    sent = []
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_whatsapp",
                        lambda phone, p, c: sent.append(("whatsapp", phone)))
    monkeypatch.setattr(sub_accounts, "send_minor_flag_removed_email",
                        lambda email, p, c: sent.append(("email", email)))

    world.client.patch(f"/api/sub-accounts/{world.child.id}/minor",
                       json={"is_minor": False}, headers=world.h(world.parent))
    assert ("email", "kuntald1@gmail.com") in sent


# ------------------------------------------------------ the new A rating

def test_the_adult_rating_exists_and_is_accepted(world):
    assert AgeRating("A").value == "A"
    assert "A" in videos.ALLOWED_AGE_RATINGS


def test_the_minor_flag_survives_deactivation(world):
    """Deactivate used to return the ORM row directly and report every
    child as an adult; the flag matters now that it drives this."""
    world.set_config()
    r = world.client.patch(f"/api/sub-accounts/{world.child.id}/deactivate", headers=world.h(world.parent))
    assert r.status_code == 200
    assert r.json()["is_minor"] is True
