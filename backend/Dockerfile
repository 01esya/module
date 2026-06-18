# ============================================================
# CargoFlow Backend — Dockerfile
# ============================================================
# Многоэтапная сборка (multi-stage build):
#   1. builder — устанавливает зависимости в изолированную папку
#   2. runtime — минимальный образ только с нужными артефактами
#
# Сборка:   docker build -t cargoflow-backend .
# Запуск:   docker run -p 8000:8000 --env-file .env cargoflow-backend
# ============================================================

# ─── Этап 1: Установка зависимостей ──────────────────────────
FROM python:3.12-slim AS builder

# Системные зависимости для psycopg2-binary и bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /install

COPY requirements.txt .

# pip install в изолированный prefix (не в site-packages системы)
RUN pip install --no-cache-dir --prefix=/install/deps -r requirements.txt


# ─── Этап 2: Минимальный runtime-образ ───────────────────────
FROM python:3.12-slim AS runtime

# Метаданные образа
LABEL maintainer="CargoFlow Team"
LABEL description="Backend модуль формирования электронных путевых листов"
LABEL version="1.0.0"

# Не запускаем под root, создаем рабочую директорию с нужными правами
RUN groupadd -r cargoflow && useradd -r -g cargoflow cargoflow \
    && mkdir -p /app && chown cargoflow:cargoflow /app

WORKDIR /app

# Копируем зависимости из builder-этапа
COPY --from=builder /install/deps /usr/local

# Копируем только исходный код приложения (с правами cargoflow для записи SQLite)
COPY --chown=cargoflow:cargoflow app/ ./app/

# Переменные окружения
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    BACKEND_PORT=8000

# Открываем порт приложения
EXPOSE 8000

# Меняем пользователя (не root)
USER cargoflow

# Команда запуска — uvicorn с несколькими workers
# Количество workers: 2*CPU + 1 (для 1 CPU = 3)
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "3", \
     "--log-level", "info"]
