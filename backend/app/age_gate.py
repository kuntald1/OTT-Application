"""Which age ratings a given viewer may NOT watch.

ONE function decides it — blocked_ratings_for() — and every surface that
can show or play a video asks that same function. The answer is applied
in two shapes:

  * list queries filter blocked videos out entirely, so they never
    appear in browse, search, recommendations, continue-watching,
    history, My List or special categories; and
  * videos._check_video_access refuses playback, so a direct link, a
    guessed id, or a raw API call gets no playback URL either.

Both are needed. Hiding a card in the UI is not a restriction — the app
and the website both talk to the same public API, and anyone can call it
without them.

WHO IS RESTRICTED
  Main accounts are 18+ by registration (auth.MIN_REGISTRATION_AGE
  rejects under-18s), so only family sub-accounts can be minors, and
  UserDemographics.is_declared_minor is the single source of truth. A
  sub-account with no demographics row at all — only possible for ones
  created before that feature shipped — counts as a minor, the safe
  side, until its parent says otherwise from Manage Profile.

  Logged-out visitors are restricted too (client decision, Nov 2026):
  restricted content is not browsable at all without an account, rather
  than being visible-but-unplayable the way subscription content is.

WHAT IS RESTRICTED
  AgeRestrictionConfig, a single admin-editable row. No rating is
  hardcoded here. If that row is missing or its master switch is off,
  nothing is restricted and the site behaves exactly as it did before
  this feature shipped.
"""

from sqlalchemy.orm import Session

from app.models import AgeRestrictionConfig, User, UserDemographics

# Every rating that exists, weakest first. Used only for ordering the
# admin screen and validating what it sends; the actual restriction is
# whatever the admin has ticked, not a cut-off on this list.
RATING_ORDER = ["U", "UA7+", "UA13+", "UA16+", "A"]

# Used when the settings row has never been seeded AND an admin opens
# the settings page — what the checkboxes show before the first save.
DEFAULT_RESTRICTED = ("UA16+", "A")


def parse_ratings(raw: str | None) -> list[str]:
    """Comma-separated column value -> clean, ordered, de-duplicated
    list. Unknown values are dropped rather than raising: a rating that
    was retired after being saved here shouldn't break every video
    request on the site.
    """
    if not raw:
        return []
    seen = {part.strip() for part in raw.split(",") if part.strip()}
    return [r for r in RATING_ORDER if r in seen]


def get_config(db: Session) -> AgeRestrictionConfig | None:
    return db.query(AgeRestrictionConfig).first()


def restricted_ratings(db: Session) -> set[str]:
    """The ratings currently closed to under-18 profiles. Empty set when
    the feature is off or has never been set up — meaning no restriction
    at all, which is the behaviour this site had before Nov 2026.
    """
    config = get_config(db)
    if config is None or not config.enabled:
        return set()
    return set(parse_ratings(config.restricted_ratings))


def is_minor_viewer(user: User | None, db: Session) -> bool:
    """True for a family sub-account its parent declared as under-18.

    Mirrors routers/auth.py's own is_declared_minor resolution exactly,
    including the "no row means minor" default for sub-accounts created
    before UserDemographics existed. A main account is never a minor:
    registration rejects under-18s outright.
    """
    if user is None:
        return False
    if not user.parent_id:
        return False
    row = (
        db.query(UserDemographics)
        .filter(UserDemographics.user_id == user.id)
        .first()
    )
    return row.is_declared_minor if row else True


def blocked_ratings_for(user: User | None, db: Session) -> set[str]:
    """The ratings THIS viewer may not watch. Empty for an adult — the
    overwhelmingly common case, and the one that must stay unchanged.

    Call this ONCE per request and pass the result down (every list
    endpoint does), rather than per video: it reads the settings row,
    and a browse page renders a hundred cards.
    """
    restricted = restricted_ratings(db)
    if not restricted:
        return set()
    if user is None:
        return restricted
    if is_minor_viewer(user, db):
        return restricted
    return set()


def is_blocked(video_age_rating, blocked: set[str]) -> bool:
    """True if this video's rating is one the viewer may not watch.
    Takes the rating as either the AgeRating enum member or its plain
    string value, since both turn up depending on how the row was
    loaded.
    """
    if not blocked:
        return False
    value = getattr(video_age_rating, "value", video_age_rating)
    return value in blocked
