"""
Имитационная модель спутникового мониторинга транспортных средств.

Модуль реализует генератор телеметрических данных, совместимый со
структурой навигационных пакетов протокола Wialon IPS 2.0, применяемого
в спутниковых системах мониторинга транспорта класса ГЛОНАСС/GPS.

Используется для формирования реалистичных тестовых данных при
отсутствии физического подключения к навигационному оборудованию.
Алгоритм интерполяции позиции по маршрутным координатам воспроизводит
кинематику реального транспортного средства: изменение скорости,
расход топлива, отклонение от оси маршрута.

Ссылки:
    - Wialon IPS 2.0 Protocol: https://sdk.wialon.com/wiki/en/sidebar/remoteapi/apiref/format/ips
    - ГОСТ Р 56041-2014 «Навигационное обеспечение транспорта»
"""

import math
import random
from datetime import datetime, timezone
from typing import Any

# Константы физической модели
_EARTH_RADIUS_KM = 6371.0
_MAX_SPEED_KMH = 90
_MIN_SPEED_KMH = 15
_FUEL_CONSUMPTION_PER_KM = 0.35    # % топлива на км (эмпирический коэффициент)
_SPEED_NOISE_KMH = 8               # амплитуда случайных колебаний скорости
_COORD_NOISE_DEG = 0.002           # разброс позиции от оси маршрута (±220 м)


