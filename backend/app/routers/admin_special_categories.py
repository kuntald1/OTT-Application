from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AdminUser, SpecialCategory, SpecialCategoryVideo, Video, VideoSection, VideoStatus,
    VideoCast, VideoCrew, Person, User,
)
from app.schemas import (
    SpecialCategoryCreate, SpecialCategoryUpdate, SpecialCategoryOut, SpecialCategoryVideoCardOut,
    AdminVideoSearchResultOut,
)

router = APIRouter(prefix="/admin/special-categories", tags=["admin-special-categories"])


def _to_out(sc: SpecialCategory, db: Session) -> SpecialCategoryOut:
    links = db.query(SpecialCategoryVideo).filter(SpecialCategoryVideo.special_category_id == sc.id).all()
    video_ids = [l.video_id for l in links]
    videos = db.query(Video).filter(Video.id.in_(video_ids)).all() if video_ids else []
    return SpecialCategoryOut(
        id=sc.id,
        title=sc.title,
        visible_from=sc.visible_from,
        visible_to=sc.visible_to,
        display_order=sc.display_order,
        section=sc.section.value,
        is_disabled=sc.is_disabled,
        video_count=len(videos),
        videos=[
            SpecialCategoryVideoCardOut(
                id=v.id, title=v.title, poster_image_url=v.poster_image_url,
                trailer_playback_url=None,  # populated by the public endpoint (needs BUNNY_CDN_HOSTNAME urls); admin list doesn't need it
            )
            for v in videos
        ],
    )


