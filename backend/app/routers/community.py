import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_user_optional
from app.models import User, CommunityRoom, RoomPost, PostReply, PostLike
from app.schemas import (
    RoomSummaryOut, RoomDetailOut, RoomCreate,
    PostOut, PostCreate, ReplyOut, ReplyCreate, LikeToggleOut,
)

router = APIRouter(prefix="/community/rooms", tags=["community"])

UPLOAD_DIR = Path("uploads/room_posts")
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


def _post_to_out(post: RoomPost, db: Session, viewer: User | None) -> PostOut:
    likes_count = db.query(PostLike).filter(PostLike.post_id == post.id).count()
    liked_by_me = False
    if viewer:
        liked_by_me = (
            db.query(PostLike)
            .filter(PostLike.post_id == post.id, PostLike.user_id == viewer.id)
            .first()
            is not None
        )
    replies = (
        db.query(PostReply)
        .filter(PostReply.post_id == post.id)
        .order_by(PostReply.created_at.asc())
        .all()
    )
    reply_outs = [
        ReplyOut(
            id=r.id,
            author_user_id=r.author_user_id,
            author_name=db.query(User).filter(User.id == r.author_user_id).first().name,
            text=r.text,
            created_at=r.created_at,
        )
        for r in replies
    ]
    author = db.query(User).filter(User.id == post.author_user_id).first()
    return PostOut(
        id=post.id,
        author_user_id=post.author_user_id,
        author_name=author.name if author else "Unknown",
        text=post.text,
        image_url=post.image_url,
        likes_count=likes_count,
        liked_by_me=liked_by_me,
        replies=reply_outs,
        created_at=post.created_at,
    )


@router.get("", response_model=list[RoomSummaryOut])
def list_rooms(db: Session = Depends(get_db)):
    rooms = db.query(CommunityRoom).order_by(CommunityRoom.created_at.desc()).all()
    out = []
    for room in rooms:
        creator = db.query(User).filter(User.id == room.created_by_user_id).first()
        post_count = db.query(RoomPost).filter(RoomPost.room_id == room.id).count()
        out.append(RoomSummaryOut(
            id=room.id,
            title=room.title,
            created_by_name=creator.name if creator else "Unknown",
            post_count=post_count,
            created_at=room.created_at,
        ))
    return out


@router.post("", response_model=RoomSummaryOut, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = CommunityRoom(title=payload.title, created_by_user_id=current_user.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    return RoomSummaryOut(
        id=room.id, title=room.title, created_by_name=current_user.name,
        post_count=0, created_at=room.created_at,
    )


@router.get("/{room_id}", response_model=RoomDetailOut)
def get_room(
    room_id: str,
    viewer: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    room = db.query(CommunityRoom).filter(CommunityRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    creator = db.query(User).filter(User.id == room.created_by_user_id).first()
    posts = (
        db.query(RoomPost)
        .filter(RoomPost.room_id == room.id)
        .order_by(RoomPost.created_at.desc())
        .all()
    )
    return RoomDetailOut(
        id=room.id,
        title=room.title,
        created_by_name=creator.name if creator else "Unknown",
        posts=[_post_to_out(p, db, viewer) for p in posts],
        created_at=room.created_at,
    )


@router.post("/{room_id}/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    room_id: str,
    text: str = Form(...),
    image: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = db.query(CommunityRoom).filter(CommunityRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    image_url = None
    if image is not None and image.filename:
        if image.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only JPEG, PNG, WEBP, or GIF images are allowed.",
            )
        contents = await image.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Image must be smaller than 5MB.",
            )
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        ext = os.path.splitext(image.filename)[1].lower() or ".jpg"
        filename = f"{uuid_module.uuid4()}{ext}"
        with open(UPLOAD_DIR / filename, "wb") as f:
            f.write(contents)
        image_url = f"/api/uploads/room_posts/{filename}"

    post = RoomPost(
        room_id=room.id,
        author_user_id=current_user.id,
        text=text,
        image_url=image_url,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_to_out(post, db, current_user)


@router.post("/{room_id}/posts/{post_id}/replies", response_model=ReplyOut, status_code=status.HTTP_201_CREATED)
def create_reply(
    room_id: str,
    post_id: str,
    payload: ReplyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(RoomPost).filter(RoomPost.id == post_id, RoomPost.room_id == room_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    reply = PostReply(post_id=post.id, author_user_id=current_user.id, text=payload.text)
    db.add(reply)
    db.commit()
    db.refresh(reply)
    return ReplyOut(
        id=reply.id, author_user_id=current_user.id, author_name=current_user.name, text=reply.text, created_at=reply.created_at,
    )


@router.post("/{room_id}/posts/{post_id}/like", response_model=LikeToggleOut)
def toggle_like(
    room_id: str,
    post_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(RoomPost).filter(RoomPost.id == post_id, RoomPost.room_id == room_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    existing = (
        db.query(PostLike)
        .filter(PostLike.post_id == post.id, PostLike.user_id == current_user.id)
        .first()
    )
    if existing:
        db.delete(existing)
        liked = False
    else:
        db.add(PostLike(post_id=post.id, user_id=current_user.id))
        liked = True
    db.commit()

    likes_count = db.query(PostLike).filter(PostLike.post_id == post.id).count()
    return LikeToggleOut(liked=liked, likes_count=likes_count)
