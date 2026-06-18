-- ============================================================
-- МИГРАЦИЯ 001: Создание таблиц employees и waybills
-- ============================================================
-- Проект: CargoFlow — модуль электронных путевых листов
-- Среда выполнения: Supabase Dashboard → SQL Editor
-- Зависимости: таблицы organizations, vehicles уже существуют
-- ============================================================
-- ВАЖНО: Выполнять этот скрипт целиком в SQL Editor Supabase.
-- Скрипт идемпотентен — повторный запуск не вызовет ошибок.
-- ============================================================


-- ============================================================
-- 1. ТАБЛИЦА СОТРУДНИКОВ (employees)
-- ============================================================
-- Хранит штат сотрудников организации: водители, диспетчеры,
-- механики. Связана с таблицей organizations через FK.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employees (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id bigint NOT NULL
                    REFERENCES public.organizations(id) ON DELETE RESTRICT,
    full_name       text   NOT NULL
                    CONSTRAINT employees_full_name_length
                    CHECK (char_length(full_name) BETWEEN 2 AND 255),
    role            text   NOT NULL DEFAULT 'Водитель'
                    CONSTRAINT employees_role_length
                    CHECK (char_length(role) BETWEEN 1 AND 100),
    phone           text   NOT NULL DEFAULT ''
                    CONSTRAINT employees_phone_format
                    CHECK (phone = '' OR phone ~ '^\+?[0-9\s\-\(\)]{7,20}$'),
    license_number  text       NULL,      -- Номер водительского удостоверения
    license_class   text       NULL,      -- Категория ВУ (B, C, CE, ...)
    snils           text       NULL,      -- СНИЛС (для путевого листа)
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Комментарии к таблице (для автодокументации)
COMMENT ON TABLE  public.employees IS 'Реестр сотрудников организации (водители, диспетчеры, механики)';
COMMENT ON COLUMN public.employees.full_name      IS 'ФИО сотрудника в формате Фамилия Имя Отчество';
COMMENT ON COLUMN public.employees.role            IS 'Должность / роль сотрудника';
COMMENT ON COLUMN public.employees.phone           IS 'Контактный телефон в формате +79XXXXXXXXX';
COMMENT ON COLUMN public.employees.license_number  IS 'Серия и номер водительского удостоверения';
COMMENT ON COLUMN public.employees.license_class   IS 'Категория ВУ (B, C, CE и т.д.)';
COMMENT ON COLUMN public.employees.snils           IS 'Номер СНИЛС';
COMMENT ON COLUMN public.employees.organization_id IS 'FK на организацию-работодателя';

-- Индексы для employees
CREATE INDEX IF NOT EXISTS idx_employees_organization
    ON public.employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_active
    ON public.employees(active) WHERE active = true;

-- Триггер автообновления updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 2. ТАБЛИЦА ПУТЕВЫХ ЛИСТОВ (waybills)
-- ============================================================
-- Основная бизнес-сущность модуля. Хранит электронные путевые
-- листы с реквизитами согласно Приказу Минтранса РФ.
-- Связана с vehicles (ТС) и employees (водитель).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.waybills (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id bigint      NOT NULL
                    REFERENCES public.organizations(id) ON DELETE RESTRICT,

    -- === Сведения о грузе ===
    cargo_type      text        NOT NULL
                    CONSTRAINT waybills_cargo_type_length
                    CHECK (char_length(cargo_type) BETWEEN 1 AND 255),
    weight          numeric(10,2) NOT NULL
                    CONSTRAINT waybills_weight_positive
                    CHECK (weight > 0 AND weight <= 100000),
    customer        text        NOT NULL
                    CONSTRAINT waybills_customer_length
                    CHECK (char_length(customer) BETWEEN 1 AND 255),
    carrier         text        NOT NULL
                    CONSTRAINT waybills_carrier_length
                    CHECK (char_length(carrier) BETWEEN 1 AND 255),

    -- === Маршрут ===
    from_city       text        NOT NULL
                    CONSTRAINT waybills_from_city_length
                    CHECK (char_length(from_city) BETWEEN 1 AND 100),
    to_city         text        NOT NULL
                    CONSTRAINT waybills_to_city_length
                    CHECK (char_length(to_city) BETWEEN 1 AND 100),
    route_coords    jsonb       NOT NULL DEFAULT '[]'::jsonb,

    -- === Период действия путевого листа ===
    date_from       date        NOT NULL,
    date_to         date        NOT NULL,
    CONSTRAINT waybills_dates_order
        CHECK (date_to >= date_from),

    -- === Назначение ТС и водителя ===
    vehicle_id      bigint      NULL
                    REFERENCES public.vehicles(id) ON DELETE SET NULL,
    driver_id       bigint      NULL
                    REFERENCES public.employees(id) ON DELETE SET NULL,

    -- === Статус документа ===
    status          text        NOT NULL DEFAULT 'Ожидают'
                    CONSTRAINT waybills_status_enum
                    CHECK (status IN ('Ожидают', 'В пути', 'Доставлен', 'Отменён')),

    -- === Кто создал / кому принадлежит документ ===
    created_by      uuid        NULL
                    REFERENCES auth.users(id) ON DELETE SET NULL,

    -- === Служебные поля ===
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Комментарии к таблице
COMMENT ON TABLE  public.waybills IS 'Электронные путевые листы грузового автомобиля (Форма № 4-П)';
COMMENT ON COLUMN public.waybills.cargo_type      IS 'Наименование перевозимого груза';
COMMENT ON COLUMN public.waybills.weight           IS 'Масса груза брутто, кг';
COMMENT ON COLUMN public.waybills.customer         IS 'Наименование заказчика (грузоотправитель)';
COMMENT ON COLUMN public.waybills.carrier          IS 'Наименование перевозчика';
COMMENT ON COLUMN public.waybills.from_city        IS 'Пункт отправления (погрузки)';
COMMENT ON COLUMN public.waybills.to_city          IS 'Пункт назначения (разгрузки)';
COMMENT ON COLUMN public.waybills.route_coords     IS 'Координаты маршрута в формате [[lat, lon], ...], WGS-84';
COMMENT ON COLUMN public.waybills.date_from        IS 'Дата начала действия путевого листа';
COMMENT ON COLUMN public.waybills.date_to          IS 'Дата окончания действия путевого листа';
COMMENT ON COLUMN public.waybills.vehicle_id       IS 'FK на транспортное средство';
COMMENT ON COLUMN public.waybills.driver_id        IS 'FK на водителя-экспедитора';
COMMENT ON COLUMN public.waybills.status           IS 'Статус: Ожидают | В пути | Доставлен | Отменён';
COMMENT ON COLUMN public.waybills.created_by       IS 'UUID пользователя Supabase Auth, создавшего документ';

-- Индексы для waybills
CREATE INDEX IF NOT EXISTS idx_waybills_organization
    ON public.waybills(organization_id);
CREATE INDEX IF NOT EXISTS idx_waybills_status
    ON public.waybills(status);
CREATE INDEX IF NOT EXISTS idx_waybills_vehicle
    ON public.waybills(vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waybills_driver
    ON public.waybills(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waybills_dates
    ON public.waybills(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_waybills_created_by
    ON public.waybills(created_by) WHERE created_by IS NOT NULL;

-- Триггер автообновления updated_at
DROP TRIGGER IF EXISTS trg_waybills_updated_at ON public.waybills;
CREATE TRIGGER trg_waybills_updated_at
    BEFORE UPDATE ON public.waybills
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 3. ROW-LEVEL SECURITY (RLS)
-- ============================================================
-- Политики обеспечивают доступ к данным только в пределах
-- организации текущего пользователя. Организация определяется
-- через таблицу profiles (profiles.organization_id).
-- ============================================================

-- Включаем RLS на обеих таблицах
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waybills  ENABLE ROW LEVEL SECURITY;

-- Вспомогательная функция: получить organization_id текущего пользователя
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT organization_id
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;
$$;

-- === RLS для employees ===

-- SELECT: пользователь видит сотрудников своей организации
CREATE POLICY employees_select_own_org ON public.employees
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- INSERT: пользователь создаёт сотрудников только в своей организации
CREATE POLICY employees_insert_own_org ON public.employees
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

-- UPDATE: пользователь редактирует сотрудников только своей организации
CREATE POLICY employees_update_own_org ON public.employees
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- DELETE: пользователь удаляет сотрудников только своей организации
CREATE POLICY employees_delete_own_org ON public.employees
    FOR DELETE
    USING (organization_id = public.get_user_organization_id());


-- === RLS для waybills ===

-- SELECT: пользователь видит путевые листы своей организации
CREATE POLICY waybills_select_own_org ON public.waybills
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- INSERT: создание только в своей организации
CREATE POLICY waybills_insert_own_org ON public.waybills
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

-- UPDATE: редактирование только в своей организации
CREATE POLICY waybills_update_own_org ON public.waybills
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- DELETE: удаление только в своей организации
CREATE POLICY waybills_delete_own_org ON public.waybills
    FOR DELETE
    USING (organization_id = public.get_user_organization_id());


-- ============================================================
-- 4. SEED DATA (тестовые данные)
-- ============================================================
-- Данные соответствуют текущему data_store.json.
-- organization_id = 1 — тестовая организация.
-- ============================================================

-- Сотрудники
INSERT INTO public.employees (organization_id, full_name, role, phone, license_number, license_class, snils)
VALUES
    (1, 'Сергеев Александр Петрович',   'Водитель КАМАЗа (GPS001)',       '+79111234567', '77 16 569 719', 'B, C',  '024-536-107-98'),
    (1, 'Иванов Виталий Николаевич',    'Водитель МАЗ (GPS002)',          '+79219876543', '78 20 415 002', 'B, C',  '031-442-215-56'),
    (1, 'Михайлов Дмитрий Сергеевич',   'Водитель Volvo FH16 (GPS003)',   '+79031112233', '50 18 302 641', 'B, C, CE', '018-773-309-41'),
    (1, 'Васильев Олег Игоревич',       'Диспетчер-координатор',          '+79998887766', NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- Путевые листы
INSERT INTO public.waybills (
    organization_id, cargo_type, weight, customer, carrier,
    from_city, to_city, route_coords,
    date_from, date_to, vehicle_id, driver_id, status
)
SELECT
    1,
    'Строительные материалы',
    12000,
    'ООО ТехСтрой',
    'CargoFlow LLC',
    'Москва',
    'Казань',
    '[[55.7558, 37.6173], [55.8304, 49.0661]]'::jsonb,
    '2026-05-27'::date,
    '2026-05-30'::date,
    v.id,
    e.id,
    'В пути'
FROM public.vehicles v, public.employees e
WHERE v.state_number = 'А123БВ777'
  AND e.full_name = 'Сергеев Александр Петрович'
  AND NOT EXISTS (
      SELECT 1 FROM public.waybills
      WHERE cargo_type = 'Строительные материалы'
        AND customer = 'ООО ТехСтрой'
        AND date_from = '2026-05-27'
  )
LIMIT 1;

INSERT INTO public.waybills (
    organization_id, cargo_type, weight, customer, carrier,
    from_city, to_city, route_coords,
    date_from, date_to, vehicle_id, driver_id, status
)
SELECT
    1,
    'Замороженные продукты',
    4800,
    'АО Магнит-Логистик',
    'ИП Смирнов',
    'Нижний Новгород',
    'Казань',
    '[[56.3269, 44.0059], [56.0, 46.5], [55.7961, 49.1064]]'::jsonb,
    '2026-05-18'::date,
    '2026-05-25'::date,
    v.id,
    e.id,
    'В пути'
FROM public.vehicles v, public.employees e
WHERE v.state_number = 'В456ГД777'
  AND e.full_name = 'Иванов Виталий Николаевич'
  AND NOT EXISTS (
      SELECT 1 FROM public.waybills
      WHERE cargo_type = 'Замороженные продукты'
        AND customer = 'АО Магнит-Логистик'
  )
LIMIT 1;

INSERT INTO public.waybills (
    organization_id, cargo_type, weight, customer, carrier,
    from_city, to_city, route_coords,
    date_from, date_to, vehicle_id, driver_id, status
)
SELECT
    1,
    'Автозапчасти',
    7500,
    'ООО Детали машин',
    'ТК Вега',
    'Москва',
    'Ярославль',
    '[[55.7558, 37.6173], [56.5, 38.5], [57.6261, 39.8845]]'::jsonb,
    '2026-05-20'::date,
    '2026-05-28'::date,
    v.id,
    e.id,
    'Ожидают'
FROM public.vehicles v, public.employees e
WHERE v.state_number = 'С789ЕЖ777'
  AND e.full_name = 'Михайлов Дмитрий Сергеевич'
  AND NOT EXISTS (
      SELECT 1 FROM public.waybills
      WHERE cargo_type = 'Автозапчасти'
        AND customer = 'ООО Детали машин'
  )
LIMIT 1;


-- ============================================================
-- 5. GRANT: PostgREST доступ
-- ============================================================
-- Supabase PostgREST требует явных GRANT для ролей anon и
-- authenticated, чтобы таблицы появились в REST API.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT SELECT ON public.employees TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.employees_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waybills TO authenticated;
GRANT SELECT ON public.waybills TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.waybills_id_seq TO authenticated;

-- Функция тоже должна быть доступна для RLS
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO anon;


-- ============================================================
-- 6. ПРОВЕРОЧНЫЕ ЗАПРОСЫ (выполнить после миграции)
-- ============================================================
-- Раскомментировать и выполнить по одному для проверки:
-- ============================================================

-- SELECT * FROM public.employees ORDER BY id;
-- SELECT * FROM public.waybills ORDER BY id;
-- SELECT w.id, w.cargo_type, w.status, v.state_number, e.full_name
--   FROM public.waybills w
--   LEFT JOIN public.vehicles v ON v.id = w.vehicle_id
--   LEFT JOIN public.employees e ON e.id = w.driver_id
--   ORDER BY w.id;
