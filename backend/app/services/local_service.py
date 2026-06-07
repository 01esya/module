"""
Локальный сервисный слой — замена SupabaseService для работы с SQLite.

Реализует тот же интерфейс (имена методов и сигнатуры), что и SupabaseService,
но все операции выполняются через SQLAlchemy ORM к локальной SQLite БД.

Экспортирует backward-compatible алиасы:
    SupabaseHTTPError = LocalDBError
    SupabaseService   = LocalDBService
чтобы в роутерах менялся ТОЛЬКО путь импорта, а код оставался без изменений.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import verify_password
from app.models.models import Employee, User, Vehicle, Waybill

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24


class LocalDBError(Exception):
    """Аналог SupabaseHTTPError — те же атрибуты status_code / detail."""

    def __init__(self, status_code: int, detail: Any) -> None:
        super().__init__(str(detail))
        self.status_code = status_code
        self.detail = detail


class LocalDBService:
    """
    Локальная реализация сервисного слоя.
    Полностью совместима по интерфейсу с SupabaseService.
    """

    # ─── Auth ────────────────────────────────────────────────────

    async def login(self, email: str, password: str) -> dict:
        with SessionLocal() as db:
            user = db.query(User).filter(User.email == email).first()
            if not user or not verify_password(password, user.password_hash):
                raise LocalDBError(401, "Неверный email или пароль")

            payload = {
                "sub": user.id,
                "email": user.email,
                "role": user.role,
                "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
            }
            token = jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)

            return {
                "access_token": token,
                "token_type": "bearer",
                "expires_in": JWT_EXPIRATION_HOURS * 3600,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "role": user.role,
                    "user_metadata": {"full_name": user.full_name},
                },
            }

    async def get_user(self, access_token: str) -> dict:
        try:
            payload = jwt.decode(
                access_token, settings.jwt_secret, algorithms=[JWT_ALGORITHM]
            )
        except jwt.InvalidTokenError as exc:
            raise LocalDBError(401, f"Invalid token: {exc}") from exc

        with SessionLocal() as db:
            user = db.query(User).filter(User.id == payload["sub"]).first()
            if not user:
                raise LocalDBError(401, "User not found")
            return {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "user_metadata": {"full_name": user.full_name},
            }

    # ─── Vehicles ────────────────────────────────────────────────

    async def get_vehicles(self, access_token: str) -> list[dict]:
        with SessionLocal() as db:
            rows = db.query(Vehicle).order_by(Vehicle.id).all()
            return [self._vehicle_to_dict(v) for v in rows]

    async def get_vehicle(
        self, vehicle_id: int, access_token: str
    ) -> list[dict]:
        with SessionLocal() as db:
            v = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
            if not v:
                return []
            d = self._vehicle_to_dict(v)
            d["organization"] = {"id": 1, "name": "ООО КаргоФлоу", "active": True}
            return [d]

    # ─── Employees — CRUD ─────────────────────────────────────────

    async def get_employees(self, access_token: str) -> list[dict]:
        with SessionLocal() as db:
            rows = (
                db.query(Employee)
                .filter(Employee.active == True)  # noqa: E712
                .order_by(Employee.id)
                .all()
            )
            return [self._employee_to_dict(e) for e in rows]

    async def get_employee(
        self, employee_id: int, access_token: str
    ) -> dict | None:
        with SessionLocal() as db:
            e = db.query(Employee).filter(Employee.id == employee_id).first()
            return self._employee_to_dict(e) if e else None

    async def create_employee(self, data: dict, access_token: str) -> dict:
        with SessionLocal() as db:
            emp = Employee(**data)
            db.add(emp)
            db.commit()
            db.refresh(emp)
            return self._employee_to_dict(emp)

    async def update_employee(
        self, employee_id: int, data: dict, access_token: str
    ) -> dict:
        with SessionLocal() as db:
            emp = db.query(Employee).filter(Employee.id == employee_id).first()
            if not emp:
                raise LocalDBError(404, "Сотрудник не найден")
            for key, val in data.items():
                setattr(emp, key, val)
            emp.updated_at = datetime.now(timezone.utc).isoformat()
            db.commit()
            db.refresh(emp)
            return self._employee_to_dict(emp)

    async def delete_employee(
        self, employee_id: int, access_token: str
    ) -> None:
        """Мягкое удаление: active = False."""
        with SessionLocal() as db:
            emp = db.query(Employee).filter(Employee.id == employee_id).first()
            if emp:
                emp.active = False
                db.commit()

    # ─── Waybills — CRUD ──────────────────────────────────────────

    async def get_waybills(
        self, access_token: str, status: str | None = None
    ) -> list[dict]:
        with SessionLocal() as db:
            q = db.query(Waybill).order_by(Waybill.id.desc())
            if status:
                q = q.filter(Waybill.status == status)
            rows = q.all()
            return [self._waybill_to_dict(w) for w in rows]

    async def get_waybill(
        self, waybill_id: int, access_token: str
    ) -> dict | None:
        with SessionLocal() as db:
            w = db.query(Waybill).filter(Waybill.id == waybill_id).first()
            return self._waybill_to_dict(w) if w else None

    async def create_waybill(self, data: dict, access_token: str) -> dict:
        with SessionLocal() as db:
            if "route_coords" in data and isinstance(data["route_coords"], list):
                data["route_coords"] = json.dumps(data["route_coords"])
            wb = Waybill(**data)
            db.add(wb)
            db.commit()
            db.refresh(wb)
            return self._waybill_to_dict(wb)

    async def update_waybill(
        self, waybill_id: int, data: dict, access_token: str
    ) -> dict:
        with SessionLocal() as db:
            wb = db.query(Waybill).filter(Waybill.id == waybill_id).first()
            if not wb:
                raise LocalDBError(404, "Путевой лист не найден")
            if "route_coords" in data and isinstance(data["route_coords"], list):
                data["route_coords"] = json.dumps(data["route_coords"])
            for key, val in data.items():
                setattr(wb, key, val)
            wb.updated_at = datetime.now(timezone.utc).isoformat()
            db.commit()
            db.refresh(wb)
            return self._waybill_to_dict(wb)

    async def update_waybill_status(
        self, waybill_id: int, status: str, access_token: str
    ) -> dict:
        return await self.update_waybill(waybill_id, {"status": status}, access_token)

    async def delete_waybill(
        self, waybill_id: int, access_token: str
    ) -> None:
        with SessionLocal() as db:
            wb = db.query(Waybill).filter(Waybill.id == waybill_id).first()
            if wb:
                db.delete(wb)
                db.commit()

    # ─── Monitoring stubs (mock-данные) ───────────────────────────

    async def get_organizations(self, access_token: str) -> list[dict]:
        return [{"id": 1, "name": "ООО КаргоФлоу", "active": True}]

    async def get_profiles(self, access_token: str) -> list[dict]:
        with SessionLocal() as db:
            users = db.query(User).all()
            return [
                {"id": u.id, "full_name": u.full_name, "email": u.email}
                for u in users
            ]

    async def get_device_types(self, access_token: str) -> list[dict]:
        return [
            {"id": 1, "name": "Wialon IPS", "description": "GPS-трекер Wialon IPS"},
        ]

    async def get_parameters(
        self, access_token: str, category: str | None = None
    ) -> list[dict]:
        params = [
            {"code": "SV",  "key": "SUPPLY_VOLTAGE",     "name": "Напряжение бортсети", "value_type": "float", "unit": "В",  "category": "power"},
            {"code": "FL1", "key": "FUEL_LEVEL_1",        "name": "ДУТ-1",              "value_type": "float", "unit": "%",  "category": "fuel"},
            {"code": "FL2", "key": "FUEL_LEVEL_2",        "name": "ДУТ-2",              "value_type": "float", "unit": "%",  "category": "fuel"},
            {"code": "ET",  "key": "ENGINE_TEMPERATURE",  "name": "Т двигателя",        "value_type": "float", "unit": "°C", "category": "engine"},
            {"code": "ODO", "key": "ODOMETER",            "name": "Одометр",            "value_type": "float", "unit": "км", "category": "distance"},
            {"code": "GPS", "key": "GPS_SATELLITES_COUNT", "name": "Спутники GPS",       "value_type": "int",   "unit": "шт", "category": "gps"},
        ]
        if category:
            params = [p for p in params if p["category"] == category]
        return params

    async def get_navigation_devices(self, access_token: str) -> list[dict]:
        return [
            {"id": 1, "serial_number": "GPS001", "device_type_id": 1, "organization_id": 1, "active": True},
            {"id": 2, "serial_number": "GPS002", "device_type_id": 1, "organization_id": 1, "active": True},
            {"id": 3, "serial_number": "GPS003", "device_type_id": 1, "organization_id": 1, "active": True},
        ]

    async def get_vehicle_devices(self, access_token: str) -> list[dict]:
        vehicles = await self.get_vehicles(access_token)
        nav_devs = await self.get_navigation_devices(access_token)
        result = []
        for i, v in enumerate(vehicles):
            if i < len(nav_devs):
                result.append({
                    "id": i + 1,
                    "active": True,
                    "vehicle_id": v["id"],
                    "navigation_device_id": nav_devs[i]["id"],
                    "vehicle": v,
                    "device": {
                        **nav_devs[i],
                        "device_type": {"id": 1, "name": "Wialon IPS", "description": "GPS-трекер"},
                        "organization": {"id": 1, "name": "ООО КаргоФлоу", "active": True},
                    },
                })
        return result

    async def get_user_vehicles(self, access_token: str) -> list[dict]:
        vehicles = await self.get_vehicles(access_token)
        return [
            {
                "id": i + 1,
                "user_id": "user-1",
                "vehicle_id": v["id"],
                "vehicle": {
                    "id": v["id"],
                    "state_number": v["state_number"],
                    "number": v.get("number"),
                    "organization_id": v["organization_id"],
                },
            }
            for i, v in enumerate(vehicles)
        ]

    async def get_monitoring_records(
        self,
        access_token: str,
        vehicle_id: int,
        date_from: str,
        date_to: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        # RPC-функция Supabase недоступна локально — пустой результат
        return []

    # ─── Сериализация ORM → dict ─────────────────────────────────

    @staticmethod
    def _vehicle_to_dict(v: Vehicle) -> dict:
        return {
            "id": v.id,
            "state_number": v.state_number,
            "model": v.model,
            "device_id": v.device_id,
            "number": v.number,
            "active": v.active,
            "organization_id": v.organization_id,
        }

    @staticmethod
    def _employee_to_dict(e: Employee) -> dict:
        return {
            "id": e.id,
            "organization_id": e.organization_id,
            "full_name": e.full_name,
            "role": e.role,
            "phone": e.phone,
            "license_number": e.license_number,
            "license_class": e.license_class,
            "snils": e.snils,
            "active": e.active,
            "created_at": e.created_at,
            "updated_at": e.updated_at,
        }

    @staticmethod
    def _waybill_to_dict(w: Waybill) -> dict:
        route_coords: list = []
        if w.route_coords:
            try:
                route_coords = json.loads(w.route_coords)
            except (json.JSONDecodeError, TypeError):
                pass

        result: dict[str, Any] = {
            "id": w.id,
            "organization_id": w.organization_id,
            "cargo_type": w.cargo_type,
            "weight": w.weight,
            "customer": w.customer,
            "carrier": w.carrier,
            "from_city": w.from_city,
            "to_city": w.to_city,
            "route_coords": route_coords,
            "date_from": w.date_from,
            "date_to": w.date_to,
            "status": w.status,
            "created_at": w.created_at,
            "updated_at": w.updated_at,
            "vehicle_id": w.vehicle_id,
            "driver_id": w.driver_id,
            "vehicle": None,
            "driver": None,
        }

        if w.vehicle:
            result["vehicle"] = {
                "id": w.vehicle.id,
                "state_number": w.vehicle.state_number,
                "number": w.vehicle.number,
            }

        if w.driver:
            result["driver"] = {
                "id": w.driver.id,
                "full_name": w.driver.full_name,
                "role": w.driver.role,
                "phone": w.driver.phone,
            }

        return result


# ─── Backward-compatible aliases ─────────────────────────────────
# Роутеры импортируют именно эти имена, поэтому меняется только
# путь импорта (supabase_service → local_service), а код — нет.

SupabaseHTTPError = LocalDBError
SupabaseService = LocalDBService
