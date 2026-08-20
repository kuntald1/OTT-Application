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
from app.models import Menu, SubscriptionPlan, TaxConfig, Blog, User, CommunityRoom, RoomPost
from app.security import hash_password


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


def seed_tax_config(db):
    existing = db.query(TaxConfig).first()
    if existing:
        print(f"Tax config already exists (GST {existing.gst_percent}%), skipping.")
        return
    db.add(TaxConfig(gst_percent=18))
    db.commit()
    print("Seeded tax config: GST 18%.")


def seed_blogs(db):
    existing = {b.title for b in db.query(Blog).all()}

    from datetime import datetime, timezone

    posts = [
        {
            "title": "Backstage at Letters from Chowringhee",
            "published_at": datetime(2026, 8, 8, tzinfo=timezone.utc),
            "excerpt": "A look at how the cast and crew built a year's worth of correspondence into a single evening on stage.",
            "body": "Letters from Chowringhee asks its two leads to age a full year across ninety minutes, without ever leaving a single shared post box on stage. The production team spoke to us about how blocking, lighting, and a slowly filling prop box carry that passage of time without a single costume change signaling it outright.\n\nRehearsals leaned heavily on repetition — the same three-step choreography of writing, sealing, and posting a letter, performed dozens of times until it read as habit rather than performance. By the fourth week, the actors stopped thinking about the mechanics entirely, which is exactly when the scene started working.\n\nThe post box itself is rebuilt between shows — a small continuity detail audiences rarely notice, but one the crew insists matters for how grounded the final scene feels when it's finally opened.",
        },
        {
            "title": "Why Bengali Theatre Is Having a Moment",
            "published_at": datetime(2026, 8, 2, tzinfo=timezone.utc),
            "excerpt": "A conversation with three directors on what's drawing new, younger audiences back into the stalls.",
            "body": "Ticket sales for Bengali-language productions have climbed steadily over the past two seasons, reversing a decade-long slide. We asked three directors what changed.\n\nAll three pointed to the same shift: shorter runtimes, tighter ensembles, and a willingness to stage contemporary, occasionally uncomfortable stories rather than leaning solely on the classical repertoire. Word of mouth among a younger crowd has done the rest — several productions this season sold out entirely on social recommendations, with no traditional advertising at all.\n\nThere's also a practical factor: smaller venues have made staging original, lower-budget work viable again, which has let newer writers get produced without needing a proven track record first.",
        },
        {
            "title": "5 Classical Productions to Watch This Season",
            "published_at": datetime(2026, 7, 27, tzinfo=timezone.utc),
            "excerpt": "From Academy of Fine Arts to Rabindra Sadan — the shows worth planning your month around.",
            "body": "This season's classical lineup leans unusually ambitious, with three venues staging large-ensemble work simultaneously for the first time in years. Here's where to start if you can only make a handful of shows.\n\nAcademy of Fine Arts opens with a restaging of a rarely performed 1970s piece, using the original set designs recovered from archive. Rabindra Sadan follows two weeks later with a new adaptation that's already drawing comparisons to the original 1985 run. Muktangan rounds out the month with a smaller, more intimate piece — worth catching specifically for how differently it uses the space compared to the two larger venues.\n\nAs always with limited-run classical work, tickets for the opening weekends tend to move fastest.",
        },
        {
            "title": "An Interview with a Working Lighting Designer",
            "published_at": datetime(2026, 7, 19, tzinfo=timezone.utc),
            "excerpt": "How one designer thinks about mood, blocking, and the difference between a good cue and a great one.",
            "body": "Lighting design rarely gets discussed the way blocking or performance does, so we sat down with a designer who's worked across half a dozen productions this year to talk through the craft.\n\nThe most consistent theme: restraint. A good cue, by this designer's account, is one the audience never consciously notices — it's doing its job quietly, shaping focus and mood without calling attention to itself. The rare moments where lighting is meant to be noticed are earned precisely because everything before them wasn't.\n\nWe also talked through the practical constraints of smaller venues — how limited rigs force more deliberate choices, and why that constraint often produces more interesting design than an unlimited budget would.",
        },
        {
            "title": "What It's Actually Like to Be an Understudy",
            "published_at": datetime(2026, 7, 6, tzinfo=timezone.utc),
            "excerpt": "Weeks of preparation for a role you might never perform — and why most understudies say it's worth it anyway.",
            "body": "Understudying is often framed as a thankless job: full preparation for a role that, statistically, you may never actually perform on a given night. We talked to several understudies currently working across the city's stages about why they keep taking the work.\n\nMost described it as the fastest way to genuinely learn a production from the inside — blocking, pacing, and the small adjustments a lead makes night to night become visible in a way they wouldn't from the audience. Several also pointed out that understudy runs, when they do happen, tend to bring a different energy to a role — often looser, sometimes revealing new choices the original cast adopts going forward.",
        },
        {
            "title": "A Short History of the Academy of Fine Arts Stage",
            "published_at": datetime(2026, 6, 24, tzinfo=timezone.utc),
            "excerpt": "Decades of productions have passed through the same stage — here's what's changed, and what hasn't.",
            "body": "The Academy of Fine Arts stage has hosted productions continuously for decades, surviving several renovations without losing its basic proportions — a detail directors who've worked there repeatedly cite as unusually valuable for staging.\n\nWe traced through venue records to piece together a rough history of what's been staged there, and spoke to longtime crew members about what's changed behind the scenes even as the stage itself has stayed largely consistent — better rigging, improved acoustics, but the same fundamental relationship between stage and stalls that's shaped how directors block scenes there for years.",
        },
    ]

    count = 0
    for p in posts:
        if p["title"] in existing:
            continue
        db.add(Blog(
            title=p["title"],
            excerpt=p["excerpt"],
            body=p["body"],
            author_name="theomy Team",
            published_at=p["published_at"],
        ))
        count += 1

    db.commit()
    print(f"Seeded {count} blog posts (skipping any that already existed).")


def seed_community_rooms(db):
    # Rooms/posts need a real user_id to attach to (foreign key) — create a
    # system "theomy Team" account for this if it doesn't exist yet.
    # It has a random, unknown password — it exists purely as an author
    # anchor for seeded/official content, not meant to be logged into.
    import secrets
    team_user = db.query(User).filter(User.email == "team@theomy.com").first()
    if not team_user:
        team_user = User(
            name="theomy Team",
            email="team@theomy.com",
            hashed_password=hash_password(secrets.token_urlsafe(32)),
        )
        db.add(team_user)
        db.commit()
        db.refresh(team_user)

    existing = {r.title for r in db.query(CommunityRoom).all()}

    rooms = [
        {
            "title": "Bengali Theatre Fans",
            "post": "Welcome! Share what you've been watching this week.",
        },
        {
            "title": "Backstage Stories",
            "post": "Post your best backstage moments — mishaps welcome.",
        },
        {
            "title": "New Play Recommendations",
            "post": "What should be added to the Ticketing section next?",
        },
    ]

    count = 0
    for r in rooms:
        if r["title"] in existing:
            continue
        room = CommunityRoom(title=r["title"], created_by_user_id=team_user.id)
        db.add(room)
        db.flush()
        db.add(RoomPost(room_id=room.id, author_user_id=team_user.id, text=r["post"]))
        count += 1

    db.commit()
    print(f"Seeded {count} community rooms (skipping any that already existed).")


if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_menus(db)
        seed_subscription_plans(db)
        seed_tax_config(db)
        seed_blogs(db)
        seed_community_rooms(db)
    finally:
        db.close()
