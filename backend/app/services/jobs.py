from typing import Any

from app.worker import run_process_mining_job


def create_analysis_job(
    *,
    organization_id: str,
    project_id: str,
    dataset_id: str,
    analysis_module: str,
    case_column: str,
    activity_column: str,
    timestamp_column: str,
    amount_column: str | None = None,
    resource_column: str | None = None,
    sla_hours: float | None = None,
    user_supabase,
) -> dict[str, Any]:
    """
    Creates a job via the atomic Postgres RPC (membership + quota + insert)
    then enqueues the Celery task.
    """
    result = user_supabase.rpc(
        "create_analysis_job_atomic",
        {
            "p_organization_id": organization_id,
            "p_project_id": project_id,
            "p_dataset_id": dataset_id,
            "p_job_type": analysis_module,
        },
    ).execute()

    if not result.data:
        raise RuntimeError("Unable to create analysis job.")

    row = result.data[0]

    if not row.get("success"):
        return row

    job_id = row["job_id"]

    dataset = (
        user_supabase.table("datasets")
        .select("storage_path,row_count")
        .eq("id", dataset_id)
        .single()
        .execute()
        .data
    )

    if not dataset:
        raise RuntimeError("Dataset disappeared after job creation.")

    run_process_mining_job.delay(
        job_id=str(job_id),
        storage_path=dataset["storage_path"],
        analysis_module=analysis_module,
        case_col=case_column,
        act_col=activity_column,
        time_col=timestamp_column,
        amount_col=amount_column,
        resource_col=resource_column,
        sla_hours=sla_hours,
    )

    return row
