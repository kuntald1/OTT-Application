"""The site logo, uploaded from the admin panel.

The thing that matters here is not the upload — it is that the header
keeps drawing when there is no logo, no row, or a file that has gone
missing. A site whose header breaks because a config table is empty is
a site that breaks on the day this feature deploys.
"""

import os
import types
import uuid

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
from app.deps import get_current_admin
from app.models import AdminRole, AdminUser, Base, BrandingConfig
from app.routers import admin_site_content, site_content


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


PNG = b"\x89PNG\r\n\x1a\n-pretend-this-is-an-image"


@pytest.fixture()
def world(monkeypatch, tmp_path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(admin_site_content, "LOGO_UPLOAD_DIR", tmp_path / "branding")

    db = Session()
    admin = AdminUser(name="Boss", email="boss@theomy.com", hashed_password="x",
                      role=AdminRole.superadmin, is_active=True)
    db.add(admin); db.commit(); db.refresh(admin)

    app = FastAPI()
    app.include_router(site_content.router, prefix="/api")
    app.include_router(admin_site_content.router, prefix="/api")

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_admin] = lambda: admin

    yield types.SimpleNamespace(
        db=db, client=TestClient(app, raise_server_exceptions=False), dir=tmp_path / "branding"
    )
    db.close()


# ------------------------------------------------------- the fallback

def test_branding_answers_on_a_database_that_has_never_seen_this_feature(world):
    # No row at all. This is exactly the state of the live database the
    # moment this deploys, and the header has to draw anyway.
    assert world.db.query(BrandingConfig).count() == 0

    res = world.client.get("/api/branding")

    assert res.status_code == 200
    assert res.json()["logo_url"] is None


def test_an_empty_logo_url_reads_as_no_logo(world):
    # A cleared row must look the same to a client as no row at all,
    # otherwise the header would try to render src="".
    world.db.add(BrandingConfig(logo_url=""))
    world.db.commit()

    assert world.client.get("/api/branding").json()["logo_url"] is None


def test_the_public_endpoint_needs_no_login(world):
    # The header is drawn on every page before anyone signs in.
    assert world.client.get("/api/branding").status_code == 200


# --------------------------------------------------------- uploading

def test_uploading_a_logo_stores_it_and_points_the_site_at_it(world):
    res = world.client.post(
        "/api/admin/branding/logo",
        files={"file": ("logo.png", PNG, "image/png")},
    )

    assert res.status_code == 200
    url = res.json()["logo_url"]
    assert url.startswith("/api/uploads/branding/")
    assert len(list(world.dir.iterdir())) == 1
    # The public endpoint is what the header reads, so it has to agree.
    assert world.client.get("/api/branding").json()["logo_url"] == url


def test_the_first_upload_creates_the_single_config_row(world):
    world.client.post("/api/admin/branding/logo", files={"file": ("logo.png", PNG, "image/png")})
    # Seeded lazily rather than by a migration, which is what keeps this
    # table off the deploy checklist.
    assert world.db.query(BrandingConfig).count() == 1


def test_a_second_upload_replaces_the_logo_without_a_second_row(world):
    world.client.post("/api/admin/branding/logo", files={"file": ("a.png", PNG, "image/png")})
    first = world.client.get("/api/branding").json()["logo_url"]

    world.client.post("/api/admin/branding/logo", files={"file": ("b.png", PNG, "image/png")})
    second = world.client.get("/api/branding").json()["logo_url"]

    assert world.db.query(BrandingConfig).count() == 1
    # A fresh name every time, never a fixed "logo.png" — otherwise
    # browsers and phones serve the cached old mark for days.
    assert second != first
    # And the old file is still on disk, in case the new one was a mistake.
    assert len(list(world.dir.iterdir())) == 2


def test_svg_is_accepted_because_a_logo_has_to_stay_sharp(world):
    res = world.client.post(
        "/api/admin/branding/logo",
        files={"file": ("mark.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")},
    )
    assert res.status_code == 200
    assert res.json()["logo_url"].endswith(".svg")


def test_the_stored_name_comes_from_the_content_type_not_the_filename(world):
    world.client.post(
        "/api/admin/branding/logo",
        files={"file": ("shell.php", PNG, "image/png")},
    )
    stored = list(world.dir.iterdir())[0].name
    assert stored.endswith(".png")
    assert "php" not in stored


def test_a_non_image_is_refused(world):
    res = world.client.post(
        "/api/admin/branding/logo",
        files={"file": ("deck.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert res.status_code == 400
    assert not world.dir.exists()


def test_an_empty_file_is_refused(world):
    res = world.client.post("/api/admin/branding/logo", files={"file": ("logo.png", b"", "image/png")})
    assert res.status_code == 400


def test_an_oversized_logo_is_refused_without_being_half_written(world, monkeypatch):
    monkeypatch.setattr(admin_site_content, "MAX_LOGO_BYTES", 10)

    res = world.client.post(
        "/api/admin/branding/logo",
        files={"file": ("big.png", b"x" * 500, "image/png")},
    )

    assert res.status_code == 400
    # Checked before anything was opened for writing.
    assert not world.dir.exists()


# ----------------------------------------------------------- resetting

def test_resetting_goes_back_to_the_built_in_mark(world):
    world.client.post("/api/admin/branding/logo", files={"file": ("logo.png", PNG, "image/png")})

    res = world.client.delete("/api/admin/branding/logo")

    assert res.status_code == 200
    assert res.json()["logo_url"] is None
    assert world.client.get("/api/branding").json()["logo_url"] is None
    # Undoing a logo change is not the thing that deletes the file you
    # may well want back.
    assert len(list(world.dir.iterdir())) == 1


def test_resetting_when_there_was_never_a_logo_is_not_an_error(world):
    res = world.client.delete("/api/admin/branding/logo")
    assert res.status_code == 200
    assert res.json()["logo_url"] is None
