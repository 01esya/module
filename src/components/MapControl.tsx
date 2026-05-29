import React, { useState, useEffect, useMemo, useRef } from "react";
import { Vehicle, CargoLoad, LiveLocation } from "../types";
import { Truck, MapPin, Navigation, Compass, Layers, Eye, EyeOff, FileSpreadsheet } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";

interface MapControlProps {
  vehicles: Vehicle[];
  cargoLoads: CargoLoad[];
  selectedVehicleId: number | null;
  onSelectVehicle: (id: number | null) => void;
  liveLocations: Record<number, LiveLocation>;
}

const MAP_CITIES = [
  { name: "Москва", lat: 55.7558, lng: 37.6173, size: 8 },
  { name: "Санкт-Петербург", lat: 59.9343, lng: 30.3351, size: 7 },
  { name: "Нижний Новгород", lat: 56.3269, lng: 44.0059, size: 5 },
  { name: "Казань", lat: 55.7961, lng: 49.1064, size: 5 },
  { name: "Ярославль", lat: 57.6261, lng: 39.8845, size: 5 },
  { name: "Самара", lat: 53.2001, lng: 50.1500, size: 5 },
  { name: "Воронеж", lat: 51.6720, lng: 39.1843, size: 5 },
  { name: "Ростов-на-Дону", lat: 47.2357, lng: 39.7015, size: 6 }
];

function sameVehicleId(left: number | string | null | undefined, right: number | string | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Number(left) === Number(right);
}

