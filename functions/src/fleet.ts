import { gunzipSync } from "node:zlib";
import type { FetchFn } from "./adsb.js";
import type { JsonStore } from "./storage.js";

export const FLEET_DB_URL = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/csv/aircraft.csv.gz";
export const FLEET_PATH = "state/fleet.json";
export const FLEET_TTL = 7 * 86400;

export const AIRLINER_TYPES = new Set(
  "A19N A20N A21N A319 A320 A321 A332 A333 A338 A339 A359 A35K A306 A310 B37M B38M B39M B3XM B737 B738 B739 B744 B748 B752 B763 B772 B77L B77W B788 B789 B78X E190 E195 E290 E295 CRJ9 AT76".split(" "),
);

export interface Fleet {
  fetchedAt: number;
  hexes: string[];
}

/** tar1090-db rows: `hex;registration;icaoType;flags;…`. Keeps Turkish-registered airliners. */
export function parseFleetCsv(csv: string): string[] {
  const hexes = new Set<string>();
  for (const line of csv.split("\n")) {
    const [hex, reg, type] = line.split(";");
    if (hex && reg?.startsWith("TC-") && AIRLINER_TYPES.has(type)) hexes.add(hex.toLowerCase());
  }
  return [...hexes].sort();
}

export async function fetchFleet(f: FetchFn): Promise<string[]> {
  const res = await f(FLEET_DB_URL);
  if (!res.ok) throw new Error(`fleet db ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const gzipped = buf[0] === 0x1f && buf[1] === 0x8b;
  return parseFleetCsv((gzipped ? gunzipSync(buf) : buf).toString("utf8"));
}

export async function loadFleet(
  store: JsonStore,
  f: FetchFn,
  now: number,
  log: (msg: string, extra?: Record<string, unknown>) => void,
): Promise<string[]> {
  const cached = await store.read<Fleet>(FLEET_PATH);
  if (cached && now - cached.data.fetchedAt < FLEET_TTL && cached.data.hexes.length > 0) {
    return cached.data.hexes;
  }
  try {
    const hexes = await fetchFleet(f);
    if (hexes.length === 0) throw new Error("fleet db empty");
    await store.write(FLEET_PATH, { fetchedAt: now, hexes } satisfies Fleet);
    return hexes;
  } catch (e) {
    if (cached && cached.data.hexes.length > 0) {
      log("fleet refresh failed, using stale list", { error: String(e) });
      return cached.data.hexes;
    }
    throw e;
  }
}
