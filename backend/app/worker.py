import io
import json
import logging
import time
from typing import Any

import pandas as pd

from app.celery_app import celery_app
from app.config import get_settings
from app.db import worker_supabase
from app.services.mining import execute_mining_module

logger = logging.getLogger(__name__)
settings = get_settings()


def update_job(job_id: str, values: dict[str, Any]) -> None:
    worker_supabase.table("analysis_jobs").update(values).eq("id", job_id).execute()


def get_job(job_id: str) -> dict[str, Any] | None:
    result = (
        worker_supabase.table("analysis_jobs")
        .select("*")
        .eq("id", job_id)
        .single()
        .execute()
    )
    return result.data if result.data else None


def is_cancelled(job_id: str) -> bool:
    job = (
        worker_supabase.table("analysis_jobs")
        .select("status")
        .eq("id", job_id)
        .single()
        .execute()
        .data
    )
    return bool(job and job["status"] == "cancelled")


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=15,
    acks_late=True,
)
def run_process_mining_job(
    self,
    job_id: str,
    storage_path: str,
    analysis_module: str,
    case_col: str,
    act_col: str,
    time_col: str,
    amount_col: str | None = None,
    resource_col: str | None = None,
    sla_hours: float | None = None,
):
    started = time.monotonic()
    job = get_job(job_id)

    if not job:
        logger.warning("Job %s not found.", job_id)
        return

    if job["status"] in ("completed", "failed", "cancelled"):
        return

    try:
        update_job(
            job_id,
            {
                "status": "processing",
                "progress": 10,
                "started_at": "now()",
                "error_code": None,
                "error_message": None,
            },
        )

        if is_cancelled(job_id):
            return

        file_bytes = worker_supabase.storage.from_(
            settings.datasets_bucket
        ).download(storage_path)

        if len(file_bytes) > settings.max_upload_bytes:
            raise ValueError("Dataset exceeds configured file size limit.")

        update_job(job_id, {"progress": 30})

        if storage_path.lower().endswith(".xlsx"):
            df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        else:
            df = pd.read_csv(io.BytesIO(file_bytes))

        if len(df) > settings.default_max_rows:
            raise ValueError("Dataset exceeds configured row limit.")

        if is_cancelled(job_id):
            return

        update_job(job_id, {"progress": 50})

        artifact = execute_mining_module(
            analysis_module,
            df,
            case_col,
            act_col,
            time_col,
            amount_col=amount_col,
            resource_col=resource_col,
            sla_hours=sla_hours,
        )

        if is_cancelled(job_id):
            return

        update_job(job_id, {"progress": 80})

        artifact_path = f"{job['organization_id']}/{job_id}.json"
        artifact_bytes = json.dumps(
            artifact,
            ensure_ascii=False,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")

        worker_supabase.storage.from_(settings.artifacts_bucket).upload(
            path=artifact_path,
            file=artifact_bytes,
            file_options={
                "content-type": "application/json",
                "upsert": "true",
            },
        )

        duration = time.monotonic() - started

        cases_count = int(df[case_col].nunique()) if case_col in df.columns else 0

        worker_supabase.table("analysis_results").upsert(
            {
                "job_id": job_id,
                "organization_id": job["organization_id"],
                "metrics_summary": {
                    "total_events": int(len(df)),
                    "cases_count": cases_count,
                    "module": analysis_module,
                    "executive_summary": artifact.get("executive_summary", {}),
                },
                "artifact_storage_path": artifact_path,
            },
            on_conflict="job_id",
        ).execute()

        worker_supabase.table("usage_records").upsert(
            {
                "organization_id": job["organization_id"],
                "user_id": job["created_by"],
                "job_id": job_id,
                "rows_processed": int(len(df)),
                "execution_time_seconds": round(duration, 3),
            },
            on_conflict="job_id",
        ).execute()

        update_job(
            job_id,
            {
                "status": "completed",
                "progress": 100,
                "completed_at": "now()",
                "error_code": None,
                "error_message": None,
            },
        )

    except Exception as exc:
        logger.exception("Job %s failed.", job_id)

        if self.request.retries < self.max_retries:
            update_job(
                job_id,
                {
                    "status": "retrying",
                    "retry_count": self.request.retries + 1,
                    "error_message": str(exc)[:500],
                },
            )
            raise self.retry(exc=exc)

        update_job(
            job_id,
            {
                "status": "failed",
                "error_code": "DATASET_PROCESSING_ERROR",
                "error_message": (
                    "The dataset could not be analyzed. "
                    "Check the file format and mapped columns. "
                    f"Detail: {str(exc)[:300]}"
                ),
                "completed_at": "now()",
            },
        )
