"""
API-роутер модуля ИИ-аналитики рейсов.

Интегрирует OpenRouter API для генерации аналитических отчётов 
по данным путевых листов и телеметрии ТС.
"""

from typing import Any
import httpx  

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import CurrentSession, get_current_session
from app.core.config import settings
from app.services.local_service import LocalDBError as SupabaseHTTPError, LocalDBService as SupabaseService
from app.services.telemetry_simulator import generate_vehicle_parameters

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AiAnalyzeRequest(BaseModel):
    waybill_id: int = Field(..., description="ID путевого листа для анализа")
    question: str = Field(
        "Сделай полный аудит рейса: оцени телеметрию, расход топлива и дай рекомендации.",
        min_length=5,
        max_length=1000,
    )


@router.post(
    "/analyze",
    summary="ИИ-аудит путевого листа (OpenRouter)",
    response_model=dict[str, str],
)
async def ai_analyze(
    payload: AiAnalyzeRequest,
    session: CurrentSession = Depends(get_current_session),
) -> dict[str, str]:
    """
    Генерирует аналитический отчёт по путевому листу с использованием
    OpenRouter API. Контекст запроса включает данные маршрута, груза,
    транспортного средства и текущие параметры телеметрии.
    """
    if not settings.openrouter_api_key:
        raise HTTPException(status_code=503, detail="API ключ OpenRouter не настроен")

    svc = SupabaseService()
    token = session.access_token

    # Получаем данные путевого листа
    waybill = await svc.get_waybill(payload.waybill_id, token)
    if not waybill:
        raise HTTPException(status_code=404, detail="Путевой лист не найден")  # Исправлена опечатка

    # Получаем телеметрию ТС (если ТС назначено)
    telemetry_ctx = ""
    vehicle_id = waybill.get("vehicle_id")
    if vehicle_id:
        params = generate_vehicle_parameters(vehicle_id)["parameters"]
        telemetry_ctx = (
            f"Напряжение бортсети: {params['SUPPLY_VOLTAGE']} В | "
            f"ДУТ-1: {params['FUEL_LEVEL_1']}% | "
            f"ДУТ-2: {params['FUEL_LEVEL_2']}% | "
            f"Температура двигателя: {params['ENGINE_TEMPERATURE']} °C | "
            f"Одометр: {params['ODOMETER']} км | "
            f"Спутники GPS: {params['GPS_SATELLITES_COUNT']}"
        )

    vehicle_info = ""
    if waybill.get("vehicle"):
        v = waybill["vehicle"]
        vehicle_info = f"{v.get('state_number', '')} (id={v.get('id', '')})"

    context = (
        f"Путевой лист №{waybill['id']}.\n"
        f"Маршрут: {waybill['from_city']} → {waybill['to_city']}.\n"
        f"Груз: {waybill['cargo_type']}, масса {waybill['weight']} кг.\n"
        f"Заказчик: {waybill['customer']}. Перевозчик: {waybill['carrier']}.\n"
        f"Период: {waybill['date_from']} — {waybill['date_to']}.\n"
        f"Статус: {waybill['status']}.\n"
        f"ТС: {vehicle_info}.\n"
        + (f"Телеметрия CAN: {telemetry_ctx}.\n" if telemetry_ctx else "")
    )

    try:
        # Обязательные заголовки + рекомендуемые для OpenRouter
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:8000",
            "X-Title": "CargoFlow Logistics AI",
        }
        
        api_payload = {
            "model": "openrouter/free",
            "messages": [
                {
                    "role": "system",
                    "content": f"Ты — система ИИ-аудита логистической компании CargoFlow.\nДанные рейса:\n{context}\n"
                },
                {
                    "role": "user",
                    "content": payload.question
                }
            ],
            "temperature": 0.7,
            "max_tokens": 2048
        }
        
        async with httpx.AsyncClient() as client:
            api_response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json=api_payload,
                headers=headers,
                timeout=30.0
            )
        
        if api_response.status_code == 200:
            result = api_response.json()
            return {"text": result["choices"][0]["message"]["content"]}
        else:
            raise HTTPException(
                status_code=502,
                detail=f"OpenRouter API error: {api_response.status_code} - {api_response.text}"
            )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AI Service error: {exc}",
        ) from exc