from datetime import datetime, timedelta

VEHICLES = [
    {"id": 1, "state_number": "А123БВ777", "model": "КАМАЗ 65115", "device_id": "GPS001", "active": True, "organization_id": 1, "driver_id": "emp-1"},
    {"id": 2, "state_number": "В456ГД777", "model": "МАЗ 6312", "device_id": "GPS002", "active": True, "organization_id": 1, "driver_id": "emp-2"},
    {"id": 3, "state_number": "С789ЕЖ777", "model": "Volvo FH16", "device_id": "GPS003", "active": True, "organization_id": 1, "driver_id": "emp-3"},
    {"id": 4, "state_number": "Д012ЗИ777", "model": "Scania R500", "device_id": "GPS004", "active": True, "organization_id": 1, "driver_id": None},
]

CARGO_LOADS = [
    {
        "id": "cargo-1",
        "weight": 12000,
        "cargo_type": "Строительные материалы",
        "customer": "ООО ТехСтрой",
        "carrier": "CargoFlow LLC",
        "from_city": "Москва",
        "to_city": "Казань",
        "date_from": (datetime.utcnow() - timedelta(days=1)).date().isoformat(),
        "date_to": (datetime.utcnow() + timedelta(days=2)).date().isoformat(),
        "coords": [[55.7558, 37.6173], [55.8304, 49.0661]],
        "vehicle_id": 1,
        "status": "В пути",
        "driver_id": "emp-1",
    },
    {
        "id": "cargo-2",
        "weight": 8000,
        "cargo_type": "Холодильные товары",
        "customer": "ООО ФрешЛогистик",
        "carrier": "CargoFlow LLC",
        "from_city": "Санкт-Петербург",
        "to_city": "Нижний Новгород",
        "date_from": (datetime.utcnow() - timedelta(days=2)).date().isoformat(),
        "date_to": (datetime.utcnow() + timedelta(days=1)).date().isoformat(),
        "coords": [[59.9343, 30.3351], [56.3269, 44.0055]],
        "vehicle_id": 2,
        "status": "В пути",
        "driver_id": "emp-2",
    },
]

EMPLOYEES = [
    {"id": "emp-1", "name": "Сергеев Александр Петрович", "role": "Водитель КАМАЗа (GPS001)", "phone": "+79111234567"},
    {"id": "emp-2", "name": "Иванов Виталий Николаевич", "role": "Водитель МАЗ (GPS002)", "phone": "+79219876543"},
    {"id": "emp-3", "name": "Михайлов Дмитрий Сергеевич", "role": "Водитель Volvo FH16 (GPS003)", "phone": "+79031112233"},
    {"id": "emp-4", "name": "Васильев Олег Игоревич", "role": "Диспетчер-координатор", "phone": "+79998887766"},
]
