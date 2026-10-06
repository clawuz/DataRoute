import { describe, expect, it, vi } from "vitest";
import { ADSBDB_URL, ROUTE_TIMEOUT_MS, fetchRoute, lookupRoute, type RouteCache, type RouteCacheEntry } from "../src/routes.js";

const THY1 = {
  response: {
    flightroute: {
      callsign: "THY1",
      origin: { country_iso_name: "TR", iata_code: "IST", latitude: 41.261297, longitude: 28.741951 },
      destination: { country_iso_name: "US", iata_code: "JFK", latitude: 40.639801, longitude: -73.7789 },
    },
  },
};

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

function memCache(init: Record<string, RouteCacheEntry> = {}): RouteCache & { data: Record<string, RouteCacheEntry> } {
  const data = { ...init };
  return { data, get: async (cs) => data[cs] ?? null, set: async (cs, e) => void (data[cs] = e) };
}

describe("fetchRoute", () => {
  it("maps adsbdb response", async () => {
    const f = respond(200, THY1);
    await expect(fetchRoute(f as unknown as typeof fetch, "THY1")).resolves.toEqual({
      origin: { iata: "IST", country: "TR", lat: 41.261297, lon: 28.741951 },
      destination: { iata: "JFK", country: "US", lat: 40.639801, lon: -73.7789 },
    });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(`${ADSBDB_URL}THY1`);
  });

  it("passes an abort signal", async () => {
    const f = respond(200, THY1);
    await fetchRoute(f as unknown as typeof fetch, "THY1");
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(ROUTE_TIMEOUT_MS).toBe(5_000);
  });

  it("404 → null, 500 → throws", async () => {
    await expect(fetchRoute(respond(404, { response: "unknown callsign" }) as unknown as typeof fetch, "THYX")).resolves.toBeNull();
    await expect(fetchRoute(respond(500, {}) as unknown as typeof fetch, "THYX")).rejects.toThrow("adsbdb 500");
  });
  it("keeps the airport name when adsbdb provides one", async () => {
    const withName = JSON.parse(JSON.stringify(THY1));
    withName.response.flightroute.origin.name = "Istanbul Airport";
    const r = await fetchRoute(respond(200, withName) as unknown as typeof fetch, "THY1");
    expect(r?.origin.name).toBe("Istanbul Airport");
    expect(r?.destination.name).toBeUndefined();
  });
});

describe("lookupRoute", () => {
  const now = 1_000_000;

  it("uses a fresh positive cache entry without fetching", async () => {
    const cached = {
      origin: { iata: "IST", country: "TR", lat: 41.26, lon: 28.74 },
      destination: { iata: "JFK", country: "US", lat: 40.64, lon: -73.78 },
    };
    const cache = memCache({ THY1: { route: cached, fetchedAt: now - 3600 } });
    const f = vi.fn();
    await expect(lookupRoute("THY1", cache, f as unknown as typeof fetch, now)).resolves.toEqual(cached);
    expect(f).not.toHaveBeenCalled();
  });

  it("refetches an expired negative entry and stores the result", async () => {
    const cache = memCache({ THY1: { route: null, fetchedAt: now - 86400 - 1 } });
    const f = respond(200, THY1);
    const r = await lookupRoute("THY1", cache, f as unknown as typeof fetch, now);
    expect(r?.destination.iata).toBe("JFK");
    expect(cache.data.THY1.fetchedAt).toBe(now);
  });

  it("keeps a fresh negative entry", async () => {
    const cache = memCache({ THYX: { route: null, fetchedAt: now - 100 } });
    const f = vi.fn();
    await expect(lookupRoute("THYX", cache, f as unknown as typeof fetch, now)).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
