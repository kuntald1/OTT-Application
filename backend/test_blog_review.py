"""Blog posts submitted by members, reviewed by admins.

The risks here are not about wording. They are: a member's post going
straight onto the public site without review; a member choosing someone
else's byline; the people who can act on the queue not being told;
and — most of all — a Twilio or SMTP outage rolling back a decision that
actually happened. Those are what these cover.
"""

import os
import types
import uuid
from datetime import datetime, timezone

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
from app.models import (
    AdminRole, AdminUser, AuthProvider, Base, Blog, User, UserRole,
)
from app.routers import admin_blogs, blogs
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


POST = {"title": "Behind the Curtain", "excerpt": "How the set was built.", "body": "Long body text."}


@pytest.fixture()
def world(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)

    # Every message that would leave the building, captured instead.
    sent = types.SimpleNamespace(admin_wa=[], admin_mail=[], author_wa=[], author_mail=[])
    monkeypatch.setattr(blogs, "send_blog_submitted_whatsapp",
                        lambda phone, admin, author, title: sent.admin_wa.append((phone, author, title)))
    monkeypatch.setattr(blogs, "send_blog_submitted_email",
                        lambda email, admin, author, title, excerpt: sent.admin_mail.append((email, author, title)))
    monkeypatch.setattr(admin_blogs, "send_blog_approved_whatsapp",
                        lambda phone, author, title: sent.author_wa.append(("approved", phone, title)))
    monkeypatch.setattr(admin_blogs, "send_blog_approved_email",
                        lambda email, author, title: sent.author_mail.append(("approved", email, title)))
    monkeypatch.setattr(admin_blogs, "send_blog_rejected_whatsapp",
                        lambda phone, author, title, reason: sent.author_wa.append(("rejected", phone, reason)))
    monkeypatch.setattr(admin_blogs, "send_blog_rejected_email",
                        lambda email, author, title, reason: sent.author_mail.append(("rejected", email, reason)))

    db = Session()

    def mk_user(name, email, phone=None):
        u = User(name=name, email=email, hashed_password="x", auth_provider=AuthProvider.local,
                 role=UserRole.user, country="India", is_active=True, phone=phone)
        db.add(u); db.commit(); db.refresh(u)
        return u

    def mk_admin(name, email, role=AdminRole.admin, phone=None, active=True):
        a = AdminUser(name=name, email=email, hashed_password="x", role=role,
                      is_active=active, phone=phone)
        db.add(a); db.commit(); db.refresh(a)
        return a

    author = mk_user("Kuntal Das", "kuntald1@gmail.com", phone="9732609965")
    superadmin = mk_admin("Boss", "boss@theomy.com", AdminRole.superadmin, phone="9000000001")
    admin = mk_admin("Desk", "desk@theomy.com", AdminRole.admin, phone="9000000002")
    reviewer = admin

    app = FastAPI()
    app.include_router(blogs.router, prefix="/api")
    app.include_router(admin_blogs.router, prefix="/api")

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_admin] = lambda: reviewer

    client = TestClient(app, raise_server_exceptions=False)
    yield types.SimpleNamespace(
        db=db, client=client, sent=sent, author=author, superadmin=superadmin,
        admin=admin, mk_user=mk_user, mk_admin=mk_admin,
        h=lambda u: {"Authorization": f"Bearer {create_access_token(str(u.id))}"},
    )
    db.close()


# --------------------------------------------------------- submitting

def test_a_submitted_post_is_not_public_until_approved(world):
    res = world.client.post("/api/blogs", json=POST, headers=world.h(world.author))
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert res.json()["is_published"] is False

    # This is the whole point of the feature: the public list must not
    # carry it. A member who could publish straight to the site would
    # make the review queue decorative.
    public = world.client.get("/api/blogs").json()
    assert public == []


def test_the_byline_comes_from_the_account_not_the_request(world):
    # A submitter who could choose author_name could publish under
    # someone else's name, so the field isn't accepted at all.
    res = world.client.post(
        "/api/blogs",
        json={**POST, "author_name": "theomy Team"},
        headers=world.h(world.author),
    )
    assert res.status_code == 201
    assert res.json()["author_name"] == "Kuntal Das"


def test_submitting_needs_an_account(world):
    assert world.client.post("/api/blogs", json=POST).status_code in (401, 403)


