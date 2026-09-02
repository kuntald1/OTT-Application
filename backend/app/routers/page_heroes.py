from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PageHero
from app.schemas import PageHeroOut

router = APIRouter(prefix="/page-heroes", tags=["page-heroes"])


@router.get("/{page_key}", response_model=PageHeroOut)
def get_page_hero(page_key: str, db: Session = Depends(get_db)):
    # Public, no auth — the hero needs to render before login too, same
    # as any other landing-page content.
    hero = db.query(PageHero).filter(PageHero.page_key == page_key).first()
    if not hero:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No hero configured for this page.")
    return hero
