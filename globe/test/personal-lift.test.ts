import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { LIFT_BARS, liftAt, liftFor } from "../src/personal/lift";
import { buildRoutes } from "../src/personal/routes";

describe("lift", () => {
  it("is nothing when the trip stays in one region, a relative major (+3) for a visited trip and a whole step (+2) for a wish", () => {
    expect(liftFor("visited", ["EUR", "EUR"])).toBe(0);
    expect(liftFor("visited", ["EUR", "ASI"])).toBe(3);
    expect(liftFor("wish", ["EUR", "ASI", "AME"])).toBe(2);
  });
  it("lifts only the last bars of the chorus", () => {
    const at = (b: number): number => liftAt(b, 32, 20, 3);
    expect([31, 32, 43].map(at)).toEqual([0, 0, 0]);
    expect([44, 47, 51].map(at)).toEqual([3, 3, 3]);
    expect([52, 55, 56, 63].map(at)).toEqual([0, 0, 0, 0]);
    expect(LIFT_BARS).toBe(8);
  });
});

describe("lift in a piece", () => {
  const lowest = (p: ReturnType<typeof composePiece>, bar: number): number => {
    const bt = (60 / p.bpm) * 4;
    // the drone (show: false, Task 4) is not part of the chords: only notes that are drawn count
    const inBar = p.notes.filter((n) => n.show !== false && n.t >= bar * bt - 1e-6 && n.t < (bar + 1) * bt - 1e-6);
    return 12 * Math.log2(Math.min(...inBar.map((n) => n.freq)) / 110);
  };
  const pc = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
  it("records the lift in the style: 3 across regions, 0 in one region", () => {
    expect(composePiece("visited", buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST")).style.lift).toBe(3);
    expect(composePiece("wish", buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST")).style.lift).toBe(2);
    expect(composePiece("visited", buildRoutes(["ESB", "ADB", "AYT", "TZX"], "IST")).style.lift).toBe(0);
  });
  it("sounds the same chord a step higher, then goes home", () => {
    const routes = buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST");
    const p = composePiece("visited", routes);
    expect(pc(lowest(p, 44) - lowest(p, 40))).toBe(3);
    expect(pc(lowest(p, 56) - lowest(p, 40))).toBe(0);
    expect(pc(lowest(p, 48) - lowest(p, 36))).toBe(3);
  });
  it("does not lift a trip inside one region", () => {
    const p = composePiece("visited", buildRoutes(["ESB", "ADB", "AYT", "TZX"], "IST"));
    // bar 40 holds a passing bass note in this piece, so the lifted bars are compared with the home-key bars 56 and 40/48
    expect(pc(lowest(p, 44) - lowest(p, 56))).toBe(0);
    expect(pc(lowest(p, 48) - lowest(p, 40))).toBe(0);
  });
});
