import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { LIFT_BARS, liftAt, liftFor } from "../src/personal/lift";
import { TUNES } from "../src/personal/melodies";
import { buildRoutes, type PersonalRoute } from "../src/personal/routes";

/** the key of a piece before its shift: D, five semitones above A2 (KEY_ROOT in compose.ts) */
const KEY_ROOT_ABOVE_A = 5;
const SCALE_OF_MODE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const pc = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
/** the hook route (the one that plays the tune when there is one): the arrangement of compose.ts by length of route */
const tuneRoute = (routes: PersonalRoute[]): number => {
  const n = routes.length;
  const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i);
  const SMALL: Record<number, string[]> = { 2: ["bass", "hook"], 3: ["bass", "hook", "pluck"], 4: ["pad", "bass", "hook", "pluck"], 5: ["pad", "bass", "hook", "pluck", "kick"], 6: ["pad", "bass", "hook", "pluck", "kick", "backbeat"] };
  const BASE = ["pad", "bass", "hook", "pluck", "kick", "backbeat", "hat"];
  const seq = n <= 6 ? SMALL[n] : order.map((_, k) => BASE[Math.floor((k * 7) / n)]);
  return order[seq.indexOf("hook")].i;
};
/** the drawn notes of one route with the bar each starts in (humanize moves a note up to 18 ms early) and its pitch class above A */
const notesOfRoute = (p: ReturnType<typeof composePiece>, route: number): { bar: number; pc: number }[] => {
  const bt = (60 / p.bpm) * 4;
  return p.notes.filter((n) => n.route === route && n.show !== false).map((n) => ({ bar: Math.floor((n.t + 0.03) / bt), pc: pc(12 * Math.log2(n.freq / 110)) }));
};

describe("lift", () => {
  it("is nothing when the trip stays in one region, a minor third up (+3) for a visited trip and a whole step (+2) for a wish", () => {
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
    expect(composePiece("visited", buildRoutes(["ADA", "ESB", "DIY", "AYT"], "IST")).style.lift).toBe(0);
  });
  it("sounds the same chord a step higher, then goes home", () => {
    // `lowest` measures the chord only when the lowest note of a bar is a chord voice. With DEL first (a Bollywood card) the lowest note of a bar can be a
    // hook note, which also follows the altitude of the flight at that bar (a different degree in bar 44 than in bar 40): not a lift defect, a measure that does not fit that mix
    const routes = buildRoutes(["BOM", "NRT", "CAI", "GRU"], "IST");
    const p = composePiece("visited", routes);
    expect(pc(lowest(p, 44) - lowest(p, 40))).toBe(3);
    expect(pc(lowest(p, 56) - lowest(p, 40))).toBe(0);
    expect(pc(lowest(p, 48) - lowest(p, 36))).toBe(3);
  });
  it("plays an 8-bar tune that runs into the lifted bars in the lifted key, and the one that runs into the break at home", () => {
    // found with a probe over a few hundred selections: lifted trips whose card takes an 8-bar tune (a minor one in 2/4
    // stretched to the bar, and a major one in 4/4). The tunes start at bars 32, 40, 48: the one of bar 40 runs into the
    // lifted bars 44-51, the one of bar 48 runs into the break (52-55), which is home again.
    const cases: [Parameters<typeof composePiece>[0], string[], string | undefined, string][] = [
      ["visited", ["JFK", "OHD", "MSQ"], "IST", "uskudar"],
      ["wish", ["EWR", "MSQ", "NAV", "LOS"], undefined, "twinkle"],
    ];
    for (const [mode, places, home, id] of cases) {
      const routes = buildRoutes(places, home);
      const p = composePiece(mode, routes, { tunes: true });
      const tune = TUNES.find((t) => t.id === p.style.tune)!;
      expect(tune.id).toBe(id);
      expect(tune.bars).toBe(8);
      const lift = p.style.lift!;
      expect(lift).toBeGreaterThan(0);
      // the pitch classes the tune may use at home: its mode (varyTune moves notes inside it) and its own notes, on the
      // key of the piece (D: five semitones above A2, moved by the style's shift); in the lifted bars the same, lifted
      const home0 = KEY_ROOT_ABOVE_A + p.style.shift;
      const homeSet = new Set([...SCALE_OF_MODE[tune.mode], ...tune.notes.map(([s]) => s)].map((x) => pc(home0 + x)));
      const liftSet = new Set([...homeSet].map((x) => pc(x + lift)));
      const notes = notesOfRoute(p, tuneRoute(routes));
      const inBars = (a: number, b: number): number[] => notes.filter((n) => n.bar >= a && n.bar <= b).map((n) => n.pc);
      expect(inBars(44, 51).length).toBeGreaterThan(0);
      expect(inBars(52, 55).length).toBeGreaterThan(0);
      expect(inBars(36, 43).filter((x) => !homeSet.has(x))).toEqual([]);
      expect(inBars(44, 51).filter((x) => !liftSet.has(x))).toEqual([]);
      expect(inBars(52, 55).filter((x) => !homeSet.has(x))).toEqual([]);
    }
  });
  it("moves the hook of a lifted bar up by the lift: the same bar of the chord cycle at home, a step higher", () => {
    // no tune here: the hook route sings its own motif, four bars long and on the four chords of the cycle
    for (const [mode, places] of [["visited", ["MCT", "EBL", "YUL", "TIF"]], ["wish", ["EWR", "MUC", "CDG", "DOH"]]] as const) {
      const routes = buildRoutes([...places], "IST");
      const p = composePiece(mode, routes);
      expect(p.style.tune).toBeUndefined();
      const lift = p.style.lift!;
      expect(lift).toBeGreaterThan(0);
      const notes = notesOfRoute(p, tuneRoute(routes));
      const pcsOf = (b: number): number[] => notes.filter((n) => n.bar === b).map((n) => n.pc);
      for (let b = 44; b < 52; b++) {
        const got = pcsOf(b);
        expect(got.length).toBeGreaterThan(0);
        // the climb of the flight moves the motif a little from bar to bar: one of the home chorus bars on the same chord
        // (32-43, the same place in the four-bar cycle) has the very same notes, lifted
        const homes = [32, 36, 40].map((x) => x + (b % 4)).filter((x) => x < 44).map((x) => pcsOf(x).map((y) => pc(y + lift)));
        expect(homes).toContainEqual(got);
      }
    }
  });
  it("does not lift a trip inside one region", () => {
    const p = composePiece("visited", buildRoutes(["ADA", "ESB", "DIY", "AYT"], "IST"));
    // bar 40 holds a passing bass note in this piece, so the lifted bars are compared with the home-key bars 56 and 40/48
    expect(pc(lowest(p, 44) - lowest(p, 56))).toBe(0);
    expect(pc(lowest(p, 48) - lowest(p, 40))).toBe(0);
  });
});
