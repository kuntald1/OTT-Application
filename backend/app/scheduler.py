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
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import (
    AutopayRenewalReminder, AutopaySubscription, Subscription, User, Video, VideoStatus,
)
from app.notifications import send_autopay_reminder_email, send_autopay_reminder_whatsapp
from app.routers.autopay import AUTOPAY_GRACE_DAYS
from app.routers.recommendations import compute_and_store_embedding

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 60

# How many days before a charge the reminder goes out. Long enough that
# someone has a real chance to cancel, short enough that they still
# remember getting it when the charge lands.
AUTOPAY_REMINDER_DAYS = 3
AUTOPAY_REMINDER_POLL_SECONDS = 3600


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


def send_due_autopay_reminders():
    """Warn customers a few days before an auto-renew charge.

    Almost every "I was charged without permission" complaint is really
    "I forgot I had this". A message that arrives while there is still
    time to cancel turns a chargeback into a cancellation, which costs
    us nothing and keeps the merchant account clean. The customer's bank
    also warns them 24 hours ahead under the RBI's e-mandate rules; this
    is ours, earlier, and it names the plan rather than just an amount.

    Sent once per charge, guarded by a row in autopay_renewal_reminders —
    this job polls, so without that record a customer three days out
    would be told again every single hour.
    """
    # Opened outside the main try on purpose, with its own guard: a
    # SessionLocal() that raises would otherwise escape this function,
    # and APScheduler drops a job that throws — reminders would stop
    # silently until the next redeploy, which nobody would notice.
    try:
        db = SessionLocal()
    except Exception:
        logger.exception("send_due_autopay_reminders: couldn't open a database session")
        return

    try:
        now = datetime.now(timezone.utc)
        window_end = now + timedelta(days=AUTOPAY_REMINDER_DAYS)
        grace = timedelta(days=AUTOPAY_GRACE_DAYS)

        # expires_at carries the grace days, so the charge itself falls
        # `grace` earlier — the same arithmetic /autopay/me uses. Asking
        # the database for expires_at within the shifted window keeps the
        # filter in SQL instead of loading every active mandate.
        due = (
            db.query(AutopaySubscription, Subscription)
            .join(Subscription, Subscription.id == AutopaySubscription.subscription_id)
            .filter(
                AutopaySubscription.status == "active",
                Subscription.expires_at > now + grace,
                Subscription.expires_at <= window_end + grace,
            )
            .all()
        )

        for autopay, subscription in due:
            renewal_at = subscription.expires_at
            if renewal_at.tzinfo is None:  # defensive: treat naive as UTC
                renewal_at = renewal_at.replace(tzinfo=timezone.utc)
            renewal_at = renewal_at - grace

            already = (
                db.query(AutopayRenewalReminder)
                .filter(
                    AutopayRenewalReminder.autopay_id == autopay.id,
                    AutopayRenewalReminder.renewal_at == renewal_at,
                )
                .first()
            )
            if already:
                continue

            user = db.query(User).filter(User.id == autopay.user_id).first()
            if not user:
                continue

            # Claim it BEFORE sending. If the send then fails we have
            # chosen to skip a reminder rather than risk a loop that
            # messages the same person every hour — and the pre-charge
            # window is short enough that a retry would barely help.
            db.add(AutopayRenewalReminder(
                autopay_id=autopay.id, user_id=user.id, renewal_at=renewal_at,
            ))
            try:
                db.commit()
            except IntegrityError:
                # Another worker got there first (the unique constraint).
                db.rollback()
                continue

            try:
                if user.phone:
                    send_autopay_reminder_whatsapp(
                        user.phone, autopay.plan_name, autopay.total_amount, renewal_at,
                    )
                send_autopay_reminder_email(
                    user.email, autopay.plan_name, autopay.total_amount,
                    autopay.duration_label, renewal_at,
                )
                logger.info(
                    "Sent auto-renew reminder to user %s for charge due %s", user.id, renewal_at
                )
            except Exception:
                logger.exception("Auto-renew reminder failed for user %s", user.id)
    except Exception:
        logger.exception("send_due_autopay_reminders failed")
    finally:
        db.close()


_scheduler: BackgroundScheduler | None = None


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(publish_due_scheduled_videos, "interval", seconds=POLL_INTERVAL_SECONDS, id="publish_due_scheduled_videos")
    # Hourly, not every minute: this is a "some time in the next few
    # days" message, and an hourly poll is 24 cheap queries a day instead
    # of 1,440. Runs once at startup too, so a container restarted inside
    # someone's reminder window still catches it.
    _scheduler.add_job(
        send_due_autopay_reminders, "interval",
        seconds=AUTOPAY_REMINDER_POLL_SECONDS,
        id="send_due_autopay_reminders",
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()
    logger.info(
        "Scheduler started — video auto-publish every %ss, auto-renew reminders every %ss (%s days ahead)",
        POLL_INTERVAL_SECONDS, AUTOPAY_REMINDER_POLL_SECONDS, AUTOPAY_REMINDER_DAYS,
    )


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