def test_the_author_can_read_their_own_pending_post(world):
    post_id = world.client.post("/api/blogs", json=POST, headers=world.h(world.author)).json()["id"]

    mine = world.client.get(f"/api/blogs/{post_id}", headers=world.h(world.author))
    assert mine.status_code == 200
    assert mine.json()["status"] == "pending"

    # ...and nobody else can, logged in or not.
    other = world.mk_user("Someone Else", "other@example.com")
    assert world.client.get(f"/api/blogs/{post_id}", headers=world.h(other)).status_code == 404
    assert world.client.get(f"/api/blogs/{post_id}").status_code == 404


def test_mine_lists_every_state_and_only_my_own(world):
    world.client.post("/api/blogs", json=POST, headers=world.h(world.author))
    other = world.mk_user("Someone Else", "other@example.com")
    world.client.post("/api/blogs", json={**POST, "title": "Theirs"}, headers=world.h(other))

    mine = world.client.get("/api/blogs/mine", headers=world.h(world.author)).json()
    assert [p["title"] for p in mine] == ["Behind the Curtain"]


def test_mine_is_not_read_as_a_post_id(world):
    # /blogs/mine and /blogs/{id} both match "mine"; the route order
    # decides. Getting this wrong 404s every author's own list.
    assert world.client.get("/api/blogs/mine", headers=world.h(world.author)).status_code == 200


# ------------------------------------------------- telling the admins

def test_every_active_admin_hears_about_a_submission(world):
    world.client.post("/api/blogs", json=POST, headers=world.h(world.author))

    mailed = {m[0] for m in world.sent.admin_mail}
    assert mailed == {"boss@theomy.com", "desk@theomy.com"}
    # A queue only one person is told about stalls when that person is away.
    assert len(world.sent.admin_wa) == 2


def test_a_deactivated_admin_is_not_messaged(world):
    world.mk_admin("Gone", "gone@theomy.com", AdminRole.admin, phone="9000000003", active=False)
    world.client.post("/api/blogs", json=POST, headers=world.h(world.author))
    assert "gone@theomy.com" not in {m[0] for m in world.sent.admin_mail}


def test_an_organiser_admin_login_is_not_messaged(world):
    # A plays_organiser admin account can't reach the review screen, so
    # telling it about the queue would only be noise.
    world.mk_admin("Organiser", "org@theomy.com", AdminRole.plays_organiser, phone="9000000004")
    world.client.post("/api/blogs", json=POST, headers=world.h(world.author))
    assert "org@theomy.com" not in {m[0] for m in world.sent.admin_mail}


def test_an_admin_without_a_phone_still_gets_the_email(world):
    world.db.query(AdminUser).filter(AdminUser.email == "desk@theomy.com").update({"phone": None})
    world.db.commit()

    world.client.post("/api/blogs", json=POST, headers=world.h(world.author))
    assert "desk@theomy.com" in {m[0] for m in world.sent.admin_mail}
    assert len(world.sent.admin_wa) == 1  # only the superadmin has a number now


def test_a_failing_notification_does_not_lose_the_post(world, monkeypatch):
    # The submission already happened. An outage at Twilio must not be
    # reported to the member as a failure to submit.
    def boom(*_a, **_k):
        raise RuntimeError("twilio down")

    monkeypatch.setattr(blogs, "send_blog_submitted_whatsapp", boom)

    res = world.client.post("/api/blogs", json=POST, headers=world.h(world.author))
    assert res.status_code == 201
    assert world.db.query(Blog).count() == 1


# ------------------------------------------------------ the decision

def _submit(world):
    return world.client.post("/api/blogs", json=POST, headers=world.h(world.author)).json()["id"]


def test_approving_publishes_it_and_tells_the_author(world):
    post_id = _submit(world)

    res = world.client.post(f"/api/admin/blogs/{post_id}/approve")
    assert res.status_code == 200
    assert res.json()["status"] == "published"

    assert [p["title"] for p in world.client.get("/api/blogs").json()] == ["Behind the Curtain"]
    assert world.sent.author_mail == [("approved", "kuntald1@gmail.com", "Behind the Curtain")]
    assert world.sent.author_wa == [("approved", "9732609965", "Behind the Curtain")]