@router.get("/search-videos", response_model=list[AdminVideoSearchResultOut])
def search_videos_for_special_category(
    q: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Backs the "search by Video Title, Cast, Crew, or Organiser name"
    box in Manage Videos — one free-text query across all four,
    published videos only (no point curating a row around something
    viewers can't actually watch yet). Returns at most 25 matches,
    each tagged with which field actually matched (matched_on) so the
    picker can show a small hint like "matched: cast — Ksenia
    Romanova" instead of just a bare title.
    """
    q = q.strip()
    if len(q) < 2:
        return []
    like = f"%{q}%"

    results: dict = {}  # video_id -> AdminVideoSearchResultOut, de-duplicated (first match wins)

    def _add(video: Video, matched_on: str):
        if video.id in results:
            return
        organiser = db.query(User).filter(User.id == video.uploaded_by_user_id).first()
        results[video.id] = AdminVideoSearchResultOut(
            id=video.id,
            title=video.title,
            poster_image_url=video.poster_image_url,
            organiser_name=organiser.name if organiser else None,
            matched_on=matched_on,
        )

    for v in (
        db.query(Video)
        .filter(Video.status == VideoStatus.published, Video.title.ilike(like))
        .limit(25)
        .all()
    ):
        _add(v, "title")

    if len(results) < 25:
        cast_video_ids = (
            db.query(VideoCast.video_id)
            .join(Person, Person.id == VideoCast.person_id)
            .filter(Person.name.ilike(like))
            .subquery()
        )
        for v in (
            db.query(Video)
            .filter(Video.status == VideoStatus.published, Video.id.in_(cast_video_ids))
            .limit(25 - len(results))
            .all()
        ):
            _add(v, "cast")

    if len(results) < 25:
        crew_video_ids = (
            db.query(VideoCrew.video_id)
            .join(Person, Person.id == VideoCrew.person_id)
            .filter(Person.name.ilike(like))
            .subquery()
        )
        for v in (
            db.query(Video)
            .filter(Video.status == VideoStatus.published, Video.id.in_(crew_video_ids))
            .limit(25 - len(results))
            .all()
        ):
            _add(v, "crew")

    if len(results) < 25:
        organiser_ids = db.query(User.id).filter(User.name.ilike(like)).subquery()
        for v in (
            db.query(Video)
            .filter(Video.status == VideoStatus.published, Video.uploaded_by_user_id.in_(organiser_ids))
            .limit(25 - len(results))
            .all()
        ):
            _add(v, "organiser")

    return list(results.values())[:25]


@router.post("", response_model=SpecialCategoryOut, status_code=status.HTTP_201_CREATED)
def create_special_category(
    payload: SpecialCategoryCreate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if payload.section not in ("play", "archive", "both"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play', 'archive', or 'both'.")
    if payload.visible_from and payload.visible_to and payload.visible_to < payload.visible_from:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Visible-to date can't be before visible-from.")
    if bool(payload.visible_from) != bool(payload.visible_to):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Set both dates for a temporary special, or neither for a permanent one.")
    sc = SpecialCategory(
        title=payload.title,
        visible_from=payload.visible_from,
        visible_to=payload.visible_to,
        display_order=payload.display_order,
        section=VideoSection(payload.section),
    )
    db.add(sc)
    db.flush()
    for video_id in payload.video_ids:
        video = db.query(Video).filter(Video.id == video_id).first()
        if video:
            db.add(SpecialCategoryVideo(special_category_id=sc.id, video_id=video.id))
    db.commit()
    db.refresh(sc)
    return _to_out(sc, db)


@router.get("", response_model=list[SpecialCategoryOut])
def list_special_categories(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(SpecialCategory).order_by(SpecialCategory.display_order.asc(), SpecialCategory.created_at.desc()).all()
    return [_to_out(sc, db) for sc in rows]


@router.put("/{special_category_id}", response_model=SpecialCategoryOut)
def update_special_category(
    special_category_id: str,
    payload: SpecialCategoryUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    sc = db.query(SpecialCategory).filter(SpecialCategory.id == special_category_id).first()
    if not sc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Special category not found")
    if payload.title is not None:
        sc.title = payload.title
    if payload.clear_visible_from:
        sc.visible_from = None
    elif payload.visible_from is not None:
        sc.visible_from = payload.visible_from
    if payload.clear_visible_to:
        sc.visible_to = None
    elif payload.visible_to is not None:
        sc.visible_to = payload.visible_to
    if payload.display_order is not None:
        sc.display_order = payload.display_order
    if payload.section is not None:
        if payload.section not in ("play", "archive", "both"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="section must be 'play', 'archive', or 'both'.")
        sc.section = VideoSection(payload.section)
    if sc.visible_from and sc.visible_to and sc.visible_to < sc.visible_from:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Visible-to date can't be before visible-from.")
    if bool(sc.visible_from) != bool(sc.visible_to):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Set both dates for a temporary special, or neither for a permanent one.")
    db.commit()
    db.refresh(sc)
    return _to_out(sc, db)


@router.put("/{special_category_id}/disable", response_model=SpecialCategoryOut)
def toggle_special_category_disabled(
    special_category_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Toggles is_disabled — a soft hide that keeps the row and its
    video links intact (use DELETE below to remove permanently).
    """
    sc = db.query(SpecialCategory).filter(SpecialCategory.id == special_category_id).first()
    if not sc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Special category not found")
    sc.is_disabled = not sc.is_disabled
    db.commit()
    db.refresh(sc)
    return _to_out(sc, db)


@router.delete("/{special_category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_special_category(
    special_category_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    sc = db.query(SpecialCategory).filter(SpecialCategory.id == special_category_id).first()
    if not sc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Special category not found")
    db.query(SpecialCategoryVideo).filter(SpecialCategoryVideo.special_category_id == sc.id).delete()
    db.delete(sc)
    db.commit()


@router.post("/{special_category_id}/videos", response_model=SpecialCategoryOut)
def add_video_to_special_category(
    special_category_id: str,
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    sc = db.query(SpecialCategory).filter(SpecialCategory.id == special_category_id).first()
    if not sc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Special category not found")
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    exists = (
        db.query(SpecialCategoryVideo)
        .filter(SpecialCategoryVideo.special_category_id == sc.id, SpecialCategoryVideo.video_id == video.id)
        .first()
    )
    if not exists:
        db.add(SpecialCategoryVideo(special_category_id=sc.id, video_id=video.id))
        db.commit()
    return _to_out(sc, db)


@router.delete("/{special_category_id}/videos/{video_id}", response_model=SpecialCategoryOut)
def remove_video_from_special_category(
    special_category_id: str,
    video_id: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    sc = db.query(SpecialCategory).filter(SpecialCategory.id == special_category_id).first()
    if not sc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Special category not found")
    db.query(SpecialCategoryVideo).filter(
        SpecialCategoryVideo.special_category_id == sc.id, SpecialCategoryVideo.video_id == video_id
    ).delete()
    db.commit()
    return _to_out(sc, db)
