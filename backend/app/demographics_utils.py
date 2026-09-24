"""Age-group bucketing and city/age-group viewer matching, shared by the
customer-facing revenue analytics (routers/watch.py) and the admin
Revenue Sharing page (routers/admin_revenue.py) — both the "by city" /
"by age group" breakdowns and the Content Performance city/age-group
filters. One place for the bucket boundaries so the two surfaces can
never drift apart.

Age is computed from UserDemographics.date_of_birth AS OF TODAY, not as
of when a video was watched — same simplification the existing
viewer_country breakdown makes for country, and worth the same caveat:
this is "who this viewer currently is", not a point-in-time snapshot.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import UserDemographics

# Order matters for display (youngest first) — reused by both admin and
# customer-facing pages so the age-group dropdown/legend is identical.
AGE_GROUPS = ["18-24", "25-34", "35-44", "45-54", "55+"]


def age_group_label(date_of_birth: Optional[date], today: date) -> str:
    """"Unknown" covers both "no date of birth on file" (declared-minor
    sub-accounts, or an account that hasn't completed its profile yet) and
    the practically-impossible case of a computed age under 18 — main
    accounts and self-completing sub-accounts are both age-gated at 18+
    elsewhere (see auth.MIN_REGISTRATION_AGE), so this is just a safe
    fallback rather than a path anything should normally take.
    """
    if date_of_birth is None:
        return "Unknown"
    age = today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))
    if age < 18:
        return "Unknown"
    if age <= 24:
        return "18-24"
    if age <= 34:
        return "25-34"
    if age <= 44:
        return "35-44"
    if age <= 54:
        return "45-54"
    return "55+"


def user_ids_matching(db: Session, today: date, city: Optional[str] = None, age_group: Optional[str] = None) -> Optional[set]:
    """The set of user_ids whose UserDemographics matches every given
    filter. Returns None (meaning "no filtering needed") when neither
    filter is given — the caller should skip filtering entirely in that
    case, rather than treating None as "matches nobody".

    Age-group membership isn't a plain column, so it can't be filtered as
    a simple SQL equality — this fetches (user_id, date_of_birth) once and
    buckets in Python. Deliberately not date-range SQL (e.g. BETWEEN a
    computed cutoff) to keep the bucket boundaries in exactly one place
    (age_group_label above) and portable across SQLite (tests) and
    PostgreSQL (production) without duplicating the boundary logic in two
    different date-arithmetic dialects.
    """
    if city is None and age_group is None:
        return None

    query = db.query(UserDemographics.user_id, UserDemographics.city, UserDemographics.date_of_birth)
    if city is not None:
        query = query.filter(UserDemographics.city == city)

    matches = set()
    for row in query:
        if age_group is not None and age_group_label(row.date_of_birth, today) != age_group:
            continue
        matches.add(row.user_id)
    return matches
