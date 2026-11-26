import os
import uuid as uuid_module
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import AdminRole, Blog, BlogComment, BlogLike, User, AdminUser
from app.notifications import send_blog_submitted_email, send_blog_submitted_whatsapp
from app.schemas import (
    BlogListItemOut, BlogDetailOut, BlogCommentCreate, BlogCommentOut,
    BlogLikeToggleOut, BlogSubmitRequest,
)

router = APIRouter(prefix="/blogs", tags=["blogs"])

# Same folder, limits and served path as the admin uploader in
# admin_blogs.py — a cover is a cover whoever sent it, and two
# directories would mean two things to back up and two to serve.
COVER_UPLOAD_DIR = Path("uploads/blog_covers")
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
# Extension is taken from the VALIDATED content type, not from the
# uploaded filename. The filename is attacker-chosen, and a stored
# ".php" or ".html" under a served directory is how an image upload
# becomes something worse. Admins are trusted and their uploader keeps
# the original extension; a public endpoint should not.
IMAGE_EXT_BY_TYPE = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def _editable_or_403(blog: Blog, current_user: User) -> None:
    """A post can be changed by the person who submitted it, and only
    while it is not live.

    Published is the line. Letting an author rewrite a post after
    approval would put unreviewed words on the public site under an
    editor's approval, which is the one thing the whole queue exists
    to prevent. Pending and rejected are both open: rejected
    especially, since the reason given is an instruction to go and fix
    something.
    """
    if blog.submitted_by_user_id != current_user.id:
        # 404, not 403: whether a post exists is not a stranger's business.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if blog.status == "published":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This post is already published. Ask the theomy editors to change it.",
        )


def notify_admins_of_submission(blog: Blog, author: User, db: Session) -> None:
    """Tell every active superadmin and admin that a post is waiting.

    Everyone who can act on it is told, rather than one configured
    address: a queue only one person is told about is a queue that
    stalls when that person is away. Organiser-role admin logins are
    left out — they cannot reach the review screen.

    Never raises. A submission that succeeded must not be reported as
    failed because Twilio was down, so the whole loop is wrapped as
    well as each send inside it.
    """
    try:
        recipients = (
            db.query(AdminUser)
            .filter(
                AdminUser.is_active == True,  # noqa: E712
                AdminUser.role.in_([AdminRole.superadmin, AdminRole.admin]),
            )
            .all()
        )
        for admin in recipients:
            if admin.phone:
                send_blog_submitted_whatsapp(admin.phone, admin.name, author.name, blog.title)
            if admin.email:
                send_blog_submitted_email(admin.email, admin.name, author.name, blog.title, blog.excerpt)
    except Exception:
        pass


def _comment_to_out(c: BlogComment, db: Session) -> BlogCommentOut:
    """Resolves the author's name from whichever table actually has
    them — a comment/like is authored by either a User or an AdminUser
    (never both), since those are separate login systems in this app
    (see AdminUser's docstring on the model). Per-row lookups instead
    of one big JOIN, since a single JOIN can't cleanly express "match
    User OR AdminUser depending on which id is set" without getting
    much harder to read for a query that only ever returns a handful
    of rows per post anyway.
    """
    if c.admin_id:
        admin = db.query(AdminUser).filter(AdminUser.id == c.admin_id).first()
        return BlogCommentOut(
            id=c.id, blog_id=c.blog_id, user_id=None, user_name=admin.name if admin else "theomy Team",
            is_admin=True, content=c.content, created_at=c.created_at,
        )
    user = db.query(User).filter(User.id == c.user_id).first()
    return BlogCommentOut(
        id=c.id, blog_id=c.blog_id, user_id=c.user_id, user_name=user.name if user else "Unknown",
        is_admin=False, content=c.content, created_at=c.created_at,
    )


def _counts(blog_id, db: Session):
    likes_count = db.query(BlogLike).filter(BlogLike.blog_id == blog_id).count()
    comment_count = db.query(BlogComment).filter(BlogComment.blog_id == blog_id).count()
    return likes_count, comment_count


