from supabase import Client, create_client
from app.config import get_settings

settings = get_settings()

# Client used by API routes (RLS applies when user JWT is attached)
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key,
)

# Privileged client used only by Celery workers
worker_supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)
