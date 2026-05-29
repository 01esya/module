import dotenv from "dotenv";
import https from "https";
import http from "http";

dotenv.config();

const DEFAULT_SUPABASE_URL = "https://194-67-127-185.cloudvps.regruhosting.ru";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0MjkwNTkwLCJleHAiOjE5MzE5NzA1OTB9.I5pEgsEt60x6j0TLrJQDTYN9WyAVDWpnLJvReL_ezQQ";

export class SupabaseHttpClient {
  private baseUrl: string;
  private anonKey: string;

  constructor() {
    this.baseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    this.anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  }

  private getHeaders(accessToken?: string) {
    const headers: { [key: string]: string } = {
      "apikey": this.anonKey,
      "Content-Type": "application/json"
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    return headers;
  }

  // Handle common HTTP requests with error classification
  private async request(path: string, method: string, options: { body?: any; headers?: any } = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = { ...this.getHeaders(), ...options.headers };

    try {
      console.log(`[Supabase HTTP] Request ${method} ${url}`);
      const target = new URL(url);
      const transport = target.protocol === "https:" ? https : http;

      const response = await new Promise<{ status: number; body: any; rawText?: string }>((resolve, reject) => {
        const req = transport.request(
          {
            hostname: target.hostname,
            port: target.port || (target.protocol === "https:" ? 443 : 80),
            path: `${target.pathname}${target.search}`,
            method,
            headers,
            timeout: 30000,
          },
          (res) => {
            let raw = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              raw += chunk;
            });
            res.on("end", () => {
              let parsed: any = raw;
              if (raw) {
                try {
                  parsed = JSON.parse(raw);
                } catch {
                  // keep raw text when response is not valid JSON
                }
              }
              resolve({ status: res.statusCode || 500, body: parsed, rawText: raw });
            });
          }
        );

        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy(new Error("Supabase request timed out"));
        });

        if (options.body !== undefined) {
          req.write(JSON.stringify(options.body));
        }

        req.end();
      });

      if (response.status < 200 || response.status >= 300) {
        const message = typeof response.body === "object"
          ? (response.body.message || response.body.error_description || JSON.stringify(response.body))
          : String(response.body || response.rawText || "Ошибка сервиса Supabase");

        console.error(`[Supabase HTTP] Error response ${response.status} from ${url}:`, response.body);
        return {
          error: true,
          status: response.status,
          message
        };
      }

      return { error: false, data: response.body, status: response.status };
    } catch (err: any) {
      console.error(`[Supabase HTTP] Request failed for ${url}:`, err);
      return {
        error: true,
        status: 502,
        message: err.message || "Failed to connect to Supabase backend service"
      };
    }
  }

  // POST /auth/v1/token?grant_type=password
  async password_login(email: string, password: string) {
    const path = "/auth/v1/token?grant_type=password";
    return this.request(path, "POST", {
      body: { email, password }
    });
  }

  // POST /auth/v1/token?grant_type=refresh_token
  async refresh_session(refresh_token: string) {
    const path = "/auth/v1/token?grant_type=refresh_token";
    return this.request(path, "POST", {
      body: { refresh_token }
    });
  }

  // GET /auth/v1/user
  async get_user(accessToken: string) {
    const path = "/auth/v1/user";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/device_types?select=*
  async get_device_types(accessToken: string) {
    const path = "/rest/v1/device_types?select=*";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/parameters
  async get_parameters(accessToken: string, category?: string) {
    let path = "/rest/v1/parameters?select=*&order=code.asc";
    if (category) {
      path = `/rest/v1/parameters?select=code,key,name,value_type,unit,category&category=eq.${category}&order=code.asc`;
    }
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/organizations?select=*
  async get_organizations(accessToken: string) {
    const path = "/rest/v1/organizations?select=*";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/profiles
  async get_profiles(accessToken: string) {
    const path = "/rest/v1/profiles";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/vehicles?select=*&order=id.asc
  async get_vehicles(accessToken: string) {
    const path = "/rest/v1/vehicles?select=*&order=id.asc";
    return this.request(path, "GET", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "apikey": this.anonKey
      }
    });
  }

  // GET /rest/v1/vehicles?select=*&id=eq.1
  async get_vehicle(vehicleId: number, accessToken: string) {
    const path = `/rest/v1/vehicles?select=*,organization:organizations(id,name,active)&id=eq.${vehicleId}`;
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/vehicles?select=*&active=eq.true&order=id.asc
  async get_active_vehicles(accessToken: string) {
    const path = "/rest/v1/vehicles?select=*&active=eq.true&order=id.asc";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/navigation_devices?select=*&order=id.asc
  async get_navigation_devices(accessToken: string) {
    const path = "/rest/v1/navigation_devices?select=*&order=id.asc";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/vehicle_devices?select=... (with expanded schemas as specified in api.http)
  async get_vehicle_devices(accessToken: string) {
    const path = "/rest/v1/vehicle_devices?select=id,active,vehicle_id,navigation_device_id,vehicle:vehicles(id,state_number,organization_id,number,active,organization:organizations(id,name,active)),device:navigation_devices(id,serial_number,device_type_id,organization_id,active,device_type:device_types(id,name,description),organization:organizations(id,name,active))&order=id.asc";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // GET /rest/v1/user_vehicles
  async get_user_vehicles(accessToken: string) {
    const path = "/rest/v1/user_vehicles?select=id,user_id,vehicle_id,vehicle:vehicles(id,state_number,number,organization_id)&order=id.asc";
    return this.request(path, "GET", {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
  }

  // POST /rest/v1/rpc/get_monitoring_records
  async get_monitoring_records(
    accessToken: string,
    vehicleId: number,
    dateFrom: string,
    dateTo: string,
    limit: number = 50,
    offset: number = 0
  ) {
    const path = "/rest/v1/rpc/get_monitoring_records";
    return this.request(path, "POST", {
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: {
        "p_vehicle_id": vehicleId,
        "p_from": dateFrom,
        "p_to": dateTo,
        "p_limit": limit,
        "p_offset": offset
      }
    });
  }
}

export async function get_vehicles(accessToken: string) {
  const client = new SupabaseHttpClient();
  return client.get_vehicles(accessToken);
}
