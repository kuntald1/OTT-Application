from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import SubscriptionDuration


def get_duration_months_and_discount(duration_label: str, db: Session) -> tuple[int, Decimal]:
    """Looks up (months, discount_fraction) for a duration label from
    the admin-editable SubscriptionDuration catalog (Admin > Subscription
    Plans > Durations tab) — replaces what used to be a hardcoded dict
    duplicated across payments.py, stripe_payments.py, and
    subscriptions.py. Falls back to 1 month / 0% discount for an
    unrecognized or since-removed label, matching those old dicts'
    safe default, so a stale label from an in-flight checkout never
    raises.
    """
    row = db.query(SubscriptionDuration).filter(SubscriptionDuration.label == duration_label).first()
    if not row:
        return 1, Decimal("0")
    return row.months, (Decimal(row.discount_percent) / Decimal("100"))
