import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import auth, oauth, tickets, subscriptions, menus, plans, payments, tax, blogs, community, organisers, donations, revenue, withdrawals, event_enquiries, otp, exchange_rate, stripe_payments, reward_config, admin_auth, videos, admin_videos, people, admin_event_enquiries, video_payments, watch, admin_revenue, admin_menus, my_list, playback_sessions, watch_progress, admin_ads

# Creates the `users` table on startup if it doesn't already exist.
# For future schema changes, switch to Alembic migrations instead of
# relying on create_all.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="theomy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://theomy.com", "https://www.theomy.com"],
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
app.include_router(payments.router, prefix="/api")
app.include_router(tax.router, prefix="/api")
app.include_router(blogs.router, prefix="/api")
app.include_router(community.router, prefix="/api")
app.include_router(organisers.router, prefix="/api")
app.include_router(donations.router, prefix="/api")
app.include_router(revenue.router, prefix="/api")
app.include_router(withdrawals.router, prefix="/api")
app.include_router(event_enquiries.router, prefix="/api")
app.include_router(otp.router, prefix="/api")
app.include_router(exchange_rate.router, prefix="/api")
app.include_router(stripe_payments.router, prefix="/api")
app.include_router(reward_config.router, prefix="/api")
app.include_router(admin_auth.router, prefix="/api")
app.include_router(videos.router, prefix="/api")
app.include_router(admin_videos.router, prefix="/api")
app.include_router(admin_event_enquiries.router, prefix="/api")
app.include_router(people.router, prefix="/api")
app.include_router(video_payments.router, prefix="/api")
app.include_router(watch.router, prefix="/api")
app.include_router(admin_revenue.router, prefix="/api")
app.include_router(admin_menus.router, prefix="/api")
app.include_router(my_list.router, prefix="/api")
app.include_router(playback_sessions.router, prefix="/api")
app.include_router(watch_progress.router, prefix="/api")
app.include_router(admin_ads.router, prefix="/api")

# Serves uploaded profile photos at /api/uploads/... — the "uploads" folder
# on disk is bind-mounted from the host (see docker-compose.yml), so files
# persist across container rebuilds.
os.makedirs("uploads", exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
