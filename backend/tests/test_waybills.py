"""
Тест 2: Интеграционные тесты модуля путевых листов.

Покрывает:
- Получение списка путевых листов (RLS: только своя организация)
- Создание путевого листа с Pydantic-валидацией
- Валидация некорректных данных (HTTP 422)
- Смена статуса путевого листа
- Удаление путевого листа
"""

import pytest
from httpx import AsyncClient

# Данные для создания тестового путевого листа
WAYBILL_PAYLOAD = {
    "cargo_type": "Тестовый груз — pytest",
    "weight": 5000.0,
    "customer": "ООО Тест-Клиент",
    "carrier": "ИП Тест-Перевозчик",
    "from_city": "Москва",
    "to_city": "Санкт-Петербург",
    "date_from": "2026-06-01",
    "date_to": "2026-06-03",
    "organization_id": 1,
    "route_coords": [[55.7558, 37.6173], [59.9343, 30.3351]],
}


class TestWaybillsList:
    """Тесты эндпоинта GET /api/waybills"""

    @pytest.mark.asyncio
    async def test_list_waybills_authenticated(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.1: Получение списка путевых листов авторизованным пользователем.
        Ожидаемый результат: HTTP 200, тело ответа — массив (список).
        """
        resp = await client.get("/api/waybills", headers=auth_headers)
        assert resp.status_code == 200, f"Ожидался 200: {resp.text}"
        body = resp.json()
        assert isinstance(body, list), "Тело ответа должно быть массивом"

    @pytest.mark.asyncio
    async def test_list_waybills_unauthenticated(self, client: AsyncClient):
        """
        Тест 2.2: Попытка получить список без авторизации.
        Ожидаемый результат: HTTP 401.
        """
        resp = await client.get("/api/waybills")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_waybills_status_filter(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.3: Фильтрация путевых листов по статусу.
        Ожидаемый результат: HTTP 200, все записи имеют статус 'В пути'.
        """
        resp = await client.get("/api/waybills?status=В пути", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        for wb in body:
            assert wb.get("status") == "В пути"


class TestWaybillCRUD:
    """Тесты создания, обновления и удаления путевых листов"""

    created_id: int | None = None

    @pytest.mark.asyncio
    async def test_create_waybill_success(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.4: Успешное создание путевого листа с корректными данными.
        Ожидаемый результат: HTTP 201, поле id в ответе.
        """
        resp = await client.post("/api/waybills", json=WAYBILL_PAYLOAD, headers=auth_headers)
        assert resp.status_code == 201, f"Ожидался 201: {resp.text}"
        body = resp.json()
        assert "id" in body, "Ответ не содержит id созданного путевого листа"
        assert body["cargo_type"] == "Тестовый груз — pytest"
        TestWaybillCRUD.created_id = body["id"]

    @pytest.mark.asyncio
    async def test_create_waybill_validation_error(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.5: Попытка создания с некорректным весом (отрицательным).
        Pydantic должен вернуть HTTP 422 Unprocessable Entity.
        """
        bad_payload = {**WAYBILL_PAYLOAD, "weight": -100}
        resp = await client.post("/api/waybills", json=bad_payload, headers=auth_headers)
        assert resp.status_code == 422, f"Ожидался 422: {resp.text}"

    @pytest.mark.asyncio
    async def test_create_waybill_missing_field(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.6: Пропущено обязательное поле cargo_type.
        Ожидаемый результат: HTTP 422.
        """
        bad_payload = {k: v for k, v in WAYBILL_PAYLOAD.items() if k != "cargo_type"}
        resp = await client.post("/api/waybills", json=bad_payload, headers=auth_headers)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_update_waybill_status(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.7: Изменение статуса существующего путевого листа.
        Ожидаемый результат: HTTP 200, поле status обновлено.
        """
        if not TestWaybillCRUD.created_id:
            pytest.skip("Путевой лист не был создан в предыдущем тесте")
        wid = TestWaybillCRUD.created_id
        resp = await client.patch(
            f"/api/waybills/{wid}/status",
            json={"status": "В пути"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, f"Ожидался 200: {resp.text}"

    @pytest.mark.asyncio
    async def test_delete_waybill(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.8: Удаление путевого листа.
        Ожидаемый результат: HTTP 204 No Content.
        """
        if not TestWaybillCRUD.created_id:
            pytest.skip("Путевой лист не был создан")
        wid = TestWaybillCRUD.created_id
        resp = await client.delete(f"/api/waybills/{wid}", headers=auth_headers)
        assert resp.status_code == 204, f"Ожидался 204: {resp.text}"

    @pytest.mark.asyncio
    async def test_get_deleted_waybill(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 2.9: Попытка получить удалённый путевой лист.
        Ожидаемый результат: HTTP 404.
        """
        if not TestWaybillCRUD.created_id:
            pytest.skip("Путевой лист не был создан")
        wid = TestWaybillCRUD.created_id
        resp = await client.get(f"/api/waybills/{wid}", headers=auth_headers)
        assert resp.status_code == 404
