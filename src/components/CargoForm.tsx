import React, { useState, useEffect } from "react";
import { Vehicle, Employee, Waybill } from "../types";

function getVehicleLabel(vehicle: Vehicle | null | undefined) {
  const model = vehicle?.model?.trim();
  const stateNumber = vehicle?.state_number?.trim();

  if (model && stateNumber) return `${model} (${stateNumber})`;
  if (model) return model;
  if (stateNumber) return stateNumber;
  return vehicle?.id ? `ТС #${vehicle.id}` : "ТС не назначено";
}
import { PlusCircle, Edit3, Calendar, Package, ArrowRightLeft, MapPin, Truck, ShieldCheck, X, User } from "lucide-react";

interface WaybillFormPayload {
  cargo_type: string;
  weight: number;
  customer: string;
  carrier: string;
  from_city: string;
  to_city: string;
  date_from: string;
  date_to: string;
  route_coords: [number, number][];
  vehicle_id: number | null;
  driver_id: number | null;
  organization_id?: number;
}

interface CargoFormProps {
  vehicles: Vehicle[];
  employees: Employee[];
  onSave: (cargo: WaybillFormPayload) => Promise<boolean>;
  onClose: () => void;
  editingCargo: Waybill | null;
}

// Preset route options for simple coordinates mapping
const PRESET_ROUTES = [
  {
    name: "Москва ➔ Санкт-Петербург",
    fromCity: "Москва",
    toCity: "Санкт-Петербург",
    coords: [
      [55.7558, 37.6173],
      [56.2500, 34.0000],
      [58.0000, 33.0000],
      [59.9343, 30.3351]
    ]
  },
  {
    name: "Нижний Новгород ➔ Казань",
    fromCity: "Нижний Новгород",
    toCity: "Казань",
    coords: [
      [56.3269, 44.0059],
      [56.0000, 46.5000],
      [55.7961, 49.1064]
    ]
  },
  {
    name: "Москва ➔ Казань",
    fromCity: "Москва",
    toCity: "Казань",
    coords: [
      [55.7558, 37.6173],
      [56.3269, 44.0059],
      [55.7961, 49.1064]
    ]
  },
  {
    name: "Москва ➔ Ярославль",
    fromCity: "Москва",
    toCity: "Ярославль",
    coords: [
      [55.7558, 37.6173],
      [56.5000, 38.5000],
      [57.6261, 39.8845]
    ]
  },
  {
    name: "Москва ➔ Ростов-на-Дону",
    fromCity: "Москва",
    toCity: "Ростов-на-Дону",
    coords: [
      [55.7558, 37.6173],
      [51.6720, 39.1843],
      [47.2357, 39.7015]
    ]
  }
];

