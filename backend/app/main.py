from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, oauth, tickets, subscriptions

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


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
