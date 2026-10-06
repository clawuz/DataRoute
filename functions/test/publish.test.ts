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

describe("buildDayFile — end, gaps, airports", () => {
  const SAW_FALLBACK = { lat: 40.8986, lon: 29.3092, country: "TR" };
  const state2: TrackerState = {
    v: 1,
    collectingSince: NOW - 7200,
    lastSuccessAt: NOW,
    flights: [
      {
        id: "a-1", icao24: "a", cs: "THY1", dep: NOW - 3600, arr: null, end: "AIRBORNE", lastContact: NOW,
        samples: [[NOW - 3600, 0, 0, 0], [NOW, 370, 0, 1]],
        gaps: [[NOW - 3000, NOW - 2400]],
        now: { gs: 480, trk: 300 },
        route: { origin: { ...IST, name: "Istanbul Airport" }, destination: JFK },
      },
      {
        id: "b-1", icao24: "b", cs: "THY2", dep: NOW - 7000, arr: NOW - 100, end: "LAST_CONTACT", lastContact: NOW - 100,
        samples: [[NOW - 7000, 350, 1, 0], [NOW - 100, 300, 2, 0]],
        route: { origin: LHR, destination: IST },
      },
      // legacy row: no `end`, arr set, nowhere near its destination → LAST_CONTACT
      {
        id: "c-1", icao24: "c", cs: "THY3", dep: NOW - 900, arr: NOW - 300, lastContact: NOW - 300,
        samples: [[NOW - 900, 300, 10, 10]], route: { origin: IST, destination: JFK },
      },
    ],
  };
  const day = buildDayFile(state2, NOW, { state: "ok", lastSuccessAt: NOW }, SRC);

  it("every flight carries an end; gaps are relative to dep and only present when non-empty", () => {
    expect(day.flights.map((f) => f.end)).toEqual(["AIRBORNE", "LAST_CONTACT", "LAST_CONTACT"]);
    expect(day.flights[0].gaps).toEqual([[600, 1200]]);
    expect(day.flights[1].gaps).toBeUndefined();
  });

  it("publishes the airports of routed flights plus IST and SAW, with names when known", () => {
    expect(Object.keys(day.airports!).sort()).toEqual(["IST", "JFK", "LHR", "SAW"]);
    expect(day.airports!.JFK).toEqual({ lat: 40.6398, lon: -73.7789, country: "US" });
    expect(day.airports!.IST).toEqual({ lat: 41.2613, lon: 28.742, country: "TR", name: "Istanbul Airport" });
    expect(day.airports!.SAW).toEqual(SAW_FALLBACK);
  });

  it("publishes IST/SAW even when no flight is routed", () => {
    const empty = buildDayFile({ v: 1, collectingSince: NOW, lastSuccessAt: NOW, flights: [] }, NOW, { state: "ok", lastSuccessAt: NOW }, SRC);
    expect(Object.keys(empty.airports!).sort()).toEqual(["IST", "SAW"]);
  });
});

describe("buildDayFile — aircraft type and thinning", () => {
  const src = { name: "x", url: "" };
  const run = (flights: TrackerState["flights"]) =>
    buildDayFile({ v: 1, collectingSince: NOW - 86400, lastSuccessAt: NOW, flights }, NOW, { state: "ok", lastSuccessAt: NOW }, src);

  it("includes reg/type/desc only when defined", () => {
    const d = run([
      { id: "a-1", icao24: "a", cs: "THY1", dep: NOW - 100, arr: null, lastContact: NOW, samples: [[NOW - 100, 1, 0, 0]], reg: "TC-JJK", type: "B77W", desc: "BOEING 777-300ER" },
      { id: "b-1", icao24: "b", cs: "THY2", dep: NOW - 100, arr: null, lastContact: NOW, samples: [[NOW - 100, 1, 0, 0]] },
    ]);
    expect(d.flights[0]).toMatchObject({ reg: "TC-JJK", type: "B77W", desc: "BOEING 777-300ER" });
    expect("reg" in d.flights[1] || "type" in d.flights[1] || "desc" in d.flights[1]).toBe(false);
  });

  it("thins samples older than 6 h to >= 180 s, keeps recent ones, first and last; gaps untouched", () => {
    const dep = NOW - 10 * 3600;
    const samples: [number, number, number, number][] = [];
    for (let t = dep; t <= NOW; t += 60) samples.push([t, 300, 41, 29]);
    const d = run([{ id: "a-1", icao24: "a", cs: "THY1", dep, arr: null, lastContact: NOW, samples, gaps: [[dep + 100, dep + 400]] }]);
    const f = d.flights[0];
    const abs = f.s.map((x) => x[0] + dep);
    expect(abs[0]).toBe(dep);
    expect(abs.at(-1)).toBe(NOW);
    expect(abs.filter((t) => t >= NOW - 6 * 3600)).toHaveLength(6 * 60 + 1);
    const old = abs.filter((t) => t < NOW - 6 * 3600);
    for (let i = 1; i < old.length; i++) expect(old[i] - old[i - 1]).toBeGreaterThanOrEqual(180);
    expect(old.length).toBeLessThan(4 * 60 / 3 + 3);
    expect(f.gaps).toEqual([[100, 400]]);
    expect(f.s.length).toBeLessThan(samples.length);
  });
});

describe("buildDayFile type backfill", () => {
  const mk = (extra: object, icao24 = "k"): TrackerState => ({
    v: 1, collectingSince: NOW - 7200, lastSuccessAt: NOW,
    flights: [{
      id: `${icao24}-1`, icao24, cs: "THY9", dep: NOW - 600, arr: NOW - 10, lastContact: NOW - 10,
      samples: [[NOW - 600, 50, 41, 29]], route: null, ...extra,
    }],
  });
  const info = { k: { reg: "TC-LJA", type: "B739" } };
  const build = (s: TrackerState) => buildDayFile(s, NOW, { state: "ok", lastSuccessAt: NOW }, SRC, info).flights[0];

  it("fills reg, type and desc from the fleet info", () => {
    expect(build(mk({}))).toMatchObject({ reg: "TC-LJA", type: "B739", desc: "BOEING 737-900" });
  });
  it("live values win", () => {
    expect(build(mk({ reg: "TC-XXX", type: "B738", desc: "LIVE DESC" }))).toMatchObject({ reg: "TC-XXX", type: "B738", desc: "LIVE DESC" });
  });
  it("derives desc from a live type", () => {
    expect(build(mk({ type: "B738" }))).toMatchObject({ reg: "TC-LJA", type: "B738", desc: "BOEING 737-800" });
  });
  it("unknown hex leaves the fields absent", () => {
    const f = build(mk({}, "zz"));
    expect("reg" in f || "type" in f || "desc" in f).toBe(false);
  });
});
