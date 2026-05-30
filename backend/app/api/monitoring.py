"""
API-роутер модуля спутникового мониторинга транспорта.

Реализует эндпоинты:
- Справочные данные (ТС, устройства, параметры, организации)
- Текущая позиция и телеметрия ТС (имитационная модель)
- История мониторинга через RPC Supabase
- AI-анализ рейса через Gemini API
"""

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.auth import CurrentSession, get_current_session
from app.services.supabase_service import SupabaseHTTPError, SupabaseService
from app.services.telemetry_simulator import (
    generate_vehicle_history,
    generate_vehicle_location,
    generate_vehicle_parameters,
)

router = APIRouter(tags=["monitoring"])


class MonitoringRecordsRequest(BaseModel):
    vehicle_id: int
    date_from: str = Field(alias="from")
    date_to: str = Field(alias="to")
    limit: int = Field(50, ge=1, le=1000)
    offset: int = Field(0, ge=0)


def _raise(exc: SupabaseHTTPError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


# ─── Справочники ─────────────────────────────────────────────────

@router.get("/api/monitoring/vehicles", tags=["monitoring"])
async def monitoring_vehicles(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_vehicles(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/vehicles/{vehicle_id}", tags=["monitoring"])
async def monitoring_vehicle(
    vehicle_id: int,
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_vehicle(vehicle_id, session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/device-types", tags=["monitoring"])
async def device_types(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_device_types(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/parameters", tags=["monitoring"])
async def parameters(
    category: str | None = Query(default=None),
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_parameters(session.access_token, category)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/organizations", tags=["monitoring"])
async def organizations(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_organizations(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/profiles", tags=["monitoring"])
async def profiles(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_profiles(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/navigation-devices", tags=["monitoring"])
async def navigation_devices(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_navigation_devices(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/vehicle-devices", tags=["monitoring"])
async def vehicle_devices(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_vehicle_devices(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


@router.get("/api/monitoring/user-vehicles", tags=["monitoring"])
async def user_vehicles(
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_user_vehicles(session.access_token)
    except SupabaseHTTPError as exc:
        _raise(exc)


# ─── История мониторинга (Supabase RPC) ──────────────────────────

@router.post("/api/monitoring/records", tags=["monitoring"])
async def monitoring_records(
    payload: MonitoringRecordsRequest,
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_monitoring_records(
            session.access_token,
            payload.vehicle_id,
            payload.date_from,
            payload.date_to,
            payload.limit,
            payload.offset,
        )
    except SupabaseHTTPError as exc:
        _raise(exc)


# ─── Имитационная модель телеметрии ──────────────────────────────

@router.get(
    "/api/monitoring/vehicles/{vehicle_id}/location",
    tags=["monitoring"],
    summary="Текущая позиция ТС (Wialon IPS-совместимый формат)",
)
async def vehicle_location(
    vehicle_id: int,
    _: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    """
    Возвращает текущие навигационные данные ТС.
    При наличии активного путевого листа позиция интерполируется
    по маршруту (формула Хаверсина). При его отсутствии ТС
    находится на базовой стоянке.
    """
    svc = SupabaseService()
    token = _.access_token

    # Получаем данные о ТС для передачи в симулятор
    vehicles = await svc.get_vehicles(token)
    vehicle = next((v for v in vehicles if v["id"] == vehicle_id), None)
    state_number = vehicle["state_number"] if vehicle else f"TS-{vehicle_id:04d}"

    # Получаем активный путевой лист для этого ТС
    # Таблица waybills может ещё не существовать до выполнения миграции
    route_coords = None
    cargo_id = None
    try:
        waybills = await svc.get_waybills(token, status="В пути")
        active = next(
            (w for w in waybills if w.get("vehicle_id") == vehicle_id),
            None,
        )
        if active:
            route_coords = active.get("route_coords")
            cargo_id = str(active["id"])
    except SupabaseHTTPError:
        # Таблица waybills не найдена (PGRST205) — работаем без маршрута
        pass

    return generate_vehicle_location(vehicle_id, state_number, route_coords, cargo_id)


@router.get(
    "/api/monitoring/vehicles/{vehicle_id}/parameters",
    tags=["monitoring"],
    summary="Параметры CAN-шины ТС",
)
async def vehicle_parameters(
    vehicle_id: int,
    _: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    """
    Возвращает расшифрованные параметры CAN-шины ТС:
    напряжение бортсети, уровни топлива (ДУТ-1, ДУТ-2),
    температуру двигателя, одометр, состояние устройства.
    """
    return generate_vehicle_parameters(vehicle_id)


@router.get(
    "/api/monitoring/vehicles/{vehicle_id}/history",
    tags=["monitoring"],
    summary="История телеметрии за последние 30 минут",
)
async def vehicle_history(
    vehicle_id: int,
    _: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    """
    Возвращает временной ряд из 30 точек телеметрии с интервалом 1 минута.
    Профиль скорости строится по синусоидальной модели,
    расход топлива — пропорционально скорости.
    """
    return generate_vehicle_history(vehicle_id, points=30)
