# CargoFlow Backend API

**Backend модуль формирования электронных путевых листов с интеграцией со спутниковой системой мониторинга транспорта**

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green.svg)](https://fastapi.tiangolo.com)
[![Supabase](https://img.shields.io/badge/Supabase-Self--Hosted-3ecf8e.svg)](https://supabase.com)

---

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                 Frontend (React / TS)                   │
│                    :5173 / :3000                        │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP + HttpOnly Cookie
                         ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI Backend  :8000                     │
│                                                         │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐  │
│  │ /auth    │ │ /waybills │ │/employees│ │  /ai    │  │
│  └──────────┘ └───────────┘ └──────────┘ └─────────┘  │
│  ┌────────────────────┐  ┌──────────────────────────┐  │
│  │ /monitoring        │  │ SlowAPI + CORS Middleware │  │
│  └────────────────────┘  └──────────────────────────┘  │
└────────────┬────────────────────────┬───────────────────┘
             │ PostgREST API          │ Gemini API
             ▼                        ▼
┌────────────────────┐    ┌──────────────────────┐
│  Supabase          │    │  Google Gemini        │
│  Self-Hosted       │    │  gemini-2.5-flash     │
│  PostgreSQL 15     │    └──────────────────────┘
│  GoTrue Auth       │
│  PostgREST         │
└────────────────────┘
```

---

## Быстрый старт

### 1. Требования

- Python 3.12+
- pip

### 2. Установка

```powershell
# Создать виртуальное окружение
py -m venv .venv
.\.venv\Scripts\Activate.ps1

# Установить зависимости
pip install -r requirements.txt
```

### 3. Настройка `.env`

Файл `backend/.env` уже создан. Убедитесь, что ключи корректны:

```env
SUPABASE_URL=https://194-67-127-185.cloudvps.regruhosting.ru
SUPABASE_ANON_KEY=<anon key из Supabase Dashboard>
GEMINI_API_KEY=<ваш ключ Gemini>
APP_ENV=development
BACKEND_PORT=8000
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:3000
RATE_LIMIT_REQUESTS=60
```

### 4. Миграция базы данных

Перед первым запуском выполните SQL-миграцию:

**Способ 1 — Browser Agent** (рекомендуется):
1. Откройте `backend/migration_agent.html` в браузере
2. Вставьте service_role key из Supabase Studio → API Settings
3. Нажмите «Выполнить миграцию»

**Способ 2 — Supabase SQL Editor**:
1. Откройте Supabase Studio → Database → SQL Editor
2. Скопируйте содержимое `backend/migrations/001_create_employees_and_waybills.sql`
3. Нажмите Run (Ctrl+Enter)

### 5. Запуск

```powershell
# Из папки backend
uvicorn app.main:app --reload --port 8000
```

Swagger UI: **http://localhost:8000/docs**

### 6. Запуск тестов

```powershell
# Из папки backend
py -m pytest tests/ -v
```

---

## API Reference

### Аутентификация

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `POST` | `/api/auth/login` | Вход (rate limit: 10/мин) |
| `POST` | `/api/auth/logout` | Выход, удаление cookie |
| `GET`  | `/api/auth/me` | Профиль текущего пользователя |

**Аутентификация**: JWT Bearer token или HttpOnly cookie `sb_access_token`

### Путевые листы

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET`    | `/api/waybills` | Список путевых листов (фильтр: `?status=В пути`) |
| `GET`    | `/api/waybills/{id}` | Путевой лист по ID |
| `POST`   | `/api/waybills` | Создать путевой лист |
| `PATCH`  | `/api/waybills/{id}` | Обновить путевой лист |
| `PATCH`  | `/api/waybills/{id}/status` | Изменить статус |
| `DELETE` | `/api/waybills/{id}` | Удалить путевой лист |

**Статусы**: `Ожидают` → `В пути` → `Доставлен` / `Отменён`

### Сотрудники

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET`    | `/api/employees` | Список активных сотрудников |
| `GET`    | `/api/employees/{id}` | Сотрудник по ID |
| `POST`   | `/api/employees` | Создать сотрудника |
| `PATCH`  | `/api/employees/{id}` | Обновить данные |
| `DELETE` | `/api/employees/{id}` | Деактивировать (мягкое удаление) |

### Мониторинг (телеметрия)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET`  | `/api/monitoring/vehicles` | Список ТС |
| `GET`  | `/api/monitoring/vehicles/{id}/location` | Текущая позиция GPS/ГЛОНАСС |
| `GET`  | `/api/monitoring/vehicles/{id}/parameters` | Параметры CAN-шины |
| `GET`  | `/api/monitoring/vehicles/{id}/history` | История телеметрии (30 мин) |
| `POST` | `/api/monitoring/records` | История из Supabase RPC |
| `GET`  | `/api/monitoring/organizations` | Организации |
| `GET`  | `/api/monitoring/navigation-devices` | Навигационные устройства |

### ИИ-аналитика

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `POST` | `/api/ai/analyze` | Gemini-аудит рейса по путевому листу |

### Служебные

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/redoc` | ReDoc |

---

## Безопасность

| Механизм | Реализация |
|----------|-----------|
| Аутентификация | Supabase JWT (HS256), проверка через `/auth/v1/user` |
| Сессия | HttpOnly cookie `sb_access_token`, SameSite=Lax |
| Авторизация данных | Row Level Security (RLS) на уровне PostgreSQL |
| Пароли | bcrypt, cost factor 12 (`security.py`) |
| Rate Limiting | SlowAPI: 60 req/min по IP, 10/min на `/login` |
| CORS | Whitelist из `FRONTEND_ORIGIN` env var (не wildcard) |
| Секреты | Только через `.env`, нет хардкода в коде |

---

## Структура проекта

```
backend/
├── app/
│   ├── api/              # API-роутеры (по модулям)
│   │   ├── auth.py       # Аутентификация
│   │   ├── waybills.py   # Путевые листы
│   │   ├── employees.py  # Сотрудники
│   │   ├── monitoring.py # Телеметрия и мониторинг
│   │   ├── ai.py         # Gemini AI-аналитика
│   │   ├── vehicles.py   # Транспортные средства
│   │   └── health.py     # Health check
│   ├── core/
│   │   ├── config.py     # Pydantic Settings (env vars)
│   │   └── security.py   # bcrypt + SlowAPI limiter
│   ├── services/
│   │   ├── supabase_service.py    # Repository: PostgREST API
│   │   └── telemetry_simulator.py # GPS/ГЛОНАСС имитационная модель
│   └── main.py           # FastAPI app + middleware
├── migrations/
│   └── 001_create_employees_and_waybills.sql
├── tests/
│   ├── conftest.py       # pytest fixtures
│   ├── test_auth.py      # 8 тестов авторизации
│   ├── test_waybills.py  # 9 тестов путевых листов
│   └── test_monitoring.py # 10 тестов телеметрии
├── .env                  # Секреты (не в git)
├── .env.example          # Шаблон без секретов
├── Dockerfile            # Multi-stage production build
├── requirements.txt
└── pytest.ini
```

---

## Телеметрическая модель (Wialon IPS)

Модуль `telemetry_simulator.py` реализует генератор навигационных пакетов, совместимый с протоколом **Wialon IPS 2.0**, применяемым в спутниковых системах мониторинга транспорта класса ГЛОНАСС/GPS.

Алгоритм интерполяции позиции использует **формулу Хаверсина** для вычисления расстояний на сфере (WGS-84). Профиль скорости строится по синусоидальной модели, расход топлива — пропорционально скорости (0.35% ДУТ на км).

Пример навигационного пакета:

```json
{
  "vehicle_id": 4,
  "state_number": "А123БВ777",
  "timestamp": "2026-05-30T20:00:00Z",
  "latitude": 55.8124,
  "longitude": 38.4217,
  "heading": 73.2,
  "speed": 68.4,
  "gps_satellites": 11,
  "engine_on": true,
  "fuel_level": 71.3
}
```
