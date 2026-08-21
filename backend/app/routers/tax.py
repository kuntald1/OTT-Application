from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TaxConfig
from app.schemas import TaxConfigOut

router = APIRouter(prefix="/tax-config", tags=["tax-config"])


@router.get("", response_model=TaxConfigOut)
def get_tax_config(db: Session = Depends(get_db)):
    config = db.query(TaxConfig).first()
    if not config:
        # No silent fallback — if the config row is missing, say so
        # clearly instead of quietly using a hardcoded number. Fix by
        # running: docker compose exec theomy-backend python -m app.seed_data
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tax config is not set up. Run the seed script or insert a row into tax_config.",
        )
    return config
