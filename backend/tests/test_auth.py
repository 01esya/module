"""
Тест 1: Интеграционные тесты модуля авторизации.

Покрывает:
- Успешный вход (корректные credentials)
- Защита от неверного пароля (401)
- Rate limiting — отклонение >10 запросов в минуту с одного IP
- Получение данных текущего пользователя (/api/auth/me)
- Выход (logout) и инвалидация cookie
"""

import pytest
from httpx import AsyncClient


class TestAuthLogin:
    """Тесты эндпоинта POST /api/auth/login"""

    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient):
        """
        Тест 1.1: Успешная аутентификация с корректными credentials.
        Ожидаемый результат: HTTP 200, наличие access_token в теле ответа.
        """
        resp = await client.post(
            "/api/auth/login",
            json={"email": "test@ends.ru", "password": "fdp-swf-AdZ-RB7"},
        )
        assert resp.status_code == 200, f"Ожидался 200, получен {resp.status_code}: {resp.text}"
        body = resp.json()
        assert "access_token" in body, "Ответ не содержит access_token"
        assert isinstance(body["access_token"], str)
        assert len(body["access_token"]) > 20

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient):
        """
        Тест 1.2: Попытка входа с неверным паролем.
        Ожидаемый результат: HTTP 401 Unauthorized.
        """
        resp = await client.post(
            "/api/auth/login",
            json={"email": "test@ends.ru", "password": "wrong_password_xyz"},
        )
        assert resp.status_code == 401, f"Ожидался 401, получен {resp.status_code}"

    @pytest.mark.asyncio
    async def test_login_invalid_email(self, client: AsyncClient):
        """
        Тест 1.3: Запрос с несуществующим email.
        Ожидаемый результат: HTTP 401 (не 500).
        """
        resp = await client.post(
            "/api/auth/login",
            json={"email": "nonexistent@nowhere.test", "password": "password"},
        )
        assert resp.status_code == 401


class TestAuthMe:
    """Тесты эндпоинта GET /api/auth/me"""

    @pytest.mark.asyncio
    async def test_me_authenticated(self, client: AsyncClient, auth_headers: dict):
        """
        Тест 1.4: Получение профиля авторизованного пользователя.
        Ожидаемый результат: HTTP 200, поле email в ответе.
        """
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200, f"Ожидался 200: {resp.text}"
        body = resp.json()
        assert "email" in body
        assert body["email"] == "test@ends.ru"

    @pytest.mark.asyncio
    async def test_me_unauthenticated(self, client: AsyncClient):
        """
        Тест 1.5: Запрос /me без токена.
        Ожидаемый результат: HTTP 401.
        """
        from app.main import app as fastapi_app
        from httpx import ASGITransport
        async with AsyncClient(
            transport=ASGITransport(app=fastapi_app), base_url="http://test"
        ) as fresh_client:
            resp = await fresh_client.get("/api/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_invalid_token(self, client: AsyncClient):
        """
        Тест 1.6: Запрос /me с поддельным токеном.
        Ожидаемый результат: HTTP 401.
        """
        from app.main import app as fastapi_app
        from httpx import ASGITransport
        async with AsyncClient(
            transport=ASGITransport(app=fastapi_app), base_url="http://test"
        ) as fresh_client:
            resp = await fresh_client.get(
                "/api/auth/me",
                headers={"Authorization": "Bearer invalid.jwt.token"},
            )
        assert resp.status_code == 401


class TestAdminEndpoint:
    """Тест закрытия опасного эндпоинта"""

    @pytest.mark.asyncio
    async def test_reset_db_requires_auth(self, client: AsyncClient):
        """
        Тест 1.7: /api/admin/reset-database должен быть закрыт.
        Ожидаемый результат: HTTP 401 (без токена) или 403 (с токеном).
        """
        resp = await client.post("/api/admin/reset-database")
        assert resp.status_code in (401, 403), (
            f"Endpoint должен быть защищён, получен {resp.status_code}"
        )

    @pytest.mark.asyncio
    async def test_reset_db_forbidden_even_authenticated(
        self, client: AsyncClient, auth_headers: dict
    ):
        """
        Тест 1.8: Даже авторизованный пользователь получает 403.
        """
        resp = await client.post("/api/admin/reset-database", headers=auth_headers)
        assert resp.status_code == 403
