# Как запустить проект CargoFlow

Инструкция рассчитана на запуск из Windows PowerShell.

## 1. Что нужно запустить

Проект состоит из двух процессов:

- backend на FastAPI: `http://127.0.0.1:8000`
- frontend + Node/Express сервер: `http://localhost:3000`

Открывать в браузере нужно frontend:

```text
http://localhost:3000
```

## 2. Виртуальное окружение Python

В проекте уже есть виртуальное окружение:

```text
F:\cargoflow\.venv
```

Создавать второе окружение в `backend\.venv` не нужно. Это было бы технически нормально, но для этого проекта лишнее и может путать.

Backend можно запускать из папки `backend`, но активировать нужно корневое окружение:

```powershell
cd F:\cargoflow
.\.venv\Scripts\Activate.ps1
```

Если PowerShell ругается на запуск скриптов, выполните:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

После активации в начале строки терминала должно появиться `(.venv)`.

## 3. Подготовка backend

Перейдите в папку backend:

```powershell
cd F:\cargoflow\backend
```

Если файл `backend\.env` еще не создан, создайте его из примера:

```powershell
copy .env.example .env
```

Проверьте переменные в `backend\.env`:

```env
SUPABASE_URL=https://194-67-127-185.cloudvps.regruhosting.ru
SUPABASE_ANON_KEY=replace_me
FRONTEND_ORIGIN=http://localhost:5173,http://localhost:3000
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
BACKEND_PORT=8000
```

Вместо `replace_me` нужен актуальный `SUPABASE_ANON_KEY`.

Если зависимости backend еще не установлены или есть ошибка импорта, установите их в корневое `.venv`:

```powershell
cd F:\cargoflow
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

## 4. Запуск backend

В отдельном терминале PowerShell:

```powershell
cd F:\cargoflow
.\.venv\Scripts\Activate.ps1
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Проверка, что backend поднялся:

```powershell
curl.exe http://127.0.0.1:8000/health
```

Ожидаемый ответ:

```json
{"status":"ok","service":"CargoFlow FastAPI"}
```

Этот терминал нужно оставить открытым.

## 5. Подготовка frontend/Node-части

Откройте второй терминал PowerShell и перейдите в корень проекта:

```powershell
cd F:\cargoflow
```

Установите Node-зависимости:

```powershell
npm install
```

Если файл `.env` в корне проекта еще не создан, создайте его:

```powershell
copy .env.example .env
```

Проверьте переменные в корневом `.env`:

```env
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="http://localhost:3000"
FASTAPI_BASE_URL="http://127.0.0.1:8000"
```

`GEMINI_API_KEY` нужен только для функций ИИ. Без него основное приложение может запускаться, но ИИ-анализ будет недоступен.

## 6. Запуск frontend

Во втором терминале из корня проекта:

```powershell
cd F:\cargoflow
npm run dev
```

После запуска откройте:

```text
http://localhost:3000
```

Этот терминал тоже нужно оставить открытым.

## 7. Коротко: порядок запуска

Первый терминал:

```powershell
cd F:\cargoflow
.\.venv\Scripts\Activate.ps1
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

Второй терминал:

```powershell
cd F:\cargoflow
npm run dev
```

Браузер:

```text
http://localhost:3000
```

## 8. Production-сборка

Из корня проекта:

```powershell
npm run build
```

Запуск собранной версии:

```powershell
npm start
```

Собранное приложение слушает порт `3000`.

## 9. Проверка типов

Из корня проекта:

```powershell
npm run lint
```

Скрипт запускает TypeScript-проверку без сборки:

```powershell
tsc --noEmit
```

## 10. Частые проблемы

### Порт уже занят

Проверьте, что слушает порт:

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :8000
```

Завершите лишний процесс через PID:

```powershell
taskkill /PID <PID> /F
```

### Не работает авторизация или мониторинг

Проверьте:

- FastAPI запущен на `http://127.0.0.1:8000`
- frontend/Node-сервер запущен на `http://localhost:3000`
- в `backend\.env` указан актуальный `SUPABASE_ANON_KEY`
- в корневом `.env` указан `FASTAPI_BASE_URL="http://127.0.0.1:8000"`

### PowerShell не активирует `.venv`

Выполните:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### Backend падает при старте

Переустановите зависимости backend в корневое окружение:

```powershell
cd F:\cargoflow
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
cd backend
python -m uvicorn app.main:app --reload --port 8000
```
