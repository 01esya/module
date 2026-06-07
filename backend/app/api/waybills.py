"""
API-роутер модуля электронных путевых листов.

Реализует полный CRUD для сущности waybill (путевой лист).
Все операции требуют аутентификации (JWT через cookie/header).
Валидация входных данных осуществляется декларативно через Pydantic.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from app.api.auth import CurrentSession, get_current_session
from app.services.local_service import SupabaseHTTPError, SupabaseService

router = APIRouter(prefix="/api/waybills", tags=["waybills"])


# ─── Pydantic-схемы ──────────────────────────────────────────────

class WaybillCreate(BaseModel):
    """Схема создания нового путевого листа (Форма № 4-П)."""
    cargo_type: str = Field(..., min_length=1, max_length=255,
                            description="Наименование груза")
    weight: float = Field(..., gt=0, le=100_000,
                          description="Масса груза брутто, кг")
    customer: str = Field(..., min_length=1, max_length=255,
                          description="Грузоотправитель / заказчик")
    carrier: str = Field(..., min_length=1, max_length=255,
                         description="Перевозчик")
    from_city: str = Field(..., min_length=1, max_length=100,
                           description="Пункт погрузки")
    to_city: str = Field(..., min_length=1, max_length=100,
                         description="Пункт разгрузки")
    date_from: str = Field(..., description="Дата начала (YYYY-MM-DD)")
    date_to: str = Field(..., description="Дата окончания (YYYY-MM-DD)")
    vehicle_id: Optional[int] = Field(None, description="ID транспортного средства")
    driver_id: Optional[int] = Field(None, description="ID водителя")
    route_coords: list[list[float]] = Field(
        default_factory=list,
        description="Координаты маршрута [[lat, lon], ...]",
    )
    organization_id: int = Field(..., description="ID организации")

    @field_validator("route_coords")
    @classmethod
    def validate_coords(cls, v: list) -> list:
        for point in v:
            if len(point) != 2:
                raise ValueError("Каждая точка маршрута: [lat, lon]")
            lat, lon = point
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                raise ValueError(f"Невалидные координаты: {lat}, {lon}")
        return v


class WaybillStatusUpdate(BaseModel):
    """Схема изменения статуса путевого листа."""
    status: str = Field(
        ...,
        pattern=r"^(Ожидают|В пути|Доставлен|Отменён)$",
        description="Новый статус",
    )


class WaybillUpdate(BaseModel):
    """Схема частичного обновления путевого листа."""
    cargo_type: Optional[str] = Field(None, min_length=1, max_length=255)
    weight: Optional[float] = Field(None, gt=0, le=100_000)
    customer: Optional[str] = None
    carrier: Optional[str] = None
    from_city: Optional[str] = None
    to_city: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    route_coords: Optional[list[list[float]]] = None
    status: Optional[str] = Field(
        None, pattern=r"^(Ожидают|В пути|Доставлен|Отменён)$"
    )


# ─── Endpoints ───────────────────────────────────────────────────

def _raise(exc: SupabaseHTTPError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get(
    "",
    summary="Список путевых листов",
    response_model=list[dict[str, Any]],
)
async def list_waybills(
    status_filter: Optional[str] = Query(None, alias="status"),
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    """
    Возвращает список путевых листов организации текущего пользователя.
    Поддерживает фильтрацию по статусу: `Ожидают`, `В пути`, `Доставлен`, `Отменён`.
    """
    try:
        return await SupabaseService().get_waybills(session.access_token, status_filter)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get(
    "/{waybill_id}",
    summary="Получить путевой лист по ID",
    response_model=dict[str, Any],
)
async def get_waybill(
    waybill_id: int,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    try:
        record = await SupabaseService().get_waybill(waybill_id, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)
    if not record:
        raise HTTPException(status_code=404, detail="Путевой лист не найден")
    return record


@router.post(
    "",
    summary="Создать путевой лист",
    status_code=status.HTTP_201_CREATED,
    response_model=dict[str, Any],
)
async def create_waybill(
    payload: WaybillCreate,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    """
    Создаёт новый электронный путевой лист.
    Все поля проходят Pydantic-валидацию на стороне сервера.
    """
    try:
        data = payload.model_dump(exclude_none=True)
        return await SupabaseService().create_waybill(data, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.patch(
    "/{waybill_id}",
    summary="Обновить путевой лист",
    response_model=dict[str, Any],
)
async def update_waybill(
    waybill_id: int,
    payload: WaybillUpdate,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    try:
        data = payload.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Нет полей для обновления")
        return await SupabaseService().update_waybill(waybill_id, data, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.patch(
    "/{waybill_id}/status",
    summary="Изменить статус путевого листа",
    response_model=dict[str, Any],
)
async def update_waybill_status(
    waybill_id: int,
    payload: WaybillStatusUpdate,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    """Специализированный эндпоинт смены статуса — используется чаще всего."""
    try:
        return await SupabaseService().update_waybill_status(
            waybill_id, payload.status, session.access_token
        )
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.delete(
    "/{waybill_id}",
    summary="Удалить путевой лист",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_waybill(
    waybill_id: int,
    session: CurrentSession = Depends(get_current_session),
) -> None:
    try:
        await SupabaseService().delete_waybill(waybill_id, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)
