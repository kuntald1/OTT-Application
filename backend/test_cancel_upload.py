"""Cancelling a video upload that is still in flight.

The point of this feature is that a 900MB attempt someone changed their
mind about does not stay on Bunny Stream, invisible and billable, with
nothing in our database pointing at it. So the tests that matter are:
Bunny really is told to delete it, the row stops referring to it, and a
FINISHED upload is never destroyed by a stray cancel.
"""

import os
import types
import uuid
from datetime import datetime, timezone

os.environ.setdefault("DB_PASSWORD", "x")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import CHAR, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator
from sqlalchemy.dialects.postgresql import ARRAY as PGARRAY, JSONB
from sqlalchemy.ext.compiler import compiles

from app.config import settings
from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AgeRating, AuthProvider, Base, User, UserRole, Video, VideoMonetization,
    VideoSection, VideoStatus,
)
from app.routers import admin_videos, videos
from app.security import create_access_token


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


class FakeBunny:
    """Stands in for Bunny Stream's HTTP API. Records every DELETE so a
    test can assert the GUID we asked to remove, and can be told to fail
    so the "don't lose the reference" case is covered."""

    def __init__(self, status_code=200):
        self.status_code = status_code
        self.deleted = []
        self.raise_network_error = False

    def __call__(self, url, **kwargs):
        if self.raise_network_error:
            raise httpx.ConnectError("boom")
        self.deleted.append(url)
        return httpx.Response(self.status_code, text="")


@pytest.fixture()
def world(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    app = FastAPI()
    app.include_router(videos.router, prefix="/api")
    app.include_router(admin_videos.router, prefix="/api")

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_admin] = lambda: types.SimpleNamespace(id=uuid.uuid4(), name="Admin")

    monkeypatch.setattr(settings, "BUNNY_LIBRARY_ID", "12345", raising=False)
    monkeypatch.setattr(settings, "BUNNY_API_KEY", "secret", raising=False)
    monkeypatch.setattr(settings, "BUNNY_CDN_HOSTNAME", "vz-test.b-cdn.net", raising=False)

    bunny = FakeBunny()
    monkeypatch.setattr(videos.httpx, "delete", bunny)

    db = Session()

    def mk_user(name, email, role=UserRole.plays_organiser):
        u = User(name=name, email=email, hashed_password="x", auth_provider=AuthProvider.local,
                 role=role, country="India", is_active=True)
        db.add(u); db.commit(); db.refresh(u)
        return u

    def mk_video(owner, bunny_video_id="guid-1", confirmed=False):
        v = Video(
            title="Test Video", description="d", section=VideoSection.play,
            status=VideoStatus.pending, monetization_type=VideoMonetization.subscription_only,
            age_rating=AgeRating.u, release_year=2026, has_ads=False,
            uploaded_by_user_id=owner.id if owner else None,
            bunny_video_id=bunny_video_id,
            upload_confirmed_at=datetime.now(timezone.utc) if confirmed else None,
        )
        db.add(v); db.commit(); db.refresh(v)
        return v

    w = types.SimpleNamespace(db=db, bunny=bunny, mk_video=mk_video)
    w.owner = mk_user("Bohurupee", "sujoydas@gmail.com")
    w.someone_else = mk_user("Other Person", "other@gmail.com")
    w.client = TestClient(app, raise_server_exceptions=False)
    w.h = lambda u: {"Authorization": f"Bearer {create_access_token(str(u.id))}"}
    yield w
    db.close()


# --------------------------------------------------------------- creator

def test_cancelling_deletes_the_partial_file_from_bunny(world):
    video = world.mk_video(world.owner, bunny_video_id="guid-abc")

    r = world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.owner))

    assert r.status_code == 200
    # The whole point: Bunny was told to remove that exact video.
    assert len(world.bunny.deleted) == 1
    assert world.bunny.deleted[0].endswith("/library/12345/videos/guid-abc")


def test_cancelling_clears_the_reference_so_the_next_attempt_starts_clean(world):
    video = world.mk_video(world.owner, bunny_video_id="guid-abc")

    world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.owner))

    world.db.refresh(video)
    # A leftover GUID would make the next credentials call re-sign a
    # video that no longer exists, and every upload request would 404.
    assert video.bunny_video_id is None
    assert video.upload_confirmed_at is None


def test_a_finished_upload_is_never_destroyed_by_a_cancel(world):
    video = world.mk_video(world.owner, bunny_video_id="guid-done", confirmed=True)

    r = world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.owner))

    assert r.status_code == 400
    assert "already uploaded" in r.json()["detail"]
    world.db.refresh(video)
    assert video.bunny_video_id == "guid-done"
    assert world.bunny.deleted == []


def test_cancelling_before_any_byte_went_up_is_not_an_error(world):
    # Someone pressed Cancel the instant they picked the file, or pressed
    # it twice. There is nothing to undo and nothing to apologise for.
    video = world.mk_video(world.owner, bunny_video_id=None)

    r = world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.owner))

    assert r.status_code == 200
    assert world.bunny.deleted == []


def test_a_video_already_gone_from_bunny_counts_as_cancelled(world):
    world.bunny.status_code = 404
    video = world.mk_video(world.owner, bunny_video_id="guid-gone")

    r = world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.owner))

    assert r.status_code == 200
    world.db.refresh(video)
    assert video.bunny_video_id is None


def test_the_reference_is_kept_when_bunny_refuses_so_nothing_is_orphaned(world):
    world.bunny.status_code = 500
    video = world.mk_video(world.owner, bunny_video_id="guid-stuck")

    r = world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.owner))

    assert r.status_code == 502
    world.db.refresh(video)
    # Clearing it here would leave a file on Bunny that nothing can ever
    # find again. Keeping it means a retry can still clean up.
    assert video.bunny_video_id == "guid-stuck"


def test_a_network_failure_reaching_bunny_is_reported_not_swallowed(world):
    world.bunny.raise_network_error = True
    video = world.mk_video(world.owner, bunny_video_id="guid-unreachable")

    r = world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.owner))

    assert r.status_code == 502
    world.db.refresh(video)
    assert video.bunny_video_id == "guid-unreachable"


def test_one_creator_cannot_cancel_another_creators_upload(world):
    video = world.mk_video(world.owner, bunny_video_id="guid-abc")

    r = world.client.post(f"/api/videos/{video.id}/cancel-upload", headers=world.h(world.someone_else))

    assert r.status_code == 404
    world.db.refresh(video)
    assert video.bunny_video_id == "guid-abc"
    assert world.bunny.deleted == []


# ----------------------------------------------------------------- admin

def test_admin_can_cancel_any_upload(world):
    # Admins review other people's submissions, so the ownership filter
    # that applies to a creator deliberately doesn't apply here.
    video = world.mk_video(world.owner, bunny_video_id="guid-admin")

    r = world.client.post(f"/api/admin/videos/{video.id}/cancel-upload")

    assert r.status_code == 200
    assert world.bunny.deleted[0].endswith("/library/12345/videos/guid-admin")
    world.db.refresh(video)
    assert video.bunny_video_id is None


def test_admin_cancel_also_refuses_a_finished_upload(world):
    video = world.mk_video(world.owner, bunny_video_id="guid-done", confirmed=True)

    r = world.client.post(f"/api/admin/videos/{video.id}/cancel-upload")

    assert r.status_code == 400
    world.db.refresh(video)
    assert video.bunny_video_id == "guid-done"


def test_cancelling_a_video_that_does_not_exist_is_a_404(world):
    r = world.client.post(f"/api/admin/videos/{uuid.uuid4()}/cancel-upload")

    assert r.status_code == 404
