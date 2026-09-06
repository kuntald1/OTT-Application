from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AdBanner, AdBannerPage
from app.schemas import AdBannerOut

router = APIRouter(prefix="/ad-banners", tags=["ad-banners"])

ALLOWED_PAGE_KEYS = {"plays", "archive", "mylist", "community", "ticketing"}


@router.get("", response_model=list[AdBannerOut])
def list_ad_banners(page: str, db: Session = Depends(get_db)):
    """The auto-sliding banner row at the top of a page — Plays,
    Archive, My List, Community, or Ticketing (?page=<one of those>).
    Only returns a banner if today falls within its
    [start_date, end_date] window AND it's assigned to this page.
    Public, no auth — needs to render before login too.
    """
    today = date.today()
    rows = (
        db.query(AdBanner)
        .join(AdBannerPage, AdBannerPage.ad_banner_id == AdBanner.id)
        .filter(
            AdBannerPage.page_key == page,
            AdBanner.is_active == True,  # noqa: E712
            AdBanner.start_date <= today,
            AdBanner.end_date >= today,
        )
        .order_by(AdBanner.display_order)
        .all()
    )
    return [
        AdBannerOut(
            id=b.id, image_url=b.image_url, redirect_url=b.redirect_url,
            start_date=b.start_date, end_date=b.end_date, is_active=b.is_active,
            display_order=b.display_order, pages=[p.page_key for p in b.pages],
        )
        for b in rows
    ]
