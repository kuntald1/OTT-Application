import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import auth, oauth, tickets, subscriptions, menus, plans

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

# Serves uploaded profile photos at /api/uploads/... — the "uploads" folder
# on disk is bind-mounted from the host (see docker-compose.yml), so files
# persist across container rebuilds.
os.makedirs("uploads", exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
