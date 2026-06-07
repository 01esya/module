"""
ORM-модели CargoFlow — SQLAlchemy, совместимые с SQLite.

Структура таблиц waybills и waybill_signatures соответствует
целевой ER-диаграмме (logistics_waybills, logistics_waybill_signatures).
Дополнительные поля (cargo_type, weight и др.) поддерживают
текущий API-контракт.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import DeclarativeBase, relationship


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


# ─── Пользователи (локальная авторизация) ────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Text, primary_key=True)
    email = Column(Text, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    full_name = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="dispatcher")
    created_at = Column(Text, default=_now_iso)


# ─── Транспортные средства ───────────────────────────────────────

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    state_number = Column(Text, nullable=False)
    model = Column(Text)
    device_id = Column(Text)
    number = Column(Text)  # внутренний номер (используется фронтендом мониторинга)
    active = Column(Boolean, nullable=False, default=True)
    organization_id = Column(Integer, nullable=False, default=1)


# ─── Сотрудники ──────────────────────────────────────────────────

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    organization_id = Column(Integer, nullable=False, default=1)
    full_name = Column(Text, nullable=False)
    role = Column(Text, nullable=False, default="Водитель")
    phone = Column(Text, default="")
    license_number = Column(Text)
    license_class = Column(Text)
    snils = Column(Text)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(Text, default=_now_iso)
    updated_at = Column(Text, default=_now_iso, onupdate=_now_iso)


# ─── Путевые листы (logistics_waybills) ──────────────────────────

class Waybill(Base):
    __tablename__ = "waybills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    organization_id = Column(Integer, nullable=False, default=1)

    # --- Поля текущего API (груз / маршрут) ---
    cargo_type = Column(Text)
    weight = Column(Float)
    customer = Column(Text)
    carrier = Column(Text)
    from_city = Column(Text)
    to_city = Column(Text)
    route_coords = Column(Text)  # JSON-строка: [[lat, lon], ...]
    date_from = Column(Text)
    date_to = Column(Text)

    # --- Поля ER-диаграммы (logistics_waybills) ---
    waybill_number = Column(Text)
    status = Column(Text, nullable=False, default="Ожидают")

    driver_id = Column(Integer, ForeignKey("employees.id"))
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"))
    route_id = Column(Integer)       # FK → route_routes (в Supabase)
    timetable_id = Column(Integer)   # FK → timetable_timetables (в Supabase)
    order_id = Column(Integer)       # FK → timetable_orders (в Supabase)

    planned_departure = Column(Text)
    planned_arrival = Column(Text)
    actual_departure = Column(Text)
    actual_arrival = Column(Text)

    odometer_start = Column(Integer)
    odometer_end = Column(Integer)
    engine_hours_start = Column(Float)
    engine_hours_end = Column(Float)
    fuel_start = Column(Float)
    fuel_end = Column(Float)
    fuel_issued = Column(Float)
    fuel_consumed_fact = Column(Float)
    fuel_consumed_norm = Column(Float)

    notes = Column(Text)

    created_by = Column(Text)
    updated_by = Column(Text)
    created_at = Column(Text, default=_now_iso)
    updated_at = Column(Text, default=_now_iso)

    # Relationships (eager JOIN для корректной сериализации)
    vehicle = relationship("Vehicle", foreign_keys=[vehicle_id], lazy="joined")
    driver = relationship("Employee", foreign_keys=[driver_id], lazy="joined")


# ─── Подписи путевых листов (logistics_waybill_signatures) ───────

class WaybillSignature(Base):
    __tablename__ = "waybill_signatures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    waybill_id = Column(
        Integer,
        ForeignKey("waybills.id", ondelete="CASCADE"),
        nullable=False,
    )
    signatory_type = Column(Text, nullable=False)
    signed_by_user_id = Column(Text)
    signed_at = Column(Text, default=_now_iso)
    signature_data = Column(Text)
    ip_address = Column(Text)
    user_agent = Column(Text)
