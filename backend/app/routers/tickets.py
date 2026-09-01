import os
import random
import uuid as uuid_module
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Ticket, TicketSource
from app.schemas import TicketOut

router = APIRouter(prefix="/tickets", tags=["tickets"])

IMAGE_UPLOAD_DIR = Path("uploads/ticket_images")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


def _generate_ticket_number(db: Session) -> str:
    # Same format the frontend used to fake locally (TCK-XXXXXX) — retry on
    # the rare collision rather than trusting randomness alone.
    for _ in range(10):
        number = f"TCK-{random.randint(100000, 999999)}"
        if not db.query(Ticket).filter(Ticket.ticket_number == number).first():
            return number
    raise RuntimeError("Could not generate a unique ticket number")


async def _save_image(file: UploadFile) -> str:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be JPEG, PNG, or WebP.")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be smaller than 5MB.")
    IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    stored_name = f"{uuid_module.uuid4()}{ext}"
    with open(IMAGE_UPLOAD_DIR / stored_name, "wb") as out:
        out.write(contents)
    return f"/api/uploads/ticket_images/{stored_name}"


@router.post("", response_model=TicketOut, status_code=201)
async def create_ticket(
    subject: str = Form(...),
    description: str = Form(""),
    source: str = Form("complaint"),
    image: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        source_enum = TicketSource(source)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source.")

    image_url = None
    if image is not None and image.filename:
        image_url = await _save_image(image)

    ticket = Ticket(
        user_id=current_user.id,
        ticket_number=_generate_ticket_number(db),
        subject=subject,
        description=description or None,
        source=source_enum,
        image_url=image_url,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("", response_model=list[TicketOut])
def list_my_tickets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Ticket)
        .filter(Ticket.user_id == current_user.id)
        .order_by(Ticket.created_at.desc())
        .all()
    )