@router.get("", response_model=list[BlogListItemOut])
def list_blogs(db: Session = Depends(get_db)):
    blogs = (
        db.query(Blog)
        .filter(Blog.is_published == True)  # noqa: E712
        .order_by(Blog.published_at.desc())
        .all()
    )
    out = []
    for b in blogs:
        likes_count, comment_count = _counts(b.id, db)
        out.append(BlogListItemOut(
            id=b.id, title=b.title, excerpt=b.excerpt, author_name=b.author_name,
            published_at=b.published_at, cover_image_url=b.cover_image_url,
            is_published=b.is_published, likes_count=likes_count, comment_count=comment_count,
        ))
    return out


@router.post("", response_model=BlogListItemOut, status_code=status.HTTP_201_CREATED)
def submit_blog(
    payload: BlogSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A site member writes a post. It goes to the review queue, never
    straight live — anyone with an account can call this.

    author_name is taken from the account rather than the request: a
    byline the submitter could type would be a byline they could put
    someone else's name on.
    """
    blog = Blog(
        title=payload.title.strip(),
        excerpt=payload.excerpt.strip(),
        body=payload.body,
        author_name=current_user.name or "theomy member",
        is_published=False,
        status="pending",
        submitted_by_user_id=current_user.id,
    )
    db.add(blog)
    db.commit()
    db.refresh(blog)

    # After the commit, deliberately. The post is saved and the author
    # will see it in their list whatever happens to the messages.
    notify_admins_of_submission(blog, current_user, db)

    likes_count, comment_count = _counts(blog.id, db)
    return BlogListItemOut(
        id=blog.id, title=blog.title, excerpt=blog.excerpt, author_name=blog.author_name,
        published_at=blog.published_at, cover_image_url=blog.cover_image_url,
        is_published=blog.is_published, likes_count=likes_count, comment_count=comment_count,
        status=blog.status, review_note=blog.review_note, submitted_by_name=current_user.name,
    )


@router.get("/mine", response_model=list[BlogListItemOut])
def list_my_blogs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """This person's own submissions, in every state.

    Declared BEFORE /{blog_id} on purpose: FastAPI matches in order, so
    the other way round "mine" would be read as a post id and 404.
    """
    rows = (
        db.query(Blog)
        .filter(Blog.submitted_by_user_id == current_user.id)
        .order_by(Blog.published_at.desc())
        .all()
    )
    out = []
    for b in rows:
        likes_count, comment_count = _counts(b.id, db)
        out.append(BlogListItemOut(
            id=b.id, title=b.title, excerpt=b.excerpt, author_name=b.author_name,
            published_at=b.published_at, cover_image_url=b.cover_image_url,
            is_published=b.is_published, likes_count=likes_count, comment_count=comment_count,
            status=b.status, review_note=b.review_note, submitted_by_name=current_user.name,
        ))
    return out


@router.put("/{blog_id}", response_model=BlogListItemOut)
def update_my_blog(
    blog_id: str,
    payload: BlogSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The author revising their own post before it goes live.

    A REJECTED post edited here goes back into the queue and the admins
    are told again — that is a resubmission, and nobody would know to
    look at it otherwise. A PENDING one stays where it is in the queue
    and sends nothing: it is already on the list, and a message per
    save would train the admins to ignore the alerts.
    """
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    _editable_or_403(blog, current_user)

    was_rejected = blog.status == "rejected"
    blog.title = payload.title.strip()
    blog.excerpt = payload.excerpt.strip()
    blog.body = payload.body
    if was_rejected:
        blog.status = "pending"
        # The old reason described the old draft; leaving it would show
        # the author "not published: fix X" on a draft where X is fixed.
        blog.review_note = None
        blog.reviewed_at = None
    db.commit()
    db.refresh(blog)

    if was_rejected:
        notify_admins_of_submission(blog, current_user, db)

    likes_count, comment_count = _counts(blog.id, db)
    return BlogListItemOut(
        id=blog.id, title=blog.title, excerpt=blog.excerpt, author_name=blog.author_name,
        published_at=blog.published_at, cover_image_url=blog.cover_image_url,
        is_published=blog.is_published, likes_count=likes_count, comment_count=comment_count,
        status=blog.status, review_note=blog.review_note, submitted_by_name=current_user.name,
    )


@router.post("/{blog_id}/cover", response_model=BlogListItemOut)
async def upload_my_blog_cover(
    blog_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The author's own cover picture for a post not yet published.

    Read, checked, then written — never streamed straight to disk, so
    an oversized file is refused rather than half-saved.
    """
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    _editable_or_403(blog, current_user)

    ext = IMAGE_EXT_BY_TYPE.get(file.content_type or "")
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, or WEBP images are allowed.",
        )
    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be smaller than 5MB.")
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That file is empty.")

    COVER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(COVER_UPLOAD_DIR / stored_name, "wb") as out:
        out.write(contents)

    blog.cover_image_url = f"/api/uploads/blog_covers/{stored_name}"
    db.commit()
    db.refresh(blog)

    likes_count, comment_count = _counts(blog.id, db)
    return BlogListItemOut(
        id=blog.id, title=blog.title, excerpt=blog.excerpt, author_name=blog.author_name,
        published_at=blog.published_at, cover_image_url=blog.cover_image_url,
        is_published=blog.is_published, likes_count=likes_count, comment_count=comment_count,
        status=blog.status, review_note=blog.review_note, submitted_by_name=current_user.name,
    )


@router.get("/{blog_id}", response_model=BlogDetailOut)
def get_blog(
    blog_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    # Unpublished is invisible — except to whoever wrote it. Someone
    # who submitted a post needs to be able to read it back while it
    # waits, and to see it again after a rejection in order to fix it.
    visible = blog is not None and (
        blog.is_published
        or (current_user is not None and blog.submitted_by_user_id == current_user.id)
    )
    if not visible:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    likes_count, comment_count = _counts(blog.id, db)
    liked_by_me = False
    if current_user:
        liked_by_me = (
            db.query(BlogLike).filter(BlogLike.blog_id == blog.id, BlogLike.user_id == current_user.id).first()
            is not None
        )
    return BlogDetailOut(
        id=blog.id, title=blog.title, excerpt=blog.excerpt, body=blog.body, author_name=blog.author_name,
        published_at=blog.published_at, cover_image_url=blog.cover_image_url, is_published=blog.is_published,
        likes_count=likes_count, liked_by_me=liked_by_me, comment_count=comment_count,
        # Carried explicitly: the schema defaults these to "published",
        # which would tell an author looking at their own pending post
        # that it is already live.
        status=blog.status, review_note=blog.review_note,
    )


@router.post("/{blog_id}/like", response_model=BlogLikeToggleOut)
def toggle_blog_like(
    blog_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    existing = db.query(BlogLike).filter(BlogLike.blog_id == blog.id, BlogLike.user_id == current_user.id).first()
    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(BlogLike(blog_id=blog.id, user_id=current_user.id))
        db.commit()
        liked = True
    likes_count = db.query(BlogLike).filter(BlogLike.blog_id == blog.id).count()
    return BlogLikeToggleOut(liked=liked, likes_count=likes_count)


@router.get("/{blog_id}/comments", response_model=list[BlogCommentOut])
def list_blog_comments(blog_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(BlogComment)
        .filter(BlogComment.blog_id == blog_id)
        .order_by(BlogComment.created_at.desc())
        .all()
    )
    return [_comment_to_out(c, db) for c in rows]


@router.post("/{blog_id}/comments", response_model=BlogCommentOut, status_code=status.HTTP_201_CREATED)
def add_blog_comment(
    blog_id: str,
    payload: BlogCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    comment = BlogComment(blog_id=blog.id, user_id=current_user.id, content=payload.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_to_out(comment, db)


@router.delete("/{blog_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_own_blog_comment(
    blog_id: str,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A commenter can delete their own comment — not edit it, so a
    comment's content stays honest once others may have read/replied
    to it (same reasoning noted on the BlogComment model).
    """
    comment = (
        db.query(BlogComment)
        .filter(BlogComment.id == comment_id, BlogComment.blog_id == blog_id, BlogComment.user_id == current_user.id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    db.delete(comment)
    db.commit()
