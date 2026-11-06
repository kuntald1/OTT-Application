"""Booking tickets for an event people physically attend.

Why this sits apart from every other checkout on the site: a seat in a
hall is a real-world service, not something watched inside the app.
Google Play's billing requirement covers digital content consumed in
the app — a subscription, a pay-per-view stream — so those are sold on
the website only. A theatre ticket is not, so this flow stays in the
mobile app as well, paid through Razorpay like the rest of theomy.

The shape of the payment flow (create order -> HMAC verify -> paid)
deliberately matches live_stream_payments.py, so there is one lifecycle
to understand rather than two. What is new here is seats: a show has a
fixed house, so the same seat must not be sold twice.
"""

import hashlib
import hmac
import io
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    User, EventEnquiry, EnquiryStatus, EventTicketTier, EventTicketBooking,
    PaymentStatus, PaymentGateway, CreatorEarnings, RevenueRateConfig,
)
from app.notifications import send_ticket_booking_whatsapp, send_ticket_booking_email
from app.schemas import (
    TicketTierAvailabilityOut, CreateTicketBookingRequest, CreateTicketBookingOrderResponse,
    VerifyTicketBookingRequest, TicketBookingOut, CheckInTicketRequest, CheckInTicketResponse,
)

router = APIRouter(prefix="/event-tickets", tags=["event-tickets"])

# How long an unpaid booking keeps its seats while the buyer is inside
# the Razorpay window. Long enough for a slow UPI approval, short enough
# that an abandoned checkout doesn't keep a sold-out show sold out.
HOLD_MINUTES = 15

MAX_PER_BOOKING = 10


