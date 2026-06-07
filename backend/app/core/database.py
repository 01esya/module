"""
Инициализация локальной SQLite базы данных через SQLAlchemy.

Файл БД: backend/cargoflow.db (создаётся автоматически при первом запуске).
Таблицы создаются из ORM-моделей (app.models.models).
Демо-данные загружаются один раз при пустой БД.
"""

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Путь к файлу БД — в корне backend/
DB_PATH = Path(__file__).resolve().parent.parent.parent / "cargoflow.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

# Включаем поддержку FK в SQLite (по умолчанию выключена)
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
    """FastAPI Dependency: yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """
    Создать таблицы (если не существуют) и заполнить демо-данными.
    Вызывается один раз при старте приложения (lifespan).
    """
    from app.models.models import Base  # отложенный импорт

    Base.metadata.create_all(bind=engine)
    _seed_data()
    print(f"[CargoFlow] SQLite database ready: {DB_PATH}")


def _seed_data() -> None:
    """Заполняет БД начальными данными, если она пуста."""
    from app.core.security import hash_password
    from app.models.models import Employee, User, Vehicle, Waybill

    with SessionLocal() as db:
        # Если уже есть пользователи — значит seed выполнен
        if db.query(User).first():
            return

        # ─── Пользователи ─────────────────────────────────────
        db.add(User(
            id="user-1",
            email="dispatcher@example.com",
            password_hash=hash_password("demo2026"),
            full_name="Главный диспетчер",
            role="dispatcher",
        ))
        db.add(User(
            id="user-2",
            email="test@ends.ru",
            password_hash=hash_password("fdp-swf-AdZ-RB7"),
            full_name="Тестовый диспетчер",
            role="dispatcher",
        ))

        # ─── Транспортные средства ────────────────────────────
        db.add_all([
            Vehicle(state_number="А123БВ777", model="КАМАЗ 65115", device_id="GPS001", organization_id=1),
            Vehicle(state_number="В456ГД777", model="МАЗ 6312",   device_id="GPS002", organization_id=1),
            Vehicle(state_number="С789ЕЖ777", model="Volvo FH16", device_id="GPS003", organization_id=1),
            Vehicle(state_number="Д012ЗИ777", model="Scania R500",device_id="GPS004", organization_id=1),
        ])

        # ─── Сотрудники ──────────────────────────────────────
        db.add_all([
            Employee(full_name="Сергеев Александр Петрович",  role="Водитель КАМАЗа (GPS001)",   phone="+79111234567", organization_id=1, license_number="77 16 569 719", license_class="B, C",    snils="024-536-107-98"),
            Employee(full_name="Иванов Виталий Николаевич",   role="Водитель МАЗ (GPS002)",      phone="+79219876543", organization_id=1, license_number="78 20 415 002", license_class="B, C",    snils="031-442-215-56"),
            Employee(full_name="Михайлов Дмитрий Сергеевич",  role="Водитель Volvo FH16 (GPS003)", phone="+79031112233", organization_id=1, license_number="50 18 302 641", license_class="B, C, CE", snils="018-773-309-41"),
            Employee(full_name="Васильев Олег Игоревич",      role="Диспетчер-координатор",       phone="+79998887766", organization_id=1),
        ])

        db.flush()  # чтобы получить auto-increment ID для FK в waybills

        # ─── Путевые листы ────────────────────────────────────
        db.add_all([
            Waybill(
                organization_id=1,
                cargo_type="Строительные материалы", weight=12000,
                customer="ООО ТехСтрой", carrier="CargoFlow LLC",
                from_city="Москва", to_city="Казань",
                route_coords='[[55.7558, 37.6173], [55.8304, 49.0661]]',
                date_from="2026-05-27", date_to="2026-05-30",
                vehicle_id=1, driver_id=1, status="В пути",
            ),
            Waybill(
                organization_id=1,
                cargo_type="Замороженные продукты", weight=4800,
                customer="АО Магнит-Логистик", carrier="ИП Смирнов",
                from_city="Нижний Новгород", to_city="Казань",
                route_coords='[[56.3269, 44.0059], [56.0, 46.5], [55.7961, 49.1064]]',
                date_from="2026-05-18", date_to="2026-05-25",
                vehicle_id=2, driver_id=2, status="В пути",
            ),
            Waybill(
                organization_id=1,
                cargo_type="Автозапчасти", weight=7500,
                customer="ООО Детали машин", carrier="ТК Вега",
                from_city="Москва", to_city="Ярославль",
                route_coords='[[55.7558, 37.6173], [56.5, 38.5], [57.6261, 39.8845]]',
                date_from="2026-05-20", date_to="2026-05-28",
                vehicle_id=3, driver_id=3, status="Ожидают",
            ),
        ])

        db.commit()
        print("[CargoFlow] Demo data seeded (1 user, 4 vehicles, 4 employees, 3 waybills)")
