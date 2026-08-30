import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, CommunityRoom, RoomPost, PostReply, PostLike
from app.schemas import RoomCreate, RoomSummaryOut, PostOut
from app.routers.community import _post_to_out, ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, UPLOAD_DIR

router = APIRouter(prefix="/admin/community/rooms", tags=["admin-community"])


@router.post("", response_model=RoomSummaryOut, status_code=status.HTTP_201_CREATED)
def create_room_as_admin(
    payload: RoomCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    room = CommunityRoom(title=payload.title, created_by_admin_id=current_admin.id)
    db.add(room)
    db.commit()
    db.refresh(room)
    return RoomSummaryOut(
        id=room.id, title=room.title, created_by_name=current_admin.name, is_admin_created=True,
        post_count=0, created_at=room.created_at,
    )


@router.post("/{room_id}/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post_as_admin(
    room_id: str,
    text: str = Form(...),
    image: UploadFile | None = File(None),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Lets admin post/comment inside ANY existing room, not just ones
    they created themselves — the whole point being to participate
    in user-created rooms too, not just admin-created ones.
    """
    room = db.query(CommunityRoom).filter(CommunityRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    image_url = None
    if image is not None and image.filename:
        if image.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPEG, PNG, WEBP, or GIF images are allowed.")
        contents = await image.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be smaller than 5MB.")
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        ext = os.path.splitext(image.filename)[1].lower() or ".jpg"
        filename = f"{uuid_module.uuid4()}{ext}"
        with open(UPLOAD_DIR / filename, "wb") as f:
            f.write(contents)
        image_url = f"/api/uploads/room_posts/{filename}"

    post = RoomPost(room_id=room.id, author_admin_id=current_admin.id, text=text, image_url=image_url)
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_to_out(post, db, None)


@router.delete("/{room_id}/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post_as_admin(
    room_id: str,
    post_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Deletes any comment — user- or admin-authored — in any room."""
    post = db.query(RoomPost).filter(RoomPost.id == post_id, RoomPost.room_id == room_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    db.query(PostReply).filter(PostReply.post_id == post.id).delete()
    db.query(PostLike).filter(PostLike.post_id == post.id).delete()
    db.delete(post)
    db.commit()


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room_as_admin(
    room_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    room = db.query(CommunityRoom).filter(CommunityRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    post_ids = [p.id for p in db.query(RoomPost).filter(RoomPost.room_id == room.id).all()]
    if post_ids:
        db.query(PostReply).filter(PostReply.post_id.in_(post_ids)).delete(synchronize_session=False)
        db.query(PostLike).filter(PostLike.post_id.in_(post_ids)).delete(synchronize_session=False)
        db.query(RoomPost).filter(RoomPost.room_id == room.id).delete(synchronize_session=False)
    db.delete(room)
    db.commit()
