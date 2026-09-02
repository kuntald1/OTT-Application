from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SitePage, FaqItem
from app.schemas import SitePageOut, FaqItemOut

router = APIRouter(tags=["site-content"])


@router.get("/site-pages/{slug}", response_model=SitePageOut)
def get_site_page(slug: str, db: Session = Depends(get_db)):
    # Public, no auth — About/Contact/Privacy/Terms/Cookie pages need
    # to render before login too.
    page = db.query(SitePage).filter(SitePage.slug == slug).first()
    if not page:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found.")
    return page


@router.get("/faqs", response_model=list[FaqItemOut])
def list_faqs(db: Session = Depends(get_db)):
    return db.query(FaqItem).order_by(FaqItem.display_order).all()
