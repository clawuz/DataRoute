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

export interface CollectDeps {
  fetch: FetchFn;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  store: JsonStore;
  routes: RouteCache;
  provider: AdsbProvider;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

async function resolveRoutes(state: TrackerState, d: CollectDeps, now: number) {
  let lookups = 0;
  for (const f of state.flights) {
    if (f.route !== undefined) continue;
    if (lookups++ >= MAX_ROUTE_LOOKUPS) break;
    try {
      f.route = await lookupRoute(f.cs, d.routes, d.fetch, now);
    } catch (e) {
      d.log("route lookup failed", { cs: f.cs, error: String(e) });
    }
  }
}

export async function runCollect(d: CollectDeps): Promise<"ok" | "delayed" | "conflict"> {
  const now = d.now();
  const source = { name: d.provider.name, url: d.provider.url };
  const current = await d.store.read<TrackerState>(TRACKER_PATH);
  const prev = current?.data ?? emptyState(now);

  let aircraft: AircraftState[];
  let fleetSize: number;
  try {
    const fleet = await loadFleet(d.store, d.fetch, now, d.log);
    fleetSize = fleet.length;
    aircraft = await fetchAircraft(d.fetch, d.provider, fleet, d.sleep);
  } catch (e) {
    const error = String(e);
    d.log("live data failed", { error });
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
      d.log("tracker write conflict, skipping run");
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