export default function MapControl({
  vehicles,
  cargoLoads,
  selectedVehicleId,
  onSelectVehicle,
  liveLocations
}: MapControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);

  // Pixel coordinate positions mapped in real-time from OSM layer
  const [positions, setPositions] = useState<Record<string, [number, number]>>({});
  
  const [hoveredNode, setHoveredNode] = useState<{ name: string; x: number; y: number } | null>(null);
  const [hoveredVehicle, setHoveredVehicle] = useState<LiveLocation | null>(null);
  
  const [mapTheme, setMapTheme] = useState<"light" | "dark">("light");
  const [showMapBackground, setShowMapBackground] = useState(true);

  const activeLocation = selectedVehicleId ? liveLocations[selectedVehicleId] : null;
  const visibleLocations = useMemo(
    () => Object.values(liveLocations).filter((loc) =>
      vehicles.some((vehicle) => sameVehicleId(vehicle.id, loc.vehicle_id))
    ),
    [liveLocations, vehicles]
  );
  const isLight = mapTheme === "light";

  // 1. Initialize OpenLayers Map Component once on Mount
  useEffect(() => {
    if (!mapRef.current) return;

    const initialMap = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
      view: new View({
        center: fromLonLat([37.6173, 55.7558]), // Center around Moscow European Russia core
        zoom: 5.5,
        minZoom: 3,
        maxZoom: 16,
      }),
      controls: [], // Hide default zoom buttons to maintain deep graphic style integration
    });

    setMap(initialMap);

    return () => {
      initialMap.setTarget(undefined);
    };
  }, []);

  // 2. Attach clean, responsive ResizeObserver to the parent map wrapper to update size
  useEffect(() => {
    if (!map || !containerRef.current) return;

    const observer = new ResizeObserver(() => {
      map.updateSize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [map]);

  // 3. Track Map rendering/panning events to synchronize custom HTML overlays
  useEffect(() => {
    if (!map) return;

    const syncPixelPositions = () => {
      const nextPositions: Record<string, [number, number]> = {};

      // Map cities
      MAP_CITIES.forEach((city) => {
        const coord = fromLonLat([city.lng, city.lat]);
        const pixel = map.getPixelFromCoordinate(coord);
        if (pixel) {
          nextPositions[city.name] = [pixel[0], pixel[1]];
        }
      });

      // Map moving Vehicles
      visibleLocations.forEach((loc) => {
        const coord = fromLonLat([loc.longitude, loc.latitude]);
        const pixel = map.getPixelFromCoordinate(coord);
        if (pixel) {
          nextPositions[`v-${loc.vehicle_id}`] = [pixel[0], pixel[1]];
        }
      });

      setPositions(nextPositions);
    };

    // Listen to changes in coordinates panning/zoom
    map.on("postrender", syncPixelPositions);
    map.getView().on("change:resolution", syncPixelPositions);
    map.getView().on("change:center", syncPixelPositions);
    syncPixelPositions();

    return () => {
      map.un("postrender", syncPixelPositions);
      map.getView()?.un("change:resolution", syncPixelPositions);
      map.getView()?.un("change:center", syncPixelPositions);
    };
  }, [map, visibleLocations]);

  // 4. Center-glide focusing on chosen vehicle tracker from sidebar
  useEffect(() => {
    if (!map || !activeLocation) return;
    const destCoord = fromLonLat([activeLocation.longitude, activeLocation.latitude]);
    map.getView().animate({
      center: destCoord,
      zoom: 7,
      duration: 800,
    });
  }, [map, selectedVehicleId, activeLocation]);

  // SVG route trail coordinator
  const getPathData = (coords: [number, number][]) => {
    if (!map) return "";
    return coords
      .map((pt) => {
        const coord = fromLonLat([pt[1], pt[0]]); // [Lng, Lat]
        const pixel = map.getPixelFromCoordinate(coord);
        return pixel ? `${pixel[0].toFixed(1)},${pixel[1].toFixed(1)}` : null;
      })
      .filter(Boolean)
      .map((ptStr, idx) => `${idx === 0 ? "M" : "L"} ${ptStr!.split(",")[0]} ${ptStr!.split(",")[1]}`)
      .join(" ");
  };

  // Safe clamping variables for hover elements (Fixes outer boundary overflows)
  const getClampedTooltipStyle = (x: number, y: number, width = 210, height = 150) => {
    const parentWidth = containerRef.current?.clientWidth || 820;
    const parentHeight = containerRef.current?.clientHeight || 550;

    const left = Math.max(10, Math.min(parentWidth - width - 15, x + 15));
    const top = Math.max(10, Math.min(parentHeight - height - 15, y - height / 2));

    return { left: `${left}px`, top: `${top}px` };
  };

  return (
    <div 
      id="fleet_monitoring_map" 
      className={`relative w-full overflow-hidden rounded-2xl border shadow-2xl p-4 select-none transition-colors duration-300 ${
        isLight ? "bg-white border-slate-200" : "bg-slate-950 border-slate-800"
      }`}
    >
      {/* Map Control Header */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3 border-b pb-3 ${
        isLight ? "border-slate-200" : "border-slate-800"
      }`}>
        <div>
          <h2 className={`text-sm sm:text-base font-black flex items-center gap-2 ${
            isLight ? "text-slate-900" : "text-slate-100"
          }`}>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            Живая ГИС карта дорог OpenLayers
          </h2>
          <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"} mt-0.5`}>
            Интерактивный контроль движения ведомственной техники по федеральным трассам
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Layer switcher */}
          <button
            onClick={() => setMapTheme(isLight ? "dark" : "light")}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer ${
              isLight 
                ? "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200" 
                : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
            }`}
            title="Переключить тему карты"
          >
            <Layers className="w-3.5 h-3.5 text-amber-500" />
            <span>{isLight ? "Темный радар" : "Светлая карта"}</span>
          </button>

          {/* Toggle background */}
          <button
            onClick={() => setShowMapBackground(!showMapBackground)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 transition-all cursor-pointer ${
              showMapBackground
                ? "bg-amber-500/10 border-amber-500 text-amber-600"
                : isLight
                ? "bg-slate-100 border-slate-200 text-slate-400"
                : "bg-slate-900 border-slate-800 text-slate-500"
            }`}
          >
            {showMapBackground ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Координатная сетка: {showMapBackground ? "ВКЛ" : "ВЫКЛ"}</span>
          </button>
        </div>
      </div>

      {/* Map Render Box */}
      <div 
        ref={containerRef}
        className={`relative w-full aspect-[8/5] rounded-xl overflow-hidden shadow-inner border transition-colors duration-350 ${
          isLight ? "bg-[#cbd5e1] border-slate-200" : "bg-[#020617] border-slate-900"
        }`}
      >
        {/* Actual OpenLayers Map canvas container element */}
        <div 
          ref={mapRef} 
          className="w-full h-full"
          style={{
            filter: !isLight ? "invert(1) hue-rotate(180deg) brightness(0.9) contrast(1.15)" : "none"
          }}
        />

        {/* 100% Responsive React Vector Overlay Layer */}
        <div className="absolute inset-0 pointer-events-none z-10 w-full h-full">
          <svg className="w-full h-full">
            {/* Active route tracks derived from cargoLoads coordinates */}
            {cargoLoads
              .filter((c) => c.status === "В пути" && c.coords && c.coords.length >= 2)
              .map((cargo) => {
                const pathStr = getPathData(cargo.coords);
                if (!pathStr) return null;
                const isSelected = selectedVehicleId && liveLocations[selectedVehicleId]?.cargo_id === cargo.id;

                return (
                  <g key={cargo.id}>
                    {/* Road Shadow glow */}
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={isSelected ? "rgba(245, 158, 11, 0.4)" : "rgba(79, 70, 229, 0.3)"}
                      strokeWidth={isSelected ? "6" : "4"}
                      strokeLinecap="round"
                    />
                    {/* Driving trail */}
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={isSelected ? "#f59e0b" : "#4f46e5"}
                      strokeWidth={isSelected ? "2.5" : "2"}
                      strokeLinecap="round"
                      strokeDasharray="10,18"
                      className="animate-[dash_15s_linear_infinite]"
                      style={{
                        animation: "dash 12s linear infinite"
                      }}
                    />
                  </g>
                );
              })}
          </svg>

          {/* Cities Overlay (Clickable & Hoverable) */}
          {MAP_CITIES.map((city) => {
            const pos = positions[city.name];
            if (!pos) return null;
            const [cx, cy] = pos;

            return (
              <div
                key={city.name}
                style={{ left: `${cx}px`, top: `${cy}px` }}
                onMouseEnter={() => setHoveredNode({ name: city.name, x: cx, y: cy })}
                onMouseLeave={() => setHoveredNode(null)}
                className="absolute pointer-events-auto cursor-pointer transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group"
              >
                {/* Core ring dot */}
                <div 
                  className={`w-3.5 h-3.5 rounded-full border-2 bg-slate-150 transition-all flex items-center justify-center ${
                    isLight 
                      ? "border-slate-700 hover:border-amber-500 hover:bg-slate-50" 
                      : "border-slate-850 hover:border-amber-500 hover:bg-slate-800"
                  }`}
                >
                  <div className={`w-1 h-1 rounded-full ${isLight ? "bg-slate-800" : "bg-slate-200"}`} />
                </div>
                {/* Text identifier */}
                <span className={`text-[8px] font-bold mt-1 px-1 py-0.2 rounded px-1 tracking-tight select-none pointer-events-none shrink-0 ${
                  isLight ? "text-slate-750 bg-white/70" : "text-slate-300 bg-slate-950/70"
                }`}>
                  {city.name}
                </span>
              </div>
            );
          })}

          {/* GPS Tracker Vehicles Overlay */}
          {visibleLocations.map((loc) => {
            const pos = positions[`v-${loc.vehicle_id}`];
            if (!pos) return null;
            const [vx, vy] = pos;

            const isSelected = sameVehicleId(selectedVehicleId, loc.vehicle_id);
            const headingDeg = loc.heading || 0;
            const isMoving = loc.engine_on && loc.speed > 0;

            return (
              <div
                key={loc.vehicle_id}
                style={{ left: `${vx}px`, top: `${vy}px` }}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer flex flex-col items-center"
                onClick={() => onSelectVehicle(isSelected ? null : Number(loc.vehicle_id))}
                onMouseEnter={() => setHoveredVehicle(loc)}
                onMouseLeave={() => setHoveredVehicle(null)}
              >
                {/* Pulse highlight */}
                {isSelected && (
                  <div className="absolute w-[34px] h-[34px] rounded-full border-[2.5px] border-amber-500 animate-ping opacity-60 pointer-events-none" />
                )}

                {/* Rotating vehicle arrow pointer indicator */}
                <div 
                  className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-colors duration-200 ${
                    isMoving 
                      ? "bg-amber-500 text-slate-950" 
                      : isLight 
                      ? "bg-slate-100 text-slate-500 hover:bg-slate-200" 
                      : "bg-slate-905 border border-slate-800 text-slate-400"
                  }`}
                  style={{
                    transform: `rotate(${headingDeg}deg)`,
                  }}
                >
                  <Navigation 
                    className="w-4 h-4" 
                    style={{
                      transform: "rotate(45deg)", // Lucide Navigation shape normalization
                    }} 
                  />
                </div>

                {/* License badge info */}
                <span className={`text-[8.5px] font-extrabold font-mono border mt-1 px-1.5 py-0.2 rounded shadow-md pointer-events-none ${
                  isSelected 
                    ? "bg-amber-100 border-amber-400 text-amber-900" 
                    : isLight 
                    ? "bg-white/95 border-slate-200 text-slate-900" 
                    : "bg-slate-950/90 border-slate-850 text-slate-100"
                }`}>
                  {loc.state_number}
                </span>
              </div>
            );
          })}
        </div>

        {/* Dynamic Clamped City Node Tooltip */}
        {hoveredNode && positions[hoveredNode.name] && (
          <div
            className={`absolute border rounded-lg shadow-xl px-3 py-1.5 text-xs font-bold z-30 pointer-events-none flex items-center gap-1.5 ${
              isLight 
                ? "bg-white border-slate-300 text-slate-800" 
                : "bg-slate-900 border-slate-755 text-slate-100"
            }`}
            style={getClampedTooltipStyle(positions[hoveredNode.name][0], positions[hoveredNode.name][1], 150, 50)}
          >
            <MapPin className="w-3.5 h-3.5 text-amber-500" />
            <span>{hoveredNode.name}</span>
          </div>
        )}

        {/* Dynamic Clamped Vehicle Info Hover popup */}
        {hoveredVehicle && positions[`v-${hoveredVehicle.vehicle_id}`] && (
          <div
            className={`absolute border rounded-xl shadow-2xl p-3.5 text-xs z-35 pointer-events-none min-w-[210px] backdrop-blur-md flex flex-col ${
              isLight 
                ? "bg-white/95 border-amber-500 text-slate-850" 
                : "bg-slate-900/95 border-amber-500/50 text-slate-100"
            }`}
            style={getClampedTooltipStyle(positions[`v-${hoveredVehicle.vehicle_id}`][0], positions[`v-${hoveredVehicle.vehicle_id}`][1], 215, 140)}
          >
            <div className={`flex justify-between items-center border-b pb-1.5 mb-2 ${
              isLight ? "border-slate-200" : "border-slate-800"
            }`}>
              <span className="font-extrabold text-slate-950 dark:text-slate-50 text-xs">{hoveredVehicle.state_number}</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                hoveredVehicle.engine_on ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                {hoveredVehicle.engine_on ? "Длина: В пути" : "Ожидание"}
              </span>
            </div>
            
            <div className="space-y-1.5 font-sans">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Скорость движения:</span>
                <span className="font-mono font-bold text-slate-950 dark:text-slate-100">{hoveredVehicle.speed} км/ч</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Остаток бака:</span>
                <span className={`font-mono font-bold ${hoveredVehicle.fuel_level < 25 ? "text-rose-500 animate-pulse" : "text-emerald-600"}`}>
                  {hoveredVehicle.fuel_level}%
                </span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Связь спутников:</span>
                <span className="font-mono text-indigo-505 font-bold">{hoveredVehicle.gps_satellites} GPS/Glonass</span>
              </div>
            </div>
          </div>
        )}

        {/* Target Vehicle Focus HUD HUD panel */}
        {activeLocation && positions[`v-${activeLocation.vehicle_id}`] && (
          <div className={`absolute left-4 bottom-4 border rounded-xl p-3 shadow-2xl backdrop-blur-md z-10 max-w-xs transition-all duration-300 animate-[fadeIn_0.2s_ease-out] ${
            isLight ? "bg-white/95 border-amber-500 text-slate-800" : "bg-slate-950/95 border-amber-500 text-white"
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[9px] uppercase tracking-widest text-amber-600 font-extrabold block">Автофокусировка ГИС</span>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5">{activeLocation.state_number}</h3>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onSelectVehicle(null); }}
                className="text-slate-400 hover:text-red-500 text-sm cursor-pointer p-0.5"
              >
                ✕
              </button>
            </div>
            <div className={`grid grid-cols-2 gap-x-4 gap-y-1 mt-2 border-t pt-2 text-[10px] ${
              isLight ? "border-slate-100 text-slate-600" : "border-slate-800 text-slate-300"
            }`}>
              <div>
                <span className="text-slate-400 block pb-0.2">Широта GPS:</span>
                <span className="font-mono font-bold">{activeLocation.latitude.toFixed(4)}°</span>
              </div>
              <div>
                <span className="text-slate-400 block pb-0.2">Долгота GPS:</span>
                <span className="font-mono font-bold">{activeLocation.longitude.toFixed(4)}°</span>
              </div>
              <div>
                <span className="text-slate-400 block pb-0.2">Скорость:</span>
                <span className="font-mono font-bold">{activeLocation.speed} км/ч</span>
              </div>
              <div>
                <span className="text-slate-400 block pb-0.2">Топливо:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{activeLocation.fuel_level}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Speed dial quick focal filters underneath */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {vehicles.map((v) => {
          const loc = visibleLocations.find((item) => sameVehicleId(item.vehicle_id, v.id));
          const isSelected = sameVehicleId(selectedVehicleId, v.id);
          if (!loc) return null;
          return (
            <button
              key={v.id}
              onClick={() => onSelectVehicle(isSelected ? null : v.id)}
              className={`flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? "bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 shadow-md"
                  : isLight
                  ? "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-900/100 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <div className={`p-1.5 rounded-lg flex-shrink-0 ${isSelected ? "bg-amber-500/20 text-amber-500" : "bg-slate-200 dark:bg-slate-800 text-slate-500"}`}>
                <Truck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold font-mono tracking-tight truncate">
                  {v.state_number}
                </div>
                <div className="text-[10px] truncate text-slate-400">
                  {loc.speed > 0 ? `${loc.speed} км/ч • ${loc.fuel_level}%` : "Ожидание"}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
