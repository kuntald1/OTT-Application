import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, Ticket, TicketSource
from app.schemas import TicketCreate, TicketOut

router = APIRouter(prefix="/tickets", tags=["tickets"])


def _generate_ticket_number(db: Session) -> str:
    # Same format the frontend used to fake locally (TCK-XXXXXX) — retry on
    # the rare collision rather than trusting randomness alone.
    for _ in range(10):
        number = f"TCK-{random.randint(100000, 999999)}"
        if not db.query(Ticket).filter(Ticket.ticket_number == number).first():
            return number
    raise RuntimeError("Could not generate a unique ticket number")


@router.post("", response_model=TicketOut, status_code=201)
def create_ticket(
    payload: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        source = TicketSource(payload.source)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid source.")

    ticket = Ticket(
        user_id=current_user.id,
        ticket_number=_generate_ticket_number(db),
        subject=payload.subject,
        description=payload.description,
        source=source,
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
