"""
One-time seed script — populates `menus` and `subscription_plans` with the
same data that's currently hardcoded in the frontend (NAV_LINKS, CATEGORIES,
TICKETING_LINK in TopNav.jsx; PLANS in SubscriptionPage.jsx). Run this once
after deploying the new tables, so the site's nav/pricing looks IDENTICAL
to before — just now coming from the database instead of hardcoded arrays.

Safe to re-run: it checks for existing rows by name/label before inserting,
so running it twice won't create duplicates.

Usage (from inside the backend container):
    docker compose exec theomy-backend python -m app.seed_data
"""
from app.database import SessionLocal
from app.models import Menu, SubscriptionPlan


def seed_menus(db):
    existing = {m.label for m in db.query(Menu).all()}

    # Top-level nav items, in the order they appear in TopNav.jsx's
    # NAV_LINKS + TICKETING_LINK. "Category" has no `view` of its own —
    # it's purely a dropdown trigger; its children below carry the actual
    # navigable destinations.
    top_level = [
        {"label": "Plays", "view": "hero", "display_order": 0},
        {"label": "Archive", "view": "accordion", "display_order": 1},
        {"label": "My List", "view": "mylist", "requires_auth": True, "display_order": 2},
        {"label": "Community", "view": "community", "display_order": 3},
        {"label": "Category", "view": None, "display_order": 4},
        {"label": "Ticketing", "view": "theater", "display_order": 5},
    ]

    created = {}
    for item in top_level:
        if item["label"] in existing:
            # Still need its id for the children loop below
            created[item["label"]] = (
                db.query(Menu).filter(Menu.label == item["label"]).first()
            )
            continue
        menu = Menu(
            label=item["label"],
            view=item.get("view"),
            requires_auth=item.get("requires_auth", False),
            display_order=item["display_order"],
        )
        db.add(menu)
        db.flush()  # assigns menu.id without committing yet
        created[item["label"]] = menu

    category_parent = created["Category"]

    # Sub-menu items — the Category dropdown's contents, matching
    # src/shared/categories.js exactly. Each one navigates to the
    # "category" view with its name as the category_param.
    categories = [
        "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
        "Classical Theatre", "Experimental Theatre", "Popular Shows",
    ]
    for i, cat in enumerate(categories):
        if cat in existing:
            continue
        db.add(Menu(
            label=cat,
            view="category",
            category_param=cat,
            parent_menu_id=category_parent.id,
            display_order=i,
        ))

    db.commit()
    print(f"Seeded {len(top_level)} top-level menus + {len(categories)} category sub-menus (skipping any that already existed).")


def seed_subscription_plans(db):
    existing = {p.name for p in db.query(SubscriptionPlan).all()}

    plans = [
        {
            "name": "Play",
            "tagline": "Unlimited Video Streaming",
            "base_price": 100,
            "per_extra_screen": 60,
            "features": ["Unlimited access to all Play content", "New titles added weekly"],
            "highlighted": False,
            "display_order": 0,
        },
        {
            "name": "Archive",
            "tagline": "Unlimited Archive access",
            "base_price": 100,
            "per_extra_screen": 60,
            "features": ["Unlimited access to old & restored footage", "Vintage recordings added regularly"],
            "highlighted": False,
            "display_order": 1,
        },
        {
            "name": "Both",
            "tagline": "Play + Archive, unlimited",
            "base_price": 150,
            "per_extra_screen": 90,
            "features": ["Everything in Play", "Everything in Archive", "Best value vs buying separately"],
            "highlighted": True,
            "display_order": 2,
        },
    ]

    count = 0
    for p in plans:
        if p["name"] in existing:
            continue
        db.add(SubscriptionPlan(**p))
        count += 1

    db.commit()
    print(f"Seeded {count} subscription plans (skipping any that already existed).")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_menus(db)
        seed_subscription_plans(db)
    finally:
        db.close()
