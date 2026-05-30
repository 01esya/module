"""
Точка входа серверного приложения CargoFlow Backend.

Инициализирует FastAPI-приложение, подключает middleware (CORS, Rate Limiting)
и регистрирует все API-роутеры модулей.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import ai, auth, employees, health, monitoring, vehicles, waybills
from app.core.config import settings
from app.core.security import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[CargoFlow] Starting (env={settings.app_env})")
    yield
    print("[CargoFlow] Shutting down")


app = FastAPI(
    title="CargoFlow Backend API",
    version="1.0.0",
    description=(
        "Backend модуль формирования электронных путевых листов "
        "с интеграцией со спутниковой системой мониторинга транспорта."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Middleware ────────────────────────────────────────────────────

# Rate limiting (60 запросов/мин по IP)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — только разрешённые origins из .env (не wildcard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Cookie"],
)

# ─── Routers ──────────────────────────────────────────────────────

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(vehicles.router)
app.include_router(waybills.router)
app.include_router(employees.router)
app.include_router(monitoring.router)
app.include_router(ai.router)


@app.get("/", tags=["meta"], include_in_schema=False)
def root() -> dict[str, str]:
    return {"service": "CargoFlow Backend", "version": "1.0.0", "docs": "/docs"}
