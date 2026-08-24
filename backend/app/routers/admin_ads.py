from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, Video, Ad, AdCuePoint
from app.schemas import AdOut, AdCreate, AdUpdate, AdCuePointOut, AdCuePointCreate

router = APIRouter(prefix="/admin/ads", tags=["admin-ads"])


# --- Ad library -------------------------------------------------------

@router.get("", response_model=list[AdOut])
def list_ads(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return db.query(Ad).order_by(Ad.created_at.desc()).all()


@router.post("", response_model=AdOut, status_code=status.HTTP_201_CREATED)
def create_ad(
    payload: AdCreate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Adds a reusable Ad — just a name and a VAST tag URL from Google
    Ad Manager or any VAST-compliant network. theomy never validates
    the tag itself (that only happens live, when the player's Google
    IMA SDK integration actually requests it during playback) — a
    broken/expired tag here won't surface as an error until someone
    actually watches a video it's attached to.
    """
    ad = Ad(name=payload.name, vast_tag_url=payload.vast_tag_url)
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return ad


@router.put("/{ad_id}", response_model=AdOut)
def update_ad(
    ad_id: str,
    payload: AdUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    ad = db.query(Ad).filter(Ad.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
    if payload.name is not None:
        ad.name = payload.name
    if payload.vast_tag_url is not None:
        ad.vast_tag_url = payload.vast_tag_url
    if payload.is_active is not None:
        ad.is_active = payload.is_active
    db.commit()
    db.refresh(ad)
    return ad


@router.delete("/{ad_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ad(
    ad_id: str,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Deleting an Ad also removes every cue point using it (cascade via
    explicit query here, not a DB-level ON DELETE CASCADE) — a cue
    point pointing at a deleted Ad would otherwise 500 the video player
    the next time that video loads.
    """
    ad = db.query(Ad).filter(Ad.id == ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")
    db.query(AdCuePoint).filter(AdCuePoint.ad_id == ad.id).delete()
    db.delete(ad)
    db.commit()


# --- Per-video cue points ----------------------------------------------

@router.get("/videos/{video_id}/cue-points", response_model=list[AdCuePointOut])
def list_video_cue_points(
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    rows = (
        db.query(AdCuePoint, Ad)
        .join(Ad, Ad.id == AdCuePoint.ad_id)
        .filter(AdCuePoint.video_id == video.id)
        .order_by(AdCuePoint.offset_seconds.asc())
        .all()
    )
    return [
        AdCuePointOut(id=cue.id, ad_id=ad.id, ad_name=ad.name, offset_seconds=cue.offset_seconds)
        for cue, ad in rows
    ]


@router.post("/videos/{video_id}/cue-points", response_model=AdCuePointOut, status_code=status.HTTP_201_CREATED)
def add_video_cue_point(
    video_id: str,
    payload: AdCuePointCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """offset_seconds=0 is a pre-roll (plays before the content
    starts); anything higher is a mid-roll at that point. Only takes
    effect in the player once the video's own has_ads is True — this
    endpoint doesn't check that, so an admin can pre-build a schedule
    before flipping has_ads on.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    ad = db.query(Ad).filter(Ad.id == payload.ad_id).first()
    if not ad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ad not found")

    cue = AdCuePoint(video_id=video.id, ad_id=ad.id, offset_seconds=payload.offset_seconds)
    db.add(cue)
    db.commit()
    db.refresh(cue)
    return AdCuePointOut(id=cue.id, ad_id=ad.id, ad_name=ad.name, offset_seconds=cue.offset_seconds)


@router.delete("/videos/{video_id}/cue-points/{cue_point_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video_cue_point(
    video_id: str,
    cue_point_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    cue = db.query(AdCuePoint).filter(AdCuePoint.id == cue_point_id, AdCuePoint.video_id == video_id).first()
    if not cue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cue point not found")
    db.delete(cue)
    db.commit()
