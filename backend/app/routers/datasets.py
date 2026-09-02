from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from supabase import Client

from app.auth import get_current_user, get_user_supabase
from app.config import get_settings
from app.schemas import (
    DatasetPreviewResponse,
    RegisterDatasetRequest,
    RegisterDatasetResponse,
)
from app.services.datasets import preview_tabular, safe_filename

router = APIRouter(prefix="/api/v1/datasets", tags=["datasets"])
settings = get_settings()


@router.post("/preview", response_model=DatasetPreviewResponse)
async def preview_dataset(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    del user

    filename = file.filename or "dataset.csv"
    if not filename.lower().endswith((".csv", ".xlsx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV and XLSX files are supported.",
        )

    try:
        columns, preview, estimated = preview_tabular(
            file.file, filename,
            max_bytes=settings.max_preview_bytes,
            rows=15,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return {
        "filename": safe_filename(filename),
        "columns": columns,
        "preview": preview,
        "estimated_rows": estimated,
    }


@router.post(
    "/register",
    response_model=RegisterDatasetResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_dataset(
    body: RegisterDatasetRequest,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    """
    Register a dataset that was already uploaded to Supabase Storage by the frontend.
    Storage path convention: {organization_id}/{project_id}/{uuid}_{filename}
    """
    # Membership check
    membership = (
        sb.table("organization_members")
        .select("role")
        .eq("organization_id", body.organization_id)
        .eq("user_id", user["sub"])
        .limit(1)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Organization access denied.")

    role = membership.data[0]["role"]
    if role not in ("owner", "admin", "analyst"):
        raise HTTPException(status_code=403, detail="Insufficient role to register datasets.")

    # Project ownership
    project = (
        sb.table("projects")
        .select("id")
        .eq("id", body.project_id)
        .eq("organization_id", body.organization_id)
        .limit(1)
        .execute()
    )
    if not project.data:
        raise HTTPException(status_code=400, detail="Invalid project.")

    # Subscription row limit soft-check
    sub = (
        sb.table("subscriptions")
        .select("max_rows_per_file,status")
        .eq("organization_id", body.organization_id)
        .limit(1)
        .execute()
    )
    if not sub.data or sub.data[0]["status"] != "active":
        raise HTTPException(status_code=400, detail="Active subscription required.")
    if body.row_count > sub.data[0]["max_rows_per_file"]:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset exceeds plan row limit ({sub.data[0]['max_rows_per_file']}).",
        )

    insert = (
        sb.table("datasets")
        .insert(
            {
                "organization_id": body.organization_id,
                "project_id": body.project_id,
                "name": body.name,
                "storage_path": body.storage_path,
                "row_count": body.row_count,
                "file_size_bytes": body.file_size_bytes,
                "status": "ready",
                "created_by": user["sub"],
                "source_type": "file",
                "schema_json": {"columns": []},
                "ingestion_metadata": {"uploaded_filename": body.name},
            }
        )
        .execute()
    )

    if not insert.data:
        raise HTTPException(status_code=500, detail="Failed to register dataset.")

    return {
        "dataset_id": insert.data[0]["id"],
        "status": "ready",
    }


@router.get("")
def list_datasets(
    organization_id: str,
    project_id: str | None = None,
    user: dict = Depends(get_current_user),
    sb: Client = Depends(get_user_supabase),
):
    del user
    q = (
        sb.table("datasets")
        .select("id,name,row_count,file_size_bytes,status,created_at,project_id")
        .eq("organization_id", organization_id)
        .neq("status", "deleted")
        .order("created_at", desc=True)
    )
    if project_id:
        q = q.eq("project_id", project_id)

    result = q.execute()
    return {"datasets": result.data or []}
