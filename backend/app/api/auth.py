"""
Модуль авторизации CargoFlow Backend.

Реализует:
- Аутентификация через Supabase Auth (Supabase JWT)
- Cookie-based сессии (HttpOnly cookie sb_access_token)
- Dependency `get_current_session` для защиты маршрутов
- Rate limiting на эндпоинте входа (защита от brute-force)
- Эндпоинт /api/admin/reset-database закрыт авторизацией
"""

from fastapi import APIRouter, Cookie as FastAPICookie, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel

from app.core.security import limiter
from app.services.local_service import SupabaseService

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
) -> CurrentSession:
    """
    FastAPI Dependency: извлекает и валидирует JWT-сессию.
    Порядок приоритетов: Authorization header → Cookie header → FastAPI Cookie.
    Валидация делегируется Supabase Auth (/auth/v1/user).
    """
    token: str | None = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    token = token or sb_access_token or _token_from_cookie(cookie_header)

    if not token:
        raise HTTPException(status_code=401, detail="Authorization required")

    try:
        user = await SupabaseService().get_user(token)
        return CurrentSession(access_token=token, user=user)
    except Exception as exc:
        raise HTTPException(
            status_code=401, detail=f"Supabase session invalid: {exc}"
        ) from exc


@router.post("/api/auth/login", tags=["auth"])
@limiter.limit("10/minute")  # Rate limit: макс. 10 попыток входа в минуту с одного IP
async def login(request: Request, payload: LoginRequest, response: Response) -> dict:
    """
    Аутентификация пользователя.
    При успехе устанавливает HttpOnly cookie `sb_access_token`.
    """
    try:
        data = await SupabaseService().login(payload.email, payload.password)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Supabase login failed: {exc}") from exc

    access_token = data.get("access_token", "")
    if access_token:
        response.set_cookie(
            key="sb_access_token",
            value=access_token,
            httponly=True,
            samesite="lax",
            secure=False,  # True в production (HTTPS)
            max_age=3600,
        )
    return data


@router.post("/api/auth/logout", tags=["auth"])
async def logout(response: Response) -> dict:
    response.delete_cookie("sb_access_token")
    return {"detail": "Logged out"}


@router.get("/api/auth/me", tags=["auth"])
async def me(session: CurrentSession = Depends(get_current_session)) -> dict:
    return session.user


@router.post(
    "/api/admin/reset-database",
    tags=["admin"],
    summary="[ЗАБЛОКИРОВАНО] Сброс данных — только для авторизованных администраторов",
)
async def reset_database(
    session: CurrentSession = Depends(get_current_session),  # Требует авторизацию
) -> dict:
    """
    Эндпоинт заблокирован требованием авторизации.
    В production должен дополнительно проверять роль 'admin' из JWT claims.
    """
    raise HTTPException(
        status_code=403,
        detail="Операция запрещена. Обратитесь к администратору системы.",
    )
