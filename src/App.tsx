import React, { useState, useEffect, useMemo } from "react";
import { Vehicle, Waybill, LiveLocation, User, Employee } from "./types";
import MapControl from "./components/MapControl";
import AnalyticsPanel from "./components/AnalyticsPanel";
import CargoForm from "./components/CargoForm";
import PersonnelGrid from "./components/PersonnelGrid";
import PrintWaybillModal from "./components/PrintWaybillModal";
import { 
  Truck, FileText, Users, Activity, Settings, LogOut, CheckCircle, 
  Clock, ShieldAlert, BadgeAlert, Plus, MapPin, Search, Grid, Eye, Edit, Trash, RefreshCw,
  Printer
} from "lucide-react";

const IN_TRANSIT_STATUS = "active";
const DELIVERED_STATUS = "completed";

const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  let url = input;
  if (typeof input === "string" && input.startsWith("/api")) {
    url = `http://localhost:8000${input}`;
  }
  return fetch(url, { credentials: "include", ...init });
};

function sameVehicleId(left: number | string | null | undefined, right: number | string | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Number(left) === Number(right);
}

function findVehicleById(vehicles: Vehicle[], vehicleId: number | string | null | undefined) {
  return vehicles.find((vehicle) => sameVehicleId(vehicle.id, vehicleId));
}

function hasValidActiveVehicle(cargo: Waybill, vehicles: Vehicle[]) {
  return cargo.status === IN_TRANSIT_STATUS && Boolean(findVehicleById(vehicles, cargo.vehicle_id));
}

function getVehicleLabel(vehicle: Vehicle | null | undefined) {
  const model = vehicle?.model?.trim();
  const stateNumber = vehicle?.state_number?.trim();

  if (model && stateNumber) return `${model} (${stateNumber})`;
  if (model) return model;
  if (stateNumber) return stateNumber;
  return vehicle?.id ? `ТС #${vehicle.id}` : "ТС не назначено";
}

