from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole
from app.schemas import OrganiserOut

router = APIRouter(prefix="/organisers", tags=["organisers"])


@router.get("", response_model=list[OrganiserOut])
def list_organisers(db: Session = Depends(get_db)):
    # Public — the donation directory needs to be browsable before login.
    # Only real registered users whose role is "plays_organiser" appear
    # here; nothing hardcoded or fictional.
    return (
        db.query(User)
        .filter(User.role == UserRole.plays_organiser, User.is_active == True)  # noqa: E712
        .order_by(User.name)
        .all()
    )
