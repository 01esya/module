"""
Сервисный слой взаимодействия с Supabase PostgREST API.

Реализует паттерн Repository: инкапсулирует все HTTP-запросы к
Supabase и предоставляет типизированные async-методы для API-слоя.
Аутентификация передаётся через JWT Bearer-токен (Supabase Auth).
"""

from typing import Any

import httpx

from app.core.config import settings

import time

class SupabaseHTTPError(Exception):
    def __init__(self, status_code: int, detail: Any) -> None:
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


class SupabaseService:
    def __init__(self) -> None:
        self.base_url = settings.supabase_url.rstrip("/")
        self.anon_key = settings.supabase_anon_key

    def _headers(self, access_token: str | None = None) -> dict[str, str]:
        headers = {"apikey": self.anon_key, "Content-Type": "application/json"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        return headers

    @staticmethod
    def _response_detail(response: httpx.Response) -> Any:
        try:
            return response.json()
        except ValueError:
            return response.text or response.reason_phrase

    async def _request(
        self,
        method: str,
        path: str,
        access_token: str | None = None,
        json: dict[str, Any] | list | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> Any:
        headers = self._headers(access_token)
        if extra_headers:
            headers.update(extra_headers)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                json=json,
            )

        if response.status_code < 200 or response.status_code >= 300:
            raise SupabaseHTTPError(response.status_code, self._response_detail(response))

        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    # ─── Auth ────────────────────────────────────────────────────

    async def login(self, email: str, password: str) -> dict:
        return await self._request(
            "POST",
            "/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
        )

    async def get_user(self, access_token: str) -> dict:
        return await self._request("GET", "/auth/v1/user", access_token)

    # ─── Vehicles & Devices ───────────────────────────────────────

    async def get_vehicles(self, access_token: str) -> list[dict]:
        return await self._request(
            "GET", "/rest/v1/vehicles?select=*&order=id.asc", access_token
        )

    async def get_vehicle(self, vehicle_id: int, access_token: str) -> list[dict]:
        path = (
            f"/rest/v1/vehicles"
            f"?select=*,organization:organizations(id,name,active)"
            f"&id=eq.{vehicle_id}"
        )
        return await self._request("GET", path, access_token)

    async def get_device_types(self, access_token: str) -> list[dict]:
        return await self._request("GET", "/rest/v1/device_types?select=*", access_token)

    async def get_parameters(self, access_token: str, category: str | None = None) -> list[dict]:
        if category:
            path = (
                f"/rest/v1/parameters"
                f"?select=code,key,name,value_type,unit,category"
                f"&category=eq.{category}&order=code.asc"
            )
        else:
            path = "/rest/v1/parameters?select=*&order=code.asc"
        return await self._request("GET", path, access_token)

    async def get_organizations(self, access_token: str) -> list[dict]:
        return await self._request("GET", "/rest/v1/organizations?select=*", access_token)

    async def get_profiles(self, access_token: str) -> list[dict]:
        return await self._request("GET", "/rest/v1/profiles", access_token)

    async def get_navigation_devices(self, access_token: str) -> list[dict]:
        return await self._request(
            "GET", "/rest/v1/navigation_devices?select=*&order=id.asc", access_token
        )

    async def get_vehicle_devices(self, access_token: str) -> list[dict]:
        path = (
            "/rest/v1/vehicle_devices?"
            "select=id,active,vehicle_id,navigation_device_id,"
            "vehicle:vehicles(id,state_number,organization_id,number,active,"
            "organization:organizations(id,name,active)),"
            "device:navigation_devices(id,serial_number,device_type_id,organization_id,active,"
            "device_type:device_types(id,name,description),"
            "organization:organizations(id,name,active))"
            "&order=id.asc"
        )
        return await self._request("GET", path, access_token)

    async def get_user_vehicles(self, access_token: str) -> list[dict]:
        path = (
            "/rest/v1/user_vehicles"
            "?select=id,user_id,vehicle_id,vehicle:vehicles(id,state_number,number,organization_id)"
            "&order=id.asc"
        )
        return await self._request("GET", path, access_token)

    async def get_monitoring_records(
        self,
        access_token: str,
        vehicle_id: int,
        date_from: str,
        date_to: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        return await self._request(
            "POST",
            "/rest/v1/rpc/get_monitoring_records",
            access_token,
            json={
                "p_vehicle_id": vehicle_id,
                "p_from": date_from,
                "p_to": date_to,
                "p_limit": limit,
                "p_offset": offset,
            },
        )

    # ─── Employees — CRUD ─────────────────────────────────────────

    async def get_employees(self, access_token: str) -> list[dict]:
        """Список активных сотрудников организации."""
        return await self._request(
            "GET",
            "/rest/v1/employees?select=*&order=id.asc&active=eq.true",
            access_token,
        )

    async def get_employee(self, employee_id: int, access_token: str) -> dict | None:
        path = f"/rest/v1/employees?select=*&id=eq.{employee_id}"
        result = await self._request("GET", path, access_token)
        return result[0] if result else None

    async def create_employee(self, data: dict, access_token: str) -> dict:
        result = await self._request(
            "POST",
            "/rest/v1/employees",
            access_token,
            json=data,
            extra_headers={"Prefer": "return=representation"},
        )
        return result[0] if isinstance(result, list) else result

    async def update_employee(self, employee_id: int, data: dict, access_token: str) -> dict:
        path = f"/rest/v1/employees?id=eq.{employee_id}"
        result = await self._request(
            "PATCH",
            path,
            access_token,
            json=data,
            extra_headers={"Prefer": "return=representation"},
        )
        return result[0] if isinstance(result, list) and result else {}

    async def delete_employee(self, employee_id: int, access_token: str) -> None:
        """Мягкое удаление: active = false."""
        await self._request(
            "PATCH",
            f"/rest/v1/employees?id=eq.{employee_id}",
            access_token,
            json={"active": False},
        )

    # ─── Waybills — CRUD ──────────────────────────────────────────

    async def get_waybills(
        self, access_token: str, status: str | None = None
    ) -> list[dict]:
        """Список путевых листов с JOIN на ТС и водителя."""
        select = (
            "id,cargo_type,weight,customer,carrier,"
            "from_city,to_city,route_coords,date_from,date_to,"
            "status,created_at,updated_at,vehicle_id,driver_id,"
            "vehicle:vehicles(id,state_number,number),"
            "driver:employees(id,full_name,role)"
        )
        path = f"/rest/v1/waybills?select={select}&order=id.desc"
        if status:
            path += f"&status=eq.{status}"
        return await self._request("GET", path, access_token)

    async def get_waybill(self, waybill_id: int, access_token: str) -> dict | None:
        select = (
            "id,cargo_type,weight,customer,carrier,"
            "from_city,to_city,route_coords,date_from,date_to,"
            "status,created_at,updated_at,vehicle_id,driver_id,"
            "vehicle:vehicles(id,state_number,number),"
            "driver:employees(id,full_name,role,phone)"
        )
        path = f"/rest/v1/waybills?select={select}&id=eq.{waybill_id}"
        result = await self._request("GET", path, access_token)
        return result[0] if result else None

    async def create_waybill(self, data: dict, access_token: str) -> dict:
        result = await self._request(
            "POST",
            "/rest/v1/waybills",
            access_token,
            json=data,
            extra_headers={"Prefer": "return=representation"},
        )
        return result[0] if isinstance(result, list) else result

    async def update_waybill(self, waybill_id: int, data: dict, access_token: str) -> dict:
        path = f"/rest/v1/waybills?id=eq.{waybill_id}"
        result = await self._request(
            "PATCH",
            path,
            access_token,
            json=data,
            extra_headers={"Prefer": "return=representation"},
        )
        return result[0] if isinstance(result, list) and result else {}

    async def update_waybill_status(
        self, waybill_id: int, status: str, access_token: str
    ) -> dict:
        return await self.update_waybill(waybill_id, {"status": status}, access_token)

    async def delete_waybill(self, waybill_id: int, access_token: str) -> None:
        await self._request(
            "DELETE",
            f"/rest/v1/waybills?id=eq.{waybill_id}",
            access_token,
        )


_token_cache: dict = {"token": None, "expires_at": 0.0}

async def get_supabase_token() -> str:
    """Токен сервисного пользователя Supabase с кэшированием."""
    if _token_cache["token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["token"]
    data = await SupabaseService().login(
        settings.supabase_service_email,
        settings.supabase_service_password,
    )
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = time.time() + data.get("expires_in", 3600)
    return _token_cache["token"]