from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client, create_client

from app.config import get_settings
from app.db import supabase as default_supabase

bearer = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    token = credentials.credentials

    try:
        response = default_supabase.auth.get_user(token)
        user = response.user
        if not user:
            raise ValueError("No authenticated user")

        return {
            "sub": str(user.id),
            "email": getattr(user, "email", None),
            "access_token": token,
        }
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_user_supabase(user: dict = Depends(get_current_user)) -> Client:
    """
    Returns a Supabase client carrying the user's JWT so RLS policies
    that rely on auth.uid() work for RPC and table operations.
    """
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(user["access_token"])
    return client
