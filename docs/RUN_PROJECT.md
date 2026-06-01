# Как запустить проект CargoFlow

Инструкция для Windows PowerShell. Проект находится в `c:\Users\User\cargo\module`.

---

## Быстрый старт (одна команда)

```powershell
Set-ExecutionPolicy Bypass -Scope Process
c:\Users\User\cargo\module\backend\run_server.ps1
```

Скрипт автоматически:
1. Создаёт виртуальное окружение `.venv` (если нет)
2. Устанавливает зависимости из `requirements.txt`
3. Запускает FastAPI на `:8000`

---

## Что запустить

| Сервис | Адрес | Команда |
|--------|-------|---------|
| **FastAPI Backend** | `http://localhost:8000` | `run_server.ps1` |
| **Swagger UI** | `http://localhost:8000/docs` | — |
| **Frontend (Node/Vite)** | `http://localhost:3000` | `npm run dev` |

---

## 1. Backend (FastAPI)

### Виртуальное окружение

```powershell
# Создать (только первый раз)
py -m venv c:\Users\User\cargo\module\.venv

# Активировать
c:\Users\User\cargo\module\.venv\Scripts\Activate.ps1
```

Если PowerShell блокирует скрипты:

```powershell
Set-ExecutionPolicy Bypass -Scope Process
c:\Users\User\cargo\module\.venv\Scripts\Activate.ps1
```

### Установка зависимостей

```powershell
pip install -r c:\Users\User\cargo\module\backend\requirements.txt
```

### Запуск сервера

```powershell
# Перейти в папку backend
cd c:\Users\User\cargo\module\backend

# Запустить с hot-reload
uvicorn app.main:app --reload --port 8000
```

Проверка:
```powershell
curl.exe http://localhost:8000/health
# {"status":"ok","service":"CargoFlow Backend","version":"1.0.0"}
```

### Запуск тестов

```powershell
cd c:\Users\User\cargo\module\backend
py -m pytest tests/ -v
# Ожидается: 18 passed (27 после SQL-миграции)
```

---

## 2. SQL-миграция базы данных

**Способ 1 — Browser Agent** (не нужны пароли от postgres):

```
Открыть: c:\Users\User\cargo\module\backend\migration_agent.html
→ Вставить service_role key из Supabase Studio → API Settings
→ Нажать "Выполнить миграцию"
```

**Способ 2 — Supabase SQL Editor**:

```
1. Открыть: https://194-67-127-185.cloudvps.regruhosting.ru
2. Database → SQL Editor
3. Открыть файл: backend\migrations\001_create_employees_and_waybills.sql
4. Вставить содержимое → Run (Ctrl+Enter)
```

---

## 3. Frontend (Node.js / Vite)

```powershell
# Установить зависимости (один раз)
cd c:\Users\User\cargo\module
npm install

# Запустить dev-сервер
npm run dev
```

Браузер: `http://localhost:3000`

---

## 4. Переменные окружения

**`backend/.env`** — уже заполнен. Проверьте:

```env
SUPABASE_URL=https://194-67-127-185.cloudvps.regruhosting.ru
SUPABASE_ANON_KEY=eyJhbGci...
GEMINI_API_KEY=your_key_here   ← вставьте ваш ключ
APP_ENV=development
BACKEND_PORT=8000
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:3000
```

---

## 5. Порядок запуска

**Терминал 1 — Backend:**
```powershell
Set-ExecutionPolicy Bypass -Scope Process
c:\Users\User\cargo\module\backend\run_server.ps1
```

**Терминал 2 — Frontend:**
```powershell
cd c:\Users\User\cargo\module
npm run dev
```

**Браузер:** `http://localhost:3000`

---

## 6. Частые проблемы

### Порт занят
```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### ImportError при запуске
```powershell
pip install -r c:\Users\User\cargo\module\backend\requirements.txt
```

### Тесты падают с ошибкой "waybills not found"
Нужно выполнить SQL-миграцию (см. раздел 2).

### Backend не видит переменные окружения
Убедитесь, что `backend/.env` существует и содержит `SUPABASE_URL` и `SUPABASE_ANON_KEY`.
