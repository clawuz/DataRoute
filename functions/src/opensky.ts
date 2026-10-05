import type { AircraftState } from "./day-schema.js";

export type FetchFn = typeof fetch;

export const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
export const STATES_URL = "https://opensky-network.org/api/states/all";

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.943844;
const THY = /^THY[0-9A-Z]+$/;

export async function fetchToken(f: FetchFn, clientId: string, clientSecret: string): Promise<string> {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`opensky token ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function fetchStates(f: FetchFn, token: string): Promise<unknown> {
  const res = await f(STATES_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`opensky states ${res.status}`);
  return res.json();
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function parseThyStates(json: unknown): AircraftState[] {
  const states = ((json as { states?: unknown[][] | null }).states ?? []) as unknown[][];
  const out: AircraftState[] = [];
  for (const s of states) {
    const cs = typeof s[1] === "string" ? s[1].trim() : "";
    if (!THY.test(cs)) continue;
    const lon = num(s[5]);
    const lat = num(s[6]);
    if (lat === null || lon === null) continue;
    const altM = num(s[7]) ?? num(s[13]);
    const vel = num(s[9]);
    out.push({
      icao24: String(s[0]),
      cs,
      t: num(s[3]) ?? (num(s[4]) as number),
      lat,
      lon,
      alt100: altM === null ? null : Math.max(0, Math.round((altM * M_TO_FT) / 100)),
      onGround: s[8] === true,
      gs: vel === null ? null : Math.round(vel * MS_TO_KT),
      trk: num(s[10]),
    });
  }
  return out;
}
