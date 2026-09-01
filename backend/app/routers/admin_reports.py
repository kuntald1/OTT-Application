import csv
import io

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AdminUser, User, Subscription, Video, EventEnquiry, Payment, PaymentStatus,
)

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])

# Every report is (headers, rows) — one shared shape for both the
# on-screen table and the CSV export, instead of a separate typed
# schema per report. "Bookings/ticket sales" isn't one of these —
# there's no purchase-tracking model for event tickets yet (only
# EventTicketTier, which is just pricing, not actual sales); "content"
# below covers the video library, which is the closest real
# equivalent to "inventory" for a streaming platform.


def _report_customers(db: Session):
    headers = ["Name", "Email", "Role", "Status", "Joined"]
    rows = []
    for u in db.query(User).order_by(User.created_at.desc()).all():
        rows.append([u.name, u.email, u.role.value, "Active" if u.is_active else "Deactivated", u.created_at.strftime("%Y-%m-%d")])
    return headers, rows


def _report_subscriptions(db: Session):
    headers = ["Customer", "Email", "Plan", "Duration", "Screens", "Price", "Currency", "Status", "Started", "Expires"]
    rows = []
    query = db.query(Subscription, User).join(User, Subscription.user_id == User.id).order_by(Subscription.started_at.desc())
    for s, u in query.all():
        rows.append([
            u.name, u.email, s.plan_name, s.duration_label, s.screens, str(s.price), s.currency,
            "Active" if s.is_active else "Inactive", s.started_at.strftime("%Y-%m-%d"), s.expires_at.strftime("%Y-%m-%d"),
        ])
    return headers, rows


def _report_content(db: Session):
    headers = ["Title", "Section", "Status", "Monetization", "Release Year"]
    rows = []
    for v in db.query(Video).order_by(Video.created_at.desc()).all():
        rows.append([v.title, v.section.value, v.status.value, v.monetization_type.value, v.release_year])
    return headers, rows


def _report_enquiries(db: Session):
    headers = ["Organisation", "Contact Person", "Contact Email", "Event Title", "Proposed Date", "Venue", "Status", "Submitted"]
    rows = []
    for e in db.query(EventEnquiry).order_by(EventEnquiry.created_at.desc()).all():
        rows.append([
            e.org_name, e.contact_person, e.contact_email, e.event_title,
            e.proposed_date.strftime("%Y-%m-%d"), e.venue, e.status.value, e.created_at.strftime("%Y-%m-%d"),
        ])
    return headers, rows


def _report_transactions(db: Session):
    headers = ["Customer", "Email", "Plan", "Duration", "Amount", "Currency", "Gateway", "Status", "Date"]
    rows = []
    query = db.query(Payment, User).join(User, Payment.user_id == User.id).order_by(Payment.created_at.desc())
    for p, u in query.all():
        rows.append([
            u.name, u.email, p.plan_name, p.duration_label, str(p.total_amount), p.currency,
            p.gateway.value, p.status.value, p.created_at.strftime("%Y-%m-%d"),
        ])
    return headers, rows


def _report_revenue(db: Session):
    # Revenue by paid transaction, INR and USD kept as separate rows
    # (never summed together — see admin_dashboard.py's same caution).
    headers = ["Date", "Customer", "Plan", "Amount", "Currency", "Gateway"]
    rows = []
    query = (
        db.query(Payment, User)
        .join(User, Payment.user_id == User.id)
        .filter(Payment.status == PaymentStatus.paid)
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
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    fn = REPORTS.get(report_type)
    if not fn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown report type.")
    headers, rows = fn(db)
    return {"headers": headers, "rows": rows}


@router.get("/{report_type}/export")
def export_report_csv(
    report_type: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    fn = REPORTS.get(report_type)
    if not fn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown report type.")
    headers, rows = fn(db)

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
