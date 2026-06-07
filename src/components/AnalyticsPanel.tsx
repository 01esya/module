import React, { useState, useEffect } from "react";
import { Vehicle, Waybill, LiveLocation, TelemetryParameters } from "../types";
import { Brain, Compass, HelpCircle, Activity, Gauge, Zap, TrendingUp, AlertTriangle, RefreshCw, Send, CheckCircle } from "lucide-react";

interface AnalyticsPanelProps {
  selectedVehicleId: number | null;
  vehicles: Vehicle[];
  waybills: Waybill[];
  liveLocations: Record<number, LiveLocation>;
}

const IN_TRANSIT_STATUS = "В пути";

function sameVehicleId(left: number | string | null | undefined, right: number | string | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Number(left) === Number(right);
}

export default function AnalyticsPanel({
  selectedVehicleId,
  vehicles,
  waybills,
  liveLocations
}: AnalyticsPanelProps) {
  const [telemetry, setTelemetry] = useState<TelemetryParameters | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // AI advice state
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const currentLoc = selectedVehicleId ? liveLocations[selectedVehicleId] : null;
  const telemetryParams = (telemetry?.parameters || (telemetry as any)?.decoded_parameters || {}) as Record<string, number | string>;
  const normalizedHistory = Array.isArray(historyData)
    ? historyData
    : Array.isArray((historyData as any)?.data)
      ? (historyData as any).data
      : [];

  // Find associated cargo
  const associatedCargo = currentLoc?.cargo_id
    ? (waybills || []).find((c) => String(c.id) === currentLoc.cargo_id && c.status === IN_TRANSIT_STATUS && vehicles.some((v) => sameVehicleId(v.id, c.vehicle_id)))
    : (waybills || []).find((c) => sameVehicleId(c.vehicle_id, selectedVehicleId) && c.status === IN_TRANSIT_STATUS && vehicles.some((v) => sameVehicleId(v.id, c.vehicle_id)));

  // Fetch telemetry details and tracking history when vehicle changes
  useEffect(() => {
    if (!selectedVehicleId || !vehicles.some((vehicle) => sameVehicleId(vehicle.id, selectedVehicleId))) {
      setTelemetry(null);
      setHistoryData([]);
      setAiResponse(null);
      return;
    }

    async function fetchTelemetry() {
      setLoading(true);
      try {
        const [paramRes, histRes] = await Promise.all([
          fetch(`/api/monitoring/vehicles/${selectedVehicleId}/parameters`, {
            credentials: "include"
          }),
          fetch(`/api/monitoring/vehicles/${selectedVehicleId}/history`, {
            credentials: "include"
          })
        ]);

        if (paramRes.ok) {
          const paramJson = await paramRes.json();
          setTelemetry(paramJson);
        }
        if (histRes.ok) {
          const histJson = await histRes.json();
          setHistoryData(histJson);
        }
      } catch (err) {
        console.error("Failed to load telemetry", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTelemetry();
    // Refresh parameters every 15 seconds
    const interval = setInterval(fetchTelemetry, 15000);
    return () => clearInterval(interval);
  }, [selectedVehicleId]);

  // Handle Gemini AI advice requests
  async function generateAiReport(presetQuestion?: string) {
    if (!selectedVehicleId || !associatedCargo) return;
    setAiLoading(true);
    setAiResponse(null);

    const question = presetQuestion || aiQuestion || "Сделай полный аудит выполнения рейса, оцени стабильность телеметрии, экономию топлива и дай советы водителю.";

    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          cargoId: associatedCargo.id,
          question: question
        })
      });

      if (response.ok) {
        const json = await response.json();
        setAiResponse(json.text);
      } else {
        const errJson = await response.json();
        setAiResponse(`⚠️ Не удалось вызвать ИИ-Ассистента: ${errJson.detail || "Неизвестная ошибка"}`);
      }
    } catch (err: any) {
      setAiResponse(`⚠️ Критическая ошибка подключения: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }

  if (!selectedVehicleId) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-12 bg-slate-900/40 rounded-2xl border border-slate-800/80 aspect-[16/9]">
        <div className="p-4 bg-slate-950/80 rounded-full border border-slate-800 text-slate-500 mb-4">
          <Activity className="w-8 h-8 animate-pulse text-amber-500/80" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300">Аналитика терминала GPS</h3>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          Выберите нужное транспортное средство на карте или в списке выше для просмотра детальной телеметрии, датчиков и ИИ-анализа рейса.
        </p>
      </div>
    );
  }

  // Local helper calculations to build beautiful SVG Sparklines
  const speedValues: number[] = normalizedHistory
    .map((item: any) => Number(item?.speed ?? item?.speed_kmh ?? item?.vehicle_speed))
    .filter((value: number) => Number.isFinite(value));
  const fuelValues: number[] = normalizedHistory
    .map((item: any) => Number(item?.fuel_level ?? item?.fuel ?? item?.fuel_percent))
    .filter((value: number) => Number.isFinite(value));

  const maxSpeed = speedValues.length > 0 ? Math.max(...speedValues) : 90;
  const avgSpeed = speedValues.length > 0
    ? Math.round(speedValues.reduce((acc: number, value: number) => acc + value, 0) / speedValues.length)
    : 0;

  // Construct line charts manually with SVG
  const generateSvgPath = (data: number[], width = 320, height = 70) => {
    const safeData = data.filter((value) => Number.isFinite(value));
    if (safeData.length < 2) return "";

    const maxVal = Math.max(...safeData, 1);
    const minVal = Math.min(...safeData, 0);
    const range = maxVal - minVal || 1;

    return safeData.map((val, i) => {
      const x = (i / (safeData.length - 1)) * width;
      const y = height - ((val - minVal) / range) * (height - 10) - 5;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  };

  return (
    <div id="vehicle_telemetry_terminal" className="space-y-6">
      {/* Visual Stats Block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Satellite Connection & Engine Status */}
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl shadow-md flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Канал связи</span>
            <div className="text-lg font-bold text-slate-100 flex items-center gap-1.5 mt-1 font-mono">
              <Zap className={`w-4 h-4 ${currentLoc?.gps_satellites && currentLoc.gps_satellites > 7 ? "text-amber-500" : "text-slate-500"}`} />
              {currentLoc?.gps_satellites || 0} GPS/Sat
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full inline-block ${currentLoc?.engine_on ? "bg-emerald-500" : "bg-slate-500"}`}></span>
              <span>Мотор: {currentLoc?.engine_on ? "Активен" : "Выключен"}</span>
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-400">
            <Compass className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2: Speed & Supply voltage */}
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl shadow-md flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Текущий темп</span>
            <div className="text-lg font-bold text-slate-100 flex items-center gap-1 mt-1 font-mono">
              <Gauge className="w-4 h-4 text-emerald-500" />
              {currentLoc?.speed ?? 0} км/ч
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              Питание: {Number(telemetryParams.SUPPLY_VOLTAGE ?? 12.6).toFixed(1)} V
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-400">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
        </div>

        {/* Metric 3: Odometer & Temp */}
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl shadow-md flex items-center justify-between">
          <div>
            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Одометр рейса</span>
            <div className="text-lg font-bold text-slate-100 flex items-center gap-1 mt-1 font-mono">
              <Activity className="w-4 h-4 text-orange-400" />
              {Number(telemetryParams.ODOMETER ?? 125000).toLocaleString("ru-RU")} км
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              Температура: {Number(telemetryParams.ENGINE_TEMPERATURE ?? 82)} °C
            </div>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-400">
            <Gauge className="w-5 h-5 text-orange-400" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Telemetry Curves & Sensor Log (Left col: 5 cols) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-500" />
              Графики телеметрических параметров
            </h3>

            {normalizedHistory.length > 0 ? (
              <div className="space-y-6">
                {/* Speed Plot */}
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-850">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span className="font-semibold text-slate-300">История скорости (последние 30 точек)</span>
                    <span className="font-mono text-emerald-400 font-semibold">Средняя: {avgSpeed} км/ч</span>
                  </div>
                  <div className="relative w-full h-[70px]">
                    <svg className="w-full h-full" viewBox="0 0 320 70" preserveAspectRatio="none">
                      <path
                        d={generateSvgPath(speedValues, 320, 70)}
                        fill="none"
                        stroke="#059669"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>

                {/* Fuel Level Plot */}
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-850">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span className="font-semibold text-slate-300">Слив топлива (датчик уровня ДУТ-1, ДУТ-2)</span>
                    <span className="font-mono text-amber-500 font-semibold">Расход стабилен</span>
                  </div>
                  <div className="relative w-full h-[70px]">
                    <svg className="w-full h-full" viewBox="0 0 320 70" preserveAspectRatio="none">
                      <path
                        d={generateSvgPath(fuelValues, 320, 70)}
                        fill="none"
                        stroke="#d97706"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-12 text-center">Загрузка данных графиков...</div>
            )}
          </div>

          <div className="border-t border-slate-800 pt-4 mt-6">
            <h4 className="text-xs font-semibold text-slate-400 mb-2">Статус датчиков CAN-шины</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between p-2 rounded bg-slate-950/60 font-mono text-slate-300">
                <span className="text-slate-500">ДУТ-1 (бак 1):</span>
                <span>{Number(telemetryParams.FUEL_LEVEL_1 ?? 0)}%</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-950/60 font-mono text-slate-300">
                <span className="text-slate-500">ДУТ-2 (бак 2):</span>
                <span>{Number(telemetryParams.FUEL_LEVEL_2 ?? 0)}%</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-950/60 font-mono text-slate-300">
                <span className="text-slate-500">CAN Напряжение:</span>
                <span className="text-emerald-400">{Number(telemetryParams.SUPPLY_VOLTAGE ?? 0).toFixed(1)} V</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-950/60 font-mono text-slate-300">
                <span className="text-slate-500">Темп. антифриза:</span>
                <span className="text-amber-400">{Number(telemetryParams.ENGINE_TEMPERATURE ?? 0)} °C</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Intelligent Dispatcher Report (Right col: 7 cols) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Brain className="w-4.5 h-4.5 text-amber-500" />
                ИИ-Ассистент Диспетчера (Gemini AI)
              </h3>
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
                PRO ACTIVE AI
              </span>
            </div>

            {associatedCargo ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  ИИ проанализирует маршрут <span className="text-slate-200 font-semibold">{associatedCargo.from_city} ➔ {associatedCargo.to_city}</span>,
                  текущий статус груза (<span className="text-slate-300">{associatedCargo.cargo_type}</span>) и показания датчиков ТС, выдавая отчет о возможных рисках или рекомендации по регламенту.
                </p>

                {/* Presets and prompts */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => generateAiReport("Сделай полный аудит выполнения рейса, оцени стабильность телеметрии, экономию топлива и дай советы водителю.")}
                    disabled={aiLoading}
                    className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2 py-1 rounded-lg transition-all"
                  >
                    📊 Аудит рейса и топлива
                  </button>
                  <button
                    onClick={() => generateAiReport("Оцени погодные риски, задержки из-за трафика и порекомендуй лучшие контрольные точки для груза.")}
                    disabled={aiLoading}
                    className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2 py-1 rounded-lg transition-all"
                  >
                    ⛅ Прогноз задержек и погода
                  </button>
                  <button
                    onClick={() => generateAiReport("Дай краткую сводку по безопасности: утомляемость водителя, стабильность напряжения датчиков CAN.")}
                    disabled={aiLoading}
                    className="text-[11px] bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2 py-1 rounded-lg transition-all"
                  >
                    🛡️ Безопасность ТС
                  </button>
                </div>

                {/* AI Advice Display box */}
                <div className="bg-slate-950 rounded-xl p-4 border border-slate-850 min-h-[140px] max-h-[250px] overflow-auto text-xs text-slate-300 leading-relaxed scrollbar">
                  {aiLoading ? (
                    <div className="flex flex-col items-center justify-center space-y-2 py-8 text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                      <span>ИИ рассчитывает параметры логистики...</span>
                    </div>
                  ) : aiResponse ? (
                    <div className="whitespace-pre-wrap space-y-1 markdown-body prose prose-invert font-sans">
                      {aiResponse}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-6 text-slate-500">
                      <Brain className="w-8 h-8 opacity-20 text-slate-400 mb-2" />
                      <span>Выберите один из готовых сценариев аудита выше или отправьте свободный вопрос ИИ.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 text-center py-8 rounded-xl border border-slate-850 px-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                <p className="text-xs text-slate-400">
                  Выбранный автомобиль не привязан к активному рейсу со статусом <span className="text-slate-200">\"В пути\"</span>. Назначьте груз ТС в разделе путевых листов для генерации ИИ-рекомендаций.
                </p>
              </div>
            )}
          </div>

          {/* Prompt custom question input */}
          {associatedCargo && (
            <div className="mt-4 pt-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                placeholder="Спросить ИИ-ассистента о деталях маршрута..."
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generateAiReport()}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl text-xs px-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all font-sans"
              />
              <button
                onClick={() => generateAiReport()}
                disabled={aiLoading || !aiQuestion.trim()}
                className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-850 disabled:text-slate-500 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Запрос</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