def _haversine_distance(p1: list[float], p2: list[float]) -> float:
    """
    Вычисляет расстояние между двумя точками на сфере (формула Хаверсина).

    Args:
        p1: [lat1, lon1] в градусах WGS-84
        p2: [lat2, lon2] в градусах WGS-84

    Returns:
        Расстояние в километрах.
    """
    lat1, lon1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lon2 = math.radians(p2[0]), math.radians(p2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _heading_degrees(p1: list[float], p2: list[float]) -> float:
    """
    Вычисляет начальный азимут от p1 к p2 (курс в градусах от севера).
    """
    lat1, lon1 = math.radians(p1[0]), math.radians(p1[1])
    lat2, lon2 = math.radians(p2[0]), math.radians(p2[1])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def _interpolate_position(
    coords: list[list[float]],
    progress: float,
) -> tuple[float, float]:
    """
    Линейная интерполяция позиции по ломаной маршрута.

    Args:
        coords: Список точек маршрута [[lat, lon], ...].
        progress: Доля пройденного расстояния [0.0, 1.0].

    Returns:
        (latitude, longitude) в градусах.
    """
    if not coords:
        return 55.7558, 37.6173  # Москва по умолчанию

    if len(coords) == 1:
        return coords[0][0], coords[0][1]

    # Вычисляем длину каждого сегмента и суммарную длину маршрута
    segments: list[float] = []
    for i in range(len(coords) - 1):
        segments.append(_haversine_distance(coords[i], coords[i + 1]))
    total = sum(segments) or 1.0

    target_dist = total * max(0.0, min(1.0, progress))
    accumulated = 0.0

    for i, seg_len in enumerate(segments):
        if accumulated + seg_len >= target_dist:
            local_progress = (target_dist - accumulated) / seg_len if seg_len > 0 else 0
            p1, p2 = coords[i], coords[i + 1]
            lat = p1[0] + (p2[0] - p1[0]) * local_progress
            lon = p1[1] + (p2[1] - p1[1]) * local_progress
            return lat, lon
        accumulated += seg_len

    return coords[-1][0], coords[-1][1]


def generate_vehicle_location(
    vehicle_id: int,
    state_number: str = "",
    route_coords: list[list[float]] | None = None,
    cargo_id: str | None = None,
) -> dict[str, Any]:
    """
    Генерирует навигационный пакет транспортного средства.

    Структура ответа соответствует полям навигационного пакета
    протокола Wialon IPS 2.0 (поля: lat, lon, speed, course, sats,
    hdop, inputs, outputs, params).

    Args:
        vehicle_id: Числовой идентификатор ТС.
        state_number: Государственный регистрационный номер.
        route_coords: Координаты маршрута [[lat, lon], ...].
        cargo_id: ID связанного путевого листа (если есть).

    Returns:
        Словарь с навигационными данными.
    """
    now = datetime.now(timezone.utc)
    # Прогресс по маршруту: медленно нарастает со временем
    # Детерминировано от vehicle_id + минута, чтобы при частых
    # запросах позиция не «прыгала» резко
    base_progress = 0.25 + (vehicle_id % 5) * 0.12
    time_factor = (now.minute * 60 + now.second) / 3600  # 0..1 за час
    progress = min(0.95, base_progress + time_factor * 0.15)

    if route_coords and len(route_coords) >= 2:
        lat, lon = _interpolate_position(route_coords, progress)
        # Добавляем реалистичный шум позиционирования (±220 м)
        lat += random.uniform(-_COORD_NOISE_DEG, _COORD_NOISE_DEG)
        lon += random.uniform(-_COORD_NOISE_DEG, _COORD_NOISE_DEG)
        # Курс — от текущего сегмента маршрута
        next_progress = min(0.99, progress + 0.05)
        p2_lat, p2_lon = _interpolate_position(route_coords, next_progress)
        heading = _heading_degrees([lat, lon], [p2_lat, p2_lon])
        engine_on = True
        speed = _MIN_SPEED_KMH + (vehicle_id * 7 % 40) + random.uniform(0, _SPEED_NOISE_KMH)
    else:
        # ТС на базе — небольшое смещение от центра парковки
        base_lat = 55.7558 + (vehicle_id * 0.008)
        base_lon = 37.6173 + (vehicle_id * 0.005)
        t = now.timestamp()
        lat = round(base_lat + math.sin(t / 120) * 0.003, 6)
        lon = round(base_lon + math.cos(t / 90) * 0.003, 6)
        heading = (vehicle_id * 90) % 360
        engine_on = False
        speed = 0.0

    # Уровень топлива: убывает с прогрессом маршрута
    fuel_base = max(15.0, 90.0 - vehicle_id * 3)
    fuel_level = max(10.0, fuel_base - progress * _FUEL_CONSUMPTION_PER_KM * 100)

    # Количество спутников GPS: 8–12 в норме, иногда просадка
    satellites = 9 + (vehicle_id % 3) + (1 if random.random() > 0.8 else 0)

    return {
        # ── Идентификация ──────────────────────────────────────
        "vehicle_id": vehicle_id,
        "state_number": state_number or f"TS-{vehicle_id:04d}",
        "cargo_id": cargo_id,
        # ── Навигационные данные (Wialon IPS: lat, lon, course, speed, sats) ──
        "timestamp": now.isoformat(),
        "latitude": round(lat, 6),
        "longitude": round(lon, 6),
        "heading": round(heading, 1),
        "speed": round(min(speed, _MAX_SPEED_KMH), 1),
        "gps_satellites": satellites,
        # ── Датчики CAN-шины (Wialon IPS: params) ─────────────
        "engine_on": engine_on,
        "fuel_level": round(fuel_level, 1),
    }


def generate_vehicle_parameters(vehicle_id: int) -> dict[str, Any]:
    """
    Генерирует расшифрованные параметры CAN-шины ТС.

    Соответствует формату поля `decoded_parameters` из таблицы
    monitoring_records Supabase и справочнику `parameters`.
    Параметры: SUPPLY_VOLTAGE, FUEL_LEVEL_1, FUEL_LEVEL_2,
               GPS_SATELLITES_COUNT, ENGINE_TEMPERATURE, ODOMETER, DEVICE_STATE.
    """
    now = datetime.now(timezone.utc)
    fuel_base = max(15.0, 90.0 - vehicle_id * 3)

    return {
        "vehicle_id": vehicle_id,
        "timestamp": now.isoformat(),
        "parameters": {
            # Напряжение бортовой сети (норма: 12.4–14.8 В)
            "SUPPLY_VOLTAGE": round(12.4 + random.uniform(0, 2.4), 2),
            # Уровень топлива ДУТ-1 (бак 1), %
            "FUEL_LEVEL_1": round(max(10.0, fuel_base + random.uniform(-2, 2)), 1),
            # Уровень топлива ДУТ-2 (бак 2), %
            "FUEL_LEVEL_2": round(max(10.0, fuel_base - 5 + random.uniform(-2, 2)), 1),
            # Количество спутников GPS
            "GPS_SATELLITES_COUNT": 9 + (vehicle_id % 3),
            # Состояние устройства
            "DEVICE_STATE": "moving" if random.random() > 0.3 else "idle",
            # Температура охлаждающей жидкости, °C (норма: 80–95)
            "ENGINE_TEMPERATURE": 82 + random.randint(0, 13),
            # Одометр, км
            "ODOMETER": 100_000 + vehicle_id * 8_400 + now.minute,
        },
    }


def generate_vehicle_history(vehicle_id: int, points: int = 30) -> list[dict[str, Any]]:
    """
    Генерирует историю телеметрии за последние `points` временны́х точек.

    Воспроизводит реалистичный профиль скорости:
    - разгон → крейсерская скорость → торможение перед остановками.
    Каждая точка отстоит от следующей на 1 минуту (polling interval).
    """
    from datetime import timedelta

    history = []
    now = datetime.now(timezone.utc)
    base_speed = _MIN_SPEED_KMH + (vehicle_id * 7 % 40)
    fuel = max(20.0, 85.0 - vehicle_id * 3)

    for i in range(points):
        ts = now - timedelta(minutes=(points - i))
        # Синусоидальный профиль скорости (имитация дорожного трафика)
        speed_variation = math.sin(i * 0.4) * 15
        speed = max(0.0, min(_MAX_SPEED_KMH, base_speed + speed_variation + random.uniform(-5, 5)))
        # Расход топлива пропорционален скорости
        fuel = max(10.0, fuel - speed * _FUEL_CONSUMPTION_PER_KM / 60)

        history.append({
            "timestamp": ts.isoformat(),
            "speed": round(speed, 1),
            "fuel_level": round(fuel, 1),
            "engine_on": speed > 0,
        })

    return history
