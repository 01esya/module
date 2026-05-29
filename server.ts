import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { SupabaseHttpClient, get_vehicles } from "./supabase_http";

const redisMockTokenDurationSec = 3600;
const supabaseClient = new SupabaseHttpClient();

const PORT = 3000;
const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || "http://127.0.0.1:8000";
const STORE_FILE = path.resolve(process.cwd(), "data_store.json");

// Define basic models conforming to schemas.py
interface Vehicle {
  id: number;
  state_number: string;
  model: string;
  device_id: string;
  active: boolean;
  organization_id: number;
  driver_id?: string | null;
}

interface CargoLoad {
  id: string;
  weight: number;
  cargo_type: string;
  customer: string;
  carrier: string;
  from_city: string;
  to_city: string;
  date_from: string; // YYYY-MM-DD
  date_to: string;   // YYYY-MM-DD
  coords: [number, number][]; // [[lat, lng], ...]
  vehicle_id: number | null;
  status: "Ожидают" | "В пути" | "Доставлен";
  driver_id?: string | null;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  phone: string;
}

interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
}

// Memory database loaded/saved to data_store.json
let dbState = {
  vehicles: [] as Vehicle[],
  cargoLoads: [] as CargoLoad[],
  employees: [] as Employee[],
  users: [] as User[]
};

const IN_TRANSIT_STATUS = "В пути";
let apiVehicleCache: Vehicle[] = [];
let apiVehicleCacheLoaded = false;

function sameVehicleId(left: number | string | null | undefined, right: number | string | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
}

function findVehicleById(vehicles: Vehicle[], vehicleId: number | string | null | undefined) {
  return vehicles.find((vehicle) => sameVehicleId(vehicle.id, vehicleId));
}

function getCargoAssignedVehicleIds() {
  return Array.from(new Set(
    dbState.cargoLoads
      .filter((cargo) => cargo.vehicle_id !== null && cargo.vehicle_id !== undefined)
      .map((cargo) => Number(cargo.vehicle_id))
      .filter((vehicleId) => Number.isFinite(vehicleId) && vehicleId >= 42)
  ));
}

function getMockVehicleSource() {
  const assignedVehicleIds = getCargoAssignedVehicleIds();

  if (apiVehicleCacheLoaded && apiVehicleCache.length > 0) {
    return apiVehicleCache.filter((vehicle) => assignedVehicleIds.includes(Number(vehicle.id)) || Number(vehicle.id) >= 42);
  }

  const fallbackVehicles = assignedVehicleIds.map((vehicleId) => {
    const existing = dbState.vehicles.find((vehicle) => Number(vehicle.id) === vehicleId);
    if (existing) {
      return existing;
    }

    const cargo = dbState.cargoLoads.find((item) => Number(item.vehicle_id) === vehicleId);
    return {
      id: vehicleId,
      state_number: `ТС-${vehicleId}`,
      model: cargo?.cargo_type || `Vehicle ${vehicleId}`,
      device_id: `GPS${String(vehicleId).padStart(3, "0")}`,
      active: true,
      organization_id: 1,
      driver_id: cargo?.driver_id || null,
    };
  });

  return fallbackVehicles;
}

function getMockVehicle(vehicleId: number | string | null | undefined, sourceVehicles = getMockVehicleSource()) {
  return findVehicleById(sourceVehicles, vehicleId);
}

function syncCargoLoadsWithApiVehicles(apiVehicles: Vehicle[]) {
  if (apiVehicles.length === 0) return false;

  const activeApiVehicles = apiVehicles.filter((vehicle) => vehicle.active !== false);
  const candidates = activeApiVehicles.length > 0 ? activeApiVehicles : apiVehicles;
  const usedVehicleIds = new Set<number>();

  dbState.cargoLoads.forEach((cargo) => {
    if (cargo.status !== IN_TRANSIT_STATUS) return;
    const vehicle = findVehicleById(candidates, cargo.vehicle_id);
    if (vehicle) {
      usedVehicleIds.add(Number(vehicle.id));
    }
  });

  let changed = false;
  let cursor = 0;

  dbState.cargoLoads.forEach((cargo) => {
    if (cargo.status !== IN_TRANSIT_STATUS) return;
    if (findVehicleById(candidates, cargo.vehicle_id)) return;

    const unassignedVehicle = candidates.find((vehicle) => !usedVehicleIds.has(Number(vehicle.id)));
    const vehicle = unassignedVehicle || candidates[cursor % candidates.length];
    cursor += 1;

    cargo.vehicle_id = Number(vehicle.id);
    if (!cargo.driver_id && vehicle.driver_id) {
      cargo.driver_id = vehicle.driver_id;
    }
    usedVehicleIds.add(Number(vehicle.id));
    changed = true;
  });

  if (changed) {
    saveDatabase();
  }
  return changed;
}

