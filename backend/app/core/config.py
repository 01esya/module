"""
Конфигурация серверного приложения CargoFlow.

Все чувствительные параметры загружаются исключительно из переменных
окружения (.env). Хардкод секретов в исходном коде недопустим.
"""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# 1. Сначала вычисляем абсолютный путь к .env в корне проекта (вне класса)
_current_file_path = os.path.abspath(__file__)  # путь к этому файлу config.py
_app_core_dir = os.path.dirname(_current_file_path)  # папка app/core
_app_dir = os.path.dirname(_app_core_dir)  # папка app
_backend_dir = os.path.dirname(_app_dir)  # папка backend
_root_module_dir = os.path.dirname(_backend_dir)  # корень проекта (папка module)

_env_path = os.path.join(_root_module_dir, ".env")

class Settings(BaseSettings):
    app_name: str = "CargoFlow Backend"
    app_env: str = "development"
    backend_port: int = 8000

    # Supabase — опциональные (не нужны при работе с локальной SQLite)
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # Локальная авторизация (JWT)
    jwt_secret: str = "cargoflow-local-dev-secret-2026"

    # openrouter API
    openrouter_api_key: str | None = None

    # Rate limiting
    rate_limit_requests: int = 60

    model_config = SettingsConfigDict(
        env_file=_env_path,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def frontend_origins(self) -> list[str]:
        raw = os.getenv(
            "FRONTEND_ORIGIN",
            "http://localhost:5173,http://localhost:3000",
        )
        return [o.strip() for o in raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
print("ЗАГРУЖЕННЫЙ КЛЮЧ:", get_settings().openrouter_api_key)
print("ИЩУ ТУТ:", _env_path)
settings = get_settings()
