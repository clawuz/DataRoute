import { EXTRAPOLATE_MAX_SEC } from "../src/model/dead-reckon";
import { describe, expect, it } from "vitest";
import { haversineKm } from "@collector/geo";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import { profileOf, telemetryAt } from "../src/geo3d/telemetry";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];

// 10-minute samples along the equator, 1° (111.195 km) apart; altitude 10 000 → 20 000 → 30 000 → 30 000 ft.
const landed = () =>
  one({
    dep: FROM, arr: FROM + 1800, end: "LANDED",
    s: [[0, 100, 0, 0], [600, 200, 0, 1], [1200, 300, 0, 2], [1800, 300, 0, 3]],
  });
const km1 = haversineKm(0, 0, 0, 1);
const KT = 1.852;

describe("telemetryAt", () => {
  it("is null for a single-sample track", () => {
    expect(telemetryAt(one({ s: [[0, 300, 0, 0]] }), 0, FROM)).toBeNull();
  });

  it("reports mid-segment values exactly (segment-average speed, bearing, vertical speed)", () => {
    const t = telemetryAt(landed(), 300, FROM)!;
    expect(t.source).toBe("OBSERVED");
    expect(t.gsKt).toBeCloseTo(km1 / (600 / 3600) / KT, 6);
    expect(t.hdgDeg).toBeCloseTo(90, 6);
    expect(t.vsFpm).toBeCloseTo(1000, 6); // +10 000 ft in 10 min
    expect(t.phase).toBe("CLIMB");
    expect(t.alt100).toBeCloseTo(150, 6);
    expect(t.altFt).toBeCloseTo(15000, 4);
    expect(t.lon).toBeCloseTo(0.5, 6);
  });

  it("classifies CRUISE and DESCENT", () => {
    expect(telemetryAt(landed(), 1500, FROM)!.phase).toBe("CRUISE"); // level segment
    const d = one({
      dep: FROM, arr: FROM + 1800, end: "LANDED",
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 200, 0, 2], [1800, 100, 0, 3]],
    });
    expect(telemetryAt(d, 1500, FROM)!.phase).toBe("DESCENT");
  });

  it("blends neighbouring segment values between segment midpoints", () => {
    // midpoints 300 (vs +1000) and 900 (vs +1000), then 1500 (vs 0): halfway between 900 and 1500 → +500
    expect(telemetryAt(landed(), 1200, FROM)!.vsFpm).toBeCloseTo(500, 6);
  });

  it("counts distance along the track; LANDED total is the observed track", () => {
    const t = telemetryAt(landed(), 600, FROM)!;
    expect(t.distKm).toBeCloseTo(km1, 6);
    expect(t.totalKm).toBeCloseTo(3 * km1, 6);
    expect(t.distEstimated).toBe(false);
  });

  it("elapsed, remaining (LANDED: end − u) and local solar time", () => {
    const f = landed();
    const t = telemetryAt(f, 900, FROM)!;
    expect(t.elapsedSec).toBe(900);
    expect(t.remainingSec).toBe(f.end - 900);
    expect(t.etaEstimated).toBe(false);
    expect(t.utcSec).toBe(FROM + 900);
    // FROM is 08:00 UTC; +15 min = 08.25 h; longitude 1.5° east adds 0.1 h
    expect(t.localSolarHours).toBeCloseTo(8.35, 3);
  });

  it("marks coverage gaps as NO DATA with no speed, heading or vertical speed", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE", gaps: [[600, 1200]],
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2], [1320, 300, 0, 2.2]],
      now: { gs: 480, trk: 90 },
    });
    const g = telemetryAt(f, 900, FROM)!;
    expect(g.source).toBe("NO DATA");
    expect(g.gsKt).toBeNull();
    expect(g.hdgDeg).toBeNull();
    expect(g.vsFpm).toBeNull();
    expect(g.phase).toBe("—");
    expect(g.distEstimated).toBe(true);
    expect(telemetryAt(f, 300, FROM)!.source).toBe("OBSERVED");
  });

  it("an airborne flight past its last sample is EXTRAPOLATED with the live speed and track, then holds", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE",
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]],
      now: { gs: 480, trk: 90 },
    });
    const t = telemetryAt(f, 1260, FROM)!;
    expect(t.source).toBe("EXTRAPOLATED");
    expect(t.holding).toBe(false);
    expect(t.gsKt).toBe(480);
    expect(t.hdgDeg).toBe(90);
    expect(t.vsFpm).toBeNull();
    expect(t.phase).toBe("—");
    expect(t.lon).toBeGreaterThan(2);
    expect(t.distKm).toBeGreaterThan(2 * km1);
    expect(t.distEstimated).toBe(true);
    expect(t.remainingSec).toBeNull(); // no planned route → no ETA
    expect(t.totalKm).toBeNull();
    const h = telemetryAt(f, 1200 + 400, FROM)!;
    expect(h.holding).toBe(true);
    expect(h.lon).toBeCloseTo(telemetryAt(f, 1200 + 300, FROM)!.lon, 9); // head stops at the extrapolation limit
  });

  it("LAST_CONTACT shows no ETA; airborne with a planned route shows an estimated ETA", () => {
    const lc = one({ dep: FROM, arr: FROM + 1200, end: "LAST_CONTACT", s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]] });
    expect(telemetryAt(lc, 600, FROM)!.remainingSec).toBeNull();
    const air = one({
      dep: FROM, arr: null, end: "AIRBORNE", from: "IST", to: "JFK",
      s: [[0, 300, 41, 29], [600, 370, 45, 20], [1200, 370, 50, 10]],
    });
    const t = telemetryAt(air, 1200, FROM)!;
    expect(t.etaEstimated).toBe(true);
    expect(t.remainingSec!).toBeGreaterThan(0);
    expect(t.totalKm!).toBeGreaterThan(t.distKm);
  });

  it("caches the profile per flight", () => {
    const f = landed();
    expect(profileOf(f)).toBe(profileOf(f));
    expect(profileOf(f).segs).toHaveLength(3);
  });

  it("long unobserved spans outside the track are NO DATA; short ones stay OBSERVED", () => {
    const f = one({
      dep: FROM, arr: FROM + 2800, end: "LANDED",
      s: [[0, 100, 0, 0], [600, 200, 0, 1], [1200, 300, 0, 2], [1800, 300, 0, 3]],
    });
    const hold = telemetryAt(f, 1800 + 1000, FROM)!;
    expect(hold.source).toBe("NO DATA");
    expect(hold.gsKt).toBeNull();
    expect(hold.hdgDeg).toBeNull();
    expect(hold.vsFpm).toBeNull();
    expect(hold.phase).toBe("—");
    expect(hold.distEstimated).toBe(true);
    expect(hold.lon).toBeCloseTo(3, 6);
    expect(telemetryAt(f, 1800 + 300, FROM)!.source).toBe("OBSERVED");
    const pre = one({
      dep: FROM, arr: FROM + 2800, end: "LANDED",
      s: [[1000, 100, 0, 0], [1600, 200, 0, 1], [2200, 300, 0, 2]],
    });
    const b = telemetryAt(pre, 100, FROM)!;
    expect(b.source).toBe("NO DATA");
    expect(b.gsKt).toBeNull();
    expect(b.lon).toBeCloseTo(0, 6);
    expect(telemetryAt(pre, 700, FROM)!.source).toBe("OBSERVED");
  });

  it("holding starts exactly when the extrapolation clock stops", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE",
      s: [[0, 300, 0, 0], [600, 300, 0, 1]], now: { gs: 480, trk: 90 },
    });
    expect(telemetryAt(f, 600 + EXTRAPOLATE_MAX_SEC - 1, FROM)!.holding).toBe(false);
    expect(telemetryAt(f, 600 + EXTRAPOLATE_MAX_SEC, FROM)!.holding).toBe(true);
  });

  it("ETA speed uses only segments already flown", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE", from: "IST", to: "JFK",
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2], [1800, 300, 0, 6]],
    });
    const early = telemetryAt(f, 1200, FROM)!;
    const late = telemetryAt(f, 1800, FROM)!;
    // at 1200 the fast final segment must not be known: speed ≈ 1°/600 s
    const kmh = haversineKm(0, 0, 0, 1) / (600 / 3600);
    expect(early.remainingSec!).toBeCloseTo(((early.totalKm! - early.distKm) / kmh) * 3600, 3);
    expect(late.remainingSec!).not.toBeCloseTo(((late.totalKm! - late.distKm) / kmh) * 3600, 0);
  });
});
