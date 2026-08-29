import os
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, EventEnquiry, EventTicketTier, EventEnquiryAttachment, EnquiryStatus
from app.schemas import EventEnquiryOut, AdminVideoRejectRequest, EventEnquiryEdit
from app.routers.event_enquiries import _to_out, ALLOWED_CATEGORIES, POSTER_UPLOAD_DIR, ALLOWED_POSTER_TYPES, MAX_POSTER_BYTES
from app.notifications import (
    send_enquiry_approved_email, send_enquiry_approved_whatsapp,
    send_enquiry_rejected_email, send_enquiry_rejected_whatsapp,
)

router = APIRouter(prefix="/admin/event-enquiries", tags=["admin-event-enquiries"])

# Same day-to-day operational scope as video review — available to both
# admin and superadmin roles.


def _get_enquiry_or_404(enquiry_id: str, db: Session) -> EventEnquiry:
    enquiry = db.query(EventEnquiry).filter(EventEnquiry.id == enquiry_id).first()
    if not enquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enquiry not found")
    return enquiry


def _full_out(enquiry: EventEnquiry, db: Session) -> EventEnquiryOut:
    tiers = db.query(EventTicketTier).filter(EventTicketTier.enquiry_id == enquiry.id).all()
    attachments = db.query(EventEnquiryAttachment).filter(EventEnquiryAttachment.enquiry_id == enquiry.id).all()
    return _to_out(enquiry, tiers, attachments)


@router.get("", response_model=list[EventEnquiryOut])
def list_enquiries_for_review(
    status_filter: str = "pending",
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if status_filter not in ("pending", "approved", "rejected", "all"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")

    query = db.query(EventEnquiry)
    if status_filter != "all":
        query = query.filter(EventEnquiry.status == EnquiryStatus(status_filter))
    enquiries = query.order_by(EventEnquiry.created_at.desc()).all()
    return [_full_out(e, db) for e in enquiries]


@router.put("/{enquiry_id}", response_model=EventEnquiryOut)
def edit_enquiry(
    enquiry_id: str,
    payload: EventEnquiryEdit,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Full edit — works regardless of status. Attachments aren't
    editable from here yet (documented limitation) but everything else
    is. Does not change status."""
    enquiry = _get_enquiry_or_404(enquiry_id, db)

    if payload.event_category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"event_category must be one of: {', '.join(sorted(ALLOWED_CATEGORIES))}",
        )

    enquiry.org_name = payload.org_name
    enquiry.org_about = payload.org_about
    enquiry.contact_person = payload.contact_person
    enquiry.contact_email = payload.contact_email
    enquiry.contact_phone = payload.contact_phone
    enquiry.event_title = payload.event_title
    enquiry.event_category = payload.event_category
    enquiry.event_description = payload.event_description
    enquiry.proposed_date = payload.proposed_date
    enquiry.proposed_time = payload.proposed_time
    enquiry.venue = payload.venue
    enquiry.remarks = payload.remarks

    db.query(EventTicketTier).filter(EventTicketTier.enquiry_id == enquiry.id).delete()
    for t in payload.ticket_tiers:
        db.add(EventTicketTier(enquiry_id=enquiry.id, tier_name=t.tier_name, price=t.price, quantity=t.quantity))

    db.commit()
    db.refresh(enquiry)
    return _full_out(enquiry, db)


@router.post("/{enquiry_id}/approve", response_model=EventEnquiryOut)
def approve_enquiry(
    enquiry_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    enquiry = _get_enquiry_or_404(enquiry_id, db)
    enquiry.status = EnquiryStatus.approved
    enquiry.admin_note = None
    db.commit()
    db.refresh(enquiry)

    send_enquiry_approved_email(enquiry.contact_email, enquiry.contact_person, enquiry.event_title)
    send_enquiry_approved_whatsapp(enquiry.contact_phone, enquiry.contact_person, enquiry.event_title)

    return _full_out(enquiry, db)


@router.post("/{enquiry_id}/reject", response_model=EventEnquiryOut)
def reject_enquiry(
    enquiry_id: str,
    payload: AdminVideoRejectRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    enquiry = _get_enquiry_or_404(enquiry_id, db)
    enquiry.status = EnquiryStatus.rejected
    enquiry.admin_note = payload.admin_note
    db.commit()
    db.refresh(enquiry)

    send_enquiry_rejected_email(enquiry.contact_email, enquiry.contact_person, enquiry.event_title, payload.admin_note)
    send_enquiry_rejected_whatsapp(enquiry.contact_phone, enquiry.contact_person, enquiry.event_title, payload.admin_note)

    return _full_out(enquiry, db)


@router.post("/{enquiry_id}/upload-poster", response_model=EventEnquiryOut)
async def upload_enquiry_poster_as_admin(
    enquiry_id: str,
    file: UploadFile = File(...),
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    enquiry = _get_enquiry_or_404(enquiry_id, db)
    if file.content_type not in ALLOWED_POSTER_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPEG, PNG, or WEBP images are allowed.")
    contents = await file.read()
    if len(contents) > MAX_POSTER_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Poster must be smaller than 5MB.")

    POSTER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(POSTER_UPLOAD_DIR / stored_name, "wb") as out_file:
        out_file.write(contents)

    enquiry.poster_image_url = f"/api/uploads/event_posters/{stored_name}"
    db.commit()
    db.refresh(enquiry)
    return _full_out(enquiry, db)


@router.delete("/{enquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_enquiry(
    enquiry_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Permanently removes the enquiry, its ticket tiers, and its
    attachments — including the actual files on disk, not just the
    database rows referencing them.
    """
    enquiry = _get_enquiry_or_404(enquiry_id, db)

    attachments = db.query(EventEnquiryAttachment).filter(EventEnquiryAttachment.enquiry_id == enquiry.id).all()
    for a in attachments:
        try:
            local_path = Path(a.file_url.replace("/api/uploads/", "uploads/", 1))
            if local_path.exists():
                os.remove(local_path)
        except Exception:
            pass  # Non-fatal — worst case an orphaned file remains on disk

    db.query(EventEnquiryAttachment).filter(EventEnquiryAttachment.enquiry_id == enquiry.id).delete()
    db.query(EventTicketTier).filter(EventTicketTier.enquiry_id == enquiry.id).delete()
    db.delete(enquiry)
    db.commit()
