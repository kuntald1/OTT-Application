from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ExchangeRateConfig
from app.schemas import ExchangeRateOut

router = APIRouter(prefix="/exchange-rate", tags=["exchange-rate"])


@router.get("", response_model=ExchangeRateOut)
def get_exchange_rate(db: Session = Depends(get_db)):
    config = db.query(ExchangeRateConfig).first()
    if not config:
        # No silent fallback — fail clearly instead of quietly using a
        # hardcoded number. Fix by running:
        # docker compose exec theomy-backend python -m app.seed_data
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Exchange rate is not set up. Run the seed script or insert a row into exchange_rate_config.",
        )
    return ExchangeRateOut(inr_per_usd=config.inr_per_usd)
