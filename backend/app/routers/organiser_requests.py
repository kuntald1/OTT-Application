from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserRole, OrganiserRequest, OrganiserRequestStatus
from app.schemas import OrganiserRequestCreate, OrganiserRequestOut, MyOrganiserRequestStatusOut

router = APIRouter(prefix="/organiser-requests", tags=["organiser-requests"])


def _to_out(r: OrganiserRequest, user_name: str) -> OrganiserRequestOut:
    return OrganiserRequestOut(
        id=r.id, user_id=r.user_id, user_name=user_name, subject=r.subject, group_name=r.group_name,
        phone=r.phone, email=r.email, remarks=r.remarks, status=r.status.value,
        rejection_reason=r.rejection_reason, created_at=r.created_at, reviewed_at=r.reviewed_at,
    )


@router.post("", response_model=OrganiserRequestOut, status_code=status.HTTP_201_CREATED)
def submit_organiser_request(
    payload: OrganiserRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You're already a Plays Organiser.")
    existing_pending = (
        db.query(OrganiserRequest)
        .filter(OrganiserRequest.user_id == current_user.id, OrganiserRequest.status == OrganiserRequestStatus.pending)
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a request awaiting review.")

    req = OrganiserRequest(
        user_id=current_user.id, subject=payload.subject, group_name=payload.group_name,
        phone=payload.phone, email=payload.email, remarks=payload.remarks,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _to_out(req, current_user.name)


@router.get("/mine", response_model=MyOrganiserRequestStatusOut)
def my_organiser_request_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Powers the profile dropdown's decision on whether to show
    "Request as Organiser" at all — see MyOrganiserRequestStatusOut's
    docstring for the exact hide/show rule.
    """
    if current_user.role == UserRole.plays_organiser:
        return MyOrganiserRequestStatusOut(has_pending_or_approved=True, latest_status="approved")

    latest = (
        db.query(OrganiserRequest)
        .filter(OrganiserRequest.user_id == current_user.id)
        .order_by(OrganiserRequest.created_at.desc())
        .first()
    )
    if not latest:
        return MyOrganiserRequestStatusOut(has_pending_or_approved=False, latest_status=None)
    has_pending_or_approved = latest.status in (OrganiserRequestStatus.pending, OrganiserRequestStatus.approved)
    return MyOrganiserRequestStatusOut(has_pending_or_approved=has_pending_or_approved, latest_status=latest.status.value)
