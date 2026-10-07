import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import { CORRIDOR_POINTS, buildCorridorBuffers, buildCorridors, corridorKey, corridorStyle, corridorWeight } from "../src/scene/corridors";
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
