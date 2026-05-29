import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CargoFlow FastAPI"
    app_env: str = "development"
    backend_port: int = 8000
    supabase_url: str = "https://194-67-127-185.cloudvps.regruhosting.ru"
    supabase_anon_key: str = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0MjkwNTkwLCJleHAiOjE5MzE5NzA1OTB9."
        "I5pEgsEt60x6j0TLrJQDTYN9WyAVDWpnLJvReL_ezQQ"
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def frontend_origins(self) -> list[str]:
        raw_origins = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173,http://localhost:3000")
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


settings = Settings()


def env_or_default(name: str, default: str) -> str:
    return os.getenv(name, default)
