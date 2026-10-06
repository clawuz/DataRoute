import { describe, expect, it } from "vitest";
import { buildGlobeModel, statusOf } from "../src/model/globe-model";
import { AIRPORTS, FROM, flight, makeDay } from "./helpers";

describe("statusOf", () => {
  it("explicit end wins; legacy rows never claim LANDED", () => {
    expect(statusOf({ end: "LANDED", arr: 5 })).toBe("LANDED");
    expect(statusOf({ arr: null })).toBe("AIRBORNE");
    expect(statusOf({ arr: 5 })).toBe("LAST_CONTACT");
  });
});

describe("buildGlobeModel", () => {
  const day = makeDay({
    flights: [
      flight({ id: "a", from: "IST", to: "JFK", dep: FROM + 1000, arr: null, end: "AIRBORNE", s: [[0, 0, 41, 29], [120, 100, 42, 28]], gaps: [[30, 60]], now: { gs: 480, trk: 300 } }),
      flight({ id: "b", from: "LHR", to: "IST", dep: FROM + 2000, arr: FROM + 5000, end: "LANDED", s: [[0, 300, 51, 0], [600, 10, 41, 29]] }),
      flight({ id: "c", dep: FROM + 3000, arr: FROM + 3100, end: "LAST_CONTACT", s: [[0, 300, 10, 10]] }),
      flight({ id: "empty", s: [] }),
    ],
  });
  const m = buildGlobeModel(day);

  it("keeps the base model fields and drops empty flights", () => {
    expect(m.from).toBe(FROM);
    expect(m.flights.map((f) => f.id)).toEqual(["a", "b", "c"]);
    expect(m.flights[0].t[0]).toBe(1000);
  });

  it("copies optional aircraft info (reg, type, desc) from the raw flight", () => {
    const mm = buildGlobeModel(makeDay({ flights: [
      flight({ id: "p", s: [[0, 0, 41, 29]], reg: "TC-JXX", type: "B739", desc: "BOEING 737-900" }),
      flight({ id: "q", s: [[0, 0, 41, 29]] }),
    ] }));
    expect(mm.flights[0]).toMatchObject({ reg: "TC-JXX", type: "B739", desc: "BOEING 737-900" });
    expect("reg" in mm.flights[1] || "type" in mm.flights[1] || "desc" in mm.flights[1]).toBe(false);
  });

  it("adds status, relative gaps, last sample time and track", () => {
    const [a, b, c] = m.flights;
    expect(a.status).toBe("AIRBORNE");
    expect(a.gaps).toEqual([[1030, 1060]]);
    expect(a.lastT).toBe(1120);
    expect(a.trk).toBe(300);
    expect(b.status).toBe("LANDED");
    expect(b.gaps).toEqual([]);
    expect(b.trk).toBeUndefined();
    expect(c.status).toBe("LAST_CONTACT");
  });

  it("derives planned routes only when both airports are known", () => {
    const [a, b, c] = m.flights;
    expect(a.planned).toMatchObject({ fromLat: AIRPORTS.IST.lat, toLon: AIRPORTS.JFK.lon });
    expect(a.planned!.distKm).toBeCloseTo(8027.1, 0);
    expect(b.planned).toBeDefined();
    expect(c.planned).toBeUndefined();
    const noAirports = buildGlobeModel(makeDay({ airports: undefined, flights: [flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] })] }));
    expect(noAirports.flights[0].planned).toBeUndefined();
    expect(noAirports.airports).toEqual({});
  });

  it("counts traffic per known airport", () => {
    expect(m.traffic.get("IST")).toBe(2);
    expect(m.traffic.get("JFK")).toBe(1);
    expect(m.traffic.get("LHR")).toBe(1);
    expect(m.traffic.has("ESB")).toBe(false);
  });

  it("treats a now report with gs <= 0 as unknown track", () => {
    const g = buildGlobeModel(makeDay({ flights: [flight({ s: [[0, 300, 0, 0]], now: { gs: 0, trk: 0 } })] }));
    expect(g.flights[0].trk).toBeUndefined();
  });
});
