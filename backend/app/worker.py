import json
import logging
import os
import tempfile
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


def refund_credit_on_failure(job_id: str) -> None:
    """Refund credit using atomic RPC — no race conditions."""
    try:
        job = get_job(job_id)
        if not job or job["status"] != "failed":
            return

        result = worker_supabase.rpc(
            "refund_credit_atomic",
            {
                "p_organization_id": job["organization_id"],
                "p_user_id": job["created_by"],
                "p_job_id": job_id,
            },
        ).execute()

        if result.data and result.data[0].get("success"):
            logger.info(
                "Refunded 1 credit to org %s for failed job %s (new_balance=%d)",
                job["organization_id"],
                job_id,
                result.data[0]["new_balance"],
            )
        else:
            logger.warning(
                "Refund failed for job %s: %s",
                job_id,
                result.data[0].get("error_message") if result.data else "unknown",
            )
    except Exception as exc:
        logger.exception("Failed to refund credit for job %s: %s", job_id, exc)


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

    temp_file_path = None
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

        # Memory-efficient download: write to temp file
        file_bytes = worker_supabase.storage.from_(
            settings.datasets_bucket
        ).download(storage_path)

        if len(file_bytes) > settings.max_upload_bytes:
            raise ValueError("Dataset exceeds configured file size limit.")

        temp_file = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".xlsx" if storage_path.lower().endswith(".xlsx") else ".csv",
        )
        temp_file.write(file_bytes)
        temp_file.close()
        temp_file_path = temp_file.name

        # Free the bytes buffer immediately
        del file_bytes

        update_job(job_id, {"progress": 30})

        if storage_path.lower().endswith(".xlsx"):
            df = pd.read_excel(temp_file_path, engine="openpyxl")
        else:
            df = pd.read_csv(temp_file_path)

        # Clean up temp file
        try:
            os.unlink(temp_file_path)
            temp_file_path = None
        except Exception:
            pass

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

        # Free DataFrame memory
        del df

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
        cases_count = artifact.get("executive_summary", {}).get("cases", 0)
        total_events = artifact.get("executive_summary", {}).get("events", 0)

        worker_supabase.table("analysis_results").upsert(
            {
                "job_id": job_id,
                "organization_id": job["organization_id"],
                "metrics_summary": {
                    "total_events": total_events,
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
                "rows_processed": total_events,
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
        if temp_file_path:
            try:
                os.unlink(temp_file_path)
            except Exception:
                pass

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

        # Permanent failure — mark as failed and refund credit atomically
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

        # Atomic refund via RPC
        refund_credit_on_failure(job_id)