export default function CargoForm({
  vehicles,
  employees,
  onSave,
  onClose,
  editingCargo
}: CargoFormProps) {
  // Local state matching schemas.py validation
  const [weight, setWeight] = useState<number>(10000);
  const [cargoType, setCargoType] = useState("");
  const [customer, setCustomer] = useState("");
  const [carrier, setCarrier] = useState("");
  const [fromCity, setFromCity] = useState("Москва");
  const [toCity, setToCity] = useState("Санкт-Петербург");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [coords, setCoords] = useState<[number, number][]>([
    [55.7558, 37.6173],
    [59.9343, 30.3351]
  ]);
  const [selectedPreset, setSelectedPreset] = useState("")
  const [assignedVehicleId, setAssignedVehicleId] = useState<string | "">("");
  const [assignedDriverId, setAssignedDriverId] = useState<string | "">("");
  
  const [errorText, setErrorText] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // ─── Polyline decoder (OSRM returns encoded polyline geometry) ───
  const decodePolyline = (encoded: string, precision = 5): [number, number][] => {
    const factor = Math.pow(10, precision);
    const result: [number, number][] = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      let shift = 0, result_val = 0, byte;
      do { byte = encoded.charCodeAt(index++) - 63; result_val |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      lat += (result_val & 1) ? ~(result_val >> 1) : (result_val >> 1);

      shift = 0; result_val = 0;
      do { byte = encoded.charCodeAt(index++) - 63; result_val |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
      lng += (result_val & 1) ? ~(result_val >> 1) : (result_val >> 1);

      result.push([lat / factor, lng / factor]);
    }
    return result;
  };

  // ─── Geocoding: resolve city name → coordinates via Nominatim ───
  const geocodeCity = async (cityName: string): Promise<[number, number] | null> => {
    if (!cityName.trim()) return null;
    try {
      const query = encodeURIComponent(cityName.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=ru`,
        { headers: { "User-Agent": "CargoFlow/1.0" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch { /* network error — keep existing coords */ }
    return null;
  };

  // ─── OSRM: get road route between two points ───
  const fetchRoadRoute = async (
    from: [number, number],
    to: [number, number]
  ): Promise<[number, number][] | null> => {
    try {
      // OSRM expects lon,lat (not lat,lon)
      const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=polyline`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === "Ok" && data.routes?.[0]?.geometry) {
        const decoded = decodePolyline(data.routes[0].geometry, 5);
        // Simplify: take every Nth point to keep ~40-80 points for performance
        const step = Math.max(1, Math.floor(decoded.length / 60));
        const simplified = decoded.filter((_, i) => i % step === 0 || i === decoded.length - 1);
        return simplified.length >= 2 ? simplified : decoded;
      }
    } catch { /* OSRM unavailable — will fall back to straight line */ }
    return null;
  };

  // Auto-route when cities change (with debounce)
  useEffect(() => {
    if (!fromCity.trim() || !toCity.trim()) return;

    const timer = setTimeout(async () => {
      setGeocoding(true);
      // Step 1: Geocode both cities
      const [fromCoord, toCoord] = await Promise.all([
        geocodeCity(fromCity),
        geocodeCity(toCity),
      ]);
      if (fromCoord && toCoord) {
        // Step 2: Get road route via OSRM
        const roadCoords = await fetchRoadRoute(fromCoord, toCoord);
        if (roadCoords) {
          setCoords(roadCoords);
        } else {
          // Fallback: straight line between geocoded points
          setCoords([fromCoord, toCoord]);
        }
        setSelectedPreset("");
      }
      setGeocoding(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [fromCity, toCity]);

  // Setup initial form state if editing
  useEffect(() => {
    if (editingCargo) {
      setWeight(editingCargo.weight);
      setCargoType(editingCargo.cargo_type);
      setCustomer(editingCargo.customer);
      setCarrier(editingCargo.carrier);
      setFromCity(editingCargo.from_city);
      setToCity(editingCargo.to_city);
      setDateFrom(editingCargo.date_from);
      setDateTo(editingCargo.date_to);
      setCoords(editingCargo.route_coords || []);
      setAssignedVehicleId(editingCargo.vehicle_id != null ? String(editingCargo.vehicle_id) : "");
      setAssignedDriverId(editingCargo.driver_id != null ? String(editingCargo.driver_id) : "");
      const match = PRESET_ROUTES.find(
        (r) => JSON.stringify(r.coords) === JSON.stringify(editingCargo.route_coords)
      );
      setSelectedPreset(match ? match.name : "");
    } else {
      setSelectedPreset("");
      const today = new Date().toISOString().split("T")[0];
      const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      setDateFrom(today);
      setDateTo(weekLater);
    }
  }, [editingCargo]);

  // Sync driver whenever assignedVehicleId changes
  useEffect(() => {
    if (assignedVehicleId !== "" && !editingCargo) {
      const selectedVehicle = vehicles.find((v) => Number(v.id) === Number(assignedVehicleId));
      if (selectedVehicle && selectedVehicle.driver_id != null) {
        setAssignedDriverId(String(selectedVehicle.driver_id));
      }
    }
  }, [assignedVehicleId, vehicles, editingCargo]);

  // Preset handler: also fetches road route for preset cities
  const handlePresetChange = async (presetName: string) => {
    const r = PRESET_ROUTES.find((route) => route.name === presetName);
    if (r) {
      setSelectedPreset(presetName);
      setFromCity(r.fromCity);
      setToCity(r.toCity);
      // Immediately set preset coords, then upgrade to road route
      setCoords(r.coords as [number, number][]);
      setGeocoding(true);
      const roadCoords = await fetchRoadRoute(
        r.coords[0] as [number, number],
        r.coords[r.coords.length - 1] as [number, number]
      );
      if (roadCoords) {
        setCoords(roadCoords);
      }
      setGeocoding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);

    // Schema validations matching python rules
    if (weight <= 0) {
      setErrorText("Вес должен быть положительным числом (> 0)");
      return;
    }
    if (!cargoType.trim()) {
      setErrorText("Пожалуйста, укажите тип груза");
      return;
    }
    if (!customer.trim() || !carrier.trim()) {
      setErrorText("Пожалуйста, заполните поля Заказчика и Перевозчика");
      return;
    }
    if (new Date(dateTo) < new Date(dateFrom)) {
      setErrorText("Дата прибытия не может быть раньше даты отправления");
      return;
    }
    if (coords.length === 0) {
      setErrorText("Список географических координат не может быть пустым");
      return;
    }

    // Business Logic constraint validation: every assigned truck must compile a driver
    if (assignedVehicleId !== "" && !assignedDriverId) {
      setErrorText("Ошибка: выбрано транспортное средство, но за ним не закреплен водитель на этот рейс. Пожалуйста, укажите водителя!");
      return;
    }

    setLoading(true);

    const payload: WaybillFormPayload = {
      weight,
      cargo_type: cargoType,
      customer,
      carrier,
      from_city: fromCity,
      to_city: toCity,
      date_from: dateFrom,
      date_to: dateTo,
      route_coords: coords,
      vehicle_id: assignedVehicleId === "" ? null : Number(assignedVehicleId),
      driver_id: assignedDriverId === "" ? null : Number(assignedDriverId),
    };

    const isOk = await onSave(payload);
    setLoading(false);
    if (isOk) {
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorText("Ошибка сохранения путевого листа. Проверьте правильность введенных дат");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 font-sans select-none overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative scrollbar">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur-sm z-15">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-100">
              {editingCargo ? `Редактирование путевого листа: ${editingCargo.id}` : "Выписка нового путевого листа"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorText && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl p-3 text-xs leading-relaxed">
              ⚠️ {errorText}
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Путевой лист успешно оформлен в базе данных!</span>
            </div>
          )}

          {/* Quick Preset routing selection */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
            <label className="text-xs font-semibold text-slate-400 block mb-1.5 label-spacing">
              Шаблоны региональных маршрутов (автонастройка)
            </label>
            <select
              onChange={(e) => handlePresetChange(e.target.value)}
              value={selectedPreset}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2 focus:outline-none focus:border-amber-500 font-sans"
            >
              <option value="" disabled>--- Выберите маршрутную нитку перевозки ---</option>
              {PRESET_ROUTES.map((route) => (
                <option key={route.name} value={route.name}>
                  {route.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
              Шаблон мгновенно привяжет координаты маршрута. Вы также можете ввести любые города вручную — координаты определятся автоматически.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cargo Type */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Тип груза</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Например: Металлопрокат, ТНП"
                  value={cargoType}
                  onChange={(e) => setCargoType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Cargo Weight */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Масса груза (кг)</label>
              <input
                type="number"
                required
                min="100"
                placeholder="Масса в килограммах"
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Организация-Заказчик</label>
              <input
                type="text"
                required
                placeholder="ООО Ромашка"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Carrier */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">ТК / Перевозчик</label>
              <input
                type="text"
                required
                placeholder="Транспортные Линии, ИП"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/40 p-3 rounded-xl border border-slate-850">
            {/* Start Town */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Пункт погрузки</label>
              <input
                type="text"
                required
                value={fromCity}
                onChange={(e) => setFromCity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* End Town */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">Пункт разгрузки</label>
              <input
                type="text"
                required
                value={toCity}
                onChange={(e) => setToCity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date Start */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Дата выезда
              </label>
              <input
                type="date"
                required
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Date End */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Дата прибытия
              </label>
              <input
                type="date"
                required
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Associated vehicle tracking terminal */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                Назначить ТС и треккер
              </label>
              <select
                value={assignedVehicleId}
                onChange={(e) => setAssignedVehicleId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500 font-sans font-bold"
              >
                <option value="">-- Без ТС (Ожидание) --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {getVehicleLabel(v)}{v.device_id ? ` · ${v.device_id}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Associated Driver assigned to the bill */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Закрепленный водитель *
              </label>
              <select
                value={assignedDriverId}
                onChange={(e) => setAssignedDriverId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs px-3 py-2.5 focus:outline-none focus:border-amber-500 font-sans font-bold"
              >
                <option value="">-- Выберите водителя --</option>
                {employees.map((emp) => {
                  const empId = String(emp.id);
                  const empName = emp.name || emp.full_name || "Сотрудник без имени";
                  return (
                    <option key={empId} value={empId}>
                      {empName} {empId.startsWith("emp") ? `(${emp.role || "сотрудник"})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Raw coordinates display */}
          <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-850">
            <label className="text-xs font-semibold text-slate-400 block mb-1.5 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Конечные географические координаты ({coords.length} т.)
              {geocoding && <span className="text-amber-500 ml-1 animate-pulse">⟳ определение...</span>}
            </label>
            <div className="w-full bg-slate-950 border border-slate-800 rounded-lg text-slate-400 text-[10px] px-3 py-2 font-mono truncate">
              {JSON.stringify(coords)}
            </div>
          </div>

          {/* Form Actions footer */}
          <div className="border-t border-slate-800 pt-5 flex justify-end gap-3.5">
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 text-slate-950 px-5  py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-amber-500/5"
            >
              {loading ? "Публикация..." : editingCargo ? "Сохранить изменения" : "Выписать путевой лист"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
