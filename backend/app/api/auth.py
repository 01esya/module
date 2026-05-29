from fastapi import APIRouter, Cookie as FastAPICookie, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from app.services.supabase_service import SupabaseService

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class CurrentSession(BaseModel):
    access_token: str
    user: dict


def _token_from_cookie(cookie_header: str | None) -> str | None:
    if not cookie_header:
        return None

    for part in cookie_header.split(";"):
        key, _, value = part.strip().partition("=")
        if key == "sb_access_token" and value:
            return value
    return None


async def get_current_session(
    authorization: str | None = Header(default=None),
    cookie_header: str | None = Header(default=None, alias="cookie"),
    sb_access_token: str | None = FastAPICookie(default=None),
    access_token: str | None = Query(default=None),
) -> CurrentSession:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    token = token or sb_access_token or _token_from_cookie(cookie_header) or access_token

    if not token:
        raise HTTPException(status_code=401, detail="Authorization required")

    try:
        user = await SupabaseService().get_user(token)
        return CurrentSession(access_token=token, user=user)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=f"Supabase session invalid: {exc}") from exc


@router.post("/api/auth/login", tags=["auth"])
async def login(payload: LoginRequest) -> dict:
    try:
        return await SupabaseService().login(payload.email, payload.password)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail=f"Supabase login failed: {exc}") from exc


@router.get("/api/auth/me", tags=["auth"])
async def me(session: CurrentSession = Depends(get_current_session)) -> dict:
    return session.user
