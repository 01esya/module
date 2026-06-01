-- ============================================================
-- МИГРАЦИЯ 001: Создание таблиц модуля ЭПЛ (SQLite)
-- ============================================================
-- Проект:  CargoFlow — модуль электронных путевых листов
-- СУБД:    SQLite (локальная демонстрационная среда)
-- Целевая: Supabase/PostgreSQL (продакшн, общая схема)
--
-- Схема соответствует ER-диаграмме: logistics_waybills и
-- logistics_waybill_signatures. FK на общие таблицы
-- (common_vehicles, common_drivers, public_profiles,
--  route_routes, timetable_timetables, timetable_orders)
-- объявлены как логические ссылки без жёсткого CASCADE,
-- поскольку в локальной SQLite эти таблицы представлены
-- mock-данными. В продакшне связи обеспечиваются на уровне
-- Supabase RLS и FOREIGN KEY constraints PostgreSQL.
-- ============================================================

PRAGMA foreign_keys = ON;  -- включаем проверку FK в SQLite

-- ============================================================
-- 0. ВСПОМОГАТЕЛЬНЫЕ MOCK-ТАБЛИЦЫ (заглушки для FK)
-- Нужны только локально; в Supabase эти таблицы уже есть.
-- ============================================================

CREATE TABLE IF NOT EXISTS common_organizations (
    id      INTEGER PRIMARY KEY,
    name    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS common_vehicles (
    id           INTEGER PRIMARY KEY,
    state_number TEXT    NOT NULL,
    model        TEXT
);

CREATE TABLE IF NOT EXISTS common_drivers (
    id        INTEGER PRIMARY KEY,
    full_name TEXT    NOT NULL,
    license   TEXT
);

CREATE TABLE IF NOT EXISTS route_routes (
    id   INTEGER PRIMARY KEY,
    name TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_timetables (
    id   INTEGER PRIMARY KEY,
    name TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_orders (
    id   INTEGER PRIMARY KEY,
    name TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS public_profiles (
    id   TEXT PRIMARY KEY,   -- UUID храним как TEXT в SQLite
    name TEXT    NOT NULL
);


-- ============================================================
-- 1. ОСНОВНАЯ ТАБЛИЦА: logistics_waybills
-- ============================================================
-- Электронный путевой лист (ЭПЛ). Содержит все реквизиты
-- согласно Приказу Минтранса РФ № 368, включая показания
-- одометра, моточасов и расход топлива.
-- ============================================================

CREATE TABLE IF NOT EXISTS logistics_waybills (

    -- === Идентификатор ===
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,  -- bigint → INTEGER (SQLite autoincrement)

    -- === Принадлежность к организации ===
    organization_id     INTEGER     NOT NULL
                        REFERENCES common_organizations(id),

    -- === Номер и статус документа ===
    waybill_number      TEXT        NOT NULL UNIQUE,
    status              TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),

    -- === Внешние ключи: назначенный водитель и ТС ===
    driver_id           INTEGER     NULL
                        REFERENCES common_drivers(id),
    vehicle_id          INTEGER     NULL
                        REFERENCES common_vehicles(id),

    -- === Внешние ключи: маршрут, расписание, заявка ===
    route_id            INTEGER     NULL
                        REFERENCES route_routes(id),
    timetable_id        INTEGER     NULL
                        REFERENCES timetable_timetables(id),
    order_id            INTEGER     NULL
                        REFERENCES timetable_orders(id),

    -- === Плановые и фактические временны́е метки ===
    -- timestamptz → TEXT (ISO 8601: '2026-06-01T08:00:00+03:00')
    planned_departure   TEXT        NULL,   -- Плановое время выезда
    planned_arrival     TEXT        NULL,   -- Плановое время прибытия
    actual_departure    TEXT        NULL,   -- Фактическое время выезда
    actual_arrival      TEXT        NULL,   -- Фактическое время прибытия

    -- === Одометр (км) ===
    -- integer → INTEGER
    odometer_start      INTEGER     NULL,   -- Показание одометра при выезде
    odometer_end        INTEGER     NULL,   -- Показание одометра при возврате

    -- === Моточасы ===
    -- numeric → REAL
    engine_hours_start  REAL        NULL,   -- Моточасы при выезде
    engine_hours_end    REAL        NULL,   -- Моточасы при возврате

    -- === Топливо (литры) ===
    -- numeric → REAL
    fuel_start          REAL        NULL,   -- Остаток топлива при выезде
    fuel_end            REAL        NULL,   -- Остаток топлива при возврате
    fuel_issued         REAL        NULL,   -- Выдано топлива (заправка)
    fuel_consumed_fact  REAL        NULL,   -- Фактический расход топлива
    fuel_consumed_norm  REAL        NULL,   -- Нормативный расход топлива

    -- === Примечания ===
    notes               TEXT        NULL,

    -- === Аудит ===
    created_at          TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at          TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    -- === Пользователи (UUID как TEXT) ===
    created_by          TEXT        NULL
                        REFERENCES public_profiles(id),   -- кто создал
    updated_by          TEXT        NULL
                        REFERENCES public_profiles(id)    -- кто последний изменил
);

-- Индексы logistics_waybills
CREATE INDEX IF NOT EXISTS idx_lw_organization  ON logistics_waybills(organization_id);
CREATE INDEX IF NOT EXISTS idx_lw_status        ON logistics_waybills(status);
CREATE INDEX IF NOT EXISTS idx_lw_driver        ON logistics_waybills(driver_id);
CREATE INDEX IF NOT EXISTS idx_lw_vehicle       ON logistics_waybills(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_lw_route         ON logistics_waybills(route_id);
CREATE INDEX IF NOT EXISTS idx_lw_created_by    ON logistics_waybills(created_by);
CREATE INDEX IF NOT EXISTS idx_lw_planned_dep   ON logistics_waybills(planned_departure);

-- Триггер: автообновление updated_at при UPDATE
CREATE TRIGGER IF NOT EXISTS trg_lw_updated_at
    AFTER UPDATE ON logistics_waybills
    FOR EACH ROW
BEGIN
    UPDATE logistics_waybills
       SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = OLD.id;
END;


-- ============================================================
-- 2. ДОЧЕРНЯЯ ТАБЛИЦА: logistics_waybill_signatures
-- ============================================================
-- Хранит ЭЦП (или факт подписания) путевого листа.
-- Один ЭПЛ может иметь несколько подписей (водитель,
-- механик, диспетчер). Тип подписи задаётся полем
-- signatory_type. ip_address хранится как TEXT (inet → TEXT).
-- ============================================================

CREATE TABLE IF NOT EXISTS logistics_waybill_signatures (

    -- === Идентификатор ===
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,  -- bigint → INTEGER

    -- === Связь с путевым листом ===
    waybill_id          INTEGER     NOT NULL
                        REFERENCES logistics_waybills(id) ON DELETE CASCADE,

    -- === Тип подписанта ===
    -- Примеры: 'driver', 'mechanic', 'dispatcher', 'medical_officer'
    signatory_type      TEXT        NOT NULL,

    -- === Кто подписал (UUID как TEXT) ===
    signed_by_user_id   TEXT        NULL
                        REFERENCES public_profiles(id),

    -- === Когда подписано (timestamptz → TEXT ISO 8601) ===
    signed_at           TEXT        NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

    -- === Данные подписи (base64 ЭЦП или хэш) ===
    signature_data      TEXT        NULL,

    -- === Технические метаданные сессии подписания ===
    ip_address          TEXT        NULL,   -- inet → TEXT (напр. '192.168.1.1')
    user_agent          TEXT        NULL    -- HTTP User-Agent браузера/приложения
);

-- Индексы logistics_waybill_signatures
CREATE INDEX IF NOT EXISTS idx_lws_waybill      ON logistics_waybill_signatures(waybill_id);
CREATE INDEX IF NOT EXISTS idx_lws_signed_by    ON logistics_waybill_signatures(signed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_lws_type         ON logistics_waybill_signatures(signatory_type);


-- ============================================================
-- 3. SEED DATA — тестовые mock-данные для демонстрации
-- ============================================================

INSERT OR IGNORE INTO common_organizations (id, name) VALUES
    (1, 'ООО КаргоФлоу');

INSERT OR IGNORE INTO common_vehicles (id, state_number, model) VALUES
    (1, 'А123БВ777', 'КАМАЗ-5490'),
    (2, 'В456ГД777', 'МАЗ-6501'),
    (3, 'С789ЕЖ777', 'Volvo FH16');

INSERT OR IGNORE INTO common_drivers (id, full_name, license) VALUES
    (1, 'Сергеев Александр Петрович',  '77 16 569 719'),
    (2, 'Иванов Виталий Николаевич',   '78 20 415 002'),
    (3, 'Михайлов Дмитрий Сергеевич',  '50 18 302 641');

INSERT OR IGNORE INTO public_profiles (id, name) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Диспетчер Системный');

INSERT OR IGNORE INTO logistics_waybills (
    organization_id, waybill_number, status,
    driver_id, vehicle_id,
    planned_departure, planned_arrival,
    actual_departure,
    odometer_start, odometer_end,
    engine_hours_start, engine_hours_end,
    fuel_start, fuel_issued, fuel_consumed_fact, fuel_consumed_norm,
    notes, created_by
) VALUES
    (1, 'ЭПЛ-2026-001', 'completed',
     1, 1,
     '2026-05-27T06:00:00+03:00', '2026-05-27T20:00:00+03:00',
     '2026-05-27T06:15:00+03:00',
     125400, 125820,
     3840.5, 3844.2,
     180.0, 40.0, 38.5, 36.0,
     'Груз — строительные материалы, ООО ТехСтрой → Казань',
     '00000000-0000-0000-0000-000000000001'),

    (1, 'ЭПЛ-2026-002', 'active',
     2, 2,
     '2026-05-30T08:00:00+03:00', '2026-05-30T18:00:00+03:00',
     '2026-05-30T08:05:00+03:00',
     98200, NULL,
     2210.0, NULL,
     220.0, 60.0, NULL, 42.0,
     'Замороженные продукты, АО Магнит-Логистик',
     '00000000-0000-0000-0000-000000000001'),

    (1, 'ЭПЛ-2026-003', 'draft',
     3, 3,
     '2026-06-02T07:00:00+03:00', '2026-06-02T15:00:00+03:00',
     NULL,
     210000, NULL,
     5100.0, NULL,
     300.0, NULL, NULL, 55.0,
     'Автозапчасти, ООО Детали машин → Ярославль',
     '00000000-0000-0000-0000-000000000001');

INSERT OR IGNORE INTO logistics_waybill_signatures (
    waybill_id, signatory_type, signed_by_user_id,
    signed_at, signature_data, ip_address, user_agent
) VALUES
    (1, 'driver',   '00000000-0000-0000-0000-000000000001',
     '2026-05-27T06:10:00+03:00', 'MOCK_SIG_DRIVER_001',  '127.0.0.1', 'CargoFlow/1.0'),
    (1, 'mechanic', '00000000-0000-0000-0000-000000000001',
     '2026-05-27T06:12:00+03:00', 'MOCK_SIG_MECH_001',    '127.0.0.1', 'CargoFlow/1.0'),
    (1, 'dispatcher','00000000-0000-0000-0000-000000000001',
     '2026-05-27T20:30:00+03:00', 'MOCK_SIG_DISP_001',    '127.0.0.1', 'CargoFlow/1.0');
