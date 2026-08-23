from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RevenueRateConfig
from app.schemas import RevenueRateOut

router = APIRouter(prefix="/revenue-rate", tags=["revenue"])


def _to_out(config: RevenueRateConfig) -> RevenueRateOut:
    rate_paisa = config.rate_paisa_per_minute
    rupees = Decimal(rate_paisa) / 100
    if rate_paisa % 100 == 0:
        display = f"₹{int(rupees)}/min"
    else:
        display = f"{rate_paisa} paisa/min (₹{rupees}/min)"
    return RevenueRateOut(
        rate_paisa_per_minute=rate_paisa,
        rate_rupees_per_minute=rupees,
        rate_display=display,
        platform_commission_percent=config.platform_commission_percent,
    )


@router.get("", response_model=RevenueRateOut)
def get_revenue_rate(db: Session = Depends(get_db)):
    config = db.query(RevenueRateConfig).first()
    if not config:
        # No silent fallback — fail clearly instead of quietly using a
        # hardcoded number. Fix by running:
        # docker compose exec theomy-backend python -m app.seed_data
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Revenue rate is not set up. Run the seed script or insert a row into revenue_rate_config.",
        )
    return _to_out(config)
