from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RewardConfig
from app.schemas import RewardConfigOut

router = APIRouter(prefix="/reward-config", tags=["rewards"])


@router.get("", response_model=RewardConfigOut)
def get_reward_config(db: Session = Depends(get_db)):
    config = db.query(RewardConfig).first()
    if not config:
        # No silent fallback — fail clearly instead of quietly using a
        # hardcoded number. Fix by running:
        # docker compose exec theomy-backend python -m app.seed_data
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Reward config is not set up. Run the seed script or insert a row into reward_config.",
        )
    return config
