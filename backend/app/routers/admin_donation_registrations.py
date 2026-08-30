import os
import uuid as uuid_module
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, User, UserRole, DonationRegistration, DonationRegistrationStatus
from app.schemas import DonationRegistrationOut, DonationRegistrationRejectRequest
from app.notifications import (
    send_donation_registration_approved_email, send_donation_registration_approved_whatsapp,
    send_donation_registration_rejected_email, send_donation_registration_rejected_whatsapp,
)

router = APIRouter(prefix="/admin/donation-registrations", tags=["admin-donation-registrations"])

DOCUMENT_UPLOAD_DIR = Path("uploads/donation_documents")
QR_UPLOAD_DIR = Path("uploads/donation_qr_codes")
ALLOWED_DOCUMENT_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
ALLOWED_QR_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


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


async def _save_upload(file: UploadFile, upload_dir: Path, allowed_types: set, url_prefix: str) -> str:
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File type not allowed.")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be smaller than 5MB.")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(upload_dir / stored_name, "wb") as out:
        out.write(contents)
    return f"/api/uploads/{url_prefix}/{stored_name}"


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


@router.post("", response_model=DonationRegistrationOut, status_code=status.HTTP_201_CREATED)
async def create_donation_registration_as_admin(
    user_id: str = Form(...),
    group_name: str = Form(...),
    account_number: str = Form(""),
    ifsc_code: str = Form(""),
    qr_code: UploadFile | None = File(None),
    document: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Lets admin register donation details on behalf of a Plays
    Organiser directly — same fields and validation as the public
    self-submit endpoint, just with admin picking the target user
    instead of it being the logged-in user.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role != UserRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This user isn't a Plays Organiser.")

    has_bank_details = bool(account_number.strip() and ifsc_code.strip())
    has_qr = qr_code is not None and bool(qr_code.filename)
    if not has_bank_details and not has_qr:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide either bank details (account number + IFSC) or a QR code.")

    qr_code_url = None
    if has_qr:
        qr_code_url = await _save_upload(qr_code, QR_UPLOAD_DIR, ALLOWED_QR_TYPES, "donation_qr_codes")
    document_url = await _save_upload(document, DOCUMENT_UPLOAD_DIR, ALLOWED_DOCUMENT_TYPES, "donation_documents")

    reg = DonationRegistration(
        user_id=user.id, group_name=group_name,
        account_number=account_number.strip() or None, ifsc_code=ifsc_code.strip() or None,
        qr_code_url=qr_code_url, document_url=document_url,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return _to_out(reg, user.name)


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

    send_donation_registration_approved_email(user.email, user.name, reg.group_name)
    send_donation_registration_approved_whatsapp(user.phone or "", user.name, reg.group_name)

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

    send_donation_registration_rejected_email(user.email, user.name, reg.group_name, payload.reason)
    send_donation_registration_rejected_whatsapp(user.phone or "", user.name, reg.group_name, payload.reason)

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


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_donation_registration(
    request_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    reg, _ = _get_or_404(request_id, db)
    db.delete(reg)
    db.commit()
