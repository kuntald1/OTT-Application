from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Blog
from app.schemas import BlogListItemOut, BlogDetailOut

router = APIRouter(prefix="/blogs", tags=["blogs"])


@router.get("", response_model=list[BlogListItemOut])
def list_blogs(db: Session = Depends(get_db)):
    return (
        db.query(Blog)
        .filter(Blog.is_published == True)  # noqa: E712
        .order_by(Blog.published_at.desc())
        .all()
    )


@router.get("/{blog_id}", response_model=BlogDetailOut)
def get_blog(blog_id: str, db: Session = Depends(get_db)):
    blog = (
        db.query(Blog)
        .filter(Blog.id == blog_id, Blog.is_published == True)  # noqa: E712
        .first()
    )
    if not blog:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return blog
