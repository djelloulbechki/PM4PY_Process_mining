from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "process_mining_worker",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.worker"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    task_time_limit=60 * 30,
    task_soft_time_limit=60 * 25,
    timezone="UTC",
    enable_utc=True,
)