def test_rejecting_keeps_it_private_and_sends_the_reason(world):
    post_id = _submit(world)

    res = world.client.post(f"/api/admin/blogs/{post_id}/reject", json={"reason": "Needs sources"})
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    assert res.json()["review_note"] == "Needs sources"

    assert world.client.get("/api/blogs").json() == []
    # The reason is what makes a rejection actionable, so it has to
    # reach the author and not just sit in the database.
    assert world.sent.author_wa == [("rejected", "9732609965", "Needs sources")]
    assert world.sent.author_mail == [("rejected", "kuntald1@gmail.com", "Needs sources")]


def test_rejecting_requires_a_reason(world):
    post_id = _submit(world)
    assert world.client.post(f"/api/admin/blogs/{post_id}/reject", json={"reason": ""}).status_code == 422
    assert world.client.post(f"/api/admin/blogs/{post_id}/reject", json={}).status_code == 422


def test_a_rejected_post_can_be_approved_later_and_loses_the_note(world):
    post_id = _submit(world)
    world.client.post(f"/api/admin/blogs/{post_id}/reject", json={"reason": "Needs sources"})

    res = world.client.post(f"/api/admin/blogs/{post_id}/approve")
    assert res.json()["status"] == "published"
    # Leaving the old reason on a published post would show the author
    # "not published: needs sources" next to their live article.
    assert res.json()["review_note"] is None


def test_approving_dates_the_post_to_when_it_went_live(world):
    post_id = _submit(world)
    world.db.query(Blog).filter(Blog.id == post_id).update(
        {"published_at": datetime(2020, 1, 1, tzinfo=timezone.utc)}
    )
    world.db.commit()

    world.client.post(f"/api/admin/blogs/{post_id}/approve")

    # The public list orders by published_at; a post approved long after
    # it was written should not arrive already buried.
    row = world.db.query(Blog).filter(Blog.id == post_id).first()
    published_at = row.published_at
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    assert published_at.year == datetime.now(timezone.utc).year


