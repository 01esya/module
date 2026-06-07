export interface Vehicle {
  id: number;
  state_number: string;
  model: string;
  device_id: string;
  active: boolean;
  organization_id: number;
  driver_id?: string | null;
}

export interface CargoLoad {
  id: string;
  weight: number;
  cargo_type: string;
  customer: string;
  carrier: string;
  from_city: string;
  to_city: string;
  date_from: string;
  date_to: string;
  coords: [number, number][];
  vehicle_id: number | null;
  status: "Ожидают" | "В пути" | "Доставлен";
  driver_id?: string | null;
}

export interface Waybill {
  id: number;
  organization_id: number;
  cargo_type: string;
  weight: number;
  customer: string;
  carrier: string;
  from_city: string;
  to_city: string;
  route_coords: [number, number][];
  date_from: string;
  date_to: string;
  status: string;
  vehicle_id: number | null;
  driver_id: number | null;
  vehicle?: { id: number; state_number: string; number?: string } | null;
  driver?: { id: number; full_name: string; role: string; phone?: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  phone: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface LiveLocation {
  vehicle_id: number;
  state_number: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  speed: number;
  fuel_level: number;
  engine_on: boolean;
  gps_satellites: number;
  heading: number;
  cargo_id?: string;
}

export interface TelemetryParameters {
  vehicle_id: number;
  timestamp: string;
  parameters: {
    SUPPLY_VOLTAGE: number;
    FUEL_LEVEL_1: number;
    FUEL_LEVEL_2: number;
    GPS_SATELLITES_COUNT: number;
    DEVICE_STATE: "active" | "idle" | "moving";
    ENGINE_TEMPERATURE: number;
    ODOMETER: number;
  };
}
