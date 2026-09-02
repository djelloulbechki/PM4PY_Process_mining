from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.auth import get_current_user, get_user_supabase
from app.config import get_settings
from app.db import worker_supabase
from app.schemas import (
    ArtifactUrlResponse,
    CreateAnalysisRequest,
    CreateAnalysisResponse,
    JobStatusResponse,
)
from app.services.jobs import create_analysis_job

router = APIRouter(prefix="/api/v1/analyses", tags=["analyses"])
settings = get_settings()


@router.post(
    "",
    response_model=CreateAnalysisResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_analysis(
    data: CreateAnalysisRequest,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    membership = (
        sb.table("organization_members")
        .select("organization_id,role")
        .eq("organization_id", data.organization_id)
        .eq("user_id", user["sub"])
        .limit(1)
        .execute()
    )

    if not membership.data:
        raise HTTPException(status_code=403, detail="Organization access denied.")

    if membership.data[0]["role"] not in ("owner", "admin", "analyst"):
        raise HTTPException(status_code=403, detail="Insufficient role to run analyses.")

    result = create_analysis_job(
        organization_id=data.organization_id,
        project_id=data.project_id,
        dataset_id=data.dataset_id,
        analysis_module=data.analysis_module.value,
        case_column=data.case_column,
        activity_column=data.activity_column,
        timestamp_column=data.timestamp_column,
        amount_column=data.amount_column,
        resource_column=data.resource_column,
        sla_hours=data.sla_hours,
        user_supabase=sb,
    )

    if not result.get("success"):
        reason = result.get("error_message") or "Analysis job could not be created."
        raise HTTPException(status_code=400, detail=reason)

    return {
        "job_id": str(result["job_id"]),
        "status": "queued",
    }


@router.get("/{job_id}", response_model=JobStatusResponse)
def get_analysis(
    job_id: str,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    del user
    result = (
        sb.table("analysis_jobs")
        .select(
            "id,status,progress,job_type,error_code,error_message,"
            "started_at,completed_at,created_at"
        )
        .eq("id", job_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Analysis job not found.")

    return result.data


@router.get("")
def list_analyses(
    organization_id: str,
    project_id: str | None = None,
    limit: int = 50,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    del user
    limit = min(max(limit, 1), 100)
    q = (
        sb.table("analysis_jobs")
        .select(
            "id,status,progress,job_type,dataset_id,error_code,"
            "created_at,completed_at,started_at"
        )
        .eq("organization_id", organization_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if project_id:
        q = q.eq("project_id", project_id)

    result = q.execute()
    return {"jobs": result.data or []}


@router.post("/{job_id}/cancel")
def cancel_analysis(
    job_id: str,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    del user
    result = (
        sb.table("analysis_jobs")
        .update({"status": "cancelled"})
        .eq("id", job_id)
        .in_("status", ["queued", "processing", "retrying"])
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=409,
            detail="Job cannot be cancelled in its current state.",
        )

    return {"job_id": job_id, "status": "cancelled"}


@router.get("/{job_id}/artifact", response_model=ArtifactUrlResponse)
def get_artifact_url(
    job_id: str,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    """
    Returns a short-lived signed URL for the analysis artifact JSON.
    Uses service role only after verifying the user can see the job via RLS.
    """
    del user

    job = (
        sb.table("analysis_jobs")
        .select("id,status,organization_id")
        .eq("id", job_id)
        .single()
        .execute()
    )
    if not job.data:
        raise HTTPException(status_code=404, detail="Analysis job not found.")

    if job.data["status"] != "completed":
        raise HTTPException(
            status_code=409,
            detail="Artifact is only available for completed jobs.",
        )

    result = (
        sb.table("analysis_results")
        .select("artifact_storage_path,metrics_summary")
        .eq("job_id", job_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Result not found.")

    path = result.data["artifact_storage_path"]
    ttl = settings.artifact_signed_url_ttl

    signed = worker_supabase.storage.from_(settings.artifacts_bucket).create_signed_url(
        path, ttl
    )

    # supabase-py returns different shapes depending on version
    signed_url = None
    if isinstance(signed, dict):
        signed_url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
        if not signed_url and "data" in signed:
            signed_url = signed["data"].get("signedUrl") or signed["data"].get("signedURL")
    else:
        signed_url = getattr(signed, "signed_url", None) or getattr(signed, "signedURL", None)

    if not signed_url:
        # Fallback: try create_signed_urls
        try:
            multi = worker_supabase.storage.from_(settings.artifacts_bucket).create_signed_urls(
                [path], ttl
            )
            if multi and isinstance(multi, list) and multi[0].get("signedURL"):
                signed_url = multi[0]["signedURL"]
            elif multi and isinstance(multi, dict) and multi.get("data"):
                signed_url = multi["data"][0].get("signedURL")
        except Exception:
            pass

    if not signed_url:
        raise HTTPException(status_code=500, detail="Could not create signed URL.")

    # Make absolute if relative
    if signed_url.startswith("/"):
        signed_url = settings.supabase_url.rstrip("/") + signed_url

    return {
        "job_id": job_id,
        "signed_url": signed_url,
        "expires_in": ttl,
        "metrics_summary": result.data.get("metrics_summary") or {},
    }
