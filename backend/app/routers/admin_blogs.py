import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, Blog, BlogComment, BlogLike, User
from app.schemas import BlogCreate, BlogUpdate, BlogListItemOut, BlogDetailOut, BlogCommentOut, BlogCommentUpdate

router = APIRouter(prefix="/admin/blogs", tags=["admin-blogs"])

COVER_UPLOAD_DIR = Path("uploads/blog_covers")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


def _counts(blog_id, db: Session):
    likes_count = db.query(BlogLike).filter(BlogLike.blog_id == blog_id).count()
    comment_count = db.query(BlogComment).filter(BlogComment.blog_id == blog_id).count()
    return likes_count, comment_count


def _to_list_out(b: Blog, db: Session) -> BlogListItemOut:
    likes_count, comment_count = _counts(b.id, db)
    return BlogListItemOut(
        id=b.id, title=b.title, excerpt=b.excerpt, author_name=b.author_name,
        published_at=b.published_at, cover_image_url=b.cover_image_url,
        is_published=b.is_published, likes_count=likes_count, comment_count=comment_count,
    )


def _to_detail_out(b: Blog, db: Session) -> BlogDetailOut:
    likes_count, comment_count = _counts(b.id, db)
    return BlogDetailOut(
        id=b.id, title=b.title, excerpt=b.excerpt, body=b.body, author_name=b.author_name,
        published_at=b.published_at, cover_image_url=b.cover_image_url, is_published=b.is_published,
        likes_count=likes_count, liked_by_me=False, comment_count=comment_count,
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
    )
    db.add(blog)
    db.commit()
    db.refresh(blog)
    return _to_detail_out(blog, db)


@router.get("", response_model=list[BlogListItemOut])
def list_all_blogs(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Unlike the public listing (blogs.py), this returns drafts too —
    admin needs to see and edit unpublished posts.
    """
    blogs = db.query(Blog).order_by(Blog.published_at.desc()).all()
    return [_to_list_out(b, db) for b in blogs]


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
    return _to_detail_out(blog, db)


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
    return _to_detail_out(blog, db)


# --- Comment moderation — every comment across every post, in one place ---

@router.get("/comments/all", response_model=list[BlogCommentOut])
def list_all_comments(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(BlogComment, User.name)
        .join(User, User.id == BlogComment.user_id)
        .order_by(BlogComment.created_at.desc())
        .all()
    )
    return [
        BlogCommentOut(id=c.id, blog_id=c.blog_id, user_id=c.user_id, user_name=name, content=c.content, created_at=c.created_at)
        for c, name in rows
    ]


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
    user = db.query(User).filter(User.id == comment.user_id).first()
    return BlogCommentOut(
        id=comment.id, blog_id=comment.blog_id, user_id=comment.user_id,
        user_name=user.name if user else "Unknown", content=comment.content, created_at=comment.created_at,
    )


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
