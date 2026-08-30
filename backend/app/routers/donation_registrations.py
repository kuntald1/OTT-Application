import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserRole, DonationRegistration, DonationRegistrationStatus
from app.schemas import DonationRegistrationOut, MyDonationRegistrationStatusOut

router = APIRouter(prefix="/donation-registrations", tags=["donation-registrations"])

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


@router.post("", response_model=DonationRegistrationOut, status_code=status.HTTP_201_CREATED)
async def submit_donation_registration(
    group_name: str = Form(...),
    account_number: str = Form(""),
    ifsc_code: str = Form(""),
    qr_code: UploadFile | None = File(None),
    document: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != UserRole.plays_organiser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Plays Organiser accounts can register for donations.")

    has_bank_details = bool(account_number.strip() and ifsc_code.strip())
    has_qr = qr_code is not None and bool(qr_code.filename)
    if not has_bank_details and not has_qr:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide either bank details (account number + IFSC) or a QR code.")

    existing_pending = (
        db.query(DonationRegistration)
        .filter(DonationRegistration.user_id == current_user.id, DonationRegistration.status == DonationRegistrationStatus.pending)
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a registration awaiting review.")

    qr_code_url = None
    if has_qr:
        qr_code_url = await _save_upload(qr_code, QR_UPLOAD_DIR, ALLOWED_QR_TYPES, "donation_qr_codes")
    document_url = await _save_upload(document, DOCUMENT_UPLOAD_DIR, ALLOWED_DOCUMENT_TYPES, "donation_documents")

    reg = DonationRegistration(
        user_id=current_user.id, group_name=group_name,
        account_number=account_number.strip() or None, ifsc_code=ifsc_code.strip() or None,
        qr_code_url=qr_code_url, document_url=document_url,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return _to_out(reg, current_user.name)


@router.get("/mine", response_model=MyDonationRegistrationStatusOut)
def my_donation_registration_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    latest = (
        db.query(DonationRegistration)
        .filter(DonationRegistration.user_id == current_user.id)
        .order_by(DonationRegistration.created_at.desc())
        .first()
    )
    if not latest:
        return MyDonationRegistrationStatusOut(has_pending_or_approved=False, latest_status=None)
    has_pending_or_approved = latest.status in (DonationRegistrationStatus.pending, DonationRegistrationStatus.approved)
    return MyDonationRegistrationStatusOut(has_pending_or_approved=has_pending_or_approved, latest_status=latest.status.value)
