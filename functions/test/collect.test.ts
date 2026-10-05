import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { PROVIDERS } from "../src/adsb.js";
import type { DayFile, TrackerState } from "../src/day-schema.js";
import { DAY_PATH, ROUTE_BUDGET_MS, TRACKER_PATH, runCollect, type CollectDeps } from "../src/collect.js";
import { FLEET_PATH } from "../src/fleet.js";
import { PreconditionFailed, type JsonStore } from "../src/storage.js";
import type { RouteCache, RouteCacheEntry } from "../src/routes.js";

const NOW = 1_800_000_000;

function memStore(): JsonStore & { files: Map<string, { data: unknown; generation: number; cacheControl?: string }> } {
  const files = new Map<string, { data: unknown; generation: number; cacheControl?: string }>();
  return {
    files,
    async read<T>(path: string) {
      const f = files.get(path);
      return f ? { data: structuredClone(f.data) as T, generation: f.generation } : null;
    },
    async write(path, data, opts = {}) {
      const cur = files.get(path);
      if (opts.ifGeneration !== undefined && (cur?.generation ?? 0) !== opts.ifGeneration) throw new PreconditionFailed(path);
      files.set(path, { data: structuredClone(data), generation: (cur?.generation ?? 0) + 1, cacheControl: opts.cacheControl });
    },
  };
}

const memRoutes = (): RouteCache => {
  const m = new Map<string, RouteCacheEntry>();
  return { get: async (cs) => m.get(cs) ?? null, set: async (cs, e) => void m.set(cs, e) };
};

const fleetCsv = "ABC123;TC-JJA;A321;00;;;;\n";
const hexBody = {
  now: NOW * 1000,
  ac: [{ hex: "abc123", flight: "THY1    ", lat: 44.2, lon: 25.1, alt_baro: 37000, gs: 486, track: 308.5, seen_pos: 0 }],
};
const routeBody = {
  response: {
    flightroute: {
      origin: { country_iso_name: "TR", iata_code: "IST", latitude: 41.26, longitude: 28.74 },
      destination: { country_iso_name: "US", iata_code: "JFK", latitude: 40.64, longitude: -73.78 },
    },
  },
};

function fakeFetch(opts: { hexStatus?: number; fleetStatus?: number; routeStatus?: number } = {}) {
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("tar1090-db")) return new Response(gzipSync(fleetCsv), { status: opts.fleetStatus ?? 200 });
    if (url.includes("adsbdb")) return new Response(JSON.stringify(routeBody), { status: opts.routeStatus ?? 200 });
    if (url.includes("/v2/hex/")) return new Response(JSON.stringify(hexBody), { status: opts.hexStatus ?? 200 });
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
}

const deps = (over: Partial<CollectDeps> = {}): CollectDeps => ({
  fetch: fakeFetch(),
  now: () => NOW,
  sleep: async () => {},
  store: memStore(),
  routes: memRoutes(),
  provider: PROVIDERS.adsbfi,
  log: () => {},
  warn: () => {},
  clock: () => 0,
  ...over,
});

