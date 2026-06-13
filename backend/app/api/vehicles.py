from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import CurrentSession, get_current_session
from app.core.config import settings
from app.services.supabase_service import SupabaseHTTPError, SupabaseService, get_supabase_token
from app.services.local_service import LocalDBService

router = APIRouter()


def _raise_supabase(exc: SupabaseHTTPError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/api/vehicles", tags=["vehicles"])
async def list_vehicles(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_vehicles(await get_supabase_token())
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)
    except Exception:
        return await LocalDBService().get_vehicles(session.access_token)
