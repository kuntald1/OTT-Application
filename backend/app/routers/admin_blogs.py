import os
import uuid as uuid_module
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, Blog, BlogComment, BlogLike, User
from app.notifications import (
    send_blog_approved_email, send_blog_approved_whatsapp,
    send_blog_rejected_email, send_blog_rejected_whatsapp,
)
from app.schemas import BlogCreate, BlogUpdate, BlogListItemOut, BlogDetailOut, BlogCommentOut, BlogCommentUpdate, BlogCommentCreate, BlogLikeToggleOut, BlogRejectRequest
from app.routers.blogs import _comment_to_out

router = APIRouter(prefix="/admin/blogs", tags=["admin-blogs"])

COVER_UPLOAD_DIR = Path("uploads/blog_covers")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _counts(blog_id, db: Session):
    likes_count = db.query(BlogLike).filter(BlogLike.blog_id == blog_id).count()
    comment_count = db.query(BlogComment).filter(BlogComment.blog_id == blog_id).count()
    return likes_count, comment_count


def _submitter_name(b: Blog, db: Session) -> str | None:
    """The account that submitted this post, if a member did. None for
    an admin-written post, which is how the review screen tells the two
    apart and why there is nobody to write back to on approval."""
    if not b.submitted_by_user_id:
        return None
    user = db.query(User).filter(User.id == b.submitted_by_user_id).first()
    return user.name if user else None


def _to_list_out(b: Blog, db: Session, current_admin: AdminUser) -> BlogListItemOut:
    likes_count, comment_count = _counts(b.id, db)
    liked_by_me = (
        db.query(BlogLike).filter(BlogLike.blog_id == b.id, BlogLike.admin_id == current_admin.id).first()
        is not None
    )
    return BlogListItemOut(
        id=b.id, title=b.title, excerpt=b.excerpt, author_name=b.author_name,
        published_at=b.published_at, cover_image_url=b.cover_image_url,
        is_published=b.is_published, likes_count=likes_count, liked_by_me=liked_by_me, comment_count=comment_count,
        status=b.status, review_note=b.review_note, submitted_by_name=_submitter_name(b, db),
    )


def _to_detail_out(b: Blog, db: Session, current_admin: AdminUser) -> BlogDetailOut:
    likes_count, comment_count = _counts(b.id, db)
    liked_by_me = (
        db.query(BlogLike).filter(BlogLike.blog_id == b.id, BlogLike.admin_id == current_admin.id).first()
        is not None
    )
    return BlogDetailOut(
        id=b.id, title=b.title, excerpt=b.excerpt, body=b.body, author_name=b.author_name,
        published_at=b.published_at, cover_image_url=b.cover_image_url, is_published=b.is_published,
        likes_count=likes_count, liked_by_me=liked_by_me, comment_count=comment_count,
        status=b.status, review_note=b.review_note, submitted_by_name=_submitter_name(b, db),
    )