def test_a_decision_survives_a_failing_notification(world, monkeypatch):
    post_id = _submit(world)

    def boom(*_a, **_k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(admin_blogs, "send_blog_approved_email", boom)

    res = world.client.post(f"/api/admin/blogs/{post_id}/approve")
    assert res.status_code == 200
    # Committed before the message was attempted, so it stands.
    assert world.db.query(Blog).filter(Blog.id == post_id).first().is_published is True


def test_an_admin_written_post_has_nobody_to_write_back_to(world):
    # Nothing to notify: the admin who wrote it IS the review.
    blog = Blog(title="House post", excerpt="x", body="y", author_name="theomy Team",
                is_published=False, status="draft")
    world.db.add(blog); world.db.commit(); world.db.refresh(blog)

    res = world.client.post(f"/api/admin/blogs/{blog.id}/approve")
    assert res.status_code == 200
    assert world.sent.author_mail == []
    assert world.sent.author_wa == []


def test_deciding_on_a_post_that_does_not_exist_is_a_404(world):
    missing = uuid.uuid4()
    assert world.client.post(f"/api/admin/blogs/{missing}/approve").status_code == 404
    assert world.client.post(f"/api/admin/blogs/{missing}/reject", json={"reason": "x"}).status_code == 404


def test_the_admin_listing_shows_the_queue_with_its_state(world):
    _submit(world)
    rows = world.client.get("/api/admin/blogs").json()
    assert len(rows) == 1
    assert rows[0]["status"] == "pending"
    # Who wrote it, so the reviewer isn't deciding on an anonymous post.
    assert rows[0]["submitted_by_name"] == "Kuntal Das"


# ------------------------------------------- revising before approval

def test_the_author_can_edit_their_own_pending_post(world):
    post_id = _submit(world)

    res = world.client.put(
        f"/api/blogs/{post_id}",
        json={"title": "Behind the Curtain, revised", "excerpt": "Tighter.", "body": "Better."},
        headers=world.h(world.author),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Behind the Curtain, revised"
    assert res.json()["status"] == "pending"


def test_editing_a_pending_post_does_not_re_alert_the_admins(world):
    post_id = _submit(world)
    world.sent.admin_mail.clear()
    world.sent.admin_wa.clear()

    world.client.put(f"/api/blogs/{post_id}", json=POST, headers=world.h(world.author))

    # It is already on the queue. A message per save would teach the
    # admins to ignore the alerts that matter.
    assert world.sent.admin_mail == []
    assert world.sent.admin_wa == []


def test_editing_a_rejected_post_resubmits_it_and_tells_the_admins(world):
    post_id = _submit(world)
    world.client.post(f"/api/admin/blogs/{post_id}/reject", json={"reason": "Needs sources"})
    world.sent.admin_mail.clear()

    res = world.client.put(
        f"/api/blogs/{post_id}",
        json={**POST, "body": "Now with sources."},
        headers=world.h(world.author),
    )

    # Back in the queue, and the old reason is gone — it described the
    # old draft, and showing "fix X" on a draft where X is fixed is worse
    # than showing nothing.
    assert res.json()["status"] == "pending"
    assert res.json()["review_note"] is None
    # Nobody would know to look at it again otherwise.
    assert len(world.sent.admin_mail) == 2


def test_a_published_post_can_no_longer_be_edited_by_its_author(world):
    post_id = _submit(world)
    world.client.post(f"/api/admin/blogs/{post_id}/approve")

    res = world.client.put(f"/api/blogs/{post_id}", json=POST, headers=world.h(world.author))

    # This is the line that matters: editing after approval would put
    # unreviewed words on the public site under an editor's approval.
    assert res.status_code == 403


def test_nobody_else_can_edit_your_draft(world):
    post_id = _submit(world)
    other = world.mk_user("Someone Else", "other@example.com")

    res = world.client.put(f"/api/blogs/{post_id}", json=POST, headers=world.h(other))

    # 404, not 403 — whether a draft exists is not a stranger's business.
    assert res.status_code == 404
    assert world.client.put(f"/api/blogs/{post_id}", json=POST).status_code in (401, 403)


def test_a_cover_image_is_stored_and_attached(world, tmp_path, monkeypatch):
    monkeypatch.setattr(blogs, "COVER_UPLOAD_DIR", tmp_path / "blog_covers")
    post_id = _submit(world)

    res = world.client.post(
        f"/api/blogs/{post_id}/cover",
        files={"file": ("set.png", b"fake-png-bytes", "image/png")},
        headers=world.h(world.author),
    )
    assert res.status_code == 200
    assert res.json()["cover_image_url"].startswith("/api/uploads/blog_covers/")
    assert len(list((tmp_path / "blog_covers").iterdir())) == 1


def test_the_stored_name_comes_from_the_content_type_not_the_filename(world, tmp_path, monkeypatch):
    monkeypatch.setattr(blogs, "COVER_UPLOAD_DIR", tmp_path / "blog_covers")
    post_id = _submit(world)

    world.client.post(
        f"/api/blogs/{post_id}/cover",
        files={"file": ("shell.php", b"fake-png-bytes", "image/png")},
        headers=world.h(world.author),
    )

    # The filename is attacker-chosen. A stored ".php" under a served
    # directory is how an image upload becomes something worse.
    stored = list((tmp_path / "blog_covers").iterdir())[0].name
    assert stored.endswith(".png")
    assert "php" not in stored


def test_a_non_image_cover_is_refused(world, tmp_path, monkeypatch):
    monkeypatch.setattr(blogs, "COVER_UPLOAD_DIR", tmp_path / "blog_covers")
    post_id = _submit(world)

    res = world.client.post(
        f"/api/blogs/{post_id}/cover",
        files={"file": ("notes.pdf", b"%PDF-1.4", "application/pdf")},
        headers=world.h(world.author),
    )
    assert res.status_code == 400
    assert not (tmp_path / "blog_covers").exists()


def test_an_oversized_cover_is_refused_without_being_half_written(world, tmp_path, monkeypatch):
    monkeypatch.setattr(blogs, "COVER_UPLOAD_DIR", tmp_path / "blog_covers")
    monkeypatch.setattr(blogs, "MAX_IMAGE_BYTES", 10)
    post_id = _submit(world)

    res = world.client.post(
        f"/api/blogs/{post_id}/cover",
        files={"file": ("big.jpg", b"x" * 500, "image/jpeg")},
        headers=world.h(world.author),
    )
    assert res.status_code == 400
    # Checked before anything was opened for writing.
    assert not (tmp_path / "blog_covers").exists()


def test_a_cover_cannot_be_changed_once_published(world, tmp_path, monkeypatch):
    monkeypatch.setattr(blogs, "COVER_UPLOAD_DIR", tmp_path / "blog_covers")
    post_id = _submit(world)
    world.client.post(f"/api/admin/blogs/{post_id}/approve")

    res = world.client.post(
        f"/api/blogs/{post_id}/cover",
        files={"file": ("set.png", b"fake", "image/png")},
        headers=world.h(world.author),
    )
    assert res.status_code == 403
