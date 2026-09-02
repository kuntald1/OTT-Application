import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import auth, oauth, tickets, subscriptions, menus, plans, payments, tax, blogs, community, organisers, donations, revenue, withdrawals, event_enquiries, otp, exchange_rate, stripe_payments, reward_config, admin_auth, videos, admin_videos, people, admin_event_enquiries, video_payments, watch, admin_revenue, admin_menus, my_list, playback_sessions, watch_progress, admin_ads, recommendations, admin_ai, live_streams, admin_live_streams, webhooks, admin_users, special_categories, admin_special_categories, admin_blogs, admin_people, organiser_requests, admin_organiser_requests, admin_community, donation_registrations, admin_donation_registrations, sub_accounts, admin_plans, admin_subscriptions, admin_tickets, admin_dashboard, admin_reports, page_heroes, admin_page_heroes, theater_hero_slides, admin_theater_hero_slides, archive_hero_slides, admin_archive_hero_slides

# Creates the `users` table on startup if it doesn't already exist.
# For future schema changes, switch to Alembic migrations instead of
# relying on create_all.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="theomy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://movixa.duckdns.org"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(oauth.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(menus.router, prefix="/api")
app.include_router(plans.router, prefix="/api")
app.include_router(plans.durations_router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(tax.router, prefix="/api")
app.include_router(blogs.router, prefix="/api")
app.include_router(admin_blogs.router, prefix="/api")
app.include_router(community.router, prefix="/api")
app.include_router(admin_community.router, prefix="/api")
app.include_router(organisers.router, prefix="/api")
app.include_router(donations.router, prefix="/api")
app.include_router(donation_registrations.router, prefix="/api")
app.include_router(admin_donation_registrations.router, prefix="/api")
app.include_router(sub_accounts.router, prefix="/api")
app.include_router(admin_plans.router, prefix="/api")
app.include_router(admin_subscriptions.router, prefix="/api")
app.include_router(admin_tickets.router, prefix="/api")
app.include_router(admin_dashboard.router, prefix="/api")
app.include_router(admin_reports.router, prefix="/api")
app.include_router(page_heroes.router, prefix="/api")
app.include_router(admin_page_heroes.router, prefix="/api")
app.include_router(theater_hero_slides.router, prefix="/api")
app.include_router(admin_theater_hero_slides.router, prefix="/api")
app.include_router(archive_hero_slides.router, prefix="/api")
app.include_router(admin_archive_hero_slides.router, prefix="/api")
app.include_router(revenue.router, prefix="/api")
app.include_router(withdrawals.router, prefix="/api")
app.include_router(event_enquiries.router, prefix="/api")
app.include_router(otp.router, prefix="/api")
app.include_router(exchange_rate.router, prefix="/api")
app.include_router(stripe_payments.router, prefix="/api")
app.include_router(reward_config.router, prefix="/api")
app.include_router(admin_auth.router, prefix="/api")
# live_streams MUST be registered before videos — GET /videos/live is a
# 2-segment path, same shape as videos.py's GET /{video_id} catch-all,
# and Starlette matches routes strictly in registration order (not by
# specificity), so registering videos first would swallow "live" as a
# video_id and 500 on the UUID cast. Same reasoning as /videos/search
# needing to be declared before /{video_id} within videos.py itself.
app.include_router(live_streams.router, prefix="/api")
app.include_router(videos.router, prefix="/api")
app.include_router(admin_videos.router, prefix="/api")
app.include_router(admin_event_enquiries.router, prefix="/api")
app.include_router(people.router, prefix="/api")
app.include_router(admin_people.router, prefix="/api")
app.include_router(organiser_requests.router, prefix="/api")
app.include_router(admin_organiser_requests.router, prefix="/api")
app.include_router(video_payments.router, prefix="/api")
app.include_router(watch.router, prefix="/api")
app.include_router(admin_revenue.router, prefix="/api")
app.include_router(admin_menus.router, prefix="/api")
app.include_router(my_list.router, prefix="/api")
app.include_router(playback_sessions.router, prefix="/api")
app.include_router(watch_progress.router, prefix="/api")
app.include_router(admin_ads.router, prefix="/api")
app.include_router(recommendations.router, prefix="/api")
app.include_router(admin_ai.router, prefix="/api")
app.include_router(admin_live_streams.router, prefix="/api")
app.include_router(special_categories.router, prefix="/api")
app.include_router(admin_special_categories.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(admin_users.router, prefix="/api")

# Serves uploaded profile photos at /api/uploads/... — the "uploads" folder
# on disk is bind-mounted from the host (see docker-compose.yml), so files
# persist across container rebuilds.
os.makedirs("uploads", exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
