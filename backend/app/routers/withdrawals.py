from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User, CreatorEarnings, WithdrawalRequest, WithdrawalStatus
from app.schemas import RevenueSummaryOut, WithdrawalRequestCreate, WithdrawalRequestOut

router = APIRouter(prefix="/revenue", tags=["revenue"])


def _get_or_create_earnings(db: Session, user_id) -> CreatorEarnings:
    earnings = db.query(CreatorEarnings).filter(CreatorEarnings.creator_user_id == user_id).first()
    if not earnings:
        # No row means no real/dummy earnings have been set up for this
        # creator yet — starts at zero rather than erroring out.
        earnings = CreatorEarnings(creator_user_id=user_id, total_earned_paisa=0, available_balance_paisa=0)
        db.add(earnings)
        db.commit()
        db.refresh(earnings)
    return earnings


@router.get("/summary", response_model=RevenueSummaryOut)
def get_revenue_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    earnings = _get_or_create_earnings(db, current_user.id)
    pending_paisa = (
        db.query(WithdrawalRequest)
        .filter(
            WithdrawalRequest.creator_user_id == current_user.id,
            WithdrawalRequest.status == WithdrawalStatus.pending,
        )
        .all()
    )
    pending_total = sum(w.amount_paisa for w in pending_paisa)

    return RevenueSummaryOut(
        total_earned_rupees=Decimal(earnings.total_earned_paisa) / 100,
        available_balance_rupees=Decimal(earnings.available_balance_paisa) / 100,
        pending_withdrawals_rupees=Decimal(pending_total) / 100,
    )


@router.post("/withdrawals", response_model=WithdrawalRequestOut, status_code=status.HTTP_201_CREATED)
def request_withdrawal(
    payload: WithdrawalRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    earnings = _get_or_create_earnings(db, current_user.id)
    amount_paisa = int((payload.amount_rupees * 100).to_integral_value())

    if amount_paisa > earnings.available_balance_paisa:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Withdrawal amount exceeds your available balance.",
        )

    # Reserve the funds immediately so the same balance can't be requested
    # twice while this request is still pending. If a future admin panel
    # rejects the request, it's responsible for adding the amount back to
    # available_balance_paisa.
    earnings.available_balance_paisa -= amount_paisa

    withdrawal = WithdrawalRequest(
        creator_user_id=current_user.id,
        amount_paisa=amount_paisa,
        status=WithdrawalStatus.pending,
    )
    db.add(withdrawal)
    db.commit()
    db.refresh(withdrawal)

    return WithdrawalRequestOut(
        id=withdrawal.id,
        amount_rupees=Decimal(withdrawal.amount_paisa) / 100,
        status=withdrawal.status.value,
        admin_note=withdrawal.admin_note,
        requested_at=withdrawal.requested_at,
        processed_at=withdrawal.processed_at,
    )


@router.get("/withdrawals", response_model=list[WithdrawalRequestOut])
def list_my_withdrawals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    withdrawals = (
        db.query(WithdrawalRequest)
        .filter(WithdrawalRequest.creator_user_id == current_user.id)
        .order_by(WithdrawalRequest.requested_at.desc())
        .all()
    )
    return [
        WithdrawalRequestOut(
            id=w.id,
            amount_rupees=Decimal(w.amount_paisa) / 100,
            status=w.status.value,
            admin_note=w.admin_note,
            requested_at=w.requested_at,
            processed_at=w.processed_at,
        )
        for w in withdrawals
    ]
