from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.auth import get_current_user, get_user_supabase
from app.connectors.base import ConnectorError
from app.connectors.registry import CONNECTORS, get_connector
from app.schemas import ConnectorCreateRequest, ConnectorResponse, OdooSyncRequest
from app.services.credentials import decrypt_secret, encrypt_secret

router = APIRouter(prefix="/api/v1/connectors", tags=["connectors"])


def _member(sb: Client, org_id: str, user_id: str) -> str:
    result = sb.table("organization_members").select("role").eq("organization_id", org_id).eq("user_id", user_id).limit(1).execute()
    if not result.data:
        raise HTTPException(403, "Organization access denied.")
    role = result.data[0]["role"]
    if role not in ("owner", "admin", "analyst"):
        raise HTTPException(403, "Insufficient organization role.")
    return role


def _connector_config(row: dict) -> dict:
    config = dict(row.get("config") or {})
    if row.get("credentials_encrypted"):
        config["api_key"] = decrypt_secret(row["credentials_encrypted"])
    return config


@router.get("/catalog")
def catalog(user: dict = Depends(get_current_user)):
    del user
    return {"connectors": [{"key": key, "name": cls.name, "capabilities": ["test", "discover", "sync"]} for key, cls in CONNECTORS.items()]}


@router.get("")
def list_connectors(organization_id: str, project_id: str | None = None, user: dict = Depends(get_current_user), sb: Client = Depends(get_user_supabase)):
    _member(sb, organization_id, user["sub"])
    q = sb.table("data_sources").select("id,name,connector_type,status,config,last_sync_at,last_error,created_at,updated_at,project_id").eq("organization_id", organization_id).order("created_at", desc=True)
    if project_id:
        q = q.eq("project_id", project_id)
    return {"connectors": q.execute().data or []}


@router.post("", response_model=ConnectorResponse, status_code=201)
def create_connector(body: ConnectorCreateRequest, user: dict = Depends(get_current_user), sb: Client = Depends(get_user_supabase)):
    _member(sb, body.organization_id, user["sub"])
    if body.connector_type not in CONNECTORS:
        raise HTTPException(400, "Unsupported connector.")
    project = sb.table("projects").select("id").eq("id", body.project_id).eq("organization_id", body.organization_id).limit(1).execute()
    if not project.data:
        raise HTTPException(400, "Invalid project.")
    try:
        connector = get_connector(body.connector_type, {**body.config, "api_key": body.api_key})
        connector.test_connection()
    except ConnectorError as exc:
        raise HTTPException(400, str(exc))
    row = sb.table("data_sources").insert({
        "organization_id": body.organization_id, "project_id": body.project_id, "name": body.name,
        "connector_type": body.connector_type, "status": "connected", "config": {k: v for k, v in body.config.items() if k not in {"api_key"}},
        "credentials_encrypted": encrypt_secret(body.api_key), "created_by": user["sub"],
    }).execute()
    if not row.data:
        raise HTTPException(500, "Failed to create connector.")
    return row.data[0]


@router.post("/{connector_id}/test")
def test_connector(connector_id: str, user: dict = Depends(get_current_user), sb: Client = Depends(get_user_supabase)):
    row = sb.table("data_sources").select("*").eq("id", connector_id).single().execute().data
    if not row:
        raise HTTPException(404, "Connector not found.")
    _member(sb, row["organization_id"], user["sub"])
    try:
        result = get_connector(row["connector_type"], _connector_config(row)).test_connection()
        sb.table("data_sources").update({"status": "connected", "last_error": None}).eq("id", connector_id).execute()
        return result
    except ConnectorError as exc:
        sb.table("data_sources").update({"status": "error", "last_error": str(exc)[:500]}).eq("id", connector_id).execute()
        raise HTTPException(400, str(exc))


@router.get("/{connector_id}/discover")
def discover_connector(connector_id: str, user: dict = Depends(get_current_user), sb: Client = Depends(get_user_supabase)):
    row = sb.table("data_sources").select("*").eq("id", connector_id).single().execute().data
    if not row:
        raise HTTPException(404, "Connector not found.")
    _member(sb, row["organization_id"], user["sub"])
    try:
        return get_connector(row["connector_type"], _connector_config(row)).discover()
    except ConnectorError as exc:
        raise HTTPException(400, str(exc))


@router.post("/{connector_id}/sync")
def sync_connector(connector_id: str, body: OdooSyncRequest, user: dict = Depends(get_current_user), sb: Client = Depends(get_user_supabase)):
    row = sb.table("data_sources").select("*").eq("id", connector_id).single().execute().data
    if not row:
        raise HTTPException(404, "Connector not found.")
    _member(sb, row["organization_id"], user["sub"])
    ctype = row["connector_type"]
    try:
        events = get_connector(ctype, _connector_config(row)).fetch_events(body.mapping)
    except ConnectorError as exc:
        sb.table("data_sources").update({"status": "error", "last_error": str(exc)[:500]}).eq("id", connector_id).execute()
        raise HTTPException(400, str(exc))
    if not events:
        raise HTTPException(400, f"No valid events were returned by {ctype}.")

    import csv, io, json
    import pandas as pd
    frame = pd.DataFrame(events)
    content = io.StringIO(); frame.to_csv(content, index=False)
    label = (
        body.mapping.get("model")
        or body.mapping.get("object_type")
        or body.mapping.get("sobject")
        or body.mapping.get("entity")
        or body.mapping.get("module")
        or body.mapping.get("board_id")
        or "events"
    )
    safe = str(label).replace(".", "_").replace("/", "_")[:80]
    dataset_name = body.dataset_name or f"{ctype.title()} · {label}"
    path = f"{row['organization_id']}/{row['project_id']}/{connector_id}_{safe}.csv"
    sb.storage.from_("datasets").upload(path=path, file=content.getvalue().encode(), file_options={"content-type":"text/csv", "upsert":"true"})
    schema = {col: str(frame[col].dtype) for col in frame.columns}
    inserted = sb.table("datasets").insert({
        "organization_id": row["organization_id"], "project_id": row["project_id"], "name": dataset_name,
        "storage_path": path, "row_count": len(frame), "file_size_bytes": len(content.getvalue().encode()),
        "status": "ready", "created_by": user["sub"], "source_type": ctype, "source_id": connector_id,
        "schema_json": schema, "ingestion_metadata": {"connector": ctype, "model":body.mapping.get("model"), "mapping":body.mapping},
    }).execute()
    sb.table("data_sources").update({"status":"connected", "last_sync_at":"now()", "last_error":None}).eq("id", connector_id).execute()
    return {"dataset_id": inserted.data[0]["id"], "events": len(events), "status": "ready"}
