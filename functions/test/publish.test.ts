import { describe, expect, it } from "vitest";
import type { DaySource, RouteInfo, TrackerState } from "../src/day-schema.js";
import { buildDayFile } from "../src/publish.js";

const NOW = 1_800_000_000;
const SRC: DaySource = { name: "adsb.fi", url: "https://adsb.fi" };
const IST = { iata: "IST", country: "TR", lat: 41.2613, lon: 28.742 };
const JFK = { iata: "JFK", country: "US", lat: 40.6398, lon: -73.7789 };
const LHR = { iata: "LHR", country: "GB", lat: 51.47, lon: -0.454 };
const toJFK: RouteInfo = { origin: IST, destination: JFK };
const fromLHR: RouteInfo = { origin: LHR, destination: IST };

const state: TrackerState = {
  v: 1,
  collectingSince: NOW - 7200,
  lastSuccessAt: NOW,
  flights: [
    {
      id: "a-1", icao24: "a", cs: "THY1", dep: NOW - 3600, arr: null, lastContact: NOW,
      samples: [[NOW - 3600, 0, 0, 0], [NOW, 370, 0, 1]],
      now: { gs: 480, trk: 300 }, route: toJFK,
    },
    {
      id: "b-1", icao24: "b", cs: "THY2", dep: NOW - 7000, arr: NOW - 100, lastContact: NOW - 100,
      samples: [[NOW - 7000, 350, 1, 0], [NOW - 100, 10, 2, 0]],
      route: fromLHR,
    },
    {
      id: "c-1", icao24: "c", cs: "THY3", dep: NOW - 600, arr: null, lastContact: NOW,
      samples: [[NOW - 600, 50, 41, 29]], now: { gs: 250, trk: 123.456 }, route: null,
    },
  ],
};

describe("buildDayFile", () => {
  const day = buildDayFile(state, NOW, { state: "ok", lastSuccessAt: NOW }, SRC);

  it("header", () => {
    expect(day).toMatchObject({
      v: 1, generatedAt: NOW, collectingSince: NOW - 7200,
      status: { state: "ok", lastSuccessAt: NOW },
      source: { name: "adsb.fi", url: "https://adsb.fi" },
      window: { from: NOW - 86400, to: NOW },
    });
  });

  it("flight mapping", () => {
    const [a, b, c] = day.flights;
    expect(a).toMatchObject({ id: "a-1", cs: "THY1", tk: "TK1", from: "IST", to: "JFK", region: "AME", bearing: 308.9, dep: NOW - 3600, arr: null, now: { gs: 480, trk: 300 } });
    expect(a.s).toEqual([[0, 0, 0, 0], [3600, 370, 0, 1]]);
    expect(b).toMatchObject({ tk: "TK2", from: "LHR", to: "IST", region: "EUR" });
    expect(b.now).toBeUndefined();
    expect(c).toMatchObject({ region: "UNK", bearing: 123.5 });
    expect(c.from).toBeUndefined();
  });

  it("stats", () => {
    expect(day.stats.airborne).toBe(2);
    expect(day.stats.flights24h).toBe(3);
    expect(day.stats.destinations).toBe(2); // JFK, LHR
    expect(day.stats.countries).toBe(2); // US, GB
    expect(day.stats.km24h).toBe(222); // 111.2 km (1° lon @ equator) + 111.2 km (1° lat)
  });

  it("passes through delayed status", () => {
    const d = buildDayFile(state, NOW, { state: "delayed", lastSuccessAt: NOW - 600, error: "x" }, SRC);
    expect(d.status).toEqual({ state: "delayed", lastSuccessAt: NOW - 600, error: "x" });
  });
});
