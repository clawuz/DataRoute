import { describe, expect, it } from "vitest";
import { initCycle } from "../src/cycle/machine";
import { buildModel } from "../src/data/model";
import { buildTimeline } from "../src/data/timeline";
import { EMPTY_SNAPSHOT, altHistogram, buildSnapshot, flightCard } from "../src/hud/snapshot";
import { FROM, flight, makeDay } from "./helpers";

const m = buildModel(
  makeDay({
    flights: [
      flight({ id: "a", tk: "TK1", from: "IST", to: "JFK", dep: FROM, arr: null, s: [[0, 0, 0, 0], [900, 200, 0, 1]], now: { gs: 480, trk: 300 } }),
      flight({ id: "b", tk: "TK2", dep: FROM + 100, arr: FROM + 200, s: [[0, 390, 10, 10]] }),
    ],
  }),
);
const tl = buildTimeline(m);

describe("altHistogram", () => {
  it("bins airborne flights by 2,000 ft", () => {
    const h = altHistogram(m, 150);
    expect(h).toHaveLength(21);
    expect(h[1]).toBe(1); // a at alt100 ≈ 33 (FL033) → bin 1 (FL020–FL039)
    expect(h[19]).toBe(1); // b at FL390
  });
});

describe("flightCard", () => {
  it("derives ground speed from samples in REPLAY", () => {
    const c = flightCard(m, 0, 450, "REPLAY")!;
    expect(c).toMatchObject({ tk: "TK1", route: "IST → JFK", fl: "FL100", gs: "GS 240 KT", elapsed: "ELAPSED 00:07", region: "EUR" });
    expect(c.profile).toEqual([0, 100]);
  });
  it("uses the collector ground speed in LIVE", () => {
    expect(flightCard(m, 0, 86400, "LIVE")!.gs).toBe("GS 480 KT");
  });
  it("handles unknown routes, single samples and grounded flights", () => {
    const c = flightCard(m, 1, 150, "REPLAY")!;
    expect(c.route).toBe("ROUTE UNKNOWN");
    expect(c.gs).toBe("GS —");
    expect(flightCard(m, 1, 5000, "REPLAY")).toBeNull();
    expect(flightCard(m, 9, 100, "REPLAY")).toBeNull();
  });
});

describe("buildSnapshot", () => {
  const base = {
    model: m,
    tl,
    cycle: { ...initCycle({ start: 0, end: 86400 }), tRel: 450 },
    nowSec: FROM + 86400 + 14,
    fixture: false,
    spotlightIdx: 0,
    spotlightScreen: { x: 10, y: 20, visible: true },
    hoverIdx: 0,
    hoverScreen: { x: 10, y: 20, visible: true },
    hidden: false,
    reducedMotion: false,
  };

  it("not ready without data", () => {
    const s = buildSnapshot({ ...base, model: null, tl: null });
    expect(s.ready).toBe(false);
    expect(s.dataState).toBe("loading");
    expect(s.altHist).toEqual(EMPTY_SNAPSHOT.altHist);
  });

  it("fills counters, labels and cards at the current time", () => {
    const s = buildSnapshot(base);
    expect(s.ready).toBe(true);
    expect(s.counters).toMatchObject({ airborne: 1, flights: 2, destinations: 1 }); // b departed at 100 and landed at 200
    expect(s.timeLabel).toBe(new Date((FROM + 450) * 1000).toISOString().slice(11, 16) + " UTC");
    expect(s.updatedAgo).toBe("14 S AGO");
    expect(s.sourceName).toBe("adsb.fi");
    expect(s.dataState).toBe("ok");
    expect(s.spotlight).toMatchObject({ tk: "TK1", x: 10, y: 20, visible: true });
    expect(s.tooltip).toBeNull(); // hovering the spotlighted flight shows one card
    expect(s.playhead).toBeCloseTo(450 / 86400, 9);
  });
});
