from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserRole, DonationRegistration, DonationRegistrationStatus
from app.schemas import OrganiserOut, OrganiserDonationDetailsOut

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


@router.get("/{organiser_user_id}/donation-details", response_model=OrganiserDonationDetailsOut)
def organiser_donation_details(
    organiser_user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Where to send a donation to this organiser.

    Signing in is required. The directory above is public, but a bank
    account number and IFSC sitting on an open page are an invitation
    to collect in somebody else's name, and to be scraped — so the
    account details sit behind a login even though the list does not.

    Only an APPROVED registration answers: a pending or rejected one
    has details an admin has not vouched for.
    """
    row = (
        db.query(DonationRegistration, User)
        .join(User, DonationRegistration.user_id == User.id)
        .filter(
            DonationRegistration.user_id == organiser_user_id,
            DonationRegistration.status == DonationRegistrationStatus.approved,
            User.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This organiser isn't accepting donations right now.",
        )

    registration, organiser = row
    return OrganiserDonationDetailsOut(
        organiser_user_id=organiser.id,
        organiser_name=organiser.name,
        group_name=registration.group_name,
        account_number=registration.account_number,
        ifsc_code=registration.ifsc_code,
        qr_code_url=registration.qr_code_url,
    )