describe("runCollect", () => {
  it("first run caches the fleet, creates tracker and day.json with routes and source", async () => {
    const d = deps();
    await expect(runCollect(d)).resolves.toBe("ok");
    const store = d.store as ReturnType<typeof memStore>;
    expect((store.files.get(FLEET_PATH)!.data as { hexes: string[] }).hexes).toEqual(["abc123"]);
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.collectingSince).toBe(NOW);
    expect(tracker.flights[0]).toMatchObject({ cs: "THY1", samples: [[NOW, 370, 44.2, 25.1]] });
    expect(tracker.flights[0].route?.destination.iata).toBe("JFK");
    const day = store.files.get(DAY_PATH)!;
    expect(day.cacheControl).toBe("public, max-age=60");
    const file = day.data as DayFile;
    expect(file.flights[0]).toMatchObject({ tk: "TK1", region: "AME" });
    expect(file.status.state).toBe("ok");
    expect(file.source).toEqual({ name: "adsb.fi", url: "https://adsb.fi" });
  });

  it("provider failure publishes delayed status and keeps tracker untouched", async () => {
    const store = memStore();
    await runCollect(deps({ store }));
    const gen = store.files.get(TRACKER_PATH)!.generation;
    await expect(runCollect(deps({ store, fetch: fakeFetch({ hexStatus: 429 }), now: () => NOW + 120 }))).resolves.toBe("delayed");
    expect(store.files.get(TRACKER_PATH)!.generation).toBe(gen);
    const day = store.files.get(DAY_PATH)!.data as DayFile;
    expect(day.status).toEqual({ state: "delayed", lastSuccessAt: NOW, error: "Error: adsb.fi 429" });
    expect(day.flights).toHaveLength(1);
  });

  it("fleet failure with no cached fleet publishes delayed status", async () => {
    const store = memStore();
    await expect(runCollect(deps({ store, fetch: fakeFetch({ fleetStatus: 503 }) }))).resolves.toBe("delayed");
    expect((store.files.get(DAY_PATH)!.data as DayFile).status).toMatchObject({ state: "delayed", error: "Error: fleet db 503" });
    expect(store.files.has(TRACKER_PATH)).toBe(false);
  });

  it("tracker write conflict skips publishing", async () => {
    const store = memStore();
    const racing: JsonStore = {
      read: store.read,
      async write(path, data, opts) {
        if (path === TRACKER_PATH) throw new PreconditionFailed(path);
        return store.write(path, data, opts);
      },
    };
    await expect(runCollect(deps({ store: racing }))).resolves.toBe("conflict");
    expect(store.files.has(DAY_PATH)).toBe(false);
  });

  it("route lookup failure leaves route undefined for retry", async () => {
    const store = memStore();
    await runCollect(deps({ store, fetch: fakeFetch({ routeStatus: 500 }) }));
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.flights[0].route).toBeUndefined();
  });

  it("stops starting route lookups once the budget is spent", async () => {
    const store = memStore();
    const calls: string[] = [];
    const body = {
      now: NOW * 1000,
      ac: [1, 2, 3].map((i) => ({ hex: `abc12${i}`, flight: `THY${i}`, lat: 44 + i, lon: 25, alt_baro: 37000, gs: 480, track: 300, seen_pos: 0 })),
    };
    const f = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("tar1090-db")) return new Response(gzipSync("ABC121;TC-JJA;A321;00;;;;\n"));
      if (url.includes("adsbdb")) {
        calls.push(url);
        return new Response(JSON.stringify(routeBody));
      }
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    let t = 0;
    const clock = () => (t += ROUTE_BUDGET_MS / 2 + 1); // start, then 1st check ok, 2nd check over budget
    const warn = vi.fn();
    await expect(runCollect(deps({ store, fetch: f, clock, warn }))).resolves.toBe("ok");
    expect(calls).toHaveLength(1);
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.flights.filter((x) => x.route === undefined)).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith("route budget exhausted", { remaining: 2 });
    expect(warn.mock.calls.filter((c) => c[0] === "route budget exhausted")).toHaveLength(1);
    expect(store.files.has(DAY_PATH)).toBe(true);
  });

  it("tracker read failure returns delayed without writing day.json", async () => {
    const store = memStore();
    const broken: JsonStore = {
      read: async () => {
        throw new Error("gcs down");
      },
      write: store.write,
    };
    const warn = vi.fn();
    await expect(runCollect(deps({ store: broken, warn }))).resolves.toBe("delayed");
    expect(warn).toHaveBeenCalledWith("tracker read failed", { error: "Error: gcs down" });
    expect(store.files.size).toBe(0);
  });

  it("logs failures at warn level and success at info", async () => {
    const warn = vi.fn();
    const log = vi.fn();
    await runCollect(deps({ fetch: fakeFetch({ hexStatus: 429 }), warn, log }));
    expect(warn).toHaveBeenCalledWith("live data failed", { error: "Error: adsb.fi 429" });
    await runCollect(deps({ fetch: fakeFetch({ routeStatus: 500 }), warn, log }));
    expect(warn.mock.calls.map((c) => c[0])).toContain("route lookup failed");
    expect(log.mock.calls.map((c) => c[0])).toContain("collect ok");
  });
});
