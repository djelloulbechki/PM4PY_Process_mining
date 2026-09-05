from fastapi import APIRouter

from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "version": "1.0.0"}


@router.get("/api/v1/health", response_model=HealthResponse)
def health_v1():
    return {"status": "ok", "version": "1.0.0"}
