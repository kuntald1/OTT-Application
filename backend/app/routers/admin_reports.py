import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.date_range import parse_date_range
from app.deps import get_current_admin
from app.models import (
    AdminUser, User, Subscription, Video, EventEnquiry, Payment, PaymentStatus,
)

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])

# Every report is (headers, rows) — one shared shape for both the
# on-screen table and the CSV export, instead of a separate typed
# schema per report. Each is scoped to [start, end] against its own
# natural date column (customers: created_at, subscriptions:
# started_at, content: created_at, enquiries: created_at,
# transactions/revenue: created_at) — no start_date/end_date defaults
# to the last 1 month (see app/date_range.py). "Bookings/ticket sales"
# isn't one of these — there's no purchase-tracking model for event
# tickets yet (only EventTicketTier, which is just pricing, not actual
# sales); "content" below covers the video library, the closest real
# equivalent to "inventory" for a streaming platform.


def _report_customers(db: Session, start: datetime, end: datetime):
    headers = ["Name", "Email", "Role", "Status", "Joined"]
    rows = []
    query = db.query(User).filter(User.created_at >= start, User.created_at <= end).order_by(User.created_at.desc())
    for u in query.all():
        rows.append([u.name, u.email, u.role.value, "Active" if u.is_active else "Deactivated", u.created_at.strftime("%Y-%m-%d")])
    return headers, rows


def _report_subscriptions(db: Session, start: datetime, end: datetime):
    headers = ["Customer", "Email", "Plan", "Duration", "Screens", "Price", "Currency", "Status", "Started", "Expires"]
    rows = []
    query = (
        db.query(Subscription, User)
        .join(User, Subscription.user_id == User.id)
        .filter(Subscription.started_at >= start, Subscription.started_at <= end)
        .order_by(Subscription.started_at.desc())
    )
    for s, u in query.all():
        rows.append([
            u.name, u.email, s.plan_name, s.duration_label, s.screens, str(s.price), s.currency,
            "Active" if s.is_active else "Inactive", s.started_at.strftime("%Y-%m-%d"), s.expires_at.strftime("%Y-%m-%d"),
        ])
    return headers, rows


def _report_content(db: Session, start: datetime, end: datetime):
    headers = ["Title", "Section", "Status", "Monetization", "Release Year"]
    rows = []
    query = db.query(Video).filter(Video.created_at >= start, Video.created_at <= end).order_by(Video.created_at.desc())
    for v in query.all():
        rows.append([v.title, v.section.value, v.status.value, v.monetization_type.value, v.release_year])
    return headers, rows


def _report_enquiries(db: Session, start: datetime, end: datetime):
    headers = ["Organisation", "Contact Person", "Contact Email", "Event Title", "Proposed Date", "Venue", "Status", "Submitted"]
    rows = []
    query = (
        db.query(EventEnquiry)
        .filter(EventEnquiry.created_at >= start, EventEnquiry.created_at <= end)
        .order_by(EventEnquiry.created_at.desc())
    )
    for e in query.all():
        rows.append([
            e.org_name, e.contact_person, e.contact_email, e.event_title,
            e.proposed_date.strftime("%Y-%m-%d"), e.venue, e.status.value, e.created_at.strftime("%Y-%m-%d"),
        ])
    return headers, rows


def _report_transactions(db: Session, start: datetime, end: datetime):
    headers = ["Customer", "Email", "Plan", "Duration", "Amount", "Currency", "Gateway", "Status", "Date"]
    rows = []
    query = (
        db.query(Payment, User)
        .join(User, Payment.user_id == User.id)
        .filter(Payment.created_at >= start, Payment.created_at <= end)
        .order_by(Payment.created_at.desc())
    )
    for p, u in query.all():
        rows.append([
            u.name, u.email, p.plan_name, p.duration_label, str(p.total_amount), p.currency,
            p.gateway.value, p.status.value, p.created_at.strftime("%Y-%m-%d"),
        ])
    return headers, rows


def _report_revenue(db: Session, start: datetime, end: datetime):
    # Revenue by paid transaction, INR and USD kept as separate rows
    # (never summed together — see admin_dashboard.py's same caution).
    headers = ["Date", "Customer", "Plan", "Amount", "Currency", "Gateway"]
    rows = []
    query = (
        db.query(Payment, User)
        .join(User, Payment.user_id == User.id)
        .filter(Payment.status == PaymentStatus.paid, Payment.created_at >= start, Payment.created_at <= end)
        .order_by(Payment.created_at.desc())
    )
    for p, u in query.all():
        rows.append([p.created_at.strftime("%Y-%m-%d"), u.name, p.plan_name, str(p.total_amount), p.currency, p.gateway.value])
    return headers, rows


REPORTS = {
    "customers": _report_customers,
    "subscriptions": _report_subscriptions,
    "content": _report_content,
    "enquiries": _report_enquiries,
    "transactions": _report_transactions,
    "revenue": _report_revenue,
}


@router.get("/{report_type}")
def get_report(
    report_type: str,
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    fn = REPORTS.get(report_type)
    if not fn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown report type.")
    start, end = parse_date_range(start_date, end_date)
    headers, rows = fn(db, start, end)
    return {"headers": headers, "rows": rows}


@router.get("/{report_type}/export")
def export_report_csv(
    report_type: str,
    start_date: str | None = None,
    end_date: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    fn = REPORTS.get(report_type)
    if not fn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown report type.")
    start, end = parse_date_range(start_date, end_date)
    headers, rows = fn(db, start, end)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    buffer.seek(0)

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={report_type}_report.csv"},
    )
