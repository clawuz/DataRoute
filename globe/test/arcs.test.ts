import { DoubleSide, type ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { ARC_BASE_LIFT, ARC_WIDTH_PX, BREAK_SEC, buildArcBuffers, createArcs, isBreak } from "../src/scene/arcs";
import { buildGlobeModel } from "../src/model/globe-model";
import { altitudeRadius } from "../src/geo3d/vec";
import { FROM, flight, makeDay } from "./helpers";

const model = buildGlobeModel(
  makeDay({
    flights: [
      // observed with a coverage gap between t=240 and t=5000 (relative to dep = FROM + 100)
      flight({
        id: "a", from: "IST", to: "JFK", region: "AME", dep: FROM + 100, arr: null, end: "AIRBORNE",
        s: [[0, 100, 41, 29], [120, 100, 42, 28], [240, 100, 43, 27], [4900, 300, 50, -30], [5020, 300, 51, -31]],
        gaps: [[240, 4900]],
      }),
      // no route known → observed only
      flight({ id: "b", region: "UNK", dep: FROM + 200, arr: FROM + 500, end: "LAST_CONTACT", s: [[0, 200, 10, 10], [120, 200, 10.5, 10.5]] }),
      // single sample → no segments at all
      flight({ id: "c", dep: FROM + 300, s: [[0, 100, 0, 0]] }),
    ],
  }),
);

describe("isBreak", () => {
  const f = model.flights[0];
  it("breaks on a matching gap or a long silence, not on normal spacing", () => {
    expect(BREAK_SEC).toBe(600);
    expect(isBreak(f, 0)).toBe(false);
    expect(isBreak(f, 1)).toBe(false);
    expect(isBreak(f, 2)).toBe(true); // 240 → 4900 matches the gap
    expect(isBreak(f, 3)).toBe(false);
  });
  it("breaks on dt > BREAK_SEC even without a gap record", () => {
    const g = { ...f, gaps: [] };
    expect(isBreak(g, 2)).toBe(true);
  });
});

describe("isBreak gap branch", () => {
  const mk = (gaps: [number, number][]) =>
    buildGlobeModel(
      makeDay({
        flights: [
          flight({ id: "g", dep: FROM + 100, s: [[0, 100, 10, 10], [300, 100, 11, 11], [420, 100, 12, 12]], gaps }),
        ],
      }),
    ).flights[0];
  it("breaks on a recorded gap even when dt is below BREAK_SEC", () => {
    const f = mk([[0, 300]]);
    expect(f.t[1] - f.t[0]).toBeLessThan(BREAK_SEC);
    expect(isBreak(f, 0)).toBe(true);
    expect(isBreak(f, 1)).toBe(false);
  });
  it("does not break without the gap record", () => {
    expect(isBreak(mk([]), 0)).toBe(false);
  });
});

describe("buildArcBuffers", () => {
  const b = buildArcBuffers(model);
  const kinds = Array.from({ length: b.count }, (_, i) => b.info[i * 4 + 1]);

  it("observed runs skip the gap; planned arc is added only for routed flights", () => {
    // flight a: run1 (3 pts → 2 seg) + run2 (2 pts → 1 seg) = 3 observed; planned = 47
    // flight b: 1 observed, no planned; flight c: nothing
    expect(kinds.filter((k) => k === 0)).toHaveLength(4);
    expect(kinds.filter((k) => k === 1)).toHaveLength(47);
    expect(b.count).toBe(51);
  });

  it("segment attributes", () => {
    const rel = FROM + 100 - FROM; // dep relative to window.from
    const first = 0;
    expect(b.info[first * 4]).toBe(5); // AME index in REGIONS
    expect(b.info[first * 4 + 2]).toBe(0); // flight index
    expect(Array.from(b.t.slice(0, 2))).toEqual([rel + 0, rel + 120]);
    const len = Math.hypot(b.a[0], b.a[1], b.a[2]);
    expect(len).toBeCloseTo(altitudeRadius(100) + ARC_BASE_LIFT, 5);
  });

  it("planned segments carry [dep, end] and a dash coordinate that grows along the arc", () => {
    const i = kinds.findIndex((k) => k === 1);
    const f = model.flights[0];
    expect(b.t[i * 2]).toBe(f.dep);
    expect(b.t[i * 2 + 1]).toBe(f.end);
    expect(b.s[i * 2 + 1]).toBeGreaterThan(b.s[i * 2]);
    const last = kinds.lastIndexOf(1);
    expect(b.s[last * 2 + 1]).toBeCloseTo(f.planned!.distKm / 6371.0088, 3);
    expect(b.info[i * 4 + 2]).toBe(0);
  });

  it("all positions are finite", () => {
    for (const v of [b.a, b.b, b.t, b.s]) expect(Array.from(v).every(Number.isFinite)).toBe(true);
  });
});

describe("createArcs", () => {
  it("is a double-sided, depth-tested additive instanced mesh", () => {
    const a = createArcs(model);
    const m = a.mesh.material as ShaderMaterial;
    expect(m.side).toBe(DoubleSide);
    expect(m.depthTest).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect((a.mesh.geometry as unknown as { instanceCount: number }).instanceCount).toBe(51);
    expect(a.uniforms.uColors.value).toHaveLength(7);
    a.setResolution(1920, 1080, 2);
    expect(a.uniforms.uRes.value.toArray()).toEqual([1920, 1080]);
    expect(a.uniforms.uWidth.value).toBeCloseTo(ARC_WIDTH_PX * 2, 9);
    a.dispose();
  });
});

describe("hardening", () => {
  it("skips planned arcs for <1 km or non-finite routes", () => {
    const m = buildGlobeModel(makeDay({ flights: [flight({ from: "IST", to: "JFK", s: [[0, 1, 1, 1]] })] }));
    const base = buildArcBuffers(m).count;
    expect(base).toBe(47);
    const near = { ...m, flights: [{ ...m.flights[0], planned: { ...m.flights[0].planned!, distKm: 0.5 } }] };
    expect(buildArcBuffers(near).count).toBe(0);
    const nan = { ...m, flights: [{ ...m.flights[0], planned: { ...m.flights[0].planned!, toLat: NaN } }] };
    expect(buildArcBuffers(nan).count).toBe(0);
  });
  it("altitudeRadius treats NaN/undefined as 0", () => {
    expect(altitudeRadius(NaN)).toBe(1);
    expect(altitudeRadius(undefined as unknown as number)).toBe(1);
  });
});
