"""
API-роутер модуля управления персоналом.

Реализует CRUD для сущности employee (сотрудник организации).
Мягкое удаление: сотрудник деактивируется (active=false), не стирается.
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.auth import CurrentSession, get_current_session
from app.services.local_service import SupabaseHTTPError, SupabaseService

router = APIRouter(prefix="/api/employees", tags=["employees"])


# ─── Pydantic-схемы ──────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    """Схема создания нового сотрудника."""
    full_name: str = Field(..., min_length=2, max_length=255,
                           description="ФИО: Фамилия Имя Отчество")
    role: str = Field("Водитель", min_length=1, max_length=100,
                      description="Должность / роль")
    phone: str = Field("", max_length=20, description="Телефон (+79XXXXXXXXX)")
    organization_id: int = Field(..., description="ID организации")
    license_number: Optional[str] = Field(None, description="Серия и номер ВУ")
    license_class: Optional[str] = Field(None, description="Категория ВУ (B, C, CE)")
    snils: Optional[str] = Field(None, description="СНИЛС")


class EmployeeUpdate(BaseModel):
    """Схема частичного обновления сотрудника."""
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    role: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = None
    license_number: Optional[str] = None
    license_class: Optional[str] = None
    snils: Optional[str] = None
    active: Optional[bool] = None


# ─── Endpoints ───────────────────────────────────────────────────

def _raise(exc: SupabaseHTTPError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get(
    "",
    summary="Список сотрудников",
    response_model=list[dict[str, Any]],
)
async def list_employees(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    """Возвращает список активных сотрудников организации."""
    try:
        return await SupabaseService().get_employees(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get(
    "/{employee_id}",
    summary="Получить сотрудника по ID",
    response_model=dict[str, Any],
)
async def get_employee(
    employee_id: int,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    try:
        record = await SupabaseService().get_employee(employee_id, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)
    if not record:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return record


@router.post(
    "",
    summary="Создать сотрудника",
    status_code=status.HTTP_201_CREATED,
    response_model=dict[str, Any],
)
async def create_employee(
    payload: EmployeeCreate,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    try:
        data = payload.model_dump(exclude_none=True)
        return await SupabaseService().create_employee(data, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.patch(
    "/{employee_id}",
    summary="Обновить данные сотрудника",
    response_model=dict[str, Any],
)
async def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    try:
        data = payload.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="Нет полей для обновления")
        return await SupabaseService().update_employee(employee_id, data, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.delete(
    "/{employee_id}",
    summary="Деактивировать сотрудника",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_employee(
    employee_id: int,
    session: CurrentSession = Depends(get_current_session),
) -> None:
    """Мягкое удаление: устанавливает active=false без физического удаления записи."""
    try:
        await SupabaseService().delete_employee(employee_id, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)
