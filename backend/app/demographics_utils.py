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
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models import User, UserDemographics

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


def geo_breakdown(db: Session, per_viewer_paisa: dict, today: date) -> list:
    """Builds the "which country, then which city, then which age group
    watches this" tree the client actually asked for (Sept 2026) — the
    flat by-country / by-city / by-age-group breakdowns are three
    SEPARATE, unrelated totals and can't answer "of Kolkata's viewers,
    how many are 35-44", which was the whole point.

    per_viewer_paisa is {user_id: creator-earned paisa}, already summed
    per DISTINCT viewer — the caller decides the source (a video's
    VideoWatchRecord rows for a per-video tree, or RevenueLedgerEntry
    rows summed by user_id for a platform/creator-wide one) and passes
    in that one number per viewer; this function only builds the tree.

    Country comes from User.country (every user has one, INDIA-only
    account or not) — NOT from UserDemographics, which only ever holds
    India accounts' cities. City is only broken out for India, since
    city isn't collected anywhere else (Admin decision, Sept 2026); a
    non-India country's only child is a single "Unknown" city bucket
    (there's no per-country city collection to show instead). Age group
    applies to every country the same way.

    Returns a list of country nodes, each with nested cities, each with
    nested age groups — every level sorted by creator_earned_rupees,
    highest first, mirroring the flat breakdowns' own ordering.
    """
    user_ids = list(per_viewer_paisa.keys())
    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids))}
    demo_by_user = {d.user_id: d for d in db.query(UserDemographics).filter(UserDemographics.user_id.in_(user_ids))}

    tree: dict = {}
    for user_id, paisa in per_viewer_paisa.items():
        user = users_by_id.get(user_id)
        country = user.country if (user and user.country) else "Unknown"
        demo = demo_by_user.get(user_id)
        city = (demo.city if (demo and demo.city) else "Unknown") if country == "India" else "Unknown"
        age_group = age_group_label(demo.date_of_birth if demo else None, today)

        bucket = tree.setdefault(country, {}).setdefault(city, {}).setdefault(age_group, {"viewers": 0, "paisa": 0})
        bucket["viewers"] += 1
        bucket["paisa"] += paisa

    def rupees(paisa: int) -> Decimal:
        return (Decimal(paisa) / 100).quantize(Decimal("0.01"))

    countries_out = []
    for country, cities in tree.items():
        country_viewers = 0
        country_paisa = 0
        cities_out = []
        for city, age_groups in cities.items():
            age_groups_out = sorted(
                ({"age_group": ag, "viewer_count": v["viewers"], "creator_earned_rupees": rupees(v["paisa"])}
                 for ag, v in age_groups.items()),
                key=lambda r: r["creator_earned_rupees"], reverse=True,
            )
            city_viewers = sum(v["viewers"] for v in age_groups.values())
            city_paisa = sum(v["paisa"] for v in age_groups.values())
            country_viewers += city_viewers
            country_paisa += city_paisa
            cities_out.append({
                "city": city, "viewer_count": city_viewers,
                "creator_earned_rupees": rupees(city_paisa), "age_groups": age_groups_out,
            })
        cities_out.sort(key=lambda r: r["creator_earned_rupees"], reverse=True)
        countries_out.append({
            "country": country, "viewer_count": country_viewers,
            "creator_earned_rupees": rupees(country_paisa), "cities": cities_out,
        })
    countries_out.sort(key=lambda r: r["creator_earned_rupees"], reverse=True)
    return countries_out
