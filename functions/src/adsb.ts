import type { AircraftState } from "./day-schema.js";

export type FetchFn = typeof fetch;

export interface AdsbProvider {
  name: string; // attribution name shown in the HUD
  url: string; // attribution link
  baseUrl: string; // ADSBexchange-v2 compatible API root
}

export const PROVIDERS = {
  adsbfi: { name: "adsb.fi", url: "https://adsb.fi", baseUrl: "https://opendata.adsb.fi/api" },
  airplaneslive: { name: "airplanes.live", url: "https://airplanes.live", baseUrl: "https://api.airplanes.live" },
} satisfies Record<string, AdsbProvider>;

export const CHUNK = 100;
export const SPACING_MS = 1100;

const THY = /^THY[0-9A-Z]+$/;
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

interface V2Aircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  seen_pos?: number;
  seen?: number;
}

export function parseV2(json: unknown): AircraftState[] {
  const body = json as { now?: number; ac?: V2Aircraft[] | null };
  const nowS = (num(body.now) ?? 0) / 1000;
  const out: AircraftState[] = [];
  for (const a of body.ac ?? []) {
    const cs = (a.flight ?? "").trim();
    if (!THY.test(cs)) continue;
    const lat = num(a.lat);
    const lon = num(a.lon);
    if (lat === null || lon === null || !a.hex) continue;
    const onGround = a.alt_baro === "ground";
    const altFt = onGround ? 0 : (num(a.alt_baro) ?? num(a.alt_geom));
    const gs = num(a.gs);
    out.push({
      icao24: a.hex.toLowerCase(),
      cs,
      t: Math.round(nowS - (num(a.seen_pos) ?? num(a.seen) ?? 0)),
      lat,
      lon,
      alt100: altFt === null ? null : Math.max(0, Math.round(altFt / 100)),
      onGround,
      gs: gs === null ? null : Math.round(gs),
      trk: num(a.track),
    });
  }
  return out;
}

export async function fetchAircraft(
  f: FetchFn,
  provider: AdsbProvider,
  hexes: string[],
  sleep: (ms: number) => Promise<void>,
): Promise<AircraftState[]> {
  const byHex = new Map<string, AircraftState>();
  for (let i = 0; i < hexes.length; i += CHUNK) {
    if (i > 0) await sleep(SPACING_MS);
    const res = await f(`${provider.baseUrl}/v2/hex/${hexes.slice(i, i + CHUNK).join(",")}`);
    if (!res.ok) throw new Error(`${provider.name} ${res.status}`);
    for (const a of parseV2(await res.json())) byHex.set(a.icao24, a);
  }
  return [...byHex.values()];
}
