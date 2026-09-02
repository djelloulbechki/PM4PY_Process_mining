from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.logging_config import configure_logging
from app.routers import analyses, connectors, datasets, health

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(
    title="Process Mining SaaS API",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

app.include_router(health.router)
app.include_router(datasets.router)
app.include_router(connectors.router)
app.include_router(analyses.router)
