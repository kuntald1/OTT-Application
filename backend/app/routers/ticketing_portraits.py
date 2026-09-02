from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TicketingPortrait
from app.schemas import TicketingPortraitOut

router = APIRouter(prefix="/ticketing-portraits", tags=["ticketing-portraits"])


@router.get("", response_model=list[TicketingPortraitOut])
def list_ticketing_portraits(db: Session = Depends(get_db)):
    # Public, no auth — needs to render before login too, same as any
    # other browsing content.
    return db.query(TicketingPortrait).order_by(TicketingPortrait.display_order).all()
