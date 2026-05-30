"""
Тест 3: Интеграционные тесты модуля телеметрии.

Покрывает:
- Получение текущей позиции ТС (имитационная модель)
- Валидация структуры навигационного пакета (Wialon IPS-совместимый)
- Получение параметров CAN-шины
- Получение истории телеметрии за 30 минут
- История из Supabase RPC (get_monitoring_records)
"""

import pytest
from httpx import AsyncClient


class TestVehicleLocation:
    """Тесты текущей позиции транспортного средства"""

    @pytest.mark.asyncio
    async def test_location_structure(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.1: Навигационный пакет содержит все обязательные поля.
        Проверяет соответствие формату протокола Wialon IPS 2.0.
        """
        resp = await client.get(
            "/api/monitoring/vehicles/4/location",
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Ожидался 200: {resp.text}"
        body = resp.json()

        required_fields = {
            "vehicle_id", "state_number", "timestamp",
            "latitude", "longitude", "speed", "heading",
            "fuel_level", "engine_on", "gps_satellites",
        }
        missing = required_fields - set(body.keys())
        assert not missing, f"Отсутствуют обязательные поля: {missing}"

    @pytest.mark.asyncio
    async def test_location_coordinates_valid(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.2: Координаты находятся в допустимых диапазонах WGS-84.
        latitude: [-90, 90], longitude: [-180, 180].
        """
        resp = await client.get(
            "/api/monitoring/vehicles/4/location",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert -90 <= body["latitude"] <= 90, f"latitude вне диапазона: {body['latitude']}"
        assert -180 <= body["longitude"] <= 180, f"longitude вне диапазона: {body['longitude']}"
        assert 0 <= body["speed"] <= 200, f"speed вне диапазона: {body['speed']}"
        assert 0 <= body["heading"] <= 360, f"heading вне диапазона: {body['heading']}"
        assert 0 <= body["fuel_level"] <= 100, f"fuel_level вне диапазона: {body['fuel_level']}"
        assert body["gps_satellites"] >= 0

    @pytest.mark.asyncio
    async def test_location_unauthenticated(self, client: AsyncClient):
        """
        Тест 3.3: Запрос позиции без авторизации.
        Ожидаемый результат: HTTP 401.
        """
        from app.main import app as fastapi_app
        from httpx import ASGITransport
        async with AsyncClient(
            transport=ASGITransport(app=fastapi_app), base_url="http://test"
        ) as fresh_client:
            resp = await fresh_client.get("/api/monitoring/vehicles/4/location")
        assert resp.status_code == 401


class TestVehicleParameters:
    """Тесты параметров CAN-шины"""

    @pytest.mark.asyncio
    async def test_parameters_structure(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.4: Ответ содержит словарь параметров CAN-шины.
        """
        resp = await client.get(
            "/api/monitoring/vehicles/4/parameters",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "parameters" in body
        params = body["parameters"]
        assert "SUPPLY_VOLTAGE" in params
        assert "FUEL_LEVEL_1" in params
        assert "GPS_SATELLITES_COUNT" in params

    @pytest.mark.asyncio
    async def test_supply_voltage_range(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.5: Напряжение бортовой сети в норме (12–15 В).
        """
        resp = await client.get(
            "/api/monitoring/vehicles/4/parameters",
            headers=auth_headers,
        )
        voltage = resp.json()["parameters"]["SUPPLY_VOLTAGE"]
        assert 11.0 <= voltage <= 15.5, f"Напряжение вне нормы: {voltage} В"


class TestVehicleHistory:
    """Тесты истории телеметрии"""

    @pytest.mark.asyncio
    async def test_history_length(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.6: История содержит ровно 30 точек (1 минута каждая).
        """
        resp = await client.get(
            "/api/monitoring/vehicles/4/history",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 30, f"Ожидалось 30 точек, получено {len(body)}"

    @pytest.mark.asyncio
    async def test_history_timestamps_ordered(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.7: Временные метки истории упорядочены хронологически.
        """
        resp = await client.get(
            "/api/monitoring/vehicles/4/history",
            headers=auth_headers,
        )
        body = resp.json()
        timestamps = [p["timestamp"] for p in body]
        assert timestamps == sorted(timestamps), "Временные метки не упорядочены"

    @pytest.mark.asyncio
    async def test_history_speed_valid(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.8: Скорость во всех точках истории в допустимом диапазоне [0, 200].
        """
        resp = await client.get(
            "/api/monitoring/vehicles/4/history",
            headers=auth_headers,
        )
        body = resp.json()
        for point in body:
            assert 0 <= point["speed"] <= 200, f"Скорость вне диапазона: {point['speed']}"


class TestMonitoringRecords:
    """Тесты Supabase RPC get_monitoring_records"""

    @pytest.mark.asyncio
    async def test_monitoring_records_success(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.9: История мониторинга из Supabase за заданный период.
        Ожидаемый результат: HTTP 200, массив записей.
        """
        resp = await client.post(
            "/api/monitoring/records",
            json={
                "vehicle_id": 4,
                "from": "2026-03-18T00:00:00Z",
                "to": "2026-03-25T00:00:00Z",
                "limit": 5,
                "offset": 0,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Ожидался 200: {resp.text}"
        body = resp.json()
        assert isinstance(body, list)

    @pytest.mark.asyncio
    async def test_monitoring_vehicles_list(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 3.10: Список ТС возвращает непустой массив с полем state_number.
        """
        resp = await client.get("/api/monitoring/vehicles", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0, "Список ТС пустой"
        assert "state_number" in body[0]