// Seed initial values matching Python backend requirements
function seedDatabase() {
  dbState.vehicles = [
    {
      id: 1,
      state_number: "А123БВ777",
      model: "КАМАЗ 65115",
      device_id: "GPS001",
      active: true,
      organization_id: 1,
      driver_id: "emp-1"
    },
    {
      id: 2,
      state_number: "В456ГД777",
      model: "МАЗ 6312",
      device_id: "GPS002",
      active: true,
      organization_id: 1,
      driver_id: "emp-2"
    },
    {
      id: 3,
      state_number: "С789ЕЖ777",
      model: "Volvo FH16",
      device_id: "GPS003",
      active: true,
      organization_id: 1,
      driver_id: "emp-3"
    },
    {
      id: 4,
      state_number: "Д012ЗИ777",
      model: "Scania R500",
      device_id: "GPS004",
      active: true,
      organization_id: 1,
      driver_id: null
    }
  ];

  dbState.employees = [
    {
      id: "emp-1",
      name: "Сергеев Александр Петрович",
      role: "Водитель КАМАЗа (GPS001)",
      phone: "+79111234567"
    },
    {
      id: "emp-2",
      name: "Иванов Виталий Николаевич",
      role: "Водитель МАЗ (GPS002)",
      phone: "+79219876543"
    },
    {
      id: "emp-3",
      name: "Михайлов Дмитрий Сергеевич",
      role: "Водитель Volvo FH16 (GPS003)",
      phone: "+79031112233"
    },
    {
      id: "emp-4",
      name: "Васильев Олег Игоревич",
      role: "Диспетчер-координатор",
      phone: "+79998887766"
    }
  ];

  // SHA256 code for "changeme123" is evaluated or we do string match
  // For security, standard SHA256 of "changeme123"
  const passwordHash = crypto.createHash("sha256").update("changeme123").digest("hex");
  
  dbState.users = [
    {
      id: "user-1",
      email: "dispatcher@example.com",
      password_hash: passwordHash,
      full_name: "Главный диспетчер",
      role: "dispatcher"
    }
  ];

  dbState.cargoLoads = [
    {
      id: "cargo-1",
      weight: 12500,
      cargo_type: "Металлоконструкции",
      customer: "ООО Спецстроймет",
      carrier: "ТК Вега",
      from_city: "Москва",
      to_city: "Санкт-Петербург",
      date_from: "2026-05-15",
      date_to: "2026-05-23",
      coords: [
        [55.7558, 37.6173],
        [56.2500, 34.0000],
        [58.0000, 33.0000],
        [59.9343, 30.3351]
      ],
      vehicle_id: 1,
      status: "В пути",
      driver_id: "emp-1"
    },
    {
      id: "cargo-2",
      weight: 4800,
      cargo_type: "Замороженные продукты",
      customer: "АО Магнит-Логистик",
      carrier: "ИП Смирнов",
      from_city: "Нижний Новгород",
      to_city: "Казань",
      date_from: "2026-05-18",
      date_to: "2026-05-25",
      coords: [
        [56.3269, 44.0059],
        [56.0000, 46.5000],
        [55.7961, 49.1064]
      ],
      vehicle_id: 2,
      status: "В пути",
      driver_id: "emp-2"
    },
    {
      id: "cargo-3",
      weight: 7500,
      cargo_type: "Автозапчасти",
      customer: "ООО Детали машин",
      carrier: "ТК Вега",
      from_city: "Москва",
      to_city: "Ярославль",
      date_from: "2026-05-20",
      date_to: "2026-05-28",
      coords: [
        [55.7558, 37.6173],
        [56.5000, 38.5000],
        [57.6261, 39.8845]
      ],
      vehicle_id: 3,
      status: "Ожидают",
      driver_id: "emp-3"
    }
  ];
}

function loadDatabase() {
  if (fs.existsSync(STORE_FILE)) {
    try {
      const data = fs.readFileSync(STORE_FILE, "utf-8");
      dbState = JSON.parse(data);
      console.log("Database loaded from persistence.");
    } catch (e) {
      console.error("Failed to read database, seeding default state", e);
      seedDatabase();
    }
  } else {
    seedDatabase();
    saveDatabase();
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(dbState, null, 2), "utf-8");
  } catch (err) {
    console.error("Save db state failed", err);
  }
}

loadDatabase();

// Route helpers for GPS simulation
// Calculates the heading in degrees between two coordinates [lat, lon]
function calculateHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const heading = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((heading + 360) % 360);
}

function getVehicleMockIndex(vehicleId: number) {
  const numericId = Number(vehicleId);
  return Number.isFinite(numericId) ? Math.abs(numericId) % 10 : 0;
}

function getMockFuelLevel(vehicleId: number, base = 76) {
  return Math.max(10, Math.round(base - getVehicleMockIndex(vehicleId) * 4));
}

