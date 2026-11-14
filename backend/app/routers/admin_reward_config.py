"""Admin > Reward Points — the earn rate per kind of purchase, and what
one reward point is worth.

Superadmin-only to change, like Subscription Plans and Tax: these numbers
decide how much money the platform hands back on every sale.

There is exactly one reward_config row (see seed_data.seed_reward_config).
This router edits that row rather than creating more, and refuses rather
than inventing one if the seed has never been run — a silently created
row with default rates would be a worse surprise than a clear error.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, RewardConfig
from app.schemas import RewardConfigOut, RewardConfigUpdate

router = APIRouter(prefix="/admin/reward-config", tags=["admin-rewards"])


def _get_row(db: Session) -> RewardConfig:
    config = db.query(RewardConfig).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Reward config is not set up. Run: docker compose exec theomy-backend python -m app.seed_data",
        )
    return config


@router.get("", response_model=RewardConfigOut)
def get_reward_config_admin(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return _get_row(db)


@router.put("", response_model=RewardConfigOut)
def update_reward_config_admin(
    payload: RewardConfigUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Every field is optional — only what was sent is changed, so the
    admin page can save one value without having to resend the rest.
    """
    config = _get_row(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    db.commit()
    db.refresh(config)
    return config
