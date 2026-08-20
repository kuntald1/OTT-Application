from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Menu
from app.schemas import MenuOut

router = APIRouter(prefix="/menus", tags=["menus"])


@router.get("", response_model=list[MenuOut])
def list_menus(db: Session = Depends(get_db)):
    # Public, no auth — the whole site's nav depends on this loading fast
    # and reliably. Returns a FLAT list ordered so parents naturally come
    # before children isn't guaranteed by this order alone — the frontend
    # builds the parent/child tree itself using parent_menu_id, not order.
    return (
        db.query(Menu)
        .filter(Menu.is_active == True)  # noqa: E712
        .order_by(Menu.display_order)
        .all()
    )