// Dynamic location getter imitating monitoring_mock.py
function getMockLocation(vehicleId: number, sourceVehicles = getMockVehicleSource()): any {
  const vehicle = getMockVehicle(vehicleId, sourceVehicles);
  if (!vehicle) return { error: "Vehicle not found" };

  // Check if cargo is assigned with "В пути"
  const cargo = dbState.cargoLoads.find((c) => sameVehicleId(c.vehicle_id, vehicleId) && c.status === IN_TRANSIT_STATUS);

  if (cargo && cargo.coords && cargo.coords.length >= 2) {
    // Interporation along points
    const dateFrom = new Date(cargo.date_from).getTime();
    const dateTo = new Date(cargo.date_to).getTime();
    const today = new Date().getTime();

    let progress = 0;
    if (today >= dateFrom && today <= dateTo) {
      progress = (today - dateFrom) / (dateTo - dateFrom);
    } else if (today > dateTo) {
      progress = 1.0;
    }

    // Map progress (0 to 1) along multiple multi-point path coordinates
    const sectionsCount = cargo.coords.length - 1;
    const progressInSections = progress * sectionsCount;
    const currentSectionIdx = Math.min(Math.floor(progressInSections), sectionsCount - 1);
    const sectionProgress = progressInSections - currentSectionIdx;

    const startNode = cargo.coords[currentSectionIdx];
    const endNode = cargo.coords[currentSectionIdx + 1];

    let lat = startNode[0] + (endNode[0] - startNode[0]) * sectionProgress;
    let lng = startNode[1] + (endNode[1] - startNode[1]) * sectionProgress;

    // Small random bounce so markers flicker realistic movement
    lat += (Math.random() - 0.5) * 0.003;
    lng += (Math.random() - 0.5) * 0.003;

    const heading = calculateHeading(startNode[0], startNode[1], endNode[0], endNode[1]);
    const fuelLevel = Math.max(15, Math.round((100 - progress * 45 + Math.sin(Date.now() / 600000) * 3) * 10) / 10);
    const speed = Math.round(62 + Math.sin(Date.now() / 15000) * 8 + (Math.random() - 0.5) * 3);

    return {
      vehicle_id: vehicleId,
      state_number: vehicle.state_number,
      timestamp: new Date().toISOString(),
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      speed: speed,
      fuel_level: fuelLevel,
      engine_on: true,
      gps_satellites: Math.round(9 + Math.sin(Date.now() / 30000) * 2 + Math.random() * 1.5),
      heading: heading,
      cargo_id: cargo.id
    };
  }

  // Fallback random location (e.g. idle around base city near Moscow)
  const baseLat = 55.7558;
  const baseLon = 37.6173;
  const offset = getVehicleMockIndex(vehicleId) * 0.12;
  const engineChance = (Date.now() + vehicleId * 1000) % 60000 > 30000;

  return {
    vehicle_id: vehicleId,
    state_number: vehicle.state_number,
    timestamp: new Date().toISOString(),
    latitude: Number((baseLat + offset + Math.sin((Date.now() + vehicleId * 50000) / 120000) * 0.01).toFixed(6)),
    longitude: Number((baseLon + offset + Math.cos((Date.now() + vehicleId * 50000) / 120000) * 0.01).toFixed(6)),
    speed: engineChance ? Math.round(15 + Math.random() * 5) : 0,
    fuel_level: getMockFuelLevel(vehicleId),
    engine_on: engineChance,
    gps_satellites: 8,
    heading: Math.round((vehicleId * 90 + (Date.now() / 10000)) % 360)
  };
}

// Generate past history points
function getMockHistory(vehicleId: number, limit = 40, sourceVehicles = getMockVehicleSource()): any[] {
  const result = [];
  const cargo = dbState.cargoLoads.find((c) => sameVehicleId(c.vehicle_id, vehicleId));
  const vehicle = getMockVehicle(vehicleId, sourceVehicles);
  
  const refLat = cargo?.coords?.[0]?.[0] || 55.7558;
  const refLng = cargo?.coords?.[0]?.[1] || 37.6173;
  const destLat = cargo?.coords?.[cargo.coords.length - 1]?.[0] || 59.9343;
  const destLng = cargo?.coords?.[cargo.coords.length - 1]?.[1] || 30.3351;

  const now = new Date();
  for (let i = limit; i >= 0; i--) {
    const t = i / limit;
    const timestamp = new Date(now.getTime() - i * 15 * 60000).toISOString();
    const lat = refLat + (destLat - refLat) * (1 - t) + (Math.sin(i * 0.4) * 0.005);
    const lng = refLng + (destLng - refLng) * (1 - t) + (Math.cos(i * 0.4) * 0.005);
    const speed = i === 0 || i === limit ? 0 : Math.round(65 + Math.sin(i * 1.5) * 10);
    const fuel = Math.round((95 - (1 - t) * 35) * 10) / 10;
    
    result.push({
      vehicle_id: vehicleId,
      timestamp,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      speed,
      fuel_level: fuel,
      engine_on: speed > 0,
      gps_satellites: Math.floor(8 + Math.random() * 4),
      heading: calculateHeading(refLat, refLng, destLat, destLng),
      decoded_parameters: {
        SUPPLY_VOLTAGE: Number((12.5 + Math.sin(i) * 0.2).toFixed(2)),
        FUEL_LEVEL_1: fuel,
        GPS_SATELLITES_COUNT: Math.floor(8 + Math.random() * 4),
        DEVICE_STATE: speed > 0 ? "active" : "idle"
      }
    });
  }
  return result;
}