@router.post("", response_model=BlogDetailOut, status_code=status.HTTP_201_CREATED)
def create_blog(
    payload: BlogCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = Blog(
        title=payload.title, excerpt=payload.excerpt, body=payload.body,
        author_name=payload.author_name, is_published=payload.is_published,
        # An admin writing in the panel IS the review. An unpublished one
        # is their own draft, not a submission in anyone's queue, so it
        # never gets status "pending".
        status="published" if payload.is_published else "draft",
    )
    db.add(blog)
    db.commit()
    db.refresh(blog)
    return _to_detail_out(blog, db, current_admin)


@router.get("", response_model=list[BlogListItemOut])
def list_all_blogs(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Unlike the public listing (blogs.py), this returns drafts too —
    admin needs to see and edit unpublished posts.
    """
    blogs = db.query(Blog).order_by(Blog.published_at.desc()).all()
    return [_to_list_out(b, db, current_admin) for b in blogs]


@router.put("/{blog_id}", response_model=BlogDetailOut)
def update_blog(
    blog_id: str,
    payload: BlogUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if payload.title is not None:
        blog.title = payload.title
    if payload.excerpt is not None:
        blog.excerpt = payload.excerpt
    if payload.body is not None:
        blog.body = payload.body
    if payload.author_name is not None:
        blog.author_name = payload.author_name
    if payload.is_published is not None:
        blog.is_published = payload.is_published
    db.commit()
    db.refresh(blog)
    return _to_detail_out(blog, db, current_admin)


# --- Review queue: a member submitted a post, an admin decides --------------
#
# Approve and reject are separate endpoints rather than one "set the
# status" call, because they are not symmetrical: rejecting carries a
# reason the author is owed, approving publishes something to the public
# site. Each also writes to the author, so each deserves to be a
# deliberate act with its own name in the log.


def _notify_author(blog: Blog, db: Session, approved: bool, reason: str = "") -> None:
    """Write back to whoever submitted it. Never raises — the decision
    is already committed, and a Twilio or SMTP failure must not be
    reported to the admin as a failure to approve.

    Silently does nothing for an admin-written post: there is no
    submitter to write to.
    """
    try:
        if not blog.submitted_by_user_id:
            return
        author = db.query(User).filter(User.id == blog.submitted_by_user_id).first()
        if not author:
            return
        name = author.name or "there"
        if approved:
            if author.phone:
                send_blog_approved_whatsapp(author.phone, name, blog.title)
            if author.email:
                send_blog_approved_email(author.email, name, blog.title)
        else:
            if author.phone:
                send_blog_rejected_whatsapp(author.phone, name, blog.title, reason)
            if author.email:
                send_blog_rejected_email(author.email, name, blog.title, reason)
    except Exception:
        pass


@router.post("/{blog_id}/approve", response_model=BlogDetailOut)
def approve_blog(
    blog_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    blog.status = "published"
    blog.is_published = True
    blog.review_note = None  # a previous rejection no longer applies
    blog.reviewed_at = datetime.now(timezone.utc)
    # Dated from when it went live, not from when it was written — the
    # public list orders by this, and a post approved weeks after
    # submission should appear as today's, not buried mid-list.
    blog.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(blog)

    _notify_author(blog, db, approved=True)
    return _to_detail_out(blog, db, current_admin)


@router.post("/{blog_id}/reject", response_model=BlogDetailOut)
def reject_blog(
    blog_id: str,
    payload: BlogRejectRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    reason = payload.reason.strip()
    blog.status = "rejected"
    blog.is_published = False
    blog.review_note = reason
    blog.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(blog)

    _notify_author(blog, db, approved=False, reason=reason)
    return _to_detail_out(blog, db, current_admin)


@router.delete("/{blog_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blog(
    blog_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    db.query(BlogComment).filter(BlogComment.blog_id == blog.id).delete()
    db.query(BlogLike).filter(BlogLike.blog_id == blog.id).delete()
    db.delete(blog)
    db.commit()


@router.post("/{blog_id}/upload-cover", response_model=BlogDetailOut)
async def upload_blog_cover(
    blog_id: str,
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPEG, PNG, or WEBP images are allowed.")
    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be smaller than 5MB.")

    COVER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(COVER_UPLOAD_DIR / stored_name, "wb") as out:
        out.write(contents)

    blog.cover_image_url = f"/api/uploads/blog_covers/{stored_name}"
    db.commit()
    db.refresh(blog)
    return _to_detail_out(blog, db, current_admin)


# --- Comment moderation — every comment across every post, in one place ---

@router.get("/comments/all", response_model=list[BlogCommentOut])
def list_all_comments(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(BlogComment).order_by(BlogComment.created_at.desc()).all()
    return [_comment_to_out(c, db) for c in rows]


@router.post("/{blog_id}/like", response_model=BlogLikeToggleOut)
def toggle_blog_like_as_admin(
    blog_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    existing = db.query(BlogLike).filter(BlogLike.blog_id == blog.id, BlogLike.admin_id == current_admin.id).first()
    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(BlogLike(blog_id=blog.id, admin_id=current_admin.id))
        db.commit()
        liked = True
    likes_count = db.query(BlogLike).filter(BlogLike.blog_id == blog.id).count()
    return BlogLikeToggleOut(liked=liked, likes_count=likes_count)


@router.post("/{blog_id}/comments", response_model=BlogCommentOut, status_code=status.HTTP_201_CREATED)
def add_blog_comment_as_admin(
    blog_id: str,
    payload: BlogCommentCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    blog = db.query(Blog).filter(Blog.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    comment = BlogComment(blog_id=blog.id, admin_id=current_admin.id, content=payload.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_to_out(comment, db)


@router.put("/comments/{comment_id}", response_model=BlogCommentOut)
def edit_comment_as_admin(
    comment_id: str,
    payload: BlogCommentUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    comment = db.query(BlogComment).filter(BlogComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    comment.content = payload.content
    db.commit()
    db.refresh(comment)
    return _comment_to_out(comment, db)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment_as_admin(
    comment_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    comment = db.query(BlogComment).filter(BlogComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    db.delete(comment)
    db.commit()
