"""Background scheduler for time-based auto-actions — currently just
"publish this video once its scheduled time arrives" (Admin > Video
Review > Schedule). This is NOT a database trigger: Postgres triggers
fire on row events (INSERT/UPDATE/DELETE), not on the passage of time,
so there's no native "run this when a timestamp is reached" mechanism
in plain Postgres (that would need the pg_cron extension installed on
the DB server itself, which this deployment doesn't have set up).

Instead, this runs a lightweight polling job INSIDE the FastAPI
process itself, using APScheduler — every POLL_INTERVAL_SECONDS, it
asks the database "which scheduled videos are now due?" and publishes
them. Simple, needs no extra infrastructure (no Postgres extension, no
separate worker container, no Celery/Redis), and fits this app's
existing single-backend-container deployment. The tradeoff: a video
can publish up to POLL_INTERVAL_SECONDS late (never early), which is
fine for a "publish around this time" feature — not suitable for
something needing sub-second precision.
"""
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.models import Video, VideoStatus
from app.routers.recommendations import compute_and_store_embedding

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60


def publish_due_scheduled_videos():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due_videos = (
            db.query(Video)
            .filter(Video.status == VideoStatus.scheduled, Video.scheduled_publish_at <= now)
            .all()
        )
        for video in due_videos:
            video.status = VideoStatus.published
            video.published_at = now
            db.commit()
            db.refresh(video)
            try:
                compute_and_store_embedding(video, db)  # best-effort, same as manual approve
            except Exception:
                logger.exception("compute_and_store_embedding failed for scheduled video %s", video.id)
            logger.info("Auto-published scheduled video %s (was due at %s)", video.id, video.scheduled_publish_at)
    except Exception:
        logger.exception("publish_due_scheduled_videos failed")
    finally:
        db.close()


_scheduler: BackgroundScheduler | None = None


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(publish_due_scheduled_videos, "interval", seconds=POLL_INTERVAL_SECONDS, id="publish_due_scheduled_videos")
    _scheduler.start()
    logger.info("Video auto-publish scheduler started (polling every %ss)", POLL_INTERVAL_SECONDS)


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
