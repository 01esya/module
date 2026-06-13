"""
Конфигурация серверного приложения CargoFlow.
"""

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_current_file_path = os.path.abspath(__file__)
_app_core_dir = os.path.dirname(_current_file_path)
_app_dir = os.path.dirname(_app_core_dir)
_backend_dir = os.path.dirname(_app_dir)
_root_module_dir = os.path.dirname(_backend_dir)

_env_path = os.path.join(_root_module_dir, ".env")


def _load_env_manually(path: str) -> None:
    """Читает .env файл вручную, обходя проблемы с BOM и кодировкой на Windows."""
    try:
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except FileNotFoundError:
        print(f"[CargoFlow] WARNING: .env файл не найден: {path}")


_load_env_manually(_env_path)


class Settings(BaseSettings):
    app_name: str = "CargoFlow Backend"
    app_env: str = "development"
    backend_port: int = 8000

    supabase_url: str = ""
    supabase_anon_key: str = ""

    supabase_service_email: str = ""
    supabase_service_password: str = ""


    jwt_secret: str = "cargoflow-local-dev-secret-2026"

    openrouter_api_key: str | None = None

    rate_limit_requests: int = 60

    model_config = SettingsConfigDict(
        env_file=_env_path,
        env_file_encoding="utf-8-sig",
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