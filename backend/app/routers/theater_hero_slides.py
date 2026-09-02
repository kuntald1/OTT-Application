from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TheaterHeroSlide
from app.schemas import TheaterHeroSlideOut

router = APIRouter(prefix="/theater-hero-slides", tags=["theater-hero-slides"])


@router.get("", response_model=list[TheaterHeroSlideOut])
def list_theater_hero_slides(db: Session = Depends(get_db)):
    # Public, no auth — powers TheaterHero.jsx, which needs to render
    # before login too, same as any other landing content.
    return db.query(TheaterHeroSlide).order_by(TheaterHeroSlide.display_order).all()
