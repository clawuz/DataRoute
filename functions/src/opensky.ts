import type { AdsbProvider } from "./adsb.js";
import type { FetchFn } from "./adsb.js";
import type { AircraftState } from "./day-schema.js";

export const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
export const STATES_URL = "https://opensky-network.org/api/states/all";

export const OPENSKY_PROVIDER: AdsbProvider = {
  name: "OpenSky Network",
  url: "https://opensky-network.org",
  baseUrl: "https://opensky-network.org/api",
};

// 100 hexes -> ~1.1 kB of query string, well inside URL limits.
export const OPENSKY_CHUNK = 100;
export const OPENSKY_SPACING_MS = 1100;
export const OPENSKY_TIMEOUT_MS = 10_000;
export const TOKEN_REFRESH_MARGIN_S = 60;

const M_TO_FT = 3.28084; // 1 / 0.3048
const MS_TO_KT = 1 / 0.514444;
const THY = /^THY[0-9A-Z]+$/;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseThyStates(json: unknown): AircraftState[] {
  const states = ((json as { states?: unknown[][] | null } | null)?.states ?? []) as unknown[][];
  const out: AircraftState[] = [];
  for (const s of states) {
    const cs = typeof s[1] === "string" ? s[1].trim() : "";
    if (!THY.test(cs)) continue;
    const lon = num(s[5]);
    const lat = num(s[6]);
    const t = num(s[3]) ?? num(s[4]);
    if (lat === null || lon === null || t === null || typeof s[0] !== "string") continue;
    const altM = num(s[7]) ?? num(s[13]);
    const vel = num(s[9]);
    out.push({
      icao24: s[0].toLowerCase(),
      cs,
      t,
      lat,
      lon,
      alt100: altM === null ? null : Math.max(0, Math.round(altM * M_TO_FT / 100)),
      onGround: s[8] === true,
      gs: vel === null ? null : Math.round(vel * MS_TO_KT),
      trk: num(s[10]),
    });
  }
  return out;
}

export interface OpenSkyClient {
  getToken(): Promise<string>;
  fetchAircraft(hexes: string[], sleep: (ms: number) => Promise<void>): Promise<AircraftState[]>;
}

/** now() returns epoch seconds. The bearer token is cached in memory until ~1 min before expiry. */
export function createOpenSkyClient(
  f: FetchFn,
  creds: { clientId: string; clientSecret: string },
  now: () => number,
): OpenSkyClient {
  let cached: { token: string; refreshAt: number } | null = null;

  async function getToken(): Promise<string> {
    if (cached && now() < cached.refreshAt) return cached.token;
    let res: Response;
    try {
      res = await f(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
        }),
        signal: AbortSignal.timeout(OPENSKY_TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`${OPENSKY_PROVIDER.name} token ${String(e)}`);
    }
    if (!res.ok) throw new Error(`${OPENSKY_PROVIDER.name} token ${res.status}`);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error(`${OPENSKY_PROVIDER.name} token response missing access_token`);
    cached = { token: json.access_token, refreshAt: now() + (json.expires_in ?? 300) - TOKEN_REFRESH_MARGIN_S };
    return json.access_token;
  }

  async function fetchAircraft(hexes: string[], sleep: (ms: number) => Promise<void>): Promise<AircraftState[]> {
    const byHex = new Map<string, AircraftState>();
    for (let i = 0; i < hexes.length; i += OPENSKY_CHUNK) {
      if (i > 0) await sleep(OPENSKY_SPACING_MS);
      const token = await getToken();
      const qs = hexes
        .slice(i, i + OPENSKY_CHUNK)
        .map((h) => `icao24=${h.toLowerCase()}`)
        .join("&");
      let list: AircraftState[];
      try {
        const res = await f(`${STATES_URL}?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(OPENSKY_TIMEOUT_MS),
        });
        if (res.status === 401) cached = null; // force a fresh token next run
        if (!res.ok) throw new StatusError(`${OPENSKY_PROVIDER.name} ${res.status}`);
        list = parseThyStates(await res.json());
      } catch (e) {
        if (e instanceof StatusError) throw e;
        throw new Error(`${OPENSKY_PROVIDER.name} ${String(e)}`);
      }
      for (const a of list) byHex.set(a.icao24, a);
    }
    return [...byHex.values()];
  }

  return { getToken, fetchAircraft };
}

class StatusError extends Error {}
