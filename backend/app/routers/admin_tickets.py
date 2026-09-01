from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, User, Ticket
from app.schemas import AdminTicketOut, AdminTicketStatusUpdate

router = APIRouter(prefix="/admin/tickets", tags=["admin-tickets"])


@router.get("", response_model=list[AdminTicketOut])
def list_tickets(
    source: str | None = None,
    status_filter: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every Help Center submission (both the Message and Complain tabs
    land here — see Ticket.source) across every customer, most recent
    first. `source` filters to "message" | "complaint"; `status_filter`
    to a TicketStatus value (Open / In Progress / Resolved / Closed).
    """
    query = db.query(Ticket, User).join(User, Ticket.user_id == User.id)
    if source:
        query = query.filter(Ticket.source == source)
    if status_filter:
        query = query.filter(Ticket.status == status_filter)
    rows = query.order_by(Ticket.created_at.desc()).all()

    return [
        AdminTicketOut(
            id=t.id, ticket_number=t.ticket_number, customer_name=u.name, customer_email=u.email,
            subject=t.subject, description=t.description, status=t.status, source=t.source.value,
            created_at=t.created_at,
        )
        for t, u in rows
    ]


@router.put("/{ticket_id}/status", response_model=AdminTicketOut)
def update_ticket_status(
    ticket_id: str,
    payload: AdminTicketStatusUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    row = db.query(Ticket, User).join(User, Ticket.user_id == User.id).filter(Ticket.id == ticket_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    ticket, user = row
    ticket.status = payload.status
    db.commit()
    db.refresh(ticket)
    return AdminTicketOut(
        id=ticket.id, ticket_number=ticket.ticket_number, customer_name=user.name, customer_email=user.email,
        subject=ticket.subject, description=ticket.description, status=ticket.status, source=ticket.source.value,
        created_at=ticket.created_at,
    )
