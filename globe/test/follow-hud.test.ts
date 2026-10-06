import { describe, expect, it } from "vitest";
import { buildGlobeModel, type GlobeFlight } from "../src/model/globe-model";
import { telemetryAt } from "../src/geo3d/telemetry";
import { formatFollow, followState, speedLabel } from "../src/app/follow-hud";
import { hoverNote } from "../src/app/hud-model";
import { FROM, flight, makeDay } from "./helpers";

const one = (f: Parameters<typeof flight>[0]): GlobeFlight => buildGlobeModel(makeDay({ flights: [flight(f)] })).flights[0];
const landed = () =>
  one({
    from: "IST", to: "JFK", dep: FROM, arr: FROM + 1800, end: "LANDED",
    s: [[0, 100, 0, 0], [600, 200, 0, 1], [1200, 300, 0, 2], [1800, 300, 0, 3]],
  });

describe("formatFollow", () => {
  it("formats an observed climb with exact values", () => {
    const f = landed();
    const clock = { u: 300, speed: null, paused: false };
    const h = formatFollow(f, telemetryAt(f, 300, FROM)!, clock);
    expect(h.tk).toBe(f.tk);
    expect(h.route).toBe("IST → JFK");
    expect(h.alt).toBe("FL150 · 15,000 FT");
    expect(h.gs).toBe("360 KT");
    expect(h.hdg).toBe("090°");
    expect(h.vs).toBe("+1,000 FT/MIN");
    expect(h.phase).toBe("CLIMB");
    expect(h.dist).toBe("56 / 334 KM");
    expect(h.elapsed).toBe("00:05");
    expect(h.remaining).toBe("00:25");
    expect(h.state).toBe("OBSERVED");
    expect(h.speed).toBe("×72"); // span 1800 s → 25 s playback
    expect(h.progress).toBeCloseTo(1 / 6, 3);
    expect(h.cursor).toBeCloseTo(300 / 1800, 6);
    expect(h.notes.join(" ")).toContain("2-MIN AVERAGES");
  });

  it("shows em dashes and NO DATA inside a coverage gap", () => {
    const f = one({
      dep: FROM, arr: null, end: "AIRBORNE", gaps: [[600, 1200]],
      s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2], [1320, 300, 0, 2.2]],
    });
    const h = formatFollow(f, telemetryAt(f, 900, FROM)!, { u: 900, speed: null, paused: false });
    expect([h.alt, h.gs, h.hdg, h.vs, h.phase]).toEqual(["—", "—", "—", "—", "—"]);
    expect(h.state).toBe("NO DATA");
    expect(h.notes.join(" ")).toContain("NO DATA");
  });

  it("labels extrapolation, the live head, last contact, EST values and no ETA for last contact", () => {
    const air = one({
      dep: FROM, arr: null, end: "AIRBORNE", from: "IST", to: "JFK",
      s: [[0, 300, 41, 29], [600, 370, 45, 20], [1200, 370, 50, 10]],
      now: { gs: 480, trk: 300 },
    });
    const c = { u: 1260, speed: null, paused: false };
    const h = formatFollow(air, telemetryAt(air, 1260, FROM)!, c);
    expect(h.state).toBe("EXTRAPOLATED");
    expect(h.speed).toBe("×1 · LIVE HEAD");
    expect(h.dist.endsWith("EST")).toBe(true);
    expect(h.remaining.endsWith("EST")).toBe(true);
    expect(followState(air, telemetryAt(air, 1200 + 400, FROM)!, 1600)).toBe("LAST CONTACT");

    const lc = one({ dep: FROM, arr: FROM + 1200, end: "LAST_CONTACT", s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]] });
    const hl = formatFollow(lc, telemetryAt(lc, 1200, FROM)!, { u: 1200, speed: null, paused: false });
    expect(hl.state).toBe("LAST CONTACT");
    expect(hl.remaining).toBe("—");
  });

  it("reports NO DATA for the unobserved span after a landed flight's last sample", () => {
    const f = one({
      from: "IST", to: "JFK", dep: FROM, arr: FROM + 3600, end: "LANDED",
      s: [[0, 100, 0, 0], [600, 200, 0, 1], [1200, 300, 0, 2], [1800, 300, 0, 3]],
    });
    const h = formatFollow(f, telemetryAt(f, 1800 + 1000, FROM)!, { u: 2800, speed: null, paused: false });
    expect(h.state).toBe("NO DATA");
    expect(h.alt).toBe("—");
  });

  it("describes pause and explicit speeds", () => {
    const f = landed();
    expect(speedLabel(f, { u: 10, speed: 480, paused: false })).toBe("×480");
    expect(speedLabel(f, { u: 10, speed: 480, paused: true })).toBe("PAUSED");
  });

  it("shows LANDED at the landing time even when the last sample is over 600 s earlier", () => {
    const f = one({
      dep: FROM, arr: FROM + 3000, end: "LANDED",
      s: [[0, 100, 0, 0], [600, 200, 0, 1], [1200, 300, 0, 2]],
    });
    expect(f.end).toBe(3000);
    expect(followState(f, telemetryAt(f, 3000, FROM)!, 3000)).toBe("LANDED");
    expect(followState(f, telemetryAt(f, 2500, FROM)!, 2500)).toBe("NO DATA");
  });

  it("explains EST values", () => {
    const air = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 20]], now: { gs: 480, trk: 300 } });
    const h = formatFollow(air, telemetryAt(air, 700, FROM)!, { u: 700, speed: null, paused: false });
    expect(h.notes).toContain("EST = ESTIMATED (GAP / PLANNED / EXTRAPOLATED)");
  });

  it("LANDED at the end", () => {
    const f = landed();
    expect(followState(f, telemetryAt(f, 1800, FROM)!, 1800)).toBe("LANDED");
  });
});

describe("hoverNote", () => {
  it("flags extrapolated, no-data and last-contact flights", () => {
    const air = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [600, 300, 0, 1]] });
    expect(hoverNote(air, 300)).toBe("");
    expect(hoverNote(air, 700)).toBe("EXTRAPOLATED");
    const gap = one({ dep: FROM, arr: null, end: "AIRBORNE", gaps: [[600, 1200]], s: [[0, 300, 0, 0], [600, 300, 0, 1], [1200, 300, 0, 2]] });
    expect(hoverNote(gap, 900)).toBe("NO DATA");
    const lc = one({ dep: FROM, arr: FROM + 600, end: "LAST_CONTACT", s: [[0, 300, 0, 0], [600, 300, 0, 1]] });
    expect(hoverNote(lc, 600)).toBe("LAST CONTACT");
    expect(hoverNote(lc, 300)).toBe("");
  });

  it("flags NO DATA inside a long observed segment", () => {
    const f = one({ dep: FROM, arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [900, 300, 0, 1], [1000, 300, 0, 2]] });
    expect(hoverNote(f, 500)).toBe("NO DATA");
    expect(hoverNote(f, 950)).toBe("");
  });
});
