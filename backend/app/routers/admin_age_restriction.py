"""Admin > Age Restriction — which age ratings are off limits to
under-18 (family sub-account) profiles.

Superadmin-only to change, like Reward Points and Tax: this decides what
children can and cannot watch on the platform.

There is exactly one age_restriction_config row (see
seed_data.seed_age_restriction_config). Unlike admin_reward_config, which
refuses to work until its row is seeded, this router CREATES the row on
the first save. The difference is deliberate: a missing reward_config
means money is being handed back at rates nobody chose, whereas a missing
age_restriction_config simply means nothing is restricted — the exact
behaviour the site had before this feature, and safe to sit in. So the
screen opens on sensible defaults and the first Save writes the row.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.age_gate import DEFAULT_RESTRICTED, RATING_ORDER, get_config, parse_ratings
from app.database import get_db
from app.deps import get_current_admin, get_current_superadmin
from app.models import AdminUser, AgeRestrictionConfig, Video
from app.schemas import AgeRestrictionConfigOut, AgeRestrictionConfigUpdate

router = APIRouter(prefix="/admin/age-restriction", tags=["admin-age-restriction"])


def _out(config: AgeRestrictionConfig | None) -> AgeRestrictionConfigOut:
    if config is None:
        return AgeRestrictionConfigOut(
            enabled=False,
            restricted_ratings=list(DEFAULT_RESTRICTED),
            all_ratings=list(RATING_ORDER),
            updated_at=None,
        )
    return AgeRestrictionConfigOut(
        enabled=config.enabled,
        restricted_ratings=parse_ratings(config.restricted_ratings),
        all_ratings=list(RATING_ORDER),
        updated_at=config.updated_at,
    )


@router.get("", response_model=AgeRestrictionConfigOut)
def get_age_restriction(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Readable by any admin; only a superadmin can change it. Returns
    defaults, with enabled false, when the row has never been saved —
    which is also the truth at that point: nothing is restricted yet.
    """
    return _out(get_config(db))


@router.get("/impact")
def age_restriction_impact(
    current_admin: AdminUser = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """How many published videos carry each rating, so the admin can see
    what a change actually affects BEFORE saving it — "3 videos will be
    hidden from under-18 profiles" rather than finding out from a
    parent's complaint.
    """
    counts = {rating: 0 for rating in RATING_ORDER}
    rows = (
        db.query(Video.age_rating, Video.status)
        .filter(Video.age_rating.isnot(None))
        .all()
    )
    for age_rating, video_status in rows:
        # Only published videos are visible to a viewer at all, so only
        # those can be hidden FROM one.
        if getattr(video_status, "value", video_status) != "published":
            continue
        value = getattr(age_rating, "value", age_rating)
        if value in counts:
            counts[value] += 1
    return {"published_by_rating": counts}


@router.put("", response_model=AgeRestrictionConfigOut)
def update_age_restriction(
    payload: AgeRestrictionConfigUpdate,
    current_admin: AdminUser = Depends(get_current_superadmin),
    db: Session = Depends(get_db),
):
    """Creates the single row if it doesn't exist yet, then updates only
    the fields that were actually sent — so the master switch can be
    flipped without resending the ticked ratings, and vice versa.
    """
    config = get_config(db)
    if config is None:
        config = AgeRestrictionConfig(
            enabled=True,
            restricted_ratings=",".join(DEFAULT_RESTRICTED),
        )
        db.add(config)

    data = payload.model_dump(exclude_unset=True)
    if "enabled" in data and data["enabled"] is not None:
        config.enabled = data["enabled"]
    if "restricted_ratings" in data and data["restricted_ratings"] is not None:
        # Stored in RATING_ORDER order and de-duplicated, so the column
        # reads the same however the screen sent it.
        config.restricted_ratings = ",".join(parse_ratings(",".join(data["restricted_ratings"])))

    db.commit()
    db.refresh(config)
    return _out(config)