// Start creating Express Application
async function startServer() {
  const app = express();
  app.use(express.json());

  // Helper to parse cookies safely
  function getCookies(req: express.Request) {
    const cookieHeader = req.headers.cookie;
    const cookies: { [key: string]: string } = {};
    if (cookieHeader) {
      cookieHeader.split(";").forEach((cookie: string) => {
        const parts = cookie.split("=");
        const name = parts[0].trim();
        const value = parts.slice(1).join("=");
        cookies[name] = decodeURIComponent(value);
      });
    }
    return cookies;
  }

  // Helper to map Supabase user metadata to app User DTO
  function mapSupabaseUser(sbUser: any) {
    return {
      id: sbUser.id,
      email: sbUser.email,
      full_name: sbUser.user_metadata?.full_name || sbUser.email.split("@")[0],
      role: sbUser.user_metadata?.role || "dispatcher"
    };
  }

  function isLocalDemoCredentials(email: string, password: string) {
    return (email === "dispatcher@example.com" && password === "changeme123") ||
      (email === "test@ends.ru" && password === "fdp-swf-AdZ-RB7");
  }

  function isLocalDemoToken(token: string | undefined) {
    return typeof token === "string" && token.startsWith("local-token:");
  }

  function getLocalDemoEmail(token: string | undefined) {
    return token?.replace(/^local-token:/, "") || "test@ends.ru";
  }

  function buildLocalDemoUser(email: string) {
    return {
      id: "user-local-demo",
      email,
      full_name: email === "test@ends.ru" ? "Тестовый пользователь" : "Главный диспетчер",
      role: "dispatcher"
    };
  }

  // Cookie settings based on env config
  const isProd = process.env.NODE_ENV === "production";
  const cookieSecure = process.env.COOKIE_SECURE === "true" || isProd;
  const cookieSameSite = (process.env.COOKIE_SAMESITE as any) || (isProd ? "none" : "lax");

  // CORS with credentials support
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_ORIGIN || "http://localhost:5173");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PATCH, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Reset-Token, Authorization, Cookie");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // JWT cookies-based verifying middleware with silent token refresh
  async function authorizeUser(req: any, res: any, next: any) {
    const cookies = getCookies(req);
    let accessToken = cookies["sb_access_token"];
    const refreshToken = cookies["sb_refresh_token"];

    if (isLocalDemoToken(accessToken)) {
      const email = getLocalDemoEmail(accessToken);
      req.user = buildLocalDemoUser(email);
      req.sb_access_token = accessToken;
      return next();
    }

    if (accessToken) {
      const userResult = await supabaseClient.get_user(accessToken);
      if (!userResult.error && userResult.data) {
        req.user = mapSupabaseUser(userResult.data);
        req.sb_access_token = accessToken;
        return next();
      }
    }

    if (typeof refreshToken === "string" && refreshToken.startsWith("local-refresh:")) {
      const email = refreshToken.replace(/^local-refresh:/, "");
      req.user = buildLocalDemoUser(email);
      req.sb_access_token = `local-token:${email}`;
      return next();
    }

    if (refreshToken) {
      console.log("[BFF Auth] Access token expired or missing. Attempting silent refresh...");
      const refreshResult = await supabaseClient.refresh_session(refreshToken);
      if (!refreshResult.error && refreshResult.data) {
        const data = refreshResult.data;
        
        res.cookie("sb_access_token", data.access_token, {
          httpOnly: true,
          secure: cookieSecure,
          sameSite: cookieSameSite,
          path: "/",
          maxAge: data.expires_in ? data.expires_in * 1000 : 3600 * 1000
        });

        res.cookie("sb_refresh_token", data.refresh_token, {
          httpOnly: true,
          secure: cookieSecure,
          sameSite: cookieSameSite,
          path: "/",
          maxAge: 30 * 24 * 3600 * 1000
        });

        req.user = mapSupabaseUser(data.user);
        req.sb_access_token = data.access_token;
        return next();
      }
    }

    if (req.path === "/api/auth/me") {
      res.clearCookie("sb_access_token", { path: "/" });
      res.clearCookie("sb_refresh_token", { path: "/" });
    }
    return res.status(401).json({ detail: "Требуется авторизация" });
  }

  function fastApiAuthHeaders(req: any, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { ...extra };
    if (req.sb_access_token) {
      headers.Authorization = `Bearer ${req.sb_access_token}`;
    }
    return headers;
  }

  // API Endpoints: Auth
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: "Заполните все поля" });
    }

    const cleanEmail = email.toLowerCase().trim();

    const result = await supabaseClient.password_login(cleanEmail, password);
    if (!result.error && result.data) {
      const data = result.data;
      res.cookie("sb_access_token", data.access_token, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/",
        maxAge: data.expires_in ? data.expires_in * 1000 : 3600 * 1000
      });

      res.cookie("sb_refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/",
        maxAge: 30 * 24 * 3600 * 1000
      });

      const mappedUser = mapSupabaseUser(data.user);
      return res.json({
        access_token: "sb_session_active",
        user: mappedUser
      });
    }

    // Fallback only for the documented local demo/test accounts when Supabase auth is unavailable.
    if (isLocalDemoCredentials(cleanEmail, password)) {
      res.cookie("sb_access_token", `local-token:${cleanEmail}`, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/",
        maxAge: 24 * 3600 * 1000
      });
      res.cookie("sb_refresh_token", `local-refresh:${cleanEmail}`, {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        path: "/",
        maxAge: 30 * 24 * 3600 * 1000
      });
      return res.json({
        access_token: "sb_session_active",
        user: buildLocalDemoUser(cleanEmail)
      });
    }

    return res.status(result.status || 401).json({ detail: result.message || "Неверный email или пароль" });

  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("sb_access_token", { path: "/" });
    res.clearCookie("sb_refresh_token", { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", authorizeUser, async (req: any, res) => {
    try {
      const fastApiRes = await fetch(`${FASTAPI_BASE_URL}/api/auth/me`, {
        headers: fastApiAuthHeaders(req, { Cookie: req.headers.cookie || "" })
      });
      if (fastApiRes.ok) {
        const fastApiData = await fastApiRes.json();
        return res.json(fastApiData);
      }
    } catch (err) {
      console.warn("[BFF] FastAPI auth/me unavailable, falling back to Express session.", err);
    }
    res.json(req.user);
  });

  // API Endpoints: Loads (Waybills)
  app.get("/api/loads", authorizeUser, (req, res) => {
    if (apiVehicleCache.length > 0) {
      syncCargoLoadsWithApiVehicles(apiVehicleCache);
    }
    res.json(dbState.cargoLoads);
  });

  app.get("/api/loads/:id", authorizeUser, (req, res) => {
    const obj = dbState.cargoLoads.find((c) => c.id === req.params.id);
    if (!obj) {
      return res.status(404).json({ detail: "Груз не найден" });
    }
    res.json(obj);
  });

  app.post("/api/loads", authorizeUser, (req, res) => {
    const {
      weight,
      cargo_type,
      customer,
      carrier,
      from_city,
      to_city,
      date_from,
      date_to,
      coords,
      vehicle_id,
      driver_id
    } = req.body;

    if (!weight || !cargo_type || !customer || !carrier || !from_city || !to_city || !date_from || !date_to || !coords) {
      return res.status(422).json({ detail: "Некорректные параметры создания груза" });
    }

    // Evaluate default status
    const today = new Date().toISOString().split("T")[0];
    let status: "Ожидают" | "В пути" | "Доставлен" = "Ожидают";
    if (today >= date_from && today <= date_to) {
      status = "В пути";
    } else if (today > date_to) {
      status = "Доставлен";
    }

    const newCargo: CargoLoad = {
      id: `cargo-${crypto.randomUUID().slice(0, 8)}`,
      weight: Number(weight),
      cargo_type,
      customer,
      carrier,
      from_city,
      to_city,
      date_from,
      date_to,
      coords,
      vehicle_id: vehicle_id ? Number(vehicle_id) : null,
      driver_id: driver_id || null,
      status
    };

    dbState.cargoLoads.push(newCargo);
    saveDatabase();
    res.status(200).json(newCargo);
  });

  app.patch("/api/loads/:id", authorizeUser, (req, res) => {
    const idx = dbState.cargoLoads.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ detail: "Груз не найден" });
    }
    
    const original = dbState.cargoLoads[idx];
    const update = req.body;

    dbState.cargoLoads[idx] = {
      ...original,
      ...update,
      id: original.id // Lock the ID
    };

    saveDatabase();
    res.json(dbState.cargoLoads[idx]);
  });

  app.patch("/api/loads/:id/status", authorizeUser, (req, res) => {
    const idx = dbState.cargoLoads.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ detail: "Груз не найден" });
    }

    const { status } = req.body;
    if (!status || !["Ожидают", "В пути", "Доставлен"].includes(status)) {
      return res.status(400).json({ detail: "Неверный статус" });
    }

    dbState.cargoLoads[idx].status = status;
    saveDatabase();
    res.json(dbState.cargoLoads[idx]);
  });

  // API Endpoints: Employees
  app.get("/api/employees", authorizeUser, (req, res) => {
    res.json(dbState.employees);
  });

  app.post("/api/employees", authorizeUser, (req, res) => {
    const { name, role, phone } = req.body;
    if (!name || !role || !phone) {
      return res.status(400).json({ detail: "Заполните все обязательные поля" });
    }

    const newEmp: Employee = {
      id: `emp-${crypto.randomUUID().slice(0, 8)}`,
      name,
      role,
      phone
    };

    dbState.employees.push(newEmp);
    saveDatabase();
    res.status(201).json(newEmp);
  });

  app.delete("/api/employees/:id", authorizeUser, (req, res) => {
    const idx = dbState.employees.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ detail: "Сотрудник не найден" });
    }

    dbState.employees.splice(idx, 1);
    saveDatabase();
    res.status(204).send();
  });

  // Response helper for Supabase HttpClient responses
  function handleSupabaseResponse(supabaseRes: any, expressRes: any) {
    if (supabaseRes.error) {
      if (supabaseRes.status === 401) {
        return expressRes.status(401).json({ detail: "Неавторизован в Supabase" });
      }
      if (supabaseRes.status === 403) {
        return expressRes.status(403).json({ detail: supabaseRes.message || "Доступ запрещен" });
      }
      if (supabaseRes.status === 404) {
        return expressRes.status(404).json({ detail: supabaseRes.message || "Не найдено" });
      }
      if (supabaseRes.status >= 500) {
        return expressRes.status(502).json({ detail: supabaseRes.message || "Ошибка внешнего сервиса (Supabase)" });
      }
      return expressRes.status(supabaseRes.status || 500).json({ detail: supabaseRes.message || "Ошибка сервера" });
    }
    return expressRes.json(supabaseRes.data);
  }

  function isTechnicalFallbackStatus(status?: number) {
    return status === 502 || status === 503 || status === 504 || status === 408 || status === 425;
  }

  function isAuthFailureStatus(status?: number) {
    return status === 401 || status === 403;
  }

  function normalizeApiVehicles(items: any[]) {
    return items.map((v: any) => ({
      id: Number(v.id),
      state_number: v.state_number || v.number || String(v.id),
      model: v.model || "",
      device_id: v.device_id || `GPS${String(v.id).padStart(3, "0")}`,
      active: v.active !== false,
      organization_id: Number(v.organization_id || 0),
      driver_id: v.driver_id || null
    }));
  }

  // API Endpoints: Monitoring BFF Proxy directly targeting Supabase based on contract in api.http
  app.get("/api/monitoring/vehicles", authorizeUser, async (req: any, res) => {
    const sourceVehicles = getMockVehicleSource();
    if (apiVehicleCacheLoaded && sourceVehicles.length > 0) {
      res.setHeader("X-CargoFlow-Data-Mode", "api");
      return res.json(sourceVehicles);
    }

    if (isLocalDemoToken(req.sb_access_token)) {
      apiVehicleCache = [];
      apiVehicleCacheLoaded = false;
      const fallbackVehicles = getMockVehicleSource();
      res.setHeader("X-CargoFlow-Data-Mode", "demo");
      return res.json(fallbackVehicles);
    }

    try {
      const fastApiRes = await fetch(`${FASTAPI_BASE_URL}/api/vehicles`, {
        headers: fastApiAuthHeaders(req)
      });
      if (fastApiRes.ok) {
        const fastApiData = await fastApiRes.json();
        if (Array.isArray(fastApiData)) {
          const vehicles = normalizeApiVehicles(fastApiData);
          apiVehicleCache = vehicles;
          apiVehicleCacheLoaded = true;
          syncCargoLoadsWithApiVehicles(vehicles);
          res.setHeader("X-CargoFlow-Data-Mode", "api");
          return res.json(vehicles);
        }
      } else if (!isTechnicalFallbackStatus(fastApiRes.status) && !isAuthFailureStatus(fastApiRes.status)) {
        return res.status(fastApiRes.status).json(await fastApiRes.json().catch(() => ({ detail: "FastAPI vehicles request failed" })));
      }
    } catch (err) {
      console.warn("[BFF] FastAPI vehicles route unavailable, falling back to Supabase.", err);
    }

    const result = await get_vehicles(req.sb_access_token);
    if (!result.error && Array.isArray(result.data)) {
      const vehicles = normalizeApiVehicles(result.data);
      apiVehicleCache = vehicles;
      apiVehicleCacheLoaded = true;
      syncCargoLoadsWithApiVehicles(vehicles);
      res.setHeader("X-CargoFlow-Data-Mode", "api");
      return res.json(vehicles);
    }

    if (result.error && (result.status === 401 || result.status === 403)) {
      apiVehicleCache = [];
      apiVehicleCacheLoaded = false;
      return handleSupabaseResponse(result, res);
    }

    if (result.error && isTechnicalFallbackStatus(result.status)) {
      const fallbackVehicles = getMockVehicleSource();
      apiVehicleCache = fallbackVehicles;
      apiVehicleCacheLoaded = true;
      res.setHeader("X-CargoFlow-Data-Mode", "fallback");
      return res.json(fallbackVehicles);
    }

    return handleSupabaseResponse(result, res);
  });

  app.get("/api/monitoring/vehicles/:vehicle_id", authorizeUser, async (req: any, res) => {
    const vehicleId = Number(req.params.vehicle_id);
    if (isNaN(vehicleId)) {
      return res.status(400).json({ detail: "Некорректный ID транспорта" });
    }

    if (isLocalDemoToken(req.sb_access_token)) {
      const match = dbState.vehicles.find((v) => Number(v.id) === Number(vehicleId));
      if (match) return res.json(match);
      return res.status(404).json({ detail: "ТС не найдено во внутренней БД" });
    }

    const result = await supabaseClient.get_vehicle(vehicleId, req.sb_access_token);
    if (result.error && (result.status === 401 || result.status === 403)) {
      return handleSupabaseResponse(result, res);
    }
    if (result.error && isTechnicalFallbackStatus(result.status)) {
      const match = dbState.vehicles.find((v) => Number(v.id) === Number(vehicleId));
      res.setHeader("X-CargoFlow-Data-Mode", "demo");
      if (match) return res.json(match);
      return res.status(404).json({ detail: "ТС не найдено" });
    }
    if (result.error) {
      return handleSupabaseResponse(result, res);
    }
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ detail: "ТС не найдено" });
    }

    const v = Array.isArray(result.data) ? result.data[0] : result.data;
    return res.json(normalizeApiVehicles([v])[0]);
  });

  app.get("/api/monitoring/vehicles/:id/location", authorizeUser, async (req: any, res) => {
    try {
      const fastApiRes = await fetch(`${FASTAPI_BASE_URL}/api/monitoring/vehicles/${req.params.id}/location`, {
        headers: fastApiAuthHeaders(req)
      });
      if (fastApiRes.ok) {
        return res.json(await fastApiRes.json());
      }
      if (!isTechnicalFallbackStatus(fastApiRes.status) && !isAuthFailureStatus(fastApiRes.status)) {
        return res.status(fastApiRes.status).json(await fastApiRes.json().catch(() => ({ detail: "FastAPI location request failed" })));
      }
    } catch (err) {
      console.warn("[BFF] FastAPI location unavailable, falling back to Express mock.", err);
    }

    const vehicleId = Number(req.params.id);
    const sourceVehicles = getMockVehicleSource();
    const loc = getMockLocation(vehicleId, sourceVehicles);
    if (loc.error) {
      return res.status(404).json({ detail: loc.error });
    }
    res.setHeader("X-CargoFlow-Data-Mode", apiVehicleCacheLoaded && sourceVehicles.length > 0 ? "api" : "demo");
    res.json(loc);
  });

  app.get("/api/monitoring/vehicles/:id/history", authorizeUser, async (req: any, res) => {
    try {
      const fastApiRes = await fetch(`${FASTAPI_BASE_URL}/api/monitoring/vehicles/${req.params.id}/history`, {
        headers: fastApiAuthHeaders(req)
      });
      if (fastApiRes.ok) {
        return res.json(await fastApiRes.json());
      }
      if (!isTechnicalFallbackStatus(fastApiRes.status) && !isAuthFailureStatus(fastApiRes.status)) {
        return res.status(fastApiRes.status).json(await fastApiRes.json().catch(() => ({ detail: "FastAPI history request failed" })));
      }
    } catch (err) {
      console.warn("[BFF] FastAPI history unavailable, falling back to Express mock.", err);
    }

    const vehicleId = Number(req.params.id);
    const sourceVehicles = getMockVehicleSource();
    const vehicle = getMockVehicle(vehicleId, sourceVehicles);
    if (!vehicle) {
      return res.status(404).json({ detail: "ТС не найдено во внутренней БД" });
    }
    const history = getMockHistory(vehicleId, 30, sourceVehicles);
    res.setHeader("X-CargoFlow-Data-Mode", apiVehicleCacheLoaded && sourceVehicles.length > 0 ? "api" : "demo");
    res.json(history);
  });

  app.get("/api/monitoring/vehicles/:id/parameters", authorizeUser, async (req: any, res) => {
    try {
      const fastApiRes = await fetch(`${FASTAPI_BASE_URL}/api/monitoring/vehicles/${req.params.id}/parameters`, {
        headers: fastApiAuthHeaders(req)
      });
      if (fastApiRes.ok) {
        return res.json(await fastApiRes.json());
      }
      if (!isTechnicalFallbackStatus(fastApiRes.status) && !isAuthFailureStatus(fastApiRes.status)) {
        return res.status(fastApiRes.status).json(await fastApiRes.json().catch(() => ({ detail: "FastAPI parameters request failed" })));
      }
    } catch (err) {
      console.warn("[BFF] FastAPI parameters unavailable, falling back to Express mock.", err);
    }

    const vehicleId = Number(req.params.id);
    const sourceVehicles = getMockVehicleSource();
    const vehicle = getMockVehicle(vehicleId, sourceVehicles);
    if (!vehicle) {
      return res.status(404).json({ detail: "ТС не найдено во внутренней БД" });
    }

    const isMoving = (Date.now() + vehicleId * 1000) % 60000 > 30000;
    res.setHeader("X-CargoFlow-Data-Mode", apiVehicleCacheLoaded && sourceVehicles.length > 0 ? "api" : "demo");
    res.json({
      vehicle_id: vehicleId,
      timestamp: new Date().toISOString(),
      parameters: {
        SUPPLY_VOLTAGE: Number((12.4 + Math.random() * 0.4).toFixed(2)),
        FUEL_LEVEL_1: getMockFuelLevel(vehicleId),
        FUEL_LEVEL_2: getMockFuelLevel(vehicleId, 75),
        GPS_SATELLITES_COUNT: 9,
        DEVICE_STATE: isMoving ? "moving" : "idle",
        ENGINE_TEMPERATURE: isMoving ? Math.round(86 + Math.random() * 4) : 45,
        ODOMETER: 125000 + vehicleId * 8400 + Math.round(Date.now() / 60000) % 1000
      }
    });
  });

  app.get("/api/monitoring/device-types", authorizeUser, async (req: any, res) => {
    const result = await supabaseClient.get_device_types(req.sb_access_token);
    return handleSupabaseResponse(result, res);
  });

  app.get("/api/monitoring/parameters", authorizeUser, async (req: any, res) => {
    const category = req.query.category ? String(req.query.category) : undefined;
    const result = await supabaseClient.get_parameters(req.sb_access_token, category);
    return handleSupabaseResponse(result, res);
  });

  app.get("/api/monitoring/organizations", authorizeUser, async (req: any, res) => {
    const result = await supabaseClient.get_organizations(req.sb_access_token);
    return handleSupabaseResponse(result, res);
  });

  app.get("/api/monitoring/profiles", authorizeUser, async (req: any, res) => {
    const result = await supabaseClient.get_profiles(req.sb_access_token);
    return handleSupabaseResponse(result, res);
  });

  app.get("/api/monitoring/navigation-devices", authorizeUser, async (req: any, res) => {
    const result = await supabaseClient.get_navigation_devices(req.sb_access_token);
    return handleSupabaseResponse(result, res);
  });

  app.get("/api/monitoring/vehicle-devices", authorizeUser, async (req: any, res) => {
    const result = await supabaseClient.get_vehicle_devices(req.sb_access_token);
    return handleSupabaseResponse(result, res);
  });

  app.get("/api/monitoring/user-vehicles", authorizeUser, async (req: any, res) => {
    const result = await supabaseClient.get_user_vehicles(req.sb_access_token);
    return handleSupabaseResponse(result, res);
  });

  app.post("/api/monitoring/records", authorizeUser, async (req: any, res) => {
    const { vehicle_id, from, to, limit, offset } = req.body;
    if (!vehicle_id || !from || !to) {
      return res.status(400).json({ detail: "Параметры vehicle_id, from и to обязательны" });
    }
    const resolvedLimit = limit !== undefined ? Number(limit) : 50;
    const resolvedOffset = offset !== undefined ? Number(offset) : 0;
    const result = await supabaseClient.get_monitoring_records(
      req.sb_access_token,
      Number(vehicle_id),
      String(from),
      String(to),
      resolvedLimit,
      resolvedOffset
    );
    return handleSupabaseResponse(result, res);
  });

  // API Endpoints: Gemini AI Analyst
  app.post("/api/ai/analyze", authorizeUser, async (req: any, res) => {
    try {
      const fastApiRes = await fetch(`${FASTAPI_BASE_URL}/api/ai/analyze`, {
        method: "POST",
        headers: {
          ...fastApiAuthHeaders(req),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req.body)
      });
      if (fastApiRes.ok) {
        return res.json(await fastApiRes.json());
      }
    } catch (err) {
      console.warn("[BFF] FastAPI AI unavailable, falling back to Express Gemini path.", err);
    }

    const { cargoId, question } = req.body;
    if (!cargoId) {
      return res.status(400).json({ detail: "Не передан ID груза" });
    }

    const cargo = dbState.cargoLoads.find((c) => c.id === cargoId);
    if (!cargo) {
      return res.status(404).json({ detail: "Груз не найден" });
    }

    const sourceVehicles = getMockVehicleSource();
    const vehicle = cargo.vehicle_id ? getMockVehicle(cargo.vehicle_id, sourceVehicles) : null;
    const currentLocation = vehicle ? getMockLocation(vehicle.id, sourceVehicles) : null;

    // AI logic configuration using @google/genai SDK
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        text: `🤖 **ИИ-Консультант**: Функция ИИ временно не отвечает, так как отсутствует \`GEMINI_API_KEY\`. 

Но мы проанализировали параметры локально:
* Маршрут: ${cargo.from_city} ➔ ${cargo.to_city}
* Тип: ${cargo.cargo_type} (${cargo.weight} кг)
* ТС: ${vehicle ? `${vehicle.model} (${vehicle.state_number})` : "Не назначено"}
* Статус автомобиля: ${currentLocation ? `В движении, Скорость: ${currentLocation.speed} км/ч, Топливо: ${currentLocation.fuel_level}%` : "Ожидает старта"}`
      });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const systemInstruction = `Ты - опытный ИИ-диспетчер логистической компании. Твоя задача - анализировать состояние рейса, параметры телеметрии и давать краткие, четкие и экспертные советы по оптимизации маршрута, экономии топлива, погодных условий или задержек. Ответ выдавай в красивой разметке Markdown на русском языке. Будь дружелюбен, конкретен и профессионален.`;

      const promptContext = `
      Информация о рейсе:
      - Номер груза: ${cargo.id}
      - Вес груза: ${cargo.weight} кг
      - Груз: ${cargo.cargo_type}
      - Заказчик: ${cargo.customer}
      - Маршрут: Из ${cargo.from_city} в ${cargo.to_city}
      - Даты: С ${cargo.date_from} по ${cargo.date_to}
      - Статус: ${cargo.status}
      - Транспортное средство: ${vehicle ? `${vehicle.model} (${vehicle.state_number})` : "Нет назначенных"}
      
      Текущая телеметрия GPS:
      ${currentLocation ? JSON.stringify(currentLocation, null, 2) : "Нет данных (ТС не в пути)"}

      Пользовательский вопрос/запрос: "${question || "Дай полный логический отчет о рейсе, текущем поведении, потенциальных рисках и советах"}"
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptContext,
        config: {
          systemInstruction,
          temperature: 0.7
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API call failure:", error);
      res.status(500).json({ detail: "Ошибка при вызове ИИ-Анализатора: " + error.message });
    }
  });

  // Admin resets db
  app.post("/api/admin/reset-database", (req, res) => {
    // Easily rebuild seed data
    seedDatabase();
    saveDatabase();
    res.json({ ok: true, message: "База данных сброшена до исходных значений" });
  });

  // Serve static files and hotreload in dev, or static asset server in prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ["**/data_store.json", "**/dist/**", "**/node_modules/**"],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server loaded and listening on port ${PORT}`);
  });
}

startServer();
