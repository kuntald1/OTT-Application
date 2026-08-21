from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RewardConfig
from app.schemas import RewardConfigOut

router = APIRouter(prefix="/reward-config", tags=["rewards"])


@router.get("", response_model=RewardConfigOut)
def get_reward_config(db: Session = Depends(get_db)):
    config = db.query(RewardConfig).first()
    if not config:
        return RewardConfigOut(subscription_reward_percent=20, ticket_reward_percent=5)
    return config
