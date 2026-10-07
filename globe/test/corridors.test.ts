import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { CORRIDOR_POINTS, buildCorridorBuffers, buildCorridors, corridorKey, corridorStyle, corridorWeight, createCorridors } from "../src/scene/corridors";
import { FROM, flight, makeDay } from "./helpers";

const s = (lon: number): [number, number, number, number][] => [[0, 300, 41, 29], [600, 350, 42, lon]];
const model = (flights: ReturnType<typeof flight>[]) => buildGlobeModel(makeDay({ flights }));

describe("buildCorridors", () => {
  it("merges flights on the same route, in both directions", () => {
    const m = model([
      flight({ from: "IST", to: "JFK", s: s(20) }),
      flight({ from: "JFK", to: "IST", s: s(10) }),
      flight({ from: "IST", to: "JFK", s: s(15) }),
      flight({ from: "IST", to: "LHR", s: s(5) }),
    ]);
    const cs = buildCorridors(m);
    expect(cs.map((c) => [c.key, c.count])).toEqual([["IST-JFK", 3], ["IST-LHR", 1]]);
    expect(corridorKey("JFK", "IST")).toBe("IST-JFK");
  });

  it("keeps a single orientation (a→b by sorted code) so coordinates agree with the key", () => {
    const m = model([flight({ from: "JFK", to: "IST", s: s(10) })]);
    const c = buildCorridors(m)[0];
    expect([c.a, c.b]).toEqual(["IST", "JFK"]);
    expect(c.fromLat).toBeCloseTo(41.2613, 3); // IST
    expect(c.toLat).toBeCloseTo(40.6398, 3); // JFK
  });

  it("ignores flights without a known route or with the same endpoints", () => {
    const m = model([flight({ s: s(20) }), flight({ from: "IST", to: "IST", s: s(20) }), flight({ from: "IST", to: "ZZZ", s: s(20) })]);
    expect(buildCorridors(m)).toEqual([]);
  });

  it("sorts by traffic, then key", () => {
    const m = model([
      flight({ from: "IST", to: "LHR", s: s(5) }),
      flight({ from: "IST", to: "ESB", s: s(5) }),
      flight({ from: "IST", to: "JFK", s: s(5) }),
      flight({ from: "IST", to: "JFK", s: s(5) }),
    ]);
    expect(buildCorridors(m).map((c) => c.key)).toEqual(["IST-JFK", "ESB-IST", "IST-LHR"]);
  });
});

describe("corridor style", () => {
  it("weight is sqrt-scaled and bounded", () => {
    expect(corridorWeight(1, 100)).toBeCloseTo(0.1, 9);
    expect(corridorWeight(100, 100)).toBe(1);
    expect(corridorWeight(5, 0)).toBe(0);
  });
  it("width and alpha grow monotonically; colour goes cool → warm → near white", () => {
    let pw = -1, pa = -1;
    for (let w = 0; w <= 1.0001; w += 0.1) {
      const st = corridorStyle(Math.min(1, w));
      expect(st.widthPx).toBeGreaterThanOrEqual(pw);
      expect(st.alpha).toBeGreaterThanOrEqual(pa);
      pw = st.widthPx;
      pa = st.alpha;
    }
    expect(corridorStyle(0).widthPx).toBeCloseTo(0.9, 9);
    expect(corridorStyle(1).widthPx).toBeCloseTo(4.5, 9);
    expect(corridorStyle(0).alpha).toBeCloseTo(0.1, 9);
    expect(corridorStyle(1).alpha).toBeCloseTo(0.45, 9);
    const [r0, , b0] = corridorStyle(0).rgb;
    const [r1, g1, b1] = corridorStyle(1).rgb;
    expect(b0).toBeGreaterThan(r0); // cool
    expect(r1).toBeGreaterThan(0.95);
    expect(g1).toBeGreaterThan(0.9);
    expect(b1).toBeGreaterThan(0.8); // near white
  });
});

describe("buildCorridorBuffers", () => {
  it("emits CORRIDOR_POINTS-1 instances per corridor with matching attribute sizes", () => {
    const m = model([flight({ from: "IST", to: "JFK", s: s(20) }), flight({ from: "IST", to: "LHR", s: s(5) })]);
    const cs = buildCorridors(m);
    const b = buildCorridorBuffers(cs);
    const n = (CORRIDOR_POINTS - 1) * cs.length;
    expect(b.count).toBe(n);
    expect(b.a.length).toBe(n * 3);
    expect(b.b.length).toBe(n * 3);
    expect(b.u.length).toBe(n * 2);
    expect(b.s.length).toBe(n * 2);
    expect(b.color.length).toBe(n * 3);
    expect(b.misc.length).toBe(n * 4);
    expect(b.misc[3]).toBe(0); // corridor index of the first corridor
    expect(b.misc[(CORRIDOR_POINTS - 1) * 4 + 3]).toBe(1);
  });
  it("is empty for no corridors", () => {
    expect(buildCorridorBuffers([]).count).toBe(0);
  });
});

describe("corridor pulses (route-line flashes of the music)", () => {
  const make = () =>
    createCorridors(model([flight({ from: "IST", to: "JFK", s: s(20) }), flight({ from: "IST", to: "JFK", s: s(20) }), flight({ from: "IST", to: "LHR", s: s(5) })]));
  const pulses = (c: ReturnType<typeof createCorridors>) => c.mesh.geometry.getAttribute("aPulse").array as Float32Array;
  const seg = CORRIDOR_POINTS - 1;

  it("indexOfKey matches indexOf for both route directions; unknown keys give -1", () => {
    const c = make();
    expect(c.indexOfKey("IST-JFK")).toBe(c.indexOf("IST", "JFK"));
    expect(c.indexOfKey("IST-LHR")).toBe(c.indexOf("LHR", "IST"));
    expect(c.indexOfKey("tk123")).toBe(-1);
    c.dispose();
  });
  it("pulse raises every instance of that corridor to 1 and leaves the others at 0", () => {
    const c = make();
    const i = c.indexOfKey("IST-LHR");
    c.pulse(i);
    const a = pulses(c);
    expect(a).toHaveLength(seg * 2);
    for (let k = 0; k < seg * 2; k++) expect(a[k]).toBe(Math.floor(k / seg) === i ? 1 : 0);
    c.dispose();
  });
  it("update decays the pulse by exp(−dt / 0.6) and removes it once faint", () => {
    const c = make();
    c.pulse(0);
    c.update(0.6);
    expect(pulses(c)[0]).toBeCloseTo(1 / Math.E, 6);
    expect(pulses(c)[seg - 1]).toBeCloseTo(1 / Math.E, 6);
    for (let k = 0; k < 20; k++) c.update(0.6);
    expect(pulses(c)[0]).toBe(0);
    c.dispose();
  });
  it("pulses add up and clamp at 1.5; out-of-range indices are ignored", () => {
    const c = make();
    c.pulse(1);
    c.pulse(1, 0.3);
    expect(pulses(c)[seg]).toBeCloseTo(1.3, 6);
    c.pulse(1);
    expect(pulses(c)[seg]).toBe(1.5);
    expect(() => { c.pulse(-1); c.pulse(99); }).not.toThrow();
    expect(pulses(c)[0]).toBe(0);
    c.dispose();
  });
});
