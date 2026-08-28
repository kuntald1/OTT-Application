from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import Blog, BlogComment, BlogLike, User
from app.schemas import BlogListItemOut, BlogDetailOut, BlogCommentCreate, BlogCommentOut, BlogLikeToggleOut

router = APIRouter(prefix="/blogs", tags=["blogs"])


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


@router.get("/{blog_id}", response_model=BlogDetailOut)
def get_blog(
    blog_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    blog = (
        db.query(Blog)
        .filter(Blog.id == blog_id, Blog.is_published == True)  # noqa: E712
        .first()
    )
    if not blog:
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
        db.query(BlogComment, User.name)
        .join(User, User.id == BlogComment.user_id)
        .filter(BlogComment.blog_id == blog_id)
        .order_by(BlogComment.created_at.desc())
        .all()
    )
    return [
        BlogCommentOut(id=c.id, blog_id=c.blog_id, user_id=c.user_id, user_name=name, content=c.content, created_at=c.created_at)
        for c, name in rows
    ]


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
    return BlogCommentOut(
        id=comment.id, blog_id=comment.blog_id, user_id=comment.user_id,
        user_name=current_user.name, content=comment.content, created_at=comment.created_at,
    )


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
