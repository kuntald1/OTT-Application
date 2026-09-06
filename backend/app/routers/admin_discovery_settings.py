from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import (
    AdminUser, User, UserRole, Video, VideoStatus,
    DiscoveryRowSetting, DiscoveryHiddenItem,
)
from app.schemas import (
    DiscoverySettingsOut, DiscoveryRowOut, DiscoveryItemOut,
    DiscoveryVisibilityUpdate, DiscoveryHideItemRequest,
)

router = APIRouter(prefix="/admin/discovery-settings", tags=["admin-discovery-settings"])

ALLOWED_ROW_KEYS = {"languages", "studios"}


def _row_visible(row_key: str, db: Session) -> bool:
    setting = db.query(DiscoveryRowSetting).filter(DiscoveryRowSetting.row_key == row_key).first()
    return setting.is_visible if setting else True  # no row yet = default visible


def _hidden_keys(row_key: str, db: Session) -> set[str]:
    return {
        h.item_key for h in db.query(DiscoveryHiddenItem).filter(DiscoveryHiddenItem.row_key == row_key).all()
    }


@router.get("", response_model=DiscoverySettingsOut)
def get_discovery_settings(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Every language/studio that appears on ANY published video, in
    EITHER section — an admin manages visibility once, site-wide,
    rather than per Play/Archive (the public rows still each apply
    their own section filter on top of whatever's visible here).
    """
    hidden_languages = _hidden_keys("languages", db)
    hidden_studios = _hidden_keys("studios", db)

    videos = db.query(Video.languages).filter(Video.status == VideoStatus.published).all()
    seen_languages: set[str] = set()
    for (languages,) in videos:
        if not languages:
            continue
        for lang in [l.strip() for l in languages.split(",") if l.strip()]:
            seen_languages.add(lang)

    studio_rows = (
        db.query(User.id, User.name)
        .join(Video, Video.uploaded_by_user_id == User.id)
        .filter(Video.status == VideoStatus.published, User.role == UserRole.plays_organiser)
        .distinct()
        .all()
    )

    return DiscoverySettingsOut(
        languages=DiscoveryRowOut(
            is_visible=_row_visible("languages", db),
            all_items=[
                DiscoveryItemOut(key=lang, label=lang, hidden=lang in hidden_languages)
                for lang in sorted(seen_languages)
            ],
        ),
        studios=DiscoveryRowOut(
            is_visible=_row_visible("studios", db),
            all_items=[
                DiscoveryItemOut(key=str(user_id), label=name, hidden=str(user_id) in hidden_studios)
                for user_id, name in studio_rows
            ],
        ),
    )


def _validate_row_key(row_key: str):
    if row_key not in ALLOWED_ROW_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"row_key must be one of {sorted(ALLOWED_ROW_KEYS)}.")


@router.put("/{row_key}/visibility")
def set_row_visibility(
    row_key: str,
    payload: DiscoveryVisibilityUpdate,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Whole-row on/off — turning "languages" or "studios" off entirely,
    regardless of individual item hides.
    """
    _validate_row_key(row_key)
    setting = db.query(DiscoveryRowSetting).filter(DiscoveryRowSetting.row_key == row_key).first()
    if not setting:
        setting = DiscoveryRowSetting(row_key=row_key, is_visible=payload.is_visible)
        db.add(setting)
    else:
        setting.is_visible = payload.is_visible
    db.commit()
    return {"row_key": row_key, "is_visible": payload.is_visible}


@router.post("/{row_key}/hide")
def hide_item(
    row_key: str,
    payload: DiscoveryHideItemRequest,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _validate_row_key(row_key)
    existing = (
        db.query(DiscoveryHiddenItem)
        .filter(DiscoveryHiddenItem.row_key == row_key, DiscoveryHiddenItem.item_key == payload.item_key)
        .first()
    )
    if not existing:
        db.add(DiscoveryHiddenItem(row_key=row_key, item_key=payload.item_key))
        db.commit()
    return {"row_key": row_key, "item_key": payload.item_key, "hidden": True}


@router.delete("/{row_key}/hide/{item_key}")
def unhide_item(
    row_key: str,
    item_key: str,
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    _validate_row_key(row_key)
    existing = (
        db.query(DiscoveryHiddenItem)
        .filter(DiscoveryHiddenItem.row_key == row_key, DiscoveryHiddenItem.item_key == item_key)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
    return {"row_key": row_key, "item_key": item_key, "hidden": False}
