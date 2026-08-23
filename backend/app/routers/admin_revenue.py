from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AdminUser, User, Video, VideoWatchRecord, WithdrawalRequest, WithdrawalStatus, CreatorEarnings,
)
from app.schemas import AdminWithdrawalOut, AdminWithdrawalActionRequest, AdminContentPerformanceOut

router = APIRouter(prefix="/admin/revenue", tags=["admin-revenue"])


def _to_admin_withdrawal_out(w: WithdrawalRequest, creator: User) -> AdminWithdrawalOut:
    return AdminWithdrawalOut(
        id=w.id,
        creator_user_id=w.creator_user_id,
        creator_name=creator.name if creator else "Unknown",
        creator_email=creator.email if creator else "unknown@theomy.com",
        amount_rupees=Decimal(w.amount_paisa) / 100,
        status=w.status.value,
        admin_note=w.admin_note,
        requested_at=w.requested_at,
        processed_at=w.processed_at,
    )


@router.get("/withdrawals", response_model=list[AdminWithdrawalOut])
def list_withdrawals(
    status_filter: str | None = None,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Withdrawal request & payment tracking — the admin side of the
    creator's /revenue/withdrawals list. status_filter (pending/
    approved/rejected/paid) narrows the list; omitted shows everything,
    most recent request first.
    """
    query = db.query(WithdrawalRequest, User).join(User, User.id == WithdrawalRequest.creator_user_id)
    if status_filter:
        try:
            query = query.filter(WithdrawalRequest.status == WithdrawalStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter.")
    rows = query.order_by(WithdrawalRequest.requested_at.desc()).all()
    return [_to_admin_withdrawal_out(w, u) for w, u in rows]


def _get_withdrawal_or_404(withdrawal_id: str, db: Session) -> WithdrawalRequest:
    w = db.query(WithdrawalRequest).filter(WithdrawalRequest.id == withdrawal_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Withdrawal request not found")
    return w


@router.post("/withdrawals/{withdrawal_id}/approve", response_model=AdminWithdrawalOut)
def approve_withdrawal(
    withdrawal_id: str,
    payload: AdminWithdrawalActionRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Marks the request approved — this is an acknowledgement that the
    admin will pay the creator manually OUTSIDE the platform (bank
    transfer, UPI, etc., since RazorpayX payout automation isn't wired
    up yet). It does NOT move money by itself; call mark-paid below
    once the manual transfer is actually done, so "approved" and "paid"
    stay honestly distinct states rather than collapsing into one click.
    """
    w = _get_withdrawal_or_404(withdrawal_id, db)
    if w.status != WithdrawalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Withdrawal is already {w.status.value}.")
    w.status = WithdrawalStatus.approved
    w.admin_note = payload.admin_note
    from datetime import datetime, timezone
    w.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(w)
    creator = db.query(User).filter(User.id == w.creator_user_id).first()
    return _to_admin_withdrawal_out(w, creator)


@router.post("/withdrawals/{withdrawal_id}/mark-paid", response_model=AdminWithdrawalOut)
def mark_withdrawal_paid(
    withdrawal_id: str,
    payload: AdminWithdrawalActionRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Confirms the manual payment has actually gone out. Allowed from
    either pending or approved, since a small operation may pay
    directly without a separate approve step.
    """
    w = _get_withdrawal_or_404(withdrawal_id, db)
    if w.status not in (WithdrawalStatus.pending, WithdrawalStatus.approved):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Withdrawal is already {w.status.value}.")
    w.status = WithdrawalStatus.paid
    if payload.admin_note:
        w.admin_note = payload.admin_note
    from datetime import datetime, timezone
    w.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(w)
    creator = db.query(User).filter(User.id == w.creator_user_id).first()
    return _to_admin_withdrawal_out(w, creator)


@router.post("/withdrawals/{withdrawal_id}/reject", response_model=AdminWithdrawalOut)
def reject_withdrawal(
    withdrawal_id: str,
    payload: AdminWithdrawalActionRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Rejecting refunds the reserved amount back to the creator's
    available_balance_paisa — the withdrawal request flow deducted it
    upfront on submission (see routers/withdrawals.py) specifically so
    the same balance can't be requested twice while pending; rejecting
    without refunding would silently destroy that balance.
    """
    if not payload.admin_note:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin_note is required when rejecting.")
    w = _get_withdrawal_or_404(withdrawal_id, db)
    if w.status != WithdrawalStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Withdrawal is already {w.status.value}.")

    earnings = db.query(CreatorEarnings).filter(CreatorEarnings.creator_user_id == w.creator_user_id).first()
    if earnings:
        earnings.available_balance_paisa += w.amount_paisa

    w.status = WithdrawalStatus.rejected
    w.admin_note = payload.admin_note
    from datetime import datetime, timezone
    w.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(w)
    creator = db.query(User).filter(User.id == w.creator_user_id).first()
    return _to_admin_withdrawal_out(w, creator)


@router.get("/content-performance", response_model=list[AdminContentPerformanceOut])
def get_all_content_performance(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Platform-wide "Content performance analytics" — same shape as a
    creator's own /videos/content-performance/mine, but across every
    uploaded video, with the creator's name attached so an admin can
    see who's generating what.
    """
    rows = (
        db.query(
            Video.id,
            Video.title,
            User.name.label("creator_name"),
            func.count(VideoWatchRecord.id).label("unique_viewers"),
            func.coalesce(func.sum(VideoWatchRecord.max_session_seconds), 0).label("total_seconds"),
            func.coalesce(func.sum(VideoWatchRecord.gross_revenue_paisa), 0).label("gross_paisa"),
            func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).label("credited_paisa"),
        )
        .outerjoin(VideoWatchRecord, VideoWatchRecord.video_id == Video.id)
        .outerjoin(User, User.id == Video.uploaded_by_user_id)
        .group_by(Video.id, Video.title, User.name)
        .order_by(func.coalesce(func.sum(VideoWatchRecord.creator_credited_paisa), 0).desc())
        .all()
    )
    return [
        AdminContentPerformanceOut(
            video_id=r.id,
            title=r.title,
            creator_name=r.creator_name or "Admin-uploaded",
            unique_viewers=r.unique_viewers,
            total_watch_minutes=(Decimal(r.total_seconds) / 60).quantize(Decimal("0.01")),
            gross_revenue_rupees=(Decimal(r.gross_paisa) / 100).quantize(Decimal("0.01")),
            creator_earned_rupees=(Decimal(r.credited_paisa) / 100).quantize(Decimal("0.01")),
        )
        for r in rows
    ]
