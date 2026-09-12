from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import AdminUser, User, UserRole, Subscription
from app.schemas import AdminPartnerOut

router = APIRouter(prefix="/admin/partners", tags=["admin-partners"])


@router.get("", response_model=list[AdminPartnerOut])
def list_partners(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Plays Organiser accounts — theomy's PARTNERS, kept out of the
    regular "Customers" report/tab. Each one is categorized:

    - deactivated: the account itself is off (is_active=False) —
      checked first, regardless of subscription state.
    - registered: never had any subscription at all (and, once
      ticket-booking purchases exist, never bought a ticket either —
      that half of the check isn't possible yet, no purchase-tracking
      model for tickets exists).
    - active: has a subscription that is both is_active=True AND not
      yet expired.
    - inactive: has had at least one subscription before, but none
      currently active — everything they've ever had is expired.
    """
    now = datetime.now(timezone.utc)
    partners = (
        db.query(User)
        .filter(User.role == UserRole.plays_organiser)
        .order_by(User.created_at.desc())
        .all()
    )
    if not partners:
        return []

    partner_ids = [p.id for p in partners]
    sub_counts = dict(
        db.query(Subscription.user_id, func.count(Subscription.id))
        .filter(Subscription.user_id.in_(partner_ids))
        .group_by(Subscription.user_id)
        .all()
    )
    active_sub_ids = {
        r[0] for r in db.query(Subscription.user_id)
        .filter(
            Subscription.user_id.in_(partner_ids),
            Subscription.is_active == True,  # noqa: E712
            Subscription.expires_at > now,
        )
        .distinct()
        .all()
    }

    results = []
    for p in partners:
        if not p.is_active:
            category = "deactivated"
        elif p.id in active_sub_ids:
            category = "active"
        elif sub_counts.get(p.id, 0) == 0:
            category = "registered"
        else:
            category = "inactive"
        results.append(AdminPartnerOut(
            user_id=p.id, name=p.name, email=p.email,
            joined=p.created_at, category=category,
        ))
    return results
