# run_server.ps1
# ================================================================
# CargoFlow Backend — запуск в одну команду
# ================================================================
# Использование:
#   Set-ExecutionPolicy Bypass -Scope Process
#   .\run_server.ps1
# ================================================================

$ErrorActionPreference = "Stop"

$BACKEND = $PSScriptRoot
$ROOT = Split-Path $BACKEND -Parent
$VENV = "$ROOT\.venv"
$PYTHON = "$VENV\Scripts\python.exe"

Write-Host ""
Write-Host "  CargoFlow Backend v1.0.0" -ForegroundColor Cyan
Write-Host ""

# --- Shag 1: Virtual environment ---
if (-not (Test-Path $PYTHON)) {
    Write-Host "[1/3] Creating venv..." -ForegroundColor Yellow
    py -m venv $VENV
    Write-Host "  Done: $VENV" -ForegroundColor Green
} else {
    Write-Host "[1/3] venv found: $VENV" -ForegroundColor Green
}

# --- Shag 2: Dependencies ---
Write-Host ""
Write-Host "[2/3] Checking dependencies..." -ForegroundColor Yellow
$fastapi = & $PYTHON -c "import fastapi; print(fastapi.__version__)" 2>$null
if (-not $fastapi) {
    Write-Host "  Installing requirements.txt..." -ForegroundColor Yellow
    & $PYTHON -m pip install -r "$BACKEND\requirements.txt" -q
    Write-Host "  Done" -ForegroundColor Green
} else {
    Write-Host "  FastAPI $fastapi OK" -ForegroundColor Green
}

# --- Shag 3: Run uvicorn ---
Write-Host ""
Write-Host "[3/3] Starting FastAPI server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Swagger UI:  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Health:      http://localhost:8000/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

& $PYTHON -m uvicorn app.main:app --reload --port 8000 --host 0.0.0.0 --log-level info --app-dir $BACKEND
