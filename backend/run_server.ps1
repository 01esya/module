# run_server.ps1
# ================================================================
# CargoFlow Backend — запуск в одну команду
# ================================================================
# Использование:
#   Set-ExecutionPolicy Bypass -Scope Process
#   .\run_server.ps1
# ================================================================

$ErrorActionPreference = "Stop"

$ROOT = "c:\Users\User\cargo\module"
$BACKEND = "$ROOT\backend"
$VENV    = "$ROOT\.venv"
$PYTHON  = "$VENV\Scripts\python.exe"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║    CargoFlow Backend  v1.0.0         ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── Шаг 1: Виртуальное окружение ───────────────────────────
if (-not (Test-Path $PYTHON)) {
    Write-Host "[1/3] Создаю виртуальное окружение..." -ForegroundColor Yellow
    py -m venv $VENV
    Write-Host "  ✓ .venv создан: $VENV" -ForegroundColor Green
} else {
    Write-Host "[1/3] .venv найден: $VENV" -ForegroundColor Green
}

# ─── Шаг 2: Зависимости ─────────────────────────────────────
Write-Host ""
Write-Host "[2/3] Проверяю зависимости..." -ForegroundColor Yellow
$fastapi = & $PYTHON -c "import fastapi; print(fastapi.__version__)" 2>$null
if (-not $fastapi) {
    Write-Host "  Устанавливаю requirements.txt..." -ForegroundColor Yellow
    & $PYTHON -m pip install -r "$BACKEND\requirements.txt" -q
    Write-Host "  ✓ Зависимости установлены" -ForegroundColor Green
} else {
    Write-Host "  ✓ FastAPI $fastapi уже установлен" -ForegroundColor Green
}

# ─── Шаг 3: Запуск uvicorn ──────────────────────────────────
Write-Host ""
Write-Host "[3/3] Запускаю FastAPI сервер..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  → Swagger UI:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  → Health:      http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "  → ReDoc:       http://localhost:8000/redoc" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Нажмите Ctrl+C для остановки" -ForegroundColor Gray
Write-Host ""

& $PYTHON -m uvicorn app.main:app `
    --reload `
    --port 8000 `
    --host 0.0.0.0 `
    --log-level info `
    --app-dir "$BACKEND"
