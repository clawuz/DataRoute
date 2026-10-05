import { describe, expect, it } from "vitest";
import type { DayFile, TrackerState } from "../src/day-schema.js";
import { DAY_PATH, TRACKER_PATH, runCollect, type CollectDeps } from "../src/collect.js";
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

const statesBody = {
  time: NOW,
  states: [["abc123", "THY1    ", "Turkey", NOW, NOW, 25.1, 44.2, 11277.6, false, 250, 308.5, 0, null, null, "1", false, 0]],
};
const routeBody = {
  response: {
    flightroute: {
      origin: { country_iso_name: "TR", iata_code: "IST", latitude: 41.26, longitude: 28.74 },
      destination: { country_iso_name: "US", iata_code: "JFK", latitude: 40.64, longitude: -73.78 },
    },
  },
};

function fakeFetch(opts: { statesStatus?: number } = {}) {
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("openid-connect/token")) return new Response(JSON.stringify({ access_token: "t" }));
    if (url.includes("/states/all")) return new Response(JSON.stringify(statesBody), { status: opts.statesStatus ?? 200 });
    if (url.includes("adsbdb")) return new Response(JSON.stringify(routeBody));
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
}

const deps = (over: Partial<CollectDeps> = {}): CollectDeps => ({
  fetch: fakeFetch(),
  now: () => NOW,
  store: memStore(),
  routes: memRoutes(),
  creds: { id: "id", secret: "s" },
  log: () => {},
  ...over,
});

describe("runCollect", () => {
  it("first run creates tracker and day.json with routes", async () => {
    const d = deps();
    await expect(runCollect(d)).resolves.toBe("ok");
    const store = d.store as ReturnType<typeof memStore>;
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.collectingSince).toBe(NOW);
    expect(tracker.flights[0].route?.destination.iata).toBe("JFK");
    const day = store.files.get(DAY_PATH)!;
    expect(day.cacheControl).toBe("public, max-age=60");
    expect((day.data as DayFile).flights[0]).toMatchObject({ tk: "TK1", region: "AME" });
    expect((day.data as DayFile).status.state).toBe("ok");
  });

  it("OpenSky failure publishes delayed status and keeps tracker untouched", async () => {
    const store = memStore();
    await runCollect(deps({ store }));
    const gen = store.files.get(TRACKER_PATH)!.generation;
    await expect(runCollect(deps({ store, fetch: fakeFetch({ statesStatus: 429 }), now: () => NOW + 120 }))).resolves.toBe("delayed");
    expect(store.files.get(TRACKER_PATH)!.generation).toBe(gen);
    const day = store.files.get(DAY_PATH)!.data as DayFile;
    expect(day.status).toEqual({ state: "delayed", lastSuccessAt: NOW, error: "Error: opensky states 429" });
    expect(day.flights).toHaveLength(1);
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
    const f = (async (input: string | URL) => {
      if (String(input).includes("adsbdb")) return new Response("", { status: 500 });
      return fakeFetch()(input);
    }) as typeof fetch;
    const store = memStore();
    await runCollect(deps({ store, fetch: f }));
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.flights[0].route).toBeUndefined();
  });
});
