from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, User, DonationRegistration, DonationRegistrationStatus
from app.schemas import DonationRegistrationOut, DonationRegistrationRejectRequest

router = APIRouter(prefix="/admin/donation-registrations", tags=["admin-donation-registrations"])


def _to_out(r: DonationRegistration, user_name: str) -> DonationRegistrationOut:
    return DonationRegistrationOut(
        id=r.id, user_id=r.user_id, user_name=user_name, group_name=r.group_name,
        account_number=r.account_number, ifsc_code=r.ifsc_code, qr_code_url=r.qr_code_url,
        document_url=r.document_url, status=r.status.value, rejection_reason=r.rejection_reason,
        created_at=r.created_at, reviewed_at=r.reviewed_at,
    )


def _get_or_404(request_id: str, db: Session) -> tuple[DonationRegistration, User]:
    reg = db.query(DonationRegistration).filter(DonationRegistration.id == request_id).first()
    if not reg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found")
    user = db.query(User).filter(User.id == reg.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requesting user not found")
    return reg, user


@router.get("", response_model=list[DonationRegistrationOut])
def list_donation_registrations(
    status_filter: str = "",
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    query = db.query(DonationRegistration, User.name).join(User, User.id == DonationRegistration.user_id)
    if status_filter:
        try:
            query = query.filter(DonationRegistration.status == DonationRegistrationStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter.")
    rows = query.order_by(DonationRegistration.created_at.desc()).all()
    return [_to_out(r, name) for r, name in rows]


@router.post("/{request_id}/approve", response_model=DonationRegistrationOut)
def approve_donation_registration(
    request_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    reg, user = _get_or_404(request_id, db)
    reg.status = DonationRegistrationStatus.approved
    reg.rejection_reason = None
    reg.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reg)
    return _to_out(reg, user.name)


@router.post("/{request_id}/reject", response_model=DonationRegistrationOut)
def reject_donation_registration(
    request_id: str,
    payload: DonationRegistrationRejectRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    reg, user = _get_or_404(request_id, db)
    reg.status = DonationRegistrationStatus.rejected
    reg.rejection_reason = payload.reason
    reg.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reg)
    return _to_out(reg, user.name)


@router.post("/{request_id}/disable", response_model=DonationRegistrationOut)
def disable_donation_registration(
    request_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Distinct from reject — this applies to a registration that was
    already approved (see DonationRegistration's docstring). Disabling
    doesn't touch rejection_reason, since it's not a rejection.
    """
    reg, user = _get_or_404(request_id, db)
    reg.status = DonationRegistrationStatus.disabled
    reg.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reg)
    return _to_out(reg, user.name)
