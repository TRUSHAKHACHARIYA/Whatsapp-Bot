"""
Celery application and all background tasks.
Workers handle: campaign broadcasts, scheduled messages, webhook processing,
analytics aggregation, and subscription renewal reminders.
"""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

# ─── App ─────────────────────────────────────────────────────────────────────

celery_app = Celery(
    "wapisend",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.core.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.core.tasks.send_campaign_broadcast": {"queue": "campaigns"},
        "app.core.tasks.send_single_whatsapp_message": {"queue": "messages"},
        "app.core.tasks.aggregate_daily_analytics": {"queue": "analytics"},
    },
)

# ─── Periodic tasks ──────────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    # Run scheduled campaigns every minute
    "check-scheduled-campaigns": {
        "task": "app.core.tasks.check_scheduled_campaigns",
        "schedule": 60.0,  # every 60 seconds
    },
    # Aggregate daily analytics at midnight IST
    "aggregate-daily-analytics": {
        "task": "app.core.tasks.aggregate_daily_analytics",
        "schedule": crontab(hour=0, minute=0),
    },
    # Send subscription expiry reminders at 10am
    "subscription-expiry-reminders": {
        "task": "app.core.tasks.send_subscription_reminders",
        "schedule": crontab(hour=10, minute=0),
    },
}