export default function App() {
  // Authentication states
  const [user, setUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState("test@ends.ru");
  const [loginPassword, setLoginPassword] = useState("fdp-swf-AdZ-RB7");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active terminal module tab
  const [activeTab, setActiveTab] = useState<"dashboard" | "loads" | "map" | "telemetry" | "personnel" | "settings">("dashboard");

  // Core application lists from fullstack endpoints
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [liveLocations, setLiveLocations] = useState<Record<number, LiveLocation>>({});
  const [isDemoMode, setIsDemoMode] = useState(false);
  const showDemoBadge = useMemo(() => {
    if (!isDemoMode) return false;
    if (vehicles.length === 0) return false;

    const vehicleIds = vehicles.map((vehicle) => Number(vehicle.id));
    const hasOnlyLegacyDemoVehicles = vehicleIds.every((id) => id >= 1 && id <= 4);
    return hasOnlyLegacyDemoVehicles;
  }, [isDemoMode, vehicles]);

  // Interaction handlers
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWaybill, setEditingWaybill] = useState<Waybill | null>(null);
  const [printWaybillTarget, setPrintWaybillTarget] = useState<Waybill | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const validActiveWaybills = useMemo(
    () => waybills.filter((cargo) => hasValidActiveVehicle(cargo, vehicles)),
    [waybills, vehicles]
  );

  // Simulated live clocks
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check current session from HttpOnly cookies on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await apiFetch("/api/auth/me");
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
        }
      } catch (err) {
        console.error("Session check failed", err);
      }
    }
    checkSession();
  }, []);

  // Fetch metrics data when authenticated or refreshTrigger updates
  useEffect(() => {
    async function loadAllData() {
      try {
        const vehRes = await apiFetch("/api/monitoring/vehicles");

        if (vehRes.ok) {
          const vehs = await vehRes.json();
          const dataMode = vehRes.headers.get("X-CargoFlow-Data-Mode") || "api";
          const apiVehicles = Array.isArray(vehs) ? vehs : [];

          setIsDemoMode(dataMode === "demo" || dataMode === "fallback");
          setVehicles(apiVehicles);
          setLiveLocations((prev) => Object.fromEntries(
            Object.entries(prev).filter(([vehicleId]) => apiVehicles.some((v: Vehicle) => sameVehicleId(v.id, vehicleId)))
          ));

          apiVehicles.forEach((v: Vehicle) => {
            void fetchLocation(v.id, apiVehicles);
          });
        } else if (vehRes.status === 401 || vehRes.status === 403) {
          setIsDemoMode(false);
          setVehicles([]);
          setLiveLocations({});
        }

        const [cargRes, empRes] = await Promise.all([
          apiFetch("/api/waybills"),
          apiFetch("/api/employees")
        ]);
        if (cargRes.ok) setWaybills(await cargRes.json());
        if (empRes.ok) setEmployees(await empRes.json());
      } catch (err) {
        console.error("Failed to load backend metrics", err);
      }
    }

    loadAllData();
  }, [refreshTrigger]);

  // Periodic coordinates state update every 12 seconds for every assigned vehicle
  useEffect(() => {
    if (vehicles.length === 0) return;

    const interval = setInterval(() => {
      vehicles.forEach((v) => {
        void fetchLocation(v.id, vehicles);
      });
    }, 12000);

    return () => clearInterval(interval);
  }, [vehicles]);

  async function fetchLocation(vehicleId: number, sourceVehicles = vehicles) {
    try {
      const res = await apiFetch(`/api/monitoring/vehicles/${vehicleId}/location`);
      if (res.ok) {
        const data = await res.json();
        const vehicle = findVehicleById(sourceVehicles, data.vehicle_id ?? vehicleId);
        const normalizedVehicleId = Number(data.vehicle_id ?? vehicleId);
        const normalizedLocation = {
          ...data,
          vehicle_id: normalizedVehicleId,
          state_number: vehicle?.state_number || data.state_number || `ТС #${normalizedVehicleId}`
        };
        setLiveLocations((prev) => ({
          ...prev,
          [normalizedVehicleId]: normalizedLocation
        }));
      }
    } catch (err) {
      console.error("Tracking location failed for vehicle", vehicleId);
    }
  }

  // Auth Submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setRefreshTrigger((prev) => prev + 1);
      } else {
        const errData = await response.json();
        setLoginError(errData.detail || "Неверный логин или пароль");
      }
    } catch (err) {
      setLoginError("Серверная ошибка авторизации. Убедитесь, что Express запущен");
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout request failed", err);
    }
    setUser(null);
  };

  // Cargo Actions helpers
  const handleSaveCargo = async (payload: Omit<Waybill, "id" | "status">): Promise<boolean> => {
    try {
      const url = editingWaybill ? `/api/waybills/${editingWaybill.id}` : "/api/waybills";
      const method = editingWaybill ? "PATCH" : "POST";

      const res = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setRefreshTrigger((prev) => prev + 1);
        setEditingWaybill(null);
        return true;
      }
    } catch (err) {
      console.error("Save cargo waybill failed", err);
    }
    return false;
  };

  const handleUpdateCargoStatus = async (waybillId: string, status: string) => {
    try {
      const res = await apiFetch(`/api/waybills/${waybillId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err) {
      console.error("Update status waybill failed", err);
    }
  };

  const handlePrintWaybill = (cargo: Waybill) => {
    setPrintWaybillTarget(cargo);
  };

  const __deprecated_print = (cargo: Waybill) => {
    const vehicle = findVehicleById(vehicles, cargo.vehicle_id) || null;
    
    // Create iframe securely to render print layout without bloating current DOM
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const htmlContent = `
      <html>
        <head>
          <title>Путевой лист № ПЛ-${cargo.id}</title>
          <style>
            @media print {
              @page { size: A4 portrait; margin: 15mm; }
              body { margin: 0; background-color: #fff; color: #000; }
            }
            body {
              font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
              color: #000;
              background-color: #fff;
              font-size: 11px;
              line-height: 1.4;
              margin: 20px;
            }
            .border-box {
              border: 1px solid #1e293b;
              padding: 12px;
              margin-bottom: 12px;
              border-radius: 4px;
            }
            .header-info {
              display: flex;
              justify-content: space-between;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
              margin-bottom: 15px;
            }
            .org-stamp {
              border: 2px solid #000;
              padding: 6px 10px;
              text-align: center;
              font-weight: bold;
              font-size: 10px;
              border-radius: 3px;
              max-width: 250px;
            }
            .document-title {
              text-align: center;
              margin: 20px 0;
            }
            .document-title h1 {
              font-size: 16px;
              margin: 0 0 4px 0;
              text-transform: uppercase;
              font-weight: bold;
              letter-spacing: 0.5px;
            }
            .document-title p {
              margin: 0;
              font-size: 11px;
              color: #333;
            }
            .section-title {
              font-size: 12px;
              font-weight: bold;
              border-bottom: 1px solid #000;
              padding-bottom: 2px;
              margin: 15px 0 8px 0;
              text-transform: uppercase;
              color: #111;
            }
            .field-row {
              display: flex;
              margin-bottom: 5px;
              border-bottom: 1px dotted #ccc;
              padding-bottom: 2px;
            }
            .field-label {
              width: 180px;
              font-weight: bold;
              color: #333;
            }
            .field-value {
              flex: 1;
              color: #000;
            }
            .table-sheet {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
            }
            .table-sheet th, .table-sheet td {
              border: 1px solid #000;
              padding: 5px 8px;
              text-align: left;
            }
            .table-sheet th {
              background-color: #f1f5f9;
              font-size: 10px;
              text-transform: uppercase;
              font-weight: bold;
            }
            .signatures-row {
              margin-top: 35px;
              display: flex;
              justify-content: space-between;
            }
            .signature-block {
              width: 30%;
              text-align: center;
            }
            .signature-line {
              border-top: 1px solid #000;
              margin-top: 25px;
              font-size: 9px;
              color: #444;
            }
            .official-footer {
              text-align: center;
              margin-top: 40px;
              font-size: 9px;
              color: #666;
              border-top: 1px solid #eee;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header-info">
            <div>
              <strong>Информационная система КАРГОФЛОУ</strong><br/>
              Выгрузка путевых листов в формате PDF/A
            </div>
            <div class="org-stamp">
              ООО "КАРГОФЛОУ ТРАНС"<br/>
              Лицензия на автоперевозки № С-039459<br/>
              Действительна до 2030 г.
            </div>
          </div>

          <div class="document-title">
            <h1>ПУТЕВОЙ ЛИСТ ГРУЗОВОГО АВТОМОБИЛЯ</h1>
            <p>Серия КФ-ЭПЛ • Регистрационный номер № <strong>ПЛ-${cargo.id}</strong></p>
            <p style="margin-top: 3px; font-weight: bold;">Период действия: с ${cargo.planned_departure} по ${cargo.planned_arrival}</p>
          </div>

          <div class="section-title">1. Реквизиты юридического лица и заказчика</div>
          <div class="border-box">
            <div class="field-row">
              <span class="field-label">Организация-перевозчик:</span>
              <span class="field-value">${cargo.carrier || 'ООО "КАРГОФЛОУ ТРАНС"'} (ИНН 7705439520)</span>
            </div>
            <div class="field-row">
              <span class="field-label">Заказчик (Отправитель):</span>
              <span class="field-value">${cargo.organization_id}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Пункт погрузки груза:</span>
              <span class="field-value">г. ${cargo.waybill_number} (Центральный Склад)</span>
            </div>
            <div class="field-row">
              <span class="field-label">Пункт разгрузки груза:</span>
              <span class="field-value">г. ${cargo.notes} (Адрес указан в ТТН)</span>
            </div>
          </div>

          <div class="section-title">2. Сведения о транспортном средстве</div>
          <div class="border-box">
            <div class="field-row">
              <span class="field-label">Марка/Модель автоцистерны:</span>
              <span class="field-value">${vehicle ? vehicle.model : "Не назначено"}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Государственный рег. знак:</span>
              <span class="field-value" style="font-family: monospace; font-weight: bold;">${vehicle ? vehicle.state_number : "Не назначено"}</span>
            </div>
            <div class="field-row">
              <span class="field-label">Показания одометра (Выезд):</span>
              <span class="field-value">143,290 км</span>
            </div>
            <div class="field-row">
              <span class="field-label">Предрейсовый контроль ТС:</span>
              <span class="field-value">Выпуск разрешен. ТС полностью исправно.</span>
            </div>
          </div>

          <div class="section-title">3. Сведения о грузе и водителе</div>
          <table class="table-sheet">
            <thead>
              <tr>
                <th>Наименование груза</th>
                <th>Вес брутто (кг)</th>
                <th>Статус перевозки</th>
                <th>Условия транспортировки</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${cargo.waybill_number}</strong></td>
                <td><strong>${cargo.odometer_start.toLocaleString()}</strong></td>
                <td>${cargo.status}</td>
                <td>Стандартный температурный режим</td>
              </tr>
            </tbody>
          </table>

          <div class="border-box" style="margin-top: 10px;">
            <div class="field-row">
              <span class="field-label">Водитель-экспедитор:</span>
              <span class="field-value">Штатный водитель-экспедитор группы КАРГОФЛОУ</span>
            </div>
            <div class="field-row">
              <span class="field-label">Предрейсовый медосмотр:</span>
              <span class="field-value">Пройден. Медработник: Сидорова А.М. Допущен к рейсу.</span>
            </div>
          </div>

          <div class="section-title">4. Исполнение и подписи сторон</div>
          <p style="font-size: 10px; color: #333; margin-bottom: 25px;">
            Выезд автомобиля разрешен. Время выезда, возвращения и показания приборов фиксируются в автоматическом журнале телеметрии GPS/ГЛОНАСС.
          </p>

          <div class="signatures-row">
            <div class="signature-block">
              <div class="signature-line">Диспетчер службы логистики</div>
            </div>
            <div class="signature-block">
              <div class="signature-line">Выпустил механик КТП</div>
            </div>
            <div class="signature-block">
              <div class="signature-line">Водитель-экспедитор принял</div>
            </div>
          </div>

          <div class="official-footer">
            Электронный документ № ПЛ-${cargo.id}. Сгенерирован автоматически логистической системой КАРГОФЛОУ. <br/>
            Заверен усиленной ЭЦП ООО "КАРГОФЛОУ ТРАНС". Дата генерации: ${new Date().toLocaleDateString("ru-RU")}
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.frameElement.parentNode.removeChild(window.frameElement);
              }, 1000);
            };
          </script>
        </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();
  };

  // Personnel Actions helpers
  const handleCreateEmployee = async (name: string, role: string, phone: string): Promise<boolean> => {
    try {
      const res = await apiFetch("/api/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, role, phone })
      });

      if (res.ok) {
        setRefreshTrigger((prev) => prev + 1);
        return true;
      }
    } catch (err) {
      console.error("Add employee failed", err);
    }
    return false;
  };

  const handleDeleteEmployee = async (id: string): Promise<boolean> => {
    if (!confirm("Вы уверены, что хотите удалить сотрудника из штата компании?")) return false;
    try {
      const res = await apiFetch(`/api/employees/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setRefreshTrigger((prev) => prev + 1);
        return true;
      }
    } catch (err) {
      console.error("Delete employee failed", err);
    }
    return false;
  };

  // Reset database back to default seed helper
  const handleResetDB = async () => {
    if (!confirm("Внимание! Это полностью сбросит базу данных путевых листов и персонала до исходных образцов для демонстрации.")) return;
    try {
      const res = await apiFetch("/api/admin/reset-database", {
        method: "POST"
      });
      if (res.ok) {
        alert("База данных успешно сброшена до исходных значений!");
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err) {
      alert("Сбой сброса");
    }
  };

  // Derived Waybills Counters
  const pendingWaybills = waybills.filter((c) => c.status === "draft").length;
  const activeWaybills = waybills.filter((c) => c.status === "active").length;
  const deliveredWaybills = waybills.filter((c) => c.status === "completed").length;

  // Telemetry cautions counters
  const alertFeed: string[] = [];
  (Object.values(liveLocations) as LiveLocation[]).forEach((loc) => {
    if (loc.gps_satellites < 8) {
      alertFeed.push(`⚠️ Канал связи ТС ${loc.state_number} нестабилен (${loc.gps_satellites} спутников)`);
    }
    if (loc.fuel_level < 20) {
      alertFeed.push(`🚨 Критический уровень топлива ТС ${loc.state_number} (${loc.fuel_level}%)`);
    }
    if (loc.speed > 85) {
      alertFeed.push(`⚡ Превышение скорости ТС ${loc.state_number} (${loc.speed} км/ч)`);
    }
  });

  if (!user) {
    // Elegant dispatcher high density theme login
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4 font-sans selection:bg-[#FFD600] selection:text-black">
        <div id="login_card" className="w-full max-w-sm bg-black border border-white/5 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Accent yellow strip */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#FFD600]"></div>

          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-[#FFD600] text-black rounded-xl flex items-center justify-center mx-auto mb-4 font-semibold shadow-md shadow-[#FFD600]/20">
              <Truck className="w-6 h-6" strokeWidth={2.5} />
            </div>
            <h1 className="text-lg font-black text-white tracking-widest uppercase">CargoFlow Terminal</h1>
            <p className="text-[10px] text-slate-500 uppercase mt-1 font-mono tracking-wider">Логистический Диспетчерский терминал</p>
          </div>

          {loginError && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl p-3 text-[11px] leading-relaxed text-center mb-5">
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Email Диспетчера</label>
              <input
                required
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl text-xs px-3.5 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#FFD600] focus:ring-1 focus:ring-[#FFD600] transition-all font-mono"
                placeholder="test@ends.ru"
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Пароль системы</label>
              <input
                required
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl text-xs px-3.5 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#FFD600] focus:ring-1 focus:ring-[#FFD600] transition-all font-mono"
                placeholder="••••••••"
              />
            </div>

            {/* Default test credentials auto hint logic */}
            <div className="bg-white/5 rounded-xl border border-white/5 p-3 text-[10px] text-slate-400 leading-relaxed font-sans">
              💡 <strong className="text-white">Тестовый шаблон системы:</strong><br/>
              Вы можете использовать данные по умолчанию для входа.
            </div>

            <button
              type="submit"
              className="w-full bg-[#FFD600] hover:bg-[#ffe042] active:scale-[0.98] text-black font-black text-[11px] py-3 px-4 rounded-xl transition-all cursor-pointer shadow-lg shadow-[#FFD600]/15 uppercase tracking-wider"
            >
              Войти в терминал
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabTitles = {
    dashboard: "Панель управления",
    loads: "Согласование путевых листов",
    map: "Интерактивная GPS карта",
    telemetry: "Телеметрия ТС & ИИ",
    personnel: "Штат компании",
    settings: "Конфигурация системы"
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row selection:bg-[#FFD600] selection:text-black">
      {/* Left Sidebar Menu */}
      <aside className="w-full md:w-64 bg-[#121212] flex flex-col border-r border-white/5 flex-shrink-0 relative">
        <div className="h-16 flex items-center px-6 gap-3 border-b border-white/5 bg-black/20">
          <div className="w-8 h-8 rounded-lg bg-[#FFD600] flex items-center justify-center text-black font-black">
            <Truck className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wider text-white">CARGOFLOW</h2>
            <p className="text-[9px] text-[#FFD600] tracking-widest uppercase font-mono font-bold">TERMINAL V2.6</p>
          </div>
        </div>

        {/* Sidebar Tabs */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 px-3 block mb-3 font-mono">
            Диспетчерский пульт
          </span>

          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 px-3.5 h-10 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-[#FFD600] text-black shadow-md shadow-[#FFD600]/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Панель управления</span>
          </button>

          <button
            onClick={() => setActiveTab("loads")}
            className={`w-full flex items-center gap-3 px-3.5 h-10 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
              activeTab === "loads"
                ? "bg-[#FFD600] text-black shadow-md shadow-[#FFD600]/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Путевые листы</span>
            {pendingWaybills + activeWaybills > 0 && (
              <span className={`ml-auto font-black font-mono text-[9px] px-2 py-0.5 rounded-full ${
                activeTab === "loads" ? "bg-black text-[#FFD600]" : "bg-[#FFD600] text-black"
              }`}>
                {pendingWaybills + activeWaybills}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("map")}
            className={`w-full flex items-center gap-3 px-3.5 h-10 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
              activeTab === "map"
                ? "bg-[#FFD600] text-black shadow-md shadow-[#FFD600]/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Интерактивная карта</span>
          </button>

          <button
            onClick={() => setActiveTab("telemetry")}
            className={`w-full flex items-center gap-3 px-3.5 h-10 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
              activeTab === "telemetry"
                ? "bg-[#FFD600] text-black shadow-md shadow-[#FFD600]/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Телеметрия & ИИ</span>
          </button>

          <button
            onClick={() => setActiveTab("personnel")}
            className={`w-full flex items-center gap-3 px-3.5 h-10 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
              activeTab === "personnel"
                ? "bg-[#FFD600] text-black shadow-md shadow-[#FFD600]/20"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Штат компании</span>
          </button>

          <div className="border-t border-white/5 pt-3 mt-4">
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3.5 h-10 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
                activeTab === "settings"
                  ? "bg-[#FFD600] text-black shadow-md shadow-[#FFD600]/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Администрирование</span>
            </button>
          </div>
        </nav>

        {/* User profile widget inside sidebar */}
        <div className="p-4 border-t border-white/5 bg-black/10">
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#FFD600] text-black font-black flex items-center justify-center text-xs">
              {user.full_name?.substring(0, 2).toUpperCase() || "ДП"}
            </div>
            <div className="overflow-hidden flex-grow select-none">
              <p className="text-xs font-bold text-white truncate">{user.full_name}</p>
              <p className="text-[9px] text-[#FFD600] uppercase font-black tracking-widest">{user.role}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1 hover:bg-white/10 rounded-lg text-rose-500 hover:text-rose-400 transition-all cursor-pointer"
              title="Выйти"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Header Panel */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-30 shadow-xs">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-wider">КОНСОЛЬ УПРАВЛЕНИЯ</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-black uppercase tracking-wider">{tabTitles[activeTab]}</span>
          </div>

          {/* Real-time system clocks & user profile status */}
          <div className="flex items-center gap-4 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 px-3 font-mono text-slate-600 flex items-center gap-2 select-none">
              <Clock className="w-3.5 h-3.5 text-[#FFD600] animate-pulse stroke-[2.5]" />
              <span>{currentTime.toLocaleDateString("ru-RU")}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-900 font-black">{currentTime.toLocaleTimeString("ru-RU")}</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-100 font-mono select-none">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </div>
              GPS-СЕРВЕР: АКТИВЕН
            </div>
            {showDemoBadge && (
              <div className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100 font-mono select-none">
                DEMO DATA
              </div>
            )}
          </div>
        </header>

        {/* Content Modules Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Active Tab: Overview Dashboard */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Alert state feed */}
              {alertFeed.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 text-xs leading-relaxed text-rose-800">
                  <BadgeAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />
                  <div className="space-y-1">
                    <span className="font-extrabold uppercase tracking-wide text-rose-900">Предупреждения телеметрии автопарка:</span>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {alertFeed.slice(0, 4).map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Stats Widgets */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs transition-transform hover:shadow-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-black tracking-widest block">Путевые листы всего</span>
                  <span className="text-3xl font-black text-slate-900 mt-1 block font-mono">
                    {waybills.length}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
                    Доставлено: {deliveredWaybills} Р.
                  </span>
                </div>

                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs transition-transform hover:shadow-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-black tracking-widest block">Рейсов в пути</span>
                  <span className="text-3xl font-black text-[#FFD600] mt-1 block font-mono bg-black inline-block px-2 rounded-sm select-none">
                    {activeWaybills}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 bg-[#FFD600] rounded-full inline-block animate-pulse"></span>
                    В пути сейчас
                  </span>
                </div>

                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-black tracking-widest block">Автопарк компании</span>
                  <span className="text-3xl font-black text-slate-900 mt-1 block font-mono">
                    {vehicles.length}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-1">
                    Активные GPS-треккеры
                  </span>
                </div>

                <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
                  <span className="text-slate-400 text-[10px] uppercase font-black tracking-widest block">Штат сотрудников</span>
                  <span className="text-3xl font-black text-slate-950 mt-1 block font-mono">
                    {employees.length}
                  </span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-1">
                    Внесенные водители и персонал
                  </span>
                </div>
              </div>

              {/* Bento Dual-layout with Map & Telemetry widget */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                  {/* Map integrated */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider font-mono">Интерактивный радар трекинга GPS</span>
                      <span className="text-[9px] bg-[#FFD600] text-black font-black px-1.5 py-0.5 rounded uppercase">Live</span>
                    </div>
                    <MapControl
                      vehicles={vehicles}
                      waybills={validActiveWaybills}
                      selectedVehicleId={selectedVehicleId}
                      onSelectVehicle={(id) => {
                        setSelectedVehicleId(id);
                        if (id) setActiveTab("telemetry");
                      }}
                      liveLocations={liveLocations}
                    />
                  </div>

                  {/* Operational Registry checklist */}
                  <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#FFD600]" strokeWidth={2.5} />
                        Оперативная ведомость (В пути / Ожидает)
                      </h2>
                      <button onClick={() => setActiveTab("loads")} className="text-[11px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 hover:underline">
                        ВСЕ ПУТЕВЫЕ ЛИСТЫ ➔
                      </button>
                    </div>

                    <div className="space-y-2">
                      {waybills.filter(c => c.status !== DELIVERED_STATUS).map((cargo) => {
                        const vehicle = findVehicleById(vehicles, cargo.vehicle_id) || null;
                        const isInvalidActiveCargo = cargo.status === IN_TRANSIT_STATUS && !vehicle;
                        const loc = vehicle ? liveLocations[Number(vehicle.id)] : null;

                        return (
                          <div key={cargo.id} className="bg-slate-50/60 border border-slate-200 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-slate-900">{cargo.waybill_number}</span>
                                <span className="text-slate-400 font-mono text-[9px]">ID: {cargo.id}</span>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${
                                  isInvalidActiveCargo
                                    ? "bg-rose-50 text-rose-700 border border-rose-100"
                                    : cargo.status === IN_TRANSIT_STATUS ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/25"
                                }`}>
                                  {isInvalidActiveCargo ? "Ошибка данных" : cargo.status}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-1 font-sans">
                                Пункт: {cargo.waybill_number} ➔ {cargo.notes} | Заказчик: {cargo.organization_id} | ТС: {vehicle ? getVehicleLabel(vehicle) : "Не назначено"}
                              </div>
                              {isInvalidActiveCargo && (
                                <div className="text-rose-600 mt-1 font-bold">
                                  ТС не найдено в API. Рейс не участвует в карте, ИИ и телеметрии. Переназначьте ТС через правку путевого листа.
                                </div>
                              )}
                            </div>

                            {/* Telemetry live values */}
                            {loc && (
                              <div className="bg-black/90 text-white rounded-lg p-2 flex items-center gap-4 text-[10px] font-mono select-none">
                                <div>СКОРОСТЬ: <span className="text-[#FFD600] font-black">{loc.speed} КМ/Ч</span></div>
                                <div>ТОПЛИВО: <span className="text-[#FFD600] font-black">{loc.fuel_level}%</span></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sidebar telemetry controller card inside dashboard */}
                <div className="col-span-1 space-y-6">
                  <div className="bg-[#121212] text-white rounded-xl p-5 border border-white/5 shadow-md flex flex-col justify-between h-full">
                    <div>
                      <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest font-mono">ТЕРМИНАЛ GPS-ОБЪЕКТА</span>
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FFD600] animate-pulse"></span>
                      </div>

                      {selectedVehicleId ? (
                        (() => {
                          const veh = findVehicleById(vehicles, selectedVehicleId);
                          const loc = liveLocations[selectedVehicleId];

                          if (!veh) return null;

                          return (
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-[#FFD600]">
                                  <Truck className="w-6 h-6" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-black text-white">{veh.model}</h3>
                                  <p className="text-[10px] text-[#FFD600] font-bold font-mono tracking-widest bg-white/5 px-2 py-0.5 rounded inline-block mt-0.5">{veh.state_number}</p>
                                </div>
                              </div>

                              <div className="space-y-2 pt-3 border-t border-white/5">
                                <div className="flex justify-between text-xs font-mono">
                                  <span className="text-slate-500">ИНДИКАТОР ТРЕКА:</span>
                                  <span className="text-emerald-400 font-bold">ОНЛАЙН</span>
                                </div>
                                <div className="flex justify-between text-xs font-mono">
                                  <span className="text-slate-500">ТЕКУЩАЯ СКОРОСТЬ:</span>
                                  <span className="text-white font-extrabold">{loc ? `${loc.speed} км/ч` : "0 км/ч"}</span>
                                </div>
                                <div className="flex justify-between text-xs font-mono">
                                  <span className="text-slate-500">ЗАКАЗ НА РЕЙС:</span>
                                  <span className="text-white truncate max-w-[130px] font-sans">
                                    {validActiveWaybills.find(c => sameVehicleId(c.vehicle_id, veh.id))?.waybill_number || "Свободен"}
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs font-mono">
                                  <span className="text-slate-500">УРОВЕНЬ ТОПЛИВА:</span>
                                  <span className="text-[#FFD600] font-bold">{loc ? `${loc.fuel_level}%` : "100%"}</span>
                                </div>
                                <div className="flex justify-between text-xs font-mono">
                                  <span className="text-slate-500">СПУТНИКИ GPS:</span>
                                  <span className="text-white">{loc ? `${loc.gps_satellites} SAT` : "Свободно"}</span>
                                </div>
                              </div>

                              {loc && (
                                <div className="bg-black p-3 rounded-lg border border-white/5 leading-relaxed font-mono text-[10px] text-slate-400">
                                  <p className="text-[#FFD600] font-black uppercase text-[9px] tracking-wider mb-2">ПОСЛЕДНИЕ КООРДИНАТЫ</p>
                                  <p>ШИРОТА: {loc.latitude.toFixed(6)}°N</p>
                                  <p>ДОЛГОТА: {loc.longitude.toFixed(6)}°E</p>
                                  <p className="mt-2 text-[9px] text-slate-500">ОБНОВЛЕНО: {new Date(loc.timestamp).toLocaleTimeString()}</p>
                                </div>
                              )}

                              <button
                                onClick={() => setActiveTab("telemetry")}
                                className="w-full bg-[#FFD600] hover:bg-[#ffe042] text-black font-black uppercase text-[10px] tracking-widest py-2.5 rounded-lg font-mono transition-transform"
                              >
                                Подробный ИИ-анализ ➔
                              </button>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="text-center py-10 space-y-3">
                          <p className="text-xs text-slate-500 font-medium">Объект контроля не выбран</p>
                          <p className="text-[10px] text-slate-600 leading-relaxed">Выберите транспортное средство на интерактивной карте или в таблице, чтобы активировать телеметрию</p>
                          <div className="pt-2">
                            <select
                              onChange={(e) => setSelectedVehicleId(e.target.value === "" ? null : Number(e.target.value))}
                              className="bg-black border border-white/10 text-xs text-[#FFD600] p-2 rounded-lg font-mono w-full"
                            >
                              <option value="">-- ВЫБРАТЬ ИЗ СПИСКА --</option>
                              {vehicles.map(v => (
                                <option key={v.id} value={v.id}>{getVehicleLabel(v)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/5 mt-4 text-[9px] text-slate-500 font-mono leading-relaxed">
                      КАРГОФЛОУ GPS ТЕРМИНАЛ. ПЕРЕДАЧА ДАННЫХ ЗАШИФРОВАНА. RECV BY HOST.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Tab: Cargo / Waybills directory */}
          {activeTab === "loads" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 p-5 rounded-xl">
                <div>
                  <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Реестр и согласование путевых листов</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Операционное реестровое обслуживание ведомостей перевозок грузов компании</p>
                </div>

                <button
                  onClick={() => {
                    setEditingWaybill(null);
                    setIsFormOpen(true);
                  }}
                  className="bg-[#FFD600] hover:bg-[#ffe042] text-black text-[11px] font-black uppercase tracking-wider h-10 px-5 rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-[#FFD600]/10 select-none cursor-pointer"
                >
                  Выписать новый лист
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              {/* Waybills Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {waybills.map((cargo) => {
                  const vehicle = findVehicleById(vehicles, cargo.vehicle_id) || null;
                  const isInvalidActiveCargo = cargo.status === IN_TRANSIT_STATUS && !vehicle;

                  return (
                    <div key={cargo.id} className="bg-white border border-slate-200 p-5 rounded-xl flex flex-col justify-between hover:border-slate-350 transition-all text-xs shadow-xs">
                      <div>
                        <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-2.5">
                          <div>
                            <span className="text-[9px] text-slate-400 font-mono font-black uppercase block">ВЕДОМОСТЬ ID: {cargo.id}</span>
                            <h3 className="text-sm font-black text-slate-900 tracking-tight mt-0.5">{cargo.waybill_number}</h3>
                          </div>

                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                              isInvalidActiveCargo
                                ? "bg-rose-50 text-rose-800 border-rose-100"
                                : cargo.status === IN_TRANSIT_STATUS
                                ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                                : cargo.status === "draft"
                                ? "bg-amber-50 text-amber-800 border-amber-100"
                                : "bg-slate-50 text-slate-500 border-slate-100"
                            }`}>
                              {isInvalidActiveCargo ? "Ошибка данных" : cargo.status}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-slate-600">
                          <div className="flex justify-between">
                            <span className="text-slate-400 uppercase text-[9px] font-black tracking-wider">Маршрут:</span>
                            <span className="font-extrabold text-slate-900">{cargo.waybill_number} ➔ {cargo.notes}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 uppercase text-[9px] font-black tracking-wider">Вес брутто:</span>
                            <span className="font-mono text-slate-900 font-bold">{cargo.odometer_start.toLocaleString()} кг</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 uppercase text-[9px] font-black tracking-wider">Заказчик:</span>
                            <span className="truncate max-w-[150px] font-medium text-slate-900">{cargo.organization_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 uppercase text-[9px] font-black tracking-wider">Перевозчик:</span>
                            <span className="truncate max-w-[150px] text-slate-900">{cargo.carrier}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400 uppercase text-[9px] font-black tracking-wider">Сроки:</span>
                            <span className="font-mono text-slate-900 font-bold">{cargo.planned_departure} — {cargo.planned_arrival}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 uppercase text-[9px] font-black tracking-wider">Закрепленное ТС:</span>
                            <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded text-[10px]">
                              {vehicle ? getVehicleLabel(vehicle) : isInvalidActiveCargo ? "ТС не найдено в API" : "Не назначено"}
                            </span>
                          </div>
                          {isInvalidActiveCargo && (
                            <div className="flex justify-between items-center text-rose-600">
                              <span className="text-rose-500 uppercase text-[9px] font-black tracking-wider">Ошибка:</span>
                              <span className="font-bold">Рейс в пути без валидного ТС. Переназначьте ТС через правку.</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Waybill Status Interactive Triggers */}
                      <div className="border-t border-slate-100 pt-3.5 mt-4 flex justify-between items-center gap-3">
                        {/* Status switcher */}
                        <div className="flex gap-1.5 items-center">
                          <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">Изменить:</span>
                          <select
                            value={cargo.status}
                            onChange={(e) => handleUpdateCargoStatus(cargo.id, e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-800 font-black px-2 py-1 rounded text-[10px] cursor-pointer"
                          >
                            <option value="Ожидают">Ожидают</option>
                            <option value="В пути">В пути</option>
                            <option value="Доставлен">Доставлен</option>
                          </select>
                        </div>

                        {/* Edit card & print options */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handlePrintWaybill(cargo)}
                            className="text-white hover:bg-indigo-750 bg-indigo-600 p-1.5 px-3 rounded-lg transition-all flex items-center gap-1 cursor-pointer font-black text-[10px] uppercase tracking-wider shadow-sm"
                            title="Печать путевого листа в PDF"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Печать PDF</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingWaybill(cargo);
                              setIsFormOpen(true);
                            }}
                            className="text-slate-800 hover:text-black bg-[#FFD600] p-1.5 px-3 rounded-lg transition-all flex items-center gap-1 cursor-pointer font-black text-[10px] uppercase tracking-wider"
                            title="Редактировать параметры"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Правка</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Toggle new cargo Modal Form */}
              {isFormOpen && (
                <CargoForm
                  vehicles={vehicles}
                  employees={employees}
                  onSave={handleSaveCargo}
                  editingWaybill={editingWaybill}
                  onClose={() => {
                    setIsFormOpen(false);
                    setEditingWaybill(null);
                  }}
                />
              )}
            </div>
          )}

          {/* Active Tab: Interactive GPS Tracking map */}
          {activeTab === "map" && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-xs font-black uppercase text-slate-800 tracking-wider">ИНТЕРАКТИВНЫЙ РАДАР И GPS ТРЕКИНГ ПОЛНОЭКРАННЫЙ</span>
                  <p className="text-[10px] text-slate-400">Частота опроса датчиков: 12 секунд</p>
                </div>
                <MapControl
                  vehicles={vehicles}
                  waybills={validActiveWaybills}
                  selectedVehicleId={selectedVehicleId}
                  onSelectVehicle={setSelectedVehicleId}
                  liveLocations={liveLocations}
                />
              </div>
            </div>
          )}

          {/* Active Tab: Telemetry & Gemini IA assistant */}
          {activeTab === "telemetry" && (
            <div className="space-y-6 animate-[fadeIn_0.2s_ease-out]">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full overflow-hidden">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-black text-slate-900 uppercase truncate">Метрики телеметрии и ИИ-Аудит рисков</h2>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">Исследование показателей телеметрии и аудит рисков с помощью Gemini Pro</p>
                </div>

                <div className="flex items-center gap-2 select-none w-full md:w-auto flex-shrink-0">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider flex-shrink-0">Объект мониторинга:</span>
                  <select
                    value={selectedVehicleId || ""}
                    onChange={(e) => setSelectedVehicleId(e.target.value === "" ? null : Number(e.target.value))}
                    className="bg-slate-50 border border-slate-200 text-slate-900 text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-[#FFD600] flex-1 md:flex-initial font-bold max-w-full"
                  >
                    <option value="">-- Выберите ТС --</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {getVehicleLabel(v)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <AnalyticsPanel
                selectedVehicleId={selectedVehicleId}
                vehicles={vehicles}
                waybills={validActiveWaybills}
                liveLocations={liveLocations}
              />
            </div>
          )}

          {/* Active Tab: Employees personnel management */}
          {activeTab === "personnel" && (
            <PersonnelGrid
              employees={employees}
              onCreate={handleCreateEmployee}
              onDelete={handleDeleteEmployee}
            />
          )}

          {/* Active Tab: Settings & System utilities */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 p-6 rounded-xl space-y-4 shadow-xs">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2 uppercase">
                  <Settings className="text-[#FFD600] w-5 h-5 stroke-[2.5]" />
                  Администрирование & Конфигурация системы
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Данное окно предоставляет утилитарные средства для обслуживания базы данных путевых листов и отладочных GPS треккеров. Вы можете сбросить вносимые изменения обратно до предопределенных параметров в seed.py для чистой демонстрации дипломной работы.
                </p>

                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-black text-slate-700 block mb-2 uppercase tracking-wide">
                    Управление состоянием данных
                  </h3>
                  <button
                    onClick={handleResetDB}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-wider text-[10px] px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin-slow" />
                    <span>Сбросить и переразместить БД (Re-seed)</span>
                  </button>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Внимание! Это очистит созданные вами записи о новых сотрудниках и путевых листах, очистив все кэшируемые значения в data_store.json.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {printWaybillTarget && (
            <PrintWaybillModal
              cargo={printWaybillTarget}
              vehicles={vehicles}
              employees={employees}
              onClose={() => setPrintWaybillTarget(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
