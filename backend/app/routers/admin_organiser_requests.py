from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, User, UserRole, OrganiserRequest, OrganiserRequestStatus
from app.schemas import OrganiserRequestOut, OrganiserRequestRejectRequest
from app.notifications import (
    send_organiser_request_approved_email, send_organiser_request_approved_whatsapp,
    send_organiser_request_rejected_email, send_organiser_request_rejected_whatsapp,
)

router = APIRouter(prefix="/admin/organiser-requests", tags=["admin-organiser-requests"])


def _to_out(r: OrganiserRequest, user_name: str) -> OrganiserRequestOut:
    return OrganiserRequestOut(
        id=r.id, user_id=r.user_id, user_name=user_name, subject=r.subject, group_name=r.group_name,
        phone=r.phone, email=r.email, remarks=r.remarks, status=r.status.value,
        rejection_reason=r.rejection_reason, created_at=r.created_at, reviewed_at=r.reviewed_at,
    )


@router.get("", response_model=list[OrganiserRequestOut])
def list_organiser_requests(
    status_filter: str = "",
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(OrganiserRequest, User.name).join(User, User.id == OrganiserRequest.user_id)
    if status_filter:
        try:
            query = query.filter(OrganiserRequest.status == OrganiserRequestStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter.")
    rows = query.order_by(OrganiserRequest.created_at.desc()).all()
    return [_to_out(r, name) for r, name in rows]


@router.post("/{request_id}/approve", response_model=OrganiserRequestOut)
def approve_organiser_request(
    request_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    req = db.query(OrganiserRequest).filter(OrganiserRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requesting user not found")

    req.status = OrganiserRequestStatus.approved
    req.reviewed_at = datetime.now(timezone.utc)
    user.role = UserRole.plays_organiser
    db.commit()
    db.refresh(req)

    send_organiser_request_approved_email(user.email, user.name)
    send_organiser_request_approved_whatsapp(user.phone or "", user.name)

    return _to_out(req, user.name)


@router.post("/{request_id}/reject", response_model=OrganiserRequestOut)
def reject_organiser_request(
    request_id: str,
    payload: OrganiserRequestRejectRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    req = db.query(OrganiserRequest).filter(OrganiserRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requesting user not found")

    req.status = OrganiserRequestStatus.rejected
    req.rejection_reason = payload.reason
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)

    send_organiser_request_rejected_email(user.email, user.name, payload.reason)
    send_organiser_request_rejected_whatsapp(user.phone or "", user.name, payload.reason)

    return _to_out(req, user.name)
