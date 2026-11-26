from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BrandingConfig, SitePage, FaqItem
from app.schemas import BrandingOut, SitePageOut, FaqItemOut

router = APIRouter(tags=["site-content"])


@router.get("/branding", response_model=BrandingOut)
def get_branding(db: Session = Depends(get_db)):
    """The site logo, for the header.

    Public and unauthenticated: the header is the first thing drawn, on
    every page, before anyone has logged in.

    Never 404s. No row — which is what a database that has never seen
    the Branding screen looks like — returns a null logo_url, and every
    client reads that as "use the built-in mark". The site has to look
    right on an untouched database, because that is precisely its state
    the moment this deploys.
    """
    row = db.query(BrandingConfig).first()
    return BrandingOut(logo_url=(row.logo_url or None) if row else None)


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
