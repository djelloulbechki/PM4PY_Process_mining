from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class AnalysisModule(str, Enum):
    process_discovery = "process_discovery"
    performance_analytics = "performance_analytics"
    conformance_checking = "conformance_checking"
    process_intelligence = "process_intelligence"


class CreateAnalysisRequest(BaseModel):
    organization_id: str
    project_id: str
    dataset_id: str
    analysis_module: AnalysisModule = AnalysisModule.process_discovery
    case_column: str = Field(min_length=1, max_length=255)
    activity_column: str = Field(min_length=1, max_length=255)
    timestamp_column: str = Field(min_length=1, max_length=255)
    amount_column: str | None = Field(default=None, max_length=255)
    resource_column: str | None = Field(default=None, max_length=255)
    sla_hours: float | None = Field(default=None, gt=0, le=8760)


class CreateAnalysisResponse(BaseModel):
    job_id: str
    status: str


class DatasetPreviewResponse(BaseModel):
    filename: str
    columns: list[str]
    preview: list[dict[str, Any]]
    estimated_rows: int | None = None


class RegisterDatasetRequest(BaseModel):
    organization_id: str
    project_id: str
    name: str = Field(min_length=1, max_length=255)
    storage_path: str = Field(min_length=1, max_length=1024)
    row_count: int = Field(ge=0)
    file_size_bytes: int | None = Field(default=None, ge=0)


class RegisterDatasetResponse(BaseModel):
    dataset_id: str
    status: str


class JobStatusResponse(BaseModel):
    id: str
    status: str
    progress: int
    job_type: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    created_at: str | None = None


class ArtifactUrlResponse(BaseModel):
    job_id: str
    signed_url: str
    expires_in: int
    metrics_summary: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    version: str = "3.0.0"


class ConnectorCreateRequest(BaseModel):
    organization_id: str
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    connector_type: str = Field(min_length=1, max_length=50)
    api_key: str = Field(min_length=10, max_length=500)
    config: dict[str, Any] = Field(default_factory=dict)


class ConnectorResponse(BaseModel):
    id: str
    name: str
    connector_type: str
    status: str
    project_id: str
    config: dict[str, Any] = Field(default_factory=dict)


class OdooSyncRequest(BaseModel):
    dataset_name: str | None = Field(default=None, max_length=255)
    mapping: dict[str, Any]


# ──────────────────────────────────────────────────────────────
# Billing DTOs
# ──────────────────────────────────────────────────────────────
class TierResponse(BaseModel):
    code: str
    name: str
    price_usd: int
    max_rows: int
    max_file_size_bytes: int
    credits: int


class BillingAccountResponse(BaseModel):
    organization_id: str
    credits_balance: int
    credits_purchased: int
    created_at: str
    updated_at: str


class CheckoutRequest(BaseModel):
    organization_id: str
    tier: str = Field(..., pattern="^(standard|pro|scale)$")


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalRequest(BaseModel):
    organization_id: str


class PortalResponse(BaseModel):
    portal_url: str
