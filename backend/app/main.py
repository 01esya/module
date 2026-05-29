from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, health, monitoring, vehicles
from app.core.config import settings

app = FastAPI(
    title="CargoFlow Backend",
    version="0.1.0",
    description="FastAPI backend for CargoFlow with Supabase integration.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(health.router)
app.include_router(vehicles.router)
app.include_router(monitoring.router)


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {"message": "CargoFlow FastAPI backend is running"}
