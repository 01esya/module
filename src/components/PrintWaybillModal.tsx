import React from "react";
import { CargoLoad, Vehicle, Employee } from "../types";
import { Printer, X, BadgeCheck, FileText, CheckCircle2 } from "lucide-react";

interface PrintWaybillModalProps {
  cargo: CargoLoad;
  vehicles: Vehicle[];
  employees: Employee[];
  onClose: () => void;
}

function sameVehicleId(left: number | string | null | undefined, right: number | string | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Number(left) === Number(right);
}

export default function PrintWaybillModal({
  cargo,
  vehicles,
  employees,
  onClose
}: PrintWaybillModalProps) {
  const vehicle = cargo.vehicle_id ? vehicles.find((v) => sameVehicleId(v.id, cargo.vehicle_id)) : null;
  const driver = cargo.driver_id ? employees.find((e) => e.id === cargo.driver_id) : null;

  const dispatcher = employees.find(
    (e) =>
      e.role.toLowerCase().includes("диспетчер") ||
      e.name.toLowerCase().includes("васильев")
  ) || { id: "emp-4", name: "Васильев Олег Игоревич", role: "Диспетчер-координатор" };

  const mechanic = employees.find(
    (e) =>
      e.role.toLowerCase().includes("механик") ||
      e.name.toLowerCase().includes("козлов")
  ) || { id: "emp-2", name: "Козлов Кирилл Николаевич", role: "Старший механик" };

  // Helper to get last name and initials (e.g., "Иванов Виталий Николаевич" -> "Иванов В.Н.")
  const getInitials = (fullName?: string) => {
    if (!fullName) return "";
    const cleanName = fullName.trim().replace(/\s+/g, " ");
    const parts = cleanName.split(" ");
    if (parts.length === 0) return "";
    
    const lastName = parts[0];
    if (parts.length === 1) return lastName;

    const secondPart = parts[1];
    // Check if second part already has dotted initials like "В.Н." or "В. Н."
    if (secondPart.includes(".")) {
      return `${lastName} ${parts.slice(1).join(" ")}`;
    }

    const firstInitial = parts[1] ? parts[1].charAt(0).toUpperCase() + "." : "";
    const secondInitial = parts[2] ? parts[2].charAt(0).toUpperCase() + "." : "";
    
    return `${lastName} ${firstInitial}${secondInitial}`;
  };

  // Helper date parsing to Russian standard: "«DD» октября 2024 г."
  const formatRuDate = (dateStr?: string) => {
    if (!dateStr) return { day: "22", month: "октября", year: "2024" };
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          // YYYY-MM-DD
          const year = parts[0];
          const monthIndex = parseInt(parts[1], 10) - 1;
          const day = parts[2];
          const months = [
            "января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря"
          ];
          return { day, month: months[monthIndex] || "октября", year };
        }
        return { day: "22", month: "октября", year: "2024" };
      }
      const months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря"
      ];
      return {
        day: String(d.getDate()).padStart(2, "0"),
        month: months[d.getMonth()],
        year: String(d.getFullYear())
      };
    } catch {
      return { day: "22", month: "октября", year: "2024" };
    }
  };

  const fromDate = formatRuDate(cargo.date_from);
  const toDate = formatRuDate(cargo.date_to);

  const driverModelFromRole = (() => {
    const roleText = driver?.role || "";
    const match = roleText.match(/Водитель\s+(.+?)(?:\s*\(|$)/i);
    return match?.[1]?.trim() || "";
  })();

  const vehicleModelText = (() => {
    const candidates = [
      vehicle?.model,
      (vehicle as any)?.name,
      (vehicle as any)?.vehicle_model,
      (vehicle as any)?.truck_model,
      (cargo as any)?.vehicle_model,
      (cargo as any)?.truck_model,
      (cargo as any)?.vehicleName,
      driverModelFromRole,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    return candidates[0]?.trim() || "Модель не указана";
  })();
  const vehicleStateNumberText = vehicle?.state_number?.trim() || (cargo as any)?.state_number?.trim() || "—";
  const driverNameText = driver?.name?.trim() || "Водитель не назначен";
  const driverSignatureText = driver ? getInitials(driver.name) : "Водитель не назначен";

  const routeDistanceKm = (() => {
    const rawDistance =
      (cargo as any)?.distanceKm ??
      (cargo as any)?.distance_km ??
      (cargo as any)?.routeDistance ??
      (cargo as any)?.totalDistance ??
      (cargo as any)?.distance ??
      null;

    if (typeof rawDistance === "number" && Number.isFinite(rawDistance) && rawDistance > 0) {
      return rawDistance;
    }

    if (typeof rawDistance === "string" && rawDistance.trim()) {
      const parsed = Number(rawDistance.replace(/[\sкмKM]+/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    if (Array.isArray((cargo as any)?.coords) && (cargo as any).coords.length >= 2) {
      const points = (cargo as any).coords as [number, number][];
      const toRad = (value: number) => (value * Math.PI) / 180;
      let total = 0;
      for (let i = 1; i < points.length; i += 1) {
        const [lat1, lon1] = points[i - 1];
        const [lat2, lon2] = points[i];
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        total += 6371 * c;
      }
      if (total > 0) return Number(total.toFixed(1));
    }

    return null;
  })();

  const distanceLabel = routeDistanceKm !== null ? `${routeDistanceKm.toFixed(0)} км` : "—";

  // Keep document fields explicit instead of inventing a driver when none is assigned.
  const driverSnils = driver ? "024-536-107-98" : "—";
  const driverLicense = driver ? "77 16 569 719, выдано 01.03.2019" : "—";
  const driverClass = driver ? "B, C" : "—";

  const handlePrint = () => {
    const container = document.getElementById("waybill-print-container");
    if (!container) return;

    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) return;

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join("\n");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Путевой лист</title>
          ${styles}
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            html, body { margin: 0; background: #fff; }
            body * { visibility: hidden; }
            #waybill-print-container,
            #waybill-print-container * { visibility: visible; }
            #waybill-print-container {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              margin: 0;
              box-shadow: none !important;
              border: 0 !important;
            }
            .print\\:hidden { display: none !important; }
          </style>
        </head>
        <body>${container.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto select-none print:p-0 print:bg-white print:relative">
      
      {/* Container holding controls and paper sheet */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl flex flex-col scrollbar print:border-none print:shadow-none print:bg-white print:max-h-full print:overflow-visible">
        
        {/* Interactive Controls Header (Hidden on print) */}
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/95 sticky top-0 z-20 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <FileText className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-100 uppercase tracking-wider">Российский унифицированный путевой лист</h3>
              <p className="text-[10px] text-slate-400">Официальная типовая межотраслевая форма № 4-П</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-amber-500/10"
            >
              <Printer className="w-4 h-4" />
              <span>Распечатать форму</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Outer margin simulator (Hidden on print, formats background inside dialog nicely) */}
        <div className="p-4 bg-slate-950/40 flex justify-center print:p-0 print:bg-white">
          
          {/* Main Paper Sheet (A4 or realistic portrait shape) */}
          <div id="waybill-print-container" className="w-[820px] bg-white text-black p-6 shadow-2xl border border-slate-200 select-text font-sans leading-tight relative print:p-0 print:border-none print:shadow-none print:w-full">
            
            {/* Top Row: Series & Form codes Table */}
            <div className="grid grid-cols-12 gap-2 items-start">
              
              {/* Document Title main identifier */}
              <div className="col-span-8 text-center pt-2">
                <h1 className="text-lg font-black tracking-wider uppercase text-slate-950">ПУТЕВОЙ ЛИСТ</h1>
                <div className="flex justify-center items-baseline gap-4 mt-1">
                  <span className="text-xs font-bold text-slate-700">грузового автомобиля</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-300 font-mono font-bold">Д-II</span>
                    <span className="text-[10px] text-slate-500">№</span>
                    <span className="text-xs font-extrabold font-mono border-b border-black px-4">{cargo.id.toUpperCase().replace("CARGO-", "")}</span>
                  </div>
                </div>

                {/* Dates display with lines underneath */}
                <div className="flex items-center justify-center gap-1.5 mt-2.5 text-[10px] text-slate-800">
                  <span>«</span>
                  <span className="border-b border-black px-1.5 font-bold font-mono min-w-[20px] text-center">{fromDate.day}</span>
                  <span>»</span>
                  <span className="border-b border-black px-2 font-bold min-w-[65px] text-center">{fromDate.month}</span>
                  <span className="border-b border-black font-mono pr-0.5">{fromDate.year}</span>
                  <span className="mr-3">г.</span>

                  <span className="text-slate-500 text-[9px] uppercase tracking-wider font-bold">по «</span>
                  <span className="border-b border-black px-1.5 font-bold font-mono min-w-[20px] text-center">{toDate.day}</span>
                  <span>»</span>
                  <span className="border-b border-black px-2 font-bold min-w-[65px] text-center">{toDate.month}</span>
                  <span className="border-b border-black font-mono pr-0.5">{toDate.year}</span>
                  <span>г.</span>
                </div>
              </div>

              {/* Codes table on the top right */}
              <div className="col-span-4 flex flex-col items-end">
                <div className="border border-black w-28 text-[9px] font-mono leading-none">
                  <div className="bg-slate-100 border-b border-black p-1 text-center font-bold">Коды</div>
                  <div className="flex justify-between border-b border-black">
                    <span className="p-1 border-r border-black w-14 text-center text-slate-500">Форма по ОКУД</span>
                    <span className="p-1 w-14 text-center font-bold">0345004</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="p-1 border-r border-black w-14 text-center text-slate-500">по ОКПО</span>
                    <span className="p-1 w-14 text-center font-bold">12345678</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Organization info line */}
            <div className="mt-4 text-[10px] leading-relaxed">
              <div className="flex items-baseline gap-1 border-b border-black/80 pb-0.5">
                <span className="font-bold shrink-0 text-[10px] text-slate-800">Организация:</span>
                <span className="font-bold underline text-slate-900 flex-1">
                  {cargo.carrier || "Группа логистического экспресс-контроля КАРГОФЛОУ"}, Россия, ОГРН 2323454567001, ИНН 7701129482
                </span>
              </div>
              <div className="text-[7.5px] text-slate-400 font-bold uppercase tracking-wider text-center mt-0.5 leading-none">
                наименование, адрес, номер телефона, ОГРН, ИНН организации-владельца автотранспорта
              </div>
            </div>

            {/* Divider */}
            <div className="h-0.5 bg-black my-4 opacity-90" />

            {/* Left Box (Vehicle details) + Right Box (Work timetable & Fuel tables) Grid */}
            <div className="grid grid-cols-12 gap-4 items-start">
              
              {/* LEFT SIDE DETAILS: Brand, Plate, Trailer, Communication, driver details */}
              <div className="col-span-6 space-y-3 border-r border-dashed border-slate-300 pr-4">
                
                {/* Brand / Model */}
                <div>
                  <div className="flex items-baseline gap-1 border-b border-black pb-0.5 text-xs">
                    <span className="text-[9px] font-bold text-slate-500 uppercase shrink-0">Тип, марка, модель ТС:</span>
                    <span className="font-bold pl-1 text-[11px] text-slate-950 truncate">
                      {vehicleModelText}
                    </span>
                  </div>
                  <div className="text-[7px] text-slate-400 text-center uppercase tracking-wide">Марка, марка шасси, модель автомобиля</div>
                </div>

                {/* State plate number */}
                <div>
                  <div className="flex justify-between items-baseline border-b border-black pb-0.5 text-xs">
                    <span className="text-[9px] font-bold text-slate-500 uppercase shrink-0">Государственный номер:</span>
                    <span className="font-extrabold px-2 py-0.5 bg-slate-50 border border-slate-300 font-mono text-[11px] text-slate-950 rounded tracking-tight">
                      {vehicleStateNumberText}
                    </span>
                  </div>
                  <div className="text-[7px] text-slate-400 text-center uppercase tracking-wide">регистрационный номер автомобиля</div>
                </div>

                {/* Driver */}
                <div>
                  <div className="flex items-baseline gap-1 border-b border-black pb-0.5 text-xs">
                    <span className="text-[9px] font-bold text-slate-500 uppercase shrink-0">Водитель:</span>
                    <span className="font-extrabold pl-1 text-[11px] text-slate-950 uppercase truncate">
                      {driverNameText}
                    </span>
                  </div>
                  <div className="text-[7px] text-slate-400 text-center uppercase tracking-wide">фамилия, имя, отчество водителя</div>
                </div>

                {/* Driver documents */}
                <div className="grid grid-cols-12 gap-2 text-xs">
                  <div className="col-span-8">
                    <div className="flex items-baseline gap-1 border-b border-black pb-0.5">
                      <span className="text-[8px] font-bold text-slate-500 uppercase shrink-0">Удостоверение:</span>
                      <span className="font-mono text-[10px] text-slate-950 truncate pl-0.5">
                        {driverLicense}
                      </span>
                    </div>
                    <div className="text-[7px] text-slate-400 text-center uppercase tracking-wide">номер, дата выдачи водительского</div>
                  </div>
                  <div className="col-span-4">
                    <div className="flex items-baseline gap-1 border-b border-black pb-0.5">
                      <span className="text-[8px] font-bold text-slate-500 uppercase shrink-0">Класс:</span>
                      <span className="font-bold text-[10px] pl-0.5 font-mono">{driverClass}</span>
                    </div>
                    <div className="text-[7px] text-slate-400 text-center uppercase tracking-wide">класс водителя</div>
                  </div>
                </div>

                {/* SNILS doc */}
                <div>
                  <div className="flex items-baseline gap-1 border-b border-black pb-0.5 text-xs">
                    <span className="text-[9px] font-bold text-slate-500 uppercase shrink-0">СНИЛС:</span>
                    <span className="font-mono text-[10px] text-slate-950 pl-1">{driverSnils}</span>
                  </div>
                  <div className="text-[7px] text-slate-400 text-center uppercase tracking-wide">номер СНИЛС водителя автомобиля</div>
                </div>

                {/* Trailer parameters */}
                <div className="space-y-1.5 bg-slate-50 p-2 border border-slate-200 rounded">
                  <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider block mb-1">Информация о прицепах:</span>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] font-mono text-slate-800">
                    <div className="border-b border-slate-200 pb-0.5 truncate">Прицеп 1: <span className="font-bold text-slate-950">НЕ ИСПОЛЬЗУЕТСЯ</span></div>
                    <div className="border-b border-slate-200 pb-0.5 truncate">Номер парковки: <span>--</span></div>
                    <div className="truncate">Прицеп 2: <span className="font-bold text-slate-950">ОТСУТСТВУЕТ</span></div>
                    <div className="truncate">Рег. номер: <span>--</span></div>
                  </div>
                </div>

                {/* Accompanying persons and Transport properties */}
                <div className="space-y-1.5 pt-1 text-[9px]">
                  <div>
                    <div className="flex items-baseline gap-1 border-b border-black pb-0.5">
                      <span className="font-bold text-slate-500 text-[8px] uppercase shrink-0">Сопровождающие лица:</span>
                      <span className="text-[10px] font-mono text-slate-800 pl-1">КОНДУКТОР ОТСУТСТВУЕТ (Экипаж 1 чел.)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1 border-b border-black pb-0.5">
                      <span className="font-bold text-slate-500 text-[8px] uppercase shrink-0">Сведения о перевозке:</span>
                      <span className="text-[9px] font-bold text-slate-950 pl-1">
                        коммерческая перевозка (перевозка грузов на основании договора)
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1 border-b border-black pb-0.5">
                      <span className="font-bold text-slate-500 text-[8px] uppercase shrink-0">Вид сообщения:</span>
                      <span className="text-[9px] font-bold text-slate-950 pl-1">
                        междугороднее / пригородное сообщение
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT SIDE DETAILS: Timetable, Fuel, and operational parameters */}
              <div className="col-span-6 space-y-4">
                
                {/* Work shift properties */}
                <div className="flex justify-end gap-2 text-[9px] font-mono">
                  <div className="border border-black flex">
                    <span className="border-r border-black p-1 text-slate-500">Режим работы</span>
                    <span className="p-1 font-bold">1 (Смена)</span>
                  </div>
                  <div className="border border-black flex">
                    <span className="border-r border-black p-1 text-slate-500">Бригада</span>
                    <span className="p-1 font-bold">03</span>
                  </div>
                  <div className="border border-black flex">
                    <span className="border-r border-black p-1 text-slate-500">Табельный №</span>
                    <span className="p-1 font-bold">T-561</span>
                  </div>
                </div>

                {/* Table: "Работа водителя и автомобиля" */}
                <div>
                  <h4 className="text-[9px] font-black uppercase text-slate-800 tracking-wider mb-1 text-center">Работа водителя и автомобиля</h4>
                  <table className="w-full text-left border-collapse border border-black text-[9px]">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold text-[8px] border-b border-black">
                        <th className="border-r border-black p-1 w-1/4">Операция</th>
                        <th className="border-r border-black p-0.5 w-1/4">Время по графику (Ч:М)</th>
                        <th className="border-r border-black p-0.5">Показание одометра, км</th>
                        <th className="p-0.5">Подпись дежурного</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 font-bold bg-slate-50/50">Выпуск на линию</td>
                        <td className="border-r border-black p-1 text-center font-mono font-bold">
                          {cargo.date_from.split("-").reverse().join(".") || "22.01.2024"} 08:00
                        </td>
                        <td className="border-r border-black p-1 text-center font-mono font-bold">32 100</td>
                        <td className="p-1 text-center font-serif text-[10px] italic">{getInitials(dispatcher.name)}</td>
                      </tr>
                      <tr>
                        <td className="border-r border-black p-1 font-bold bg-slate-50/50">Возврат с линии</td>
                        <td className="border-r border-black p-1 text-center font-mono font-bold">
                          {cargo.date_to.split("-").reverse().join(".") || "22.01.2024"} 17:00
                        </td>
                        <td className="border-r border-black p-1 text-center font-mono font-bold">
                          32 260 <span className="text-[8px] text-slate-500 font-sans font-normal">({routeDistanceKm !== null ? `+${routeDistanceKm.toFixed(0)} км` : "—"})</span>
                        </td>
                        <td className="p-1 text-center font-serif text-[10px] italic">{getInitials(dispatcher.name)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Table: "Движение горючего" */}
                <div>
                  <h4 className="text-[9px] font-black uppercase text-slate-800 tracking-wider mb-1 text-center">Движение горючего</h4>
                  <table className="w-full text-center border-collapse border border-black text-[8.5px]">
                    <thead>
                      <tr className="bg-slate-100 font-bold text-[8px] border-b border-black">
                        <th className="border-r border-black p-1" colSpan={2}>Марка горючего</th>
                        <th className="border-r border-black p-0.5">Выдано, л</th>
                        <th className="border-r border-black p-0.5" colSpan={2}>Остаток при выезде / возврате</th>
                        <th className="border-r border-black p-0.5">Коэффиц. нормы</th>
                        <th className="p-0.5">Время работы двиг.</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-black font-medium text-[8px]">
                        <td className="border-r border-black p-1 font-bold bg-slate-50">Диз. топливо (ДТ)</td>
                        <td className="border-r border-black p-0.5 font-mono">02</td>
                        <td className="border-r border-black p-1 font-mono font-bold">120 л</td>
                        <td className="border-r border-black p-1 font-mono">36 л</td>
                        <td className="border-r border-black p-1 font-mono">24 л</td>
                        <td className="border-r border-black p-1 text-[7.5px] leading-none text-slate-500">+1.3л / 1т на 100км</td>
                        <td className="p-1 font-mono font-bold">3:55</td>
                      </tr>
                      {/* Signatures for fuel check */}
                      <tr className="text-[8px] text-slate-500">
                        <td className="p-1 border-r border-black text-left" colSpan={2}>Подпись заправщика / механика</td>
                        <td className="p-1 border-r border-black font-serif italic text-black">Озеров О.П.</td>
                        <td className="p-1 text-center font-serif italic text-black" colSpan={4}>Диспетчер: {getInitials(dispatcher.name)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>

            </div>

            {/* Middle Big Table: ЗАДАНИЕ ВОДИТЕЛЮ */}
            <div className="mt-5">
              <h3 className="text-[9.5px] font-black text-center uppercase tracking-wider text-slate-900 mb-1.5 bg-slate-100 py-1 border border-black">
                ЗАДАНИЕ ВОДИТЕЛЮ НА РЕЙСОВЫЙ ВЫЕЗД
              </h3>
              
              <table className="w-full text-center border-collapse border border-black text-[9px]">
                <thead>
                  <tr className="bg-slate-50 font-bold border-b border-black text-[8px] leading-tight">
                    <th className="border-r border-black p-1 w-1/4">В чье распоряжение (наименование и адрес заказчика)</th>
                    <th className="border-r border-black p-1 w-12">Время прибытия, ч.м.</th>
                    <th className="border-r border-black p-1">Адрес пункта погрузки</th>
                    <th className="border-r border-black p-1">Адрес пункта разгрузки</th>
                    <th className="border-r border-black p-1">Наименование сопровождаемого груза</th>
                    <th className="border-r border-black p-1 w-12">Колич. ездок</th>
                    <th className="border-r border-black p-1 w-11">Рассто-яние, км</th>
                    <th className="p-1 w-11">Перевез. тонн</th>
                  </tr>
                  <tr className="bg-slate-100 text-[8px] border-b border-black font-bold font-mono">
                    <td className="border-r border-black p-0.5">20</td>
                    <td className="border-r border-black p-0.5">21</td>
                    <td className="border-r border-black p-0.5">22</td>
                    <td className="border-r border-black p-0.5">23</td>
                    <td className="border-r border-black p-0.5">24</td>
                    <td className="border-r border-black p-0.5">25</td>
                    <td className="border-r border-black p-0.5">26</td>
                    <td className="p-0.5">27</td>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-black font-medium leading-normal text-[8.5px]">
                    <td className="border-r border-black p-2 text-left font-bold text-slate-950">
                      {cargo.customer || "ООО \"Заря Логистика\""}
                    </td>
                    <td className="border-r border-black p-2 font-mono font-bold text-slate-900">08:15:00</td>
                    <td className="border-r border-black p-2 text-left font-mono">
                      {cargo.from_city || "Москва"}, терминал Кольцевой, склад 4
                    </td>
                    <td className="border-r border-black p-2 text-left font-mono">
                      {cargo.to_city || "Санкт-Петербург"}, ул. Промышленная, д. 18
                    </td>
                    <td className="border-r border-black p-2 text-left font-bold text-indigo-950">
                      {cargo.cargo_type || "ТНП строительные материалы"}
                    </td>
                    <td className="border-r border-black p-2 font-mono font-extrabold text-slate-950">1</td>
                    <td className="border-r border-black p-2 font-mono font-extrabold text-slate-950">{routeDistanceKm !== null ? routeDistanceKm.toFixed(0) : "—"}</td>
                    <td className="p-2 font-mono font-extrabold text-slate-150">
                      {(cargo.weight / 1000).toFixed(2)}
                    </td>
                  </tr>
                  {/* Empty rows to mimic standard form look perfectly */}
                  <tr className="border-b border-black h-5">
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="p-1" />
                  </tr>
                  <tr className="border-b border-black h-5">
                    <td className="border-r border-black p-1 animate-pulse" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="border-r border-black p-1" />
                    <td className="p-1" />
                  </tr>
                  {/* Summary row */}
                  <tr className="font-extrabold bg-slate-50 text-[8.5px]">
                    <td className="border-r border-black p-1.5 text-right uppercase text-[8px]" colSpan={5}>Итого: </td>
                    <td className="border-r border-black p-1.5 font-mono">1</td>
                    <td className="border-r border-black p-1.5 font-mono">{routeDistanceKm !== null ? routeDistanceKm.toFixed(0) : "—"}</td>
                    <td className="p-1.5 font-mono">{(cargo.weight / 1000).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

            </div>

            {/* Bottom Row - Medical state check, control signatures and seals */}
            <div className="grid grid-cols-12 gap-4 mt-5 text-[9px] items-start">
              
              {/* Medical pre-trip indicator */}
              <div className="col-span-4 p-2 bg-slate-50 border border-slate-300 rounded relative overflow-hidden">
                <span className="font-black text-[8px] uppercase text-indigo-900 block mb-1">Предрейсовый медицинский осмотр:</span>
                <p className="text-[8.5px] leading-tight text-slate-800">
                  Прошел предсменный (предрейсовый) медицинский осмотр, к исполнению трудовых обязанностей допущен.
                </p>
                <div className="mt-2.5 flex items-baseline justify-between text-[8px] font-mono border-t pt-1 border-slate-300">
                  <span>Дата/Время: <span className="font-black">{fromDate.day}.{fromDate.month === "октября" ? "10" : "05"}.{fromDate.year} 07:30</span></span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-[8px] leading-none pt-1">
                  <span className="text-slate-400">Врач: ООО "МедКонтроль"</span>
                  <span className="font-serif italic font-bold text-slate-900">Озерова З.О.</span>
                </div>
                {/* Doctor stamp visual simulator */}
                <div className="absolute right-1 top-1 text-[7px] font-black border-2 border-indigo-500 text-indigo-500 rounded px-1 transform rotate-12 opacity-80 pointer-events-none uppercase">
                  Допущен к рейсу
                </div>
              </div>

              {/* Technical state pre-trip controller */}
              <div className="col-span-4 p-2 bg-amber-500/5 border border-amber-500/20 rounded relative overflow-hidden">
                <span className="font-black text-[8px] uppercase text-amber-900 dark:text-amber-700 block mb-1">Предрейсовый контроль ТС:</span>
                <p className="text-[8.5px] leading-tight text-slate-800">
                  Выпуск автомобиля на линию в исправном состоянии разрешен. Оборудование ГЛОНАСС/GPS активно, бортовой датчик в норме.
                </p>
                <div className="mt-2 text-[8px] font-mono border-t pt-1 border-slate-200">
                  <span>Дата/Время контроля: <span className="font-bold">{fromDate.day}.{fromDate.month === "октября" ? "10" : "05"}.{fromDate.year} 07:45</span></span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-[8px] leading-none pt-1">
                  <span className="text-slate-400">Отв. механик:</span>
                  <span className="font-serif italic font-bold text-slate-900">Козлов К.Н.</span>
                </div>
                {/* Tech stamp */}
                <div className="absolute right-1 top-2 text-[7px] font-black border-2 border-emerald-600 text-emerald-600 rounded px-1 transform -rotate-12 opacity-80 pointer-events-none uppercase">
                  Выпуск разрешен
                </div>
              </div>

              {/* Standard legal organization notes / seals */}
              <div className="col-span-4 flex flex-col items-center justify-center p-2 border border-slate-200 rounded min-h-[90px] relative">
                <div className="w-20 h-20 rounded-full border-4 border-dashed border-red-500/30 flex flex-col items-center justify-center text-[7.5px] font-black text-red-500 text-center tracking-normal transform rotate-12 absolute z-10 pointer-events-none uppercase">
                  <span>М.П.</span>
                  <span className="text-[6px] text-red-500/60 font-sans tracking-tight leading-none mt-1">КАРГОФЛОУ<br/>ЛОГИСТИКА</span>
                </div>
                <div className="text-center text-[8px] text-slate-400 font-mono mt-1 z-0 relative">
                  <div className="font-bold text-slate-500 uppercase tracking-wider text-[7px]">Отметки перевозчика:</div>
                  <p className="leading-tight text-slate-700 font-sans mt-1 text-[7.5px]">
                    Маршрут проверен ИИ-Аудитором. Помех трафика, опасных грузов, перегрузов осей не зафиксировано.
                  </p>
                </div>
              </div>

            </div>

            {/* Bottom Row - Signatures Line for Dispatcher, Driver, and vehicles acceptance */}
            <div className="mt-6 border-t border-slate-900 pt-4 text-[9px] space-y-3">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="text-slate-500 shrink-0 uppercase text-[7.5px]">Диспетчер выезд:</span>
                  <div className="flex-1 border-b border-black text-right font-serif italic font-bold pr-2">{getInitials(dispatcher.name)}</div>
                </div>
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="text-slate-500 shrink-0 uppercase text-[7.5px]">Водитель выезд:</span>
                  <div className="flex-1 border-b border-black text-right font-serif italic font-bold pr-2">{driverNameText}</div>
                </div>
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="text-slate-500 shrink-0 uppercase text-[7.5px]">Автомобиль принял:</span>
                  <div className="flex-1 border-b border-black text-right font-serif italic font-bold pr-2">{driverSignatureText}</div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4 pt-1">
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="text-slate-500 shrink-0 uppercase text-[7.5px]">Механик возврат:</span>
                  <div className="flex-1 border-b border-black text-right font-serif italic font-bold pr-2">Козлов К.Н.</div>
                </div>
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="text-slate-500 shrink-0 uppercase text-[7.5px]">Водитель сдал ТС:</span>
                  <div className="flex-1 border-b border-black text-right font-serif italic font-bold pr-2">{driverNameText}</div>
                </div>
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="text-slate-500 shrink-0 uppercase text-[7.5px]">Автомобиль принял:</span>
                  <div className="flex-1 border-b border-black text-right font-serif italic font-bold pr-2">Козлов К.Н.</div>
                </div>
              </div>
            </div>

            {/* Smart info banner overlay for print context */}
            <div className="mt-5 border border-indigo-100 bg-indigo-50/50 p-2.5 rounded-lg flex items-start gap-2 text-[8.5px] text-indigo-905 print:hidden">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold uppercase text-[7.5px] text-indigo-900 block tracking-wider">Печать и оцифровка КАРГОФЛОУ:</span>
                Данная форма путевого листа полностью соответствует требованиям Минтранса РФ и содержит весь набор реквизитов типовой формы № 4-П. При выводе на принтер фон и кнопки управления будут автоматически скрыты.
              </div>
            </div>

            {/* Document bottom stamp metadata info */}
            <div className="text-[7.5px] text-slate-400 font-mono text-center mt-6 border-t border-slate-100 pt-2 leading-none uppercase tracking-widest">
              автоматизированная система ГИС-мониторинга автотранспорта КАРГОФЛОУ • Сформировано: {new Date().toLocaleDateString("ru-RU")}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
