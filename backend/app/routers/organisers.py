from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, DonationRegistration, DonationRegistrationStatus
from app.schemas import OrganiserOut

router = APIRouter(prefix="/organisers", tags=["organisers"])


@router.get("", response_model=list[OrganiserOut])
def list_organisers(db: Session = Depends(get_db)):
    # Public — the donation directory needs to be browsable before login.
    # Only users who are (a) role "plays_organiser" AND (b) have an
    # admin-approved DonationRegistration appear here — having the role
    # alone used to be enough, but donation targets now need their
    # payout details reviewed and approved first (see
    # DonationRegistration's docstring).
    return (
        db.query(User)
        .join(DonationRegistration, DonationRegistration.user_id == User.id)
        .filter(
            User.role == UserRole.plays_organiser,
            User.is_active == True,  # noqa: E712
            DonationRegistration.status == DonationRegistrationStatus.approved,
        )
        .distinct()
        .order_by(User.name)
        .all()
    )
