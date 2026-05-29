import math
import random
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.auth import CurrentSession, get_current_session
from app.data import CARGO_LOADS, EMPLOYEES, VEHICLES
from app.services.supabase_service import SupabaseHTTPError, SupabaseService

router = APIRouter()


class MonitoringRecordsRequest(BaseModel):
    vehicle_id: int
    date_from: str = Field(alias="from")
    date_to: str = Field(alias="to")
    limit: int = 50
    offset: int = 0


def _raise_supabase(exc: SupabaseHTTPError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


def _mock_location(vehicle_id: int) -> dict[str, Any]:
    vehicle = next((item for item in VEHICLES if item["id"] == vehicle_id), None)
    state_number = vehicle["state_number"] if vehicle else f"TS-{vehicle_id}"
    cargo = next((item for item in CARGO_LOADS if item["vehicle_id"] == vehicle_id and item["status"] == "Р’ РїСѓС‚Рё"), None)

    if cargo and cargo.get("coords") and len(cargo["coords"]) >= 2:
        start = cargo["coords"][0]
        end = cargo["coords"][-1]
        progress = 0.35 + (vehicle_id % 3) * 0.08
        lat = start[0] + (end[0] - start[0]) * progress + random.uniform(-0.002, 0.002)
        lon = start[1] + (end[1] - start[1]) * progress + random.uniform(-0.002, 0.002)
        return {
            "vehicle_id": vehicle_id,
            "state_number": state_number,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "speed": 45 + (vehicle_id * 3) + random.randint(0, 10),
            "fuel_level": max(15, 70 - vehicle_id * 4 + random.randint(-2, 2)),
            "engine_on": True,
            "gps_satellites": 8 + (vehicle_id % 2),
            "heading": 60 + (vehicle_id * 17) % 360,
            "cargo_id": cargo["id"],
        }

    base_lat = 55.7558
    base_lon = 37.6173
    return {
        "vehicle_id": vehicle_id,
        "state_number": state_number,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "latitude": round(base_lat + (vehicle_id * 0.08) + math.sin(datetime.utcnow().timestamp() / 60) * 0.01, 6),
        "longitude": round(base_lon + (vehicle_id * 0.03) + math.cos(datetime.utcnow().timestamp() / 90) * 0.01, 6),
        "speed": 12 + (vehicle_id % 4) * 4,
        "fuel_level": max(10, 75 - vehicle_id * 4),
        "engine_on": True,
        "gps_satellites": 8,
        "heading": (vehicle_id * 90) % 360,
    }


@router.get("/api/monitoring/vehicles", tags=["monitoring"])
async def monitoring_vehicles(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_vehicles(session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/vehicles/{vehicle_id}", tags=["monitoring"])
async def monitoring_vehicle(vehicle_id: int, session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_vehicle(vehicle_id, session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/device-types", tags=["monitoring"])
async def device_types(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_device_types(session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/parameters", tags=["monitoring"])
async def parameters(
    category: str | None = Query(default=None),
    session: CurrentSession = Depends(get_current_session),
) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_parameters(session.access_token, category)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/organizations", tags=["monitoring"])
async def organizations(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_organizations(session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/profiles", tags=["monitoring"])
async def profiles(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_profiles(session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/navigation-devices", tags=["monitoring"])
async def navigation_devices(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_navigation_devices(session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/vehicle-devices", tags=["monitoring"])
async def vehicle_devices(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_vehicle_devices(session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


@router.get("/api/monitoring/user-vehicles", tags=["monitoring"])
async def user_vehicles(session: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    try:
        return await SupabaseService().get_user_vehicles(session.access_token)
    except SupabaseHTTPError as exc:
        _raise_supabase(exc)


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
        _raise_supabase(exc)


@router.get("/api/monitoring/vehicles/{vehicle_id}/location", tags=["monitoring"])
async def vehicle_location(vehicle_id: int, _: CurrentSession = Depends(get_current_session)) -> dict[str, Any]:
    return _mock_location(vehicle_id)


@router.get("/api/monitoring/vehicles/{vehicle_id}/history", tags=["monitoring"])
async def vehicle_history(vehicle_id: int, _: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    points = []
    for i in range(30):
        points.append({
            "timestamp": (datetime.utcnow() - timedelta(minutes=30 - i)).isoformat() + "Z",
            "speed": 40 + (vehicle_id * 2) + (i % 5) * 3,
            "fuel_level": max(10, 74 - vehicle_id * 4 + (i % 4)),
            "engine_on": True,
        })
    return points


@router.get("/api/monitoring/vehicles/{vehicle_id}/parameters", tags=["monitoring"])
async def vehicle_parameters(vehicle_id: int, _: CurrentSession = Depends(get_current_session)) -> dict[str, Any]:
    return {
        "vehicle_id": vehicle_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "parameters": {
            "SUPPLY_VOLTAGE": round(12.4 + random.random() * 0.4, 2),
            "FUEL_LEVEL_1": max(10, 76 - vehicle_id * 4),
            "FUEL_LEVEL_2": max(10, 75 - vehicle_id * 4),
            "GPS_SATELLITES_COUNT": 9,
            "DEVICE_STATE": "moving" if (datetime.utcnow().second % 2) else "idle",
            "ENGINE_TEMPERATURE": 86 + random.randint(0, 4),
            "ODOMETER": 125000 + vehicle_id * 8400 + (datetime.utcnow().minute % 1000),
        },
    }


@router.get("/api/loads", tags=["loads"])
async def loads(_: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    return CARGO_LOADS


@router.post("/api/loads", tags=["loads"])
async def create_load(payload: dict[str, Any], _: CurrentSession = Depends(get_current_session)) -> dict[str, Any]:
    cargo = dict(payload)
    cargo["id"] = f"cargo-{len(CARGO_LOADS) + 1}"
    cargo.setdefault("status", "РћР¶РёРґР°СЋС‚")
    CARGO_LOADS.append(cargo)
    return cargo


@router.patch("/api/loads/{cargo_id}", tags=["loads"])
async def update_load(cargo_id: str, payload: dict[str, Any], _: CurrentSession = Depends(get_current_session)) -> dict[str, Any]:
    cargo = next((item for item in CARGO_LOADS if item["id"] == cargo_id), None)
    if not cargo:
        raise HTTPException(status_code=404, detail="Cargo not found")
    cargo.update(payload)
    return cargo


@router.patch("/api/loads/{cargo_id}/status", tags=["loads"])
async def update_load_status(
    cargo_id: str,
    payload: dict[str, Any],
    _: CurrentSession = Depends(get_current_session),
) -> dict[str, Any]:
    cargo = next((item for item in CARGO_LOADS if item["id"] == cargo_id), None)
    if not cargo:
        raise HTTPException(status_code=404, detail="Cargo not found")
    cargo["status"] = payload.get("status", cargo.get("status"))
    return cargo


@router.delete("/api/loads/{cargo_id}", tags=["loads"])
async def delete_load(cargo_id: str, _: CurrentSession = Depends(get_current_session)) -> dict[str, bool]:
    index = next((idx for idx, item in enumerate(CARGO_LOADS) if item["id"] == cargo_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="Cargo not found")
    CARGO_LOADS.pop(index)
    return {"ok": True}


@router.get("/api/employees", tags=["employees"])
async def employees(_: CurrentSession = Depends(get_current_session)) -> list[dict[str, Any]]:
    return EMPLOYEES


@router.post("/api/ai/analyze", tags=["ai"])
async def ai_analyze(payload: dict[str, Any], _: CurrentSession = Depends(get_current_session)) -> dict[str, str]:
    cargo_id = payload.get("cargoId")
    cargo = next((item for item in CARGO_LOADS if item["id"] == cargo_id), None)
    if not cargo:
        raise HTTPException(status_code=404, detail="Cargo not found")

    vehicle = next((item for item in VEHICLES if item["id"] == cargo["vehicle_id"]), None)
    text = (
        f"AI assistant: route {cargo['from_city']} -> {cargo['to_city']} has status {cargo['status']}. "
        f"Vehicle: {vehicle['model'] if vehicle else 'not assigned'}. "
        f"Question: {payload.get('question', 'Create a short route audit')}. "
        "Recommendation: monitor speed, fuel usage, and communication intervals."
    )
    return {"text": text}
