from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.age_gate import blocked_ratings_for
from app.database import get_db
from app.deps import get_current_user
from app.models import AgeRating, MyListItem, User, Video
from app.schemas import MyListItemIn, MyListItemOut, MyListToggleResponse

router = APIRouter(prefix="/my-list", tags=["my-list"])


@router.get("", response_model=list[MyListItemOut])
def list_my_list(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(MyListItem)
        .filter(MyListItem.user_id == current_user.id)
        .order_by(MyListItem.created_at.desc())
        .all()
    )

    # Age restriction (see app/age_gate.py). My List deliberately has no
    # FK to Video (see MyListItem's docstring — it also holds demo cards
    # with no backend row), so this looks the real videos up by id
    # instead of joining. Rows that match no video are left alone: they
    # are the demo cards, which carry no age rating at all.
    #
    # The saved row itself is kept, not deleted — if the restriction is
    # lifted, or the profile stops being a minor, the item reappears
    # exactly where it was.
    blocked = blocked_ratings_for(current_user, db)
    if not blocked:
        return items
    members = [AgeRating(r) for r in blocked if r in {e.value for e in AgeRating}]
    if not members:
        return items
    blocked_ids = {
        str(vid)
        for (vid,) in db.query(Video.id).filter(Video.age_rating.in_(members)).all()
    }
    return [item for item in items if str(item.item_id) not in blocked_ids]


@router.post("/toggle", response_model=MyListToggleResponse)
def toggle_my_list_item(
    payload: MyListItemIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Adds the item if it's not already saved, removes it if it is —
    same shape the frontend's "+" button already sends (title/image/
    meta/section), just now actually persisted instead of living only
    in React state, which was wiped on every refresh or logout.
    """
    existing = (
        db.query(MyListItem)
        .filter(MyListItem.user_id == current_user.id, MyListItem.item_id == payload.item_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return MyListToggleResponse(saved=False)

    db.add(MyListItem(
        user_id=current_user.id,
        item_id=payload.item_id,
        title=payload.title,
        image_url=payload.image_url,
        meta=payload.meta,
        section=payload.section,
    ))
    db.commit()
    return MyListToggleResponse(saved=True)


@router.delete("/{item_id}", response_model=MyListToggleResponse)
def remove_my_list_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(MyListItem)
        .filter(MyListItem.user_id == current_user.id, MyListItem.item_id == item_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
    return MyListToggleResponse(saved=False)
