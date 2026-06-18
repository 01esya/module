"""
Конфигурация pytest: фикстуры для интеграционных тестов.

Используется httpx.AsyncClient с ASGI transport — запросы идут
напрямую в FastAPI-приложение без поднятия реального HTTP-сервера.
Тест проверяет реальный Supabase (Self-Hosted) через сеть.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app

# ─── Учётные данные тестового пользователя ──────────────────────
# Берём из реальных данных проекта (supabase_api_documentation.md)
TEST_EMAIL = "test@ends.ru"
TEST_PASSWORD = "fdp-swf-AdZ-RB7"


@pytest_asyncio.fixture(scope="session")
async def client():
    """HTTP-клиент, подключённый напрямую к FastAPI ASGI-приложению."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(scope="session")
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    """
    Выполняет вход и возвращает словарь заголовков авторизации.
    Используется во всех тестах, требующих аутентификации.
    """
    resp = await client.post(
        "/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("access_token")
    assert token, "access_token не найден в ответе"
    return {"Authorization": f"Bearer {token}"}
