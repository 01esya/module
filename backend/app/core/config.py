"""
Конфигурация серверного приложения CargoFlow.

Все чувствительные параметры загружаются исключительно из переменных
окружения (.env). Хардкод секретов в исходном коде недопустим.
"""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CargoFlow Backend"
    app_env: str = "development"
    backend_port: int = 8000

    # Supabase — обязательные параметры, без дефолтных значений
    supabase_url: str
    supabase_anon_key: str

    # Gemini AI
    gemini_api_key: str = ""

    # Rate limiting
    rate_limit_requests: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
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


settings = get_settings()
