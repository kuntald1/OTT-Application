from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TaxConfig
from app.schemas import TaxConfigOut

router = APIRouter(prefix="/tax-config", tags=["tax-config"])


@router.get("", response_model=TaxConfigOut)
def get_tax_config(db: Session = Depends(get_db)):
    config = db.query(TaxConfig).first()
    if not config:
        # No row seeded yet — fall back to a sane default rather than
        # erroring out and breaking checkout entirely.
        return TaxConfigOut(gst_percent=18)
    return config
