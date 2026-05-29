from typing import Any

import httpx

from app.core.config import env_or_default, settings


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
        json: dict[str, Any] | None = None,
    ) -> Any:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(access_token),
                json=json,
            )

        if response.status_code < 200 or response.status_code >= 300:
            raise SupabaseHTTPError(response.status_code, self._response_detail(response))

        return response.json()

    async def login(self, email: str, password: str) -> dict:
        return await self._request(
            "POST",
            "/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
        )

    async def get_user(self, access_token: str) -> dict:
        return await self._request("GET", "/auth/v1/user", access_token)

    async def get_vehicles(self, access_token: str | None = None) -> list[dict]:
        return await self._request("GET", "/rest/v1/vehicles?select=*&order=id.asc", access_token)

    async def get_vehicle(self, vehicle_id: int, access_token: str) -> list[dict]:
        path = f"/rest/v1/vehicles?select=*,organization:organizations(id,name,active)&id=eq.{vehicle_id}"
        return await self._request("GET", path, access_token)

    async def get_device_types(self, access_token: str) -> list[dict]:
        return await self._request("GET", "/rest/v1/device_types?select=*", access_token)

    async def get_parameters(self, access_token: str, category: str | None = None) -> list[dict]:
        path = "/rest/v1/parameters?select=*&order=code.asc"
        if category:
            path = f"/rest/v1/parameters?select=code,key,name,value_type,unit,category&category=eq.{category}&order=code.asc"
        return await self._request("GET", path, access_token)

    async def get_organizations(self, access_token: str) -> list[dict]:
        return await self._request("GET", "/rest/v1/organizations?select=*", access_token)

    async def get_profiles(self, access_token: str) -> list[dict]:
        return await self._request("GET", "/rest/v1/profiles", access_token)

    async def get_navigation_devices(self, access_token: str) -> list[dict]:
        return await self._request("GET", "/rest/v1/navigation_devices?select=*&order=id.asc", access_token)

    async def get_vehicle_devices(self, access_token: str) -> list[dict]:
        path = (
            "/rest/v1/vehicle_devices?"
            "select=id,active,vehicle_id,navigation_device_id,"
            "vehicle:vehicles(id,state_number,organization_id,number,active,organization:organizations(id,name,active)),"
            "device:navigation_devices(id,serial_number,device_type_id,organization_id,active,"
            "device_type:device_types(id,name,description),organization:organizations(id,name,active))"
            "&order=id.asc"
        )
        return await self._request("GET", path, access_token)

    async def get_user_vehicles(self, access_token: str) -> list[dict]:
        path = "/rest/v1/user_vehicles?select=id,user_id,vehicle_id,vehicle:vehicles(id,state_number,number,organization_id)&order=id.asc"
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

    async def get_vehicles_with_default_account(self) -> list[dict]:
        email = env_or_default("SUPABASE_DEMO_EMAIL", "test@ends.ru")
        password = env_or_default("SUPABASE_DEMO_PASSWORD", "fdp-swf-AdZ-RB7")
        session = await self.login(email, password)
        return await self.get_vehicles(session.get("access_token"))
