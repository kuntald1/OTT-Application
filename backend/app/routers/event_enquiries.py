import json
import os
import uuid as uuid_module
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, UserRole, EventEnquiry, EventEnquiryAttachment, EventTicketTier,
)
from app.notifications import send_event_enquiry_acknowledgement
from app.schemas import EventEnquiryOut, EventEnquiryAttachmentOut, TicketTierOut, TicketTierIn

router = APIRouter(prefix="/event-enquiries", tags=["event-enquiries"])

UPLOAD_DIR = Path("uploads/event_documents")
ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB per file
MAX_FILES = 5

# Same taxonomy as the site's existing Category menu — kept in sync
# manually since the categories rarely change. A future public Events
# listing page filters approved enquiries using these exact values.
ALLOWED_CATEGORIES = {
    "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
    "Classical Theatre", "Experimental Theatre", "Popular Shows",
}


def _require_creator_or_organiser(user: User) -> None:
    if user.role not in (UserRole.content_creator, UserRole.plays_organiser):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Content Creator or Plays Organiser accounts can submit event listing enquiries.",
        )


def _to_out(
    enquiry: EventEnquiry,
    tiers: list[EventTicketTier],
    attachments: list[EventEnquiryAttachment],
) -> EventEnquiryOut:
    return EventEnquiryOut(
        id=enquiry.id,
        org_name=enquiry.org_name,
        org_about=enquiry.org_about,
        contact_person=enquiry.contact_person,
        contact_email=enquiry.contact_email,
        contact_phone=enquiry.contact_phone,
        event_title=enquiry.event_title,
        event_category=enquiry.event_category,
        event_description=enquiry.event_description,
        proposed_date=enquiry.proposed_date,
        proposed_time=enquiry.proposed_time,
        venue=enquiry.venue,
        remarks=enquiry.remarks,
        status=enquiry.status.value,
        admin_note=enquiry.admin_note,
        ticket_tiers=[
            TicketTierOut(id=t.id, tier_name=t.tier_name, price=t.price, quantity=t.quantity)
            for t in tiers
        ],
        attachments=[
            EventEnquiryAttachmentOut(id=a.id, file_url=a.file_url, original_filename=a.original_filename)
            for a in attachments
        ],
        created_at=enquiry.created_at,
    )


@router.post("", response_model=EventEnquiryOut, status_code=status.HTTP_201_CREATED)
async def submit_event_enquiry(
    org_name: str = Form(...),
    org_about: Optional[str] = Form(None),
    contact_person: str = Form(...),
    contact_email: str = Form(...),
    contact_phone: str = Form(...),
    event_title: str = Form(...),
    event_category: str = Form(...),
    event_description: Optional[str] = Form(None),
    proposed_date: str = Form(...),  # ISO date string, e.g. "2026-09-15"
    proposed_time: Optional[str] = Form(None),
    venue: str = Form(...),
    remarks: Optional[str] = Form(None),
    # JSON-encoded list of {tier_name, price, quantity} objects — sent as
    # a single form field since multipart/form-data doesn't support
    # nested arrays of objects natively.
    ticket_tiers: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator_or_organiser(current_user)

    if event_category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"event_category must be one of: {', '.join(sorted(ALLOWED_CATEGORIES))}",
        )

    try:
        proposed_date_parsed = datetime.fromisoformat(proposed_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="proposed_date must be a valid date (e.g. 2026-09-15).",
        )

    try:
        tiers_raw = json.loads(ticket_tiers)
        parsed_tiers = [TicketTierIn(**t) for t in tiers_raw]
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ticket_tiers must be a JSON array of {tier_name, price, quantity}.",
        )
    if not parsed_tiers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one ticket tier is required.",
        )

    if len(files) > MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can attach at most {MAX_FILES} files.",
        )

    enquiry = EventEnquiry(
        submitted_by_user_id=current_user.id,
        org_name=org_name,
        org_about=org_about,
        contact_person=contact_person,
        contact_email=contact_email,
        contact_phone=contact_phone,
        event_title=event_title,
        event_category=event_category,
        event_description=event_description,
        proposed_date=proposed_date_parsed,
        proposed_time=proposed_time,
        venue=venue,
        remarks=remarks,
    )
    db.add(enquiry)
    db.flush()

    saved_tiers = []
    for t in parsed_tiers:
        tier = EventTicketTier(
            enquiry_id=enquiry.id, tier_name=t.tier_name, price=t.price, quantity=t.quantity,
        )
        db.add(tier)
        saved_tiers.append(tier)

    saved_attachments = []
    for f in files:
        if not f.filename:
            continue
        if f.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{f.filename}': only JPEG, PNG, WEBP, GIF, or PDF files are allowed.",
            )
        contents = await f.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{f.filename}' exceeds the 10MB size limit.",
            )
        # Saved to a real folder on the server's disk (bind-mounted into
        # the container — see docker-compose.yml), not Docker's internal
        # storage, so files survive container rebuilds.
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        ext = os.path.splitext(f.filename)[1].lower() or ".bin"
        stored_name = f"{uuid_module.uuid4()}{ext}"
        with open(UPLOAD_DIR / stored_name, "wb") as out:
            out.write(contents)
        attachment = EventEnquiryAttachment(
            enquiry_id=enquiry.id,
            file_url=f"/api/uploads/event_documents/{stored_name}",
            original_filename=f.filename,
        )
        db.add(attachment)
        saved_attachments.append(attachment)

    db.commit()
    db.refresh(enquiry)

    # Acknowledgement email — best-effort, never blocks the response
    send_event_enquiry_acknowledgement(contact_email, org_name, event_title)

    return _to_out(enquiry, saved_tiers, saved_attachments)


@router.get("", response_model=list[EventEnquiryOut])
def list_my_event_enquiries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_creator_or_organiser(current_user)

    enquiries = (
        db.query(EventEnquiry)
        .filter(EventEnquiry.submitted_by_user_id == current_user.id)
        .order_by(EventEnquiry.created_at.desc())
        .all()
    )
    out = []
    for e in enquiries:
        tiers = db.query(EventTicketTier).filter(EventTicketTier.enquiry_id == e.id).all()
        attachments = (
            db.query(EventEnquiryAttachment)
            .filter(EventEnquiryAttachment.enquiry_id == e.id)
            .all()
        )
        out.append(_to_out(e, tiers, attachments))
    return out
