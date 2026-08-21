from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ExchangeRateConfig
from app.schemas import ExchangeRateOut

router = APIRouter(prefix="/exchange-rate", tags=["exchange-rate"])


@router.get("", response_model=ExchangeRateOut)
def get_exchange_rate(db: Session = Depends(get_db)):
    config = db.query(ExchangeRateConfig).first()
    rate = config.inr_per_usd if config else 83.5
    return ExchangeRateOut(inr_per_usd=rate)
