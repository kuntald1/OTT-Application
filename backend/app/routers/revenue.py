from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RevenueRateConfig
from app.schemas import RevenueRateOut

router = APIRouter(prefix="/revenue-rate", tags=["revenue"])


def _to_out(rate_paisa: int) -> RevenueRateOut:
    rupees = Decimal(rate_paisa) / 100
    if rate_paisa % 100 == 0:
        display = f"₹{int(rupees)}/min"
    else:
        display = f"{rate_paisa} paisa/min (₹{rupees}/min)"
    return RevenueRateOut(
        rate_paisa_per_minute=rate_paisa,
        rate_rupees_per_minute=rupees,
        rate_display=display,
    )


@router.get("", response_model=RevenueRateOut)
def get_revenue_rate(db: Session = Depends(get_db)):
    config = db.query(RevenueRateConfig).first()
    rate_paisa = config.rate_paisa_per_minute if config else 7
    return _to_out(rate_paisa)