def _taken_seats(db: Session, tier_id) -> int:
    """Seats already spoken for in this tier: everything paid, plus the
    unpaid attempts from the last few minutes.

    Counting the recent unpaid ones is what stops two people both buying
    the last seat while one of them is still approving in their UPI app.
    An older unpaid row stops counting on its own — no sweeper job, no
    expiry column to keep in step.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=HOLD_MINUTES)
    total = (
        db.query(func.coalesce(func.sum(EventTicketBooking.quantity), 0))
        .filter(
            EventTicketBooking.tier_id == tier_id,
            or_(
                EventTicketBooking.status == PaymentStatus.paid,
                and_(
                    EventTicketBooking.status == PaymentStatus.created,
                    EventTicketBooking.created_at >= cutoff,
                ),
            ),
        )
        .scalar()
    )
    return int(total or 0)


def _public_event_or_404(db: Session, enquiry_id: str) -> EventEnquiry:
    enquiry = (
        db.query(EventEnquiry)
        .filter(
            EventEnquiry.id == enquiry_id,
            EventEnquiry.status == EnquiryStatus.approved,
        )
        .first()
    )
    if not enquiry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return enquiry


def _booking_out(booking: EventTicketBooking, enquiry: EventEnquiry | None) -> TicketBookingOut:
    return TicketBookingOut(
        id=booking.id,
        enquiry_id=booking.enquiry_id,
        event_title=enquiry.event_title if enquiry else None,
        event_venue=enquiry.venue if enquiry else None,
        event_date=enquiry.proposed_date if enquiry else None,
        event_time=enquiry.proposed_time if enquiry else None,
        tier_name=booking.tier_name,
        unit_price=booking.unit_price,
        quantity=booking.quantity,
        amount=booking.amount,
        currency=booking.currency,
        booking_reference=booking.booking_reference,
        # The QR token only leaves the server for a ticket that is paid
        # for: it is the thing that admits someone.
        qr_token=booking.qr_token if booking.status == PaymentStatus.paid else None,
        status=booking.status.value if hasattr(booking.status, "value") else str(booking.status),
        checked_in_at=booking.checked_in_at,
        created_at=booking.created_at,
    )


# Letters and digits that can't be misread or misheard down a phone
# line: no O/0, no I/1, no S/5.
_REFERENCE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY2346789"


def _new_booking_reference(db: Session) -> str:
    for _ in range(12):
        candidate = "THM-" + "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(6))
        exists = (
            db.query(EventTicketBooking.id)
            .filter(EventTicketBooking.booking_reference == candidate)
            .first()
        )
        if not exists:
            return candidate
    # Astronomically unlikely; fall back to something guaranteed unique
    # rather than failing a payment that has already gone through.
    return "THM-" + secrets.token_hex(8).upper()


@router.get("/events/{enquiry_id}/availability", response_model=list[TicketTierAvailabilityOut])
def ticket_availability(enquiry_id: str, db: Session = Depends(get_db)):
    """Open to everyone, signed in or not — the Ticketing page shows
    "Sold out" before asking anybody to log in.
    """
    enquiry = _public_event_or_404(db, enquiry_id)
    tiers = (
        db.query(EventTicketTier)
        .filter(EventTicketTier.enquiry_id == enquiry.id)
        .order_by(EventTicketTier.price.asc())
        .all()
    )

    out = []
    for tier in tiers:
        taken = _taken_seats(db, tier.id)
        available = max(0, tier.quantity - taken)
        out.append(TicketTierAvailabilityOut(
            id=tier.id,
            tier_name=tier.tier_name,
            price=tier.price,
            quantity=tier.quantity,
            taken=taken,
            available=available,
            sold_out=available <= 0,
        ))
    return out


@router.post(
    "/events/{enquiry_id}/razorpay/create-order",
    response_model=CreateTicketBookingOrderResponse,
)
def create_ticket_booking_order(
    enquiry_id: str,
    payload: CreateTicketBookingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.country != "India":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking tickets is only available for India accounts right now.",
        )
    if payload.quantity > MAX_PER_BOOKING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can book up to {MAX_PER_BOOKING} tickets at a time.",
        )

    enquiry = _public_event_or_404(db, enquiry_id)

    # Lock the tier row for the rest of this transaction. Two people
    # buying the last seats at the same moment then queue here instead
    # of both reading "2 left" and both being sold two.
    tier = (
        db.query(EventTicketTier)
        .filter(
            EventTicketTier.id == payload.tier_id,
            EventTicketTier.enquiry_id == enquiry.id,
        )
        .with_for_update()
        .first()
    )
    if not tier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket type not found for this event")

    available = max(0, tier.quantity - _taken_seats(db, tier.id))
    if available <= 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"{tier.tier_name} is sold out.")
    if payload.quantity > available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only {available} {tier.tier_name} ticket{'' if available == 1 else 's'} left.",
        )

    amount = (tier.price * payload.quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    razorpay_order = client.order.create({
        "amount": int(amount * 100),  # paise
        "currency": "INR",
        "notes": {
            "user_id": str(current_user.id),
            "enquiry_id": str(enquiry.id),
            "tier_id": str(tier.id),
            "quantity": str(payload.quantity),
            "kind": "event_ticket",
        },
    })

    # A fresh row per attempt, unlike the live-stream flow's one-row-per
    # viewer: somebody may legitimately book twice for the same show,
    # for different people or different tiers.
    booking = EventTicketBooking(
        user_id=current_user.id,
        enquiry_id=enquiry.id,
        tier_id=tier.id,
        tier_name=tier.tier_name,
        unit_price=tier.price,
        quantity=payload.quantity,
        amount=amount,
        currency="INR",
        gateway=PaymentGateway.razorpay,
        gateway_order_id=razorpay_order["id"],
        status=PaymentStatus.created,
    )
    db.add(booking)
    db.commit()          # releases the row lock
    db.refresh(booking)

    return CreateTicketBookingOrderResponse(
        booking_id=booking.id,
        razorpay_order_id=razorpay_order["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        amount=amount,
        currency="INR",
        event_title=enquiry.event_title,
        tier_name=tier.tier_name,
        quantity=payload.quantity,
    )


@router.post("/razorpay/verify", response_model=TicketBookingOut)
def verify_ticket_booking_payment(
    payload: VerifyTicketBookingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = (
        db.query(EventTicketBooking)
        .filter(
            EventTicketBooking.id == payload.booking_id,
            EventTicketBooking.user_id == current_user.id,
        )
        .first()
    )
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    expected_signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, payload.razorpay_signature):
        booking.status = PaymentStatus.failed
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment verification failed.")

    enquiry = db.query(EventEnquiry).filter(EventEnquiry.id == booking.enquiry_id).first()

    # Already verified — a double submit, or the buyer refreshed
    # mid-flow. Hand back the same ticket rather than issuing a second
    # reference or crediting the organiser twice.
    if booking.status == PaymentStatus.paid:
        return _booking_out(booking, enquiry)

    # The hold may have lapsed if approval took longer than HOLD_MINUTES
    # and the show filled up meanwhile. The money has already been taken
    # at this point, so the booking stands and the oversell is logged
    # for a human to sort out — refusing here would leave someone paid
    # up with nothing.
    tier = db.query(EventTicketTier).filter(EventTicketTier.id == booking.tier_id).first()
    if tier:
        taken_excluding_this = _taken_seats(db, tier.id) - booking.quantity
        if taken_excluding_this + booking.quantity > tier.quantity:
            print(
                f"WARNING: event_ticket_bookings {booking.id} takes tier {tier.id} "
                f"({tier.tier_name}) past its capacity of {tier.quantity}. The payment "
                f"was already taken, so the booking stands — check the door list."
            )

    booking.status = PaymentStatus.paid
    booking.gateway_payment_id = payload.razorpay_payment_id
    booking.booking_reference = _new_booking_reference(db)
    booking.qr_token = secrets.token_urlsafe(32)[:64]

    # The organiser who proposed the show gets the takings, minus
    # theomy's commission, into the same balance they already withdraw
    # from for video revenue. No RevenueLedgerEntry here: that table is
    # keyed to a video, and this is a seat in a hall.
    config = db.query(RevenueRateConfig).first()
    commission_percent = config.platform_commission_percent if config else Decimal("20")
    gross_paisa = int((booking.amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    organiser_paisa = int(
        (Decimal(gross_paisa) * (Decimal("100") - commission_percent) / Decimal("100"))
        .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )
    if enquiry and enquiry.submitted_by_user_id and organiser_paisa > 0:
        earnings = (
            db.query(CreatorEarnings)
            .filter(CreatorEarnings.creator_user_id == enquiry.submitted_by_user_id)
            .first()
        )
        if not earnings:
            earnings = CreatorEarnings(creator_user_id=enquiry.submitted_by_user_id)
            db.add(earnings)
            db.flush()
        earnings.total_earned_paisa += organiser_paisa
        earnings.available_balance_paisa += organiser_paisa

    db.commit()
    db.refresh(booking)

    # Best-effort, exactly like every other confirmation here: the
    # payment has gone through whether or not Twilio or the mail server
    # is having a bad day.
    title = enquiry.event_title if enquiry else "your show"
    venue = enquiry.venue if enquiry else ""
    when = ""
    if enquiry and enquiry.proposed_date:
        when = enquiry.proposed_date.strftime("%d %b %Y")
        if enquiry.proposed_time:
            when = f"{when}, {enquiry.proposed_time}"
    if current_user.phone:
        send_ticket_booking_whatsapp(
            current_user.phone, title, booking.tier_name, booking.quantity,
            booking.amount, booking.booking_reference,
        )
    send_ticket_booking_email(
        current_user.email, title, booking.tier_name, booking.quantity,
        booking.amount, booking.booking_reference, venue, when,
    )

    return _booking_out(booking, enquiry)


@router.get("/mine", response_model=list[TicketBookingOut])
def list_my_ticket_bookings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Paid bookings only. An abandoned checkout isn't a ticket and
    would only confuse the My Bookings list.
    """
    bookings = (
        db.query(EventTicketBooking)
        .filter(
            EventTicketBooking.user_id == current_user.id,
            EventTicketBooking.status == PaymentStatus.paid,
        )
        .order_by(EventTicketBooking.created_at.desc())
        .all()
    )
    enquiries = {
        e.id: e
        for e in db.query(EventEnquiry)
        .filter(EventEnquiry.id.in_([b.enquiry_id for b in bookings] or [None]))
        .all()
    }
    return [_booking_out(b, enquiries.get(b.enquiry_id)) for b in bookings]


