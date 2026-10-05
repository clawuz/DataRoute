import { fetchAircraft, type AdsbProvider, type FetchFn } from "./adsb.js";
import type { AircraftState, TrackerState } from "./day-schema.js";
import { loadFleet } from "./fleet.js";
import { buildDayFile } from "./publish.js";
import { lookupRoute, type RouteCache } from "./routes.js";
import { PreconditionFailed, type JsonStore } from "./storage.js";
import { emptyState, step } from "./tracker.js";

export const TRACKER_PATH = "state/tracker.json";
export const DAY_PATH = "public/day.json";
export const DAY_CACHE = "public, max-age=60";
export const MAX_ROUTE_LOOKUPS = 40;
export const ROUTE_BUDGET_MS = 45_000;

export interface CollectDeps {
  fetch: FetchFn;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  store: JsonStore;
  routes: RouteCache;
  provider: AdsbProvider;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  clock: () => number; // milliseconds
}

async function resolveRoutes(state: TrackerState, d: CollectDeps, now: number) {
  const start = d.clock();
  let lookups = 0;
  for (const f of state.flights) {
    if (f.route !== undefined) continue;
    if (lookups >= MAX_ROUTE_LOOKUPS) break;
    if (d.clock() - start >= ROUTE_BUDGET_MS) {
      d.warn("route budget exhausted", { remaining: state.flights.filter((x) => x.route === undefined).length });
      break;
    }
    lookups++;
    try {
      f.route = await lookupRoute(f.cs, d.routes, d.fetch, now);
    } catch (e) {
      d.warn("route lookup failed", { cs: f.cs, error: String(e) });
    }
  }
}

export async function runCollect(d: CollectDeps): Promise<"ok" | "delayed" | "conflict"> {
  const now = d.now();
  const source = { name: d.provider.name, url: d.provider.url };
  let current: { data: TrackerState; generation: number } | null;
  try {
    current = await d.store.read<TrackerState>(TRACKER_PATH);
  } catch (e) {
    d.warn("tracker read failed", { error: String(e) });
    return "delayed";
  }
  const prev = current?.data ?? emptyState(now);

  let aircraft: AircraftState[];
  let fleetSize: number;
  try {
    const fleet = await loadFleet(d.store, d.fetch, now, d.warn);
    fleetSize = fleet.length;
    aircraft = await fetchAircraft(d.fetch, d.provider, fleet, d.sleep);
  } catch (e) {
    const error = String(e);
    d.warn("live data failed", { error });
    const day = buildDayFile(prev, now, { state: "delayed", lastSuccessAt: prev.lastSuccessAt, error }, source);
    await d.store.write(DAY_PATH, day, { cacheControl: DAY_CACHE });
    return "delayed";
  }

  const next = step(prev, aircraft, now);
  await resolveRoutes(next, d, now);

  try {
    await d.store.write(TRACKER_PATH, next, { ifGeneration: current?.generation ?? 0 });
  } catch (e) {
    if (e instanceof PreconditionFailed) {
      d.warn("tracker write conflict, skipping run");
      return "conflict";
    }
    throw e;
  }

  await d.store.write(DAY_PATH, buildDayFile(next, now, { state: "ok", lastSuccessAt: now }, source), {
    cacheControl: DAY_CACHE,
  });
  d.log("collect ok", {
    fleet: fleetSize,
    aircraft: aircraft.length,
    flights: next.flights.length,
    unknownRoutes: next.flights.filter((f) => f.route === null).length,
    pendingRoutes: next.flights.filter((f) => f.route === undefined).length,
  });
  return "ok";
}
