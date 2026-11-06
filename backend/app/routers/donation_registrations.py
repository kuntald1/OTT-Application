import os
import uuid as uuid_module
from datetime import datetime, timezone
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
    document: UploadFile | None = File(None),
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
    document_url = None
    if document is not None and document.filename:
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


def _get_my_latest(current_user: User, db: Session) -> DonationRegistration:
    latest = (
        db.query(DonationRegistration)
        .filter(DonationRegistration.user_id == current_user.id)
        .order_by(DonationRegistration.created_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No registration found.")
    return latest


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
    return MyDonationRegistrationStatusOut(
        has_pending_or_approved=has_pending_or_approved, latest_status=latest.status.value,
        rejection_reason=latest.rejection_reason,
    )


@router.get("/mine/details", response_model=DonationRegistrationOut)
def my_donation_registration_details(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The organiser's own registration, values and all.

    /mine above answers only "do you have one, and what state is it in",
    which is what the Register link needs. This one is for the organiser
    editing their own payment details, so it hands back what is actually
    stored.
    """
    return _to_out(_get_my_latest(current_user, db), current_user.name)


@router.patch("/mine/payment-details", response_model=DonationRegistrationOut)
async def update_my_payment_details(
    account_number: str = Form(""),
    ifsc_code: str = Form(""),
    qr_code: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change where donations should be sent.

    This takes effect immediately and does NOT send the registration
    back for approval. What the admin approved is the organiser — that
    this person may collect donations through theomy at all — and that
    judgement does not change because they switched bank. Holding a new
    account number for review would only mean donations going to an
    account they have closed.

    The identity document is deliberately not editable here: it is the
    evidence the admin's decision rests on. Replacing it needs a new
    registration.

    Leaving a field empty clears it; omitting the QR file keeps the
    current image. A registration must always keep at least one way to
    be paid, so clearing everything is refused.
    """
    registration = _get_my_latest(current_user, db)
    if registration.status not in (
        DonationRegistrationStatus.pending,
        DonationRegistrationStatus.approved,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only a pending or approved registration can be updated.",
        )

    account = account_number.strip()
    ifsc = ifsc_code.strip()
    qr_url = registration.qr_code_url
    if qr_code is not None and qr_code.filename:
        qr_url = await _save_upload(qr_code, QR_UPLOAD_DIR, ALLOWED_QR_TYPES, "donation_qr_codes")

    has_bank = bool(account and ifsc)
    if not has_bank and not qr_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Keep either bank details (account number and IFSC) or a QR code.",
        )

    registration.account_number = account or None
    registration.ifsc_code = ifsc or None
    registration.qr_code_url = qr_url
    db.commit()
    db.refresh(registration)
    return _to_out(registration, current_user.name)


@router.patch("/mine/deactivate", response_model=DonationRegistrationOut)
def deactivate_my_donation_registration(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-service pause — an organiser taking a break from receiving
    donations, distinct from admin's own disable action but landing on
    the same status value (see DonationRegistration's docstring).
    """
    latest = _get_my_latest(current_user, db)
    if latest.status != DonationRegistrationStatus.approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only an approved registration can be deactivated.")
    latest.status = DonationRegistrationStatus.disabled
    latest.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(latest)
    return _to_out(latest, current_user.name)


@router.delete("/mine", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_donation_registration(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    latest = _get_my_latest(current_user, db)
    db.delete(latest)
    db.commit()