@router.get("/{booking_id}/qr.png")
def ticket_qr_image(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The QR as a PNG, drawn on the server.

    Deliberately not drawn in the browser or the app: that would mean a
    QR library in two more places, and in the Expo app a native
    dependency that has to survive every prebuild. A plain <img> works
    everywhere and there is one implementation to keep right.
    """
    booking = (
        db.query(EventTicketBooking)
        .filter(
            EventTicketBooking.id == booking_id,
            EventTicketBooking.user_id == current_user.id,
        )
        .first()
    )
    if not booking or booking.status != PaymentStatus.paid or not booking.qr_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    try:
        import qrcode
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QR codes aren't available on this server yet.",
        )

    img = qrcode.make(booking.qr_token, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.post("/check-in", response_model=CheckInTicketResponse)
def check_in_ticket(
    payload: CheckInTicketRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admit a ticket at the door.

    Who may do this: the organiser who proposed the show. Site admins
    sign in through admin_users, which is a different dependency
    (get_current_admin) and would need its own endpoint — the person on
    the door is the organiser, so that can wait until someone asks.

    Not a 403 for a wrong token, because the person on the door needs a
    plain yes/no, not an error page — every outcome comes back as
    admitted true or false with a reason.
    """
    booking = (
        db.query(EventTicketBooking)
        .filter(EventTicketBooking.qr_token == payload.qr_token)
        .first()
    )
    if not booking or booking.status != PaymentStatus.paid:
        return CheckInTicketResponse(admitted=False, reason="not_found")

    enquiry = db.query(EventEnquiry).filter(EventEnquiry.id == booking.enquiry_id).first()
    is_owner = bool(enquiry and enquiry.submitted_by_user_id == current_user.id)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only this event's organiser can check tickets in.",
        )

    attendee = db.query(User).filter(User.id == booking.user_id).first()

    if booking.checked_in_at:
        return CheckInTicketResponse(
            admitted=False,
            reason="already_used",
            booking_reference=booking.booking_reference,
            event_title=enquiry.event_title if enquiry else None,
            tier_name=booking.tier_name,
            quantity=booking.quantity,
            attendee_name=attendee.name if attendee else None,
            checked_in_at=booking.checked_in_at,
        )

    booking.checked_in_at = datetime.now(timezone.utc)
    booking.checked_in_by_user_id = current_user.id
    db.commit()
    db.refresh(booking)

    return CheckInTicketResponse(
        admitted=True,
        reason="ok",
        booking_reference=booking.booking_reference,
        event_title=enquiry.event_title if enquiry else None,
        tier_name=booking.tier_name,
        quantity=booking.quantity,
        attendee_name=attendee.name if attendee else None,
        checked_in_at=booking.checked_in_at,
    )
