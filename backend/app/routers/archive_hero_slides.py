from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArchiveHeroSlide
from app.schemas import ArchiveHeroSlideOut

router = APIRouter(prefix="/archive-hero-slides", tags=["archive-hero-slides"])


@router.get("", response_model=list[ArchiveHeroSlideOut])
def list_archive_hero_slides(db: Session = Depends(get_db)):
    # Public, no auth — powers ArchiveHero.jsx, which needs to render
    # before login too, same as any other landing content.
    return db.query(ArchiveHeroSlide).order_by(ArchiveHeroSlide.display_order).all()
