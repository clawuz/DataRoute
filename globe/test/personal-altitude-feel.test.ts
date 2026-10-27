import { describe, expect, it } from "vitest";
import { cutoffOf, flightRun, heightOf, velScale, wetShift } from "../src/personal/altitude-feel";
import { composePiece, type PersonalNote } from "../src/personal/compose";
import { cruiseFt } from "../src/personal/flight";
import { buildRoutes } from "../src/personal/routes";
import destinations from "../src/personal/destinations.json";

describe("altitude feel: the mappings", () => {
  it("heightOf: 0 on the ground, 1 at cruise, monotone, clamped", () => {
    for (const km of [100, 500, 1200, 3000, 8000]) {
      expect(heightOf(0, km)).toBe(0);
      expect(heightOf(cruiseFt(km), km)).toBe(1);
      expect(heightOf(cruiseFt(km) * 3, km)).toBe(1);
      expect(heightOf(-500, km)).toBe(0);
      let last = -1;
      for (let a = 0; a <= cruiseFt(km); a += 1000) {
        const h = heightOf(a, km);
        expect(h).toBeGreaterThanOrEqual(last);
        last = h;
      }
    }
  });
  it("loudness: 0.88 on the ground, 1 at half, 1.12 at cruise", () => {
    expect(velScale(0)).toBeCloseTo(0.88, 9);
    expect(velScale(0.5)).toBeCloseTo(1, 9);
    expect(velScale(1)).toBeCloseTo(1.12, 9);
    expect(velScale(2)).toBeCloseTo(1.12, 9);
  });
  it("brightness: 1400 Hz on the ground, 9000 Hz at cruise, rising", () => {
    expect(cutoffOf(0)).toBeCloseTo(1400, 6);
    expect(cutoffOf(1)).toBeCloseTo(9000, 6);
    expect(cutoffOf(0.5)).toBeCloseTo(1400 + 7600 * 0.5 ** 1.2, 6);
    expect(cutoffOf(0.3)).toBeLessThan(cutoffOf(0.6));
  });
  it("room: −0.05 on the ground, 0 at half, +0.05 at cruise", () => {
    expect(wetShift(0)).toBeCloseTo(-0.05, 9);
    expect(wetShift(0.5)).toBeCloseTo(0, 9);
    expect(wetShift(1)).toBeCloseTo(0.05, 9);
  });
});

const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const codes = (destinations as { i: string }[]).map((d) => d.i);
const SEL = ["TZX", "RZV", "OGU"];
const ROLE_PERC = new Set(["TIMP", "TRI"]);

describe("altitude feel: composed pieces", { timeout: 60000 }, () => {
  const rs = buildRoutes(SEL, "IST");
  const piece = composePiece("visited", rs);
  const again = composePiece("visited", rs);
  const hOf = (n: PersonalNote): number => n.alt / cruiseFt(rs[n.route].distKm);

  it("is deterministic, and has no NaN", () => {
    expect(JSON.stringify(piece.notes)).toBe(JSON.stringify(again.notes));
    for (const n of piece.notes) {
      for (const v of [n.t, n.d, n.freq, n.vel, n.wet ?? 0, n.bright ?? 0]) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it("the notes of a route in the climb are quieter than those in the cruise (same instrument)", () => {
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    let compared = 0;
    for (const inst of new Set(piece.notes.filter((n) => n.bright !== undefined).map((n) => String(n.instrument)))) {
      const mine = piece.notes.filter((n) => String(n.instrument) === inst && n.bright !== undefined && n.show !== false);
      const low = mine.filter((n) => hOf(n) < 0.3);
      const high = mine.filter((n) => hOf(n) >= 0.95);
      if (low.length < 3 || high.length < 3) continue;
      compared++;
      // the same instrument can sit at different levels in different sections: compare the ratio inside the same section instead
      const sec = (n: PersonalNote): string => piece.sections.find((s) => n.t >= s.start && n.t < s.end)?.name ?? "";
      for (const name of new Set(mine.map(sec))) {
        const l = low.filter((n) => sec(n) === name);
        const hi = high.filter((n) => sec(n) === name);
        if (l.length >= 2 && hi.length >= 2) expect(mean(l.map((n) => n.vel)), `${inst} ${name}`).toBeLessThan(mean(hi.map((n) => n.vel)));
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
  it("bright is on drawn melodic notes only: not on hidden notes, drums or the drone", () => {
    const withB = piece.notes.filter((n) => n.bright !== undefined);
    expect(withB.length).toBeGreaterThan(0);
    for (const n of withB) {
      expect(n.show).not.toBe(false);
      expect(ROLE_PERC.has(String(n.instrument))).toBe(false);
      expect(n.bright!).toBeGreaterThanOrEqual(1400);
      expect(n.bright!).toBeLessThanOrEqual(9000);
    }
    for (const n of piece.notes) if (n.show === false) expect(n.bright).toBeUndefined();
  });
  it("wet stays within 0…0.5; high notes are roomier than low ones of the same route", () => {
    for (const n of piece.notes) {
      expect(n.wet!).toBeGreaterThanOrEqual(0);
      expect(n.wet!).toBeLessThanOrEqual(0.5);
    }
  });
  it("a hidden note copies the wet of its source: the same route and instrument have wet values from the drawn notes", () => {
    const drawn = new Map<string, Set<number>>();
    for (const n of piece.notes) {
      if (n.show === false) continue;
      const k = `${n.route}|${String(n.instrument)}`;
      (drawn.get(k) ?? drawn.set(k, new Set()).get(k)!).add(n.wet!);
    }
    let checked = 0;
    for (const n of piece.notes) {
      if (n.show !== false || n.wet === 0.3) continue; // the drone is 0.3
      const set = drawn.get(`${n.route}|${String(n.instrument)}`);
      if (!set) continue;
      checked++;
      expect(set.has(n.wet!)).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });
  it("many selections: no NaN, at most 6000 notes, wet in range, bright only where allowed", () => {
    const rnd = lcg(20261027);
    for (let k = 0; k < 40; k++) {
      const n = 3 + Math.floor(rnd() * 6);
      const places = new Set<string>();
      while (places.size < n) places.add(codes[Math.floor(rnd() * codes.length)]);
      const r = buildRoutes([...places], k % 2 ? "IST" : undefined);
      if (!r.length) continue;
      const p = composePiece(k % 3 === 0 ? "wish" : "visited", r);
      expect(p.notes.length).toBeLessThanOrEqual(6000);
      for (const x of p.notes) {
        expect(Number.isFinite(x.vel) && x.vel > 0 && x.vel <= 1).toBe(true);
        expect(x.wet!).toBeGreaterThanOrEqual(0);
        expect(x.wet!).toBeLessThanOrEqual(0.5);
        if (x.show === false) expect(x.bright).toBeUndefined();
      }
    }
  });
});

describe("the flight runs (nağme)", { timeout: 60000 }, () => {
  it("flightRun: four degrees, 1…4 away from the last one, in the direction of the flight", () => {
    expect(flightRun(1, 3)).toEqual([4, 5, 6, 7]);
    expect(flightRun(-1, 3)).toEqual([2, 1, 0, -1]);
  });

  /** the runs of a piece: four drawn notes of a route, a sixteenth apart, filling the last beat of a bar */
  const runsOf = (places: string[], mode: "visited" | "wish" = "visited", home = "IST") => {
    const rs = buildRoutes(places, home);
    const p = composePiece(mode, rs);
    const bar = 240 / p.bpm;
    const beat = bar / 4;
    const n = rs.length;
    const order = rs.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i);
    const phraseBars = rs.map((_, i) => Math.min(16, Math.max(4, Math.round(4 + 12 * (n < 2 ? 0.5 : 1 - order.findIndex((o) => o.i === i) / (n - 1))))));
    const runs: { route: number; bar: number; notes: PersonalNote[]; start: number; end: number }[] = [];
    const sectionOf = (t: number): string => p.sections.find((s) => t >= s.start - 1e-6 && t < s.end)?.name ?? "";
    const lastBeat = new Map<string, PersonalNote[]>();
    for (const x of p.notes) {
      if (x.show === false) continue;
      const b = Math.floor((x.t + 0.05) / bar);
      if (x.t < b * bar + 3 * beat - 0.05) continue;
      const k = `${x.route}|${b}`;
      (lastBeat.get(k) ?? lastBeat.set(k, []).get(k)!).push(x);
    }
    for (const [k, list] of lastBeat) {
      const [route, b] = k.split("|").map(Number);
      list.sort((x, y) => x.t - y.t);
      const run = list.length === 4 && list.every((x, j) => j === 0 || Math.abs(x.t - list[j - 1].t - beat / 4) < 0.05) && list.every((x) => x.d < beat * 0.3);
      if (!run) continue;
      runs.push({ route, bar: b, notes: list, start: (b % phraseBars[route]) / phraseBars[route], end: ((b % phraseBars[route]) + 1) / phraseBars[route] });
    }
    runs.sort((x, y) => x.bar - y.bar || x.route - y.route);
    return { p, rs, runs, bar, sectionOf };
  };

  it("a piece with a hook route has rising runs in climbing bars and falling runs in descending bars", () => {
    const { runs } = runsOf(["TZX", "RZV", "OGU"]);
    expect(runs.length).toBeGreaterThan(0);
    const rising = runs.filter((r) => r.start < 0.18);
    const falling = runs.filter((r) => r.end > 0.82);
    expect(rising.length).toBeGreaterThan(0);
    expect(falling.length).toBeGreaterThan(0);
    expect(rising.length + falling.length).toBe(runs.length);
    // each step goes the right way up to an octave: the fold into the range of the instrument (`fit`) may move a note by octaves
    const step = (a: PersonalNote, b: PersonalNote): number => (((12 * Math.log2(b.freq / a.freq)) % 12) + 12) % 12;
    for (const r of rising) for (let j = 1; j < 4; j++) expect(step(r.notes[j - 1], r.notes[j]), `rising bar ${r.bar}`).toBeLessThan(6);
    for (const r of falling) for (let j = 1; j < 4; j++) expect(step(r.notes[j - 1], r.notes[j]), `falling bar ${r.bar}`).toBeGreaterThan(6);
    // and most runs are plain monotone (no fold)
    const plain = (r: (typeof runs)[number], up: boolean): boolean => r.notes.every((x, j) => j === 0 || (up ? x.freq > r.notes[j - 1].freq : x.freq < r.notes[j - 1].freq));
    expect(rising.filter((r) => plain(r, true)).length).toBeGreaterThan(rising.length / 2);
    expect(falling.filter((r) => plain(r, false)).length).toBeGreaterThan(falling.length / 2);
  });
  it("a run is drawn and comes from one route", () => {
    const { runs, p } = runsOf(["TZX", "RZV", "OGU"]);
    for (const r of runs) for (const x of r.notes) {
      expect(x.show).not.toBe(false);
      expect(x.route).toBe(r.route);
      expect(x.drawDur!).toBeGreaterThan(0);
    }
    expect(p.notes.length).toBeLessThanOrEqual(6000);
  });
  it("no run in the bars where the hook answers (call and response): the odd bars of the chorus", () => {
    const { runs, p, sectionOf, bar } = runsOf(["TZX", "RZV", "OGU"]);
    const first = Math.round(p.sections.find((s) => s.name === "chorus")!.start / bar);
    for (const r of runs) {
      if (sectionOf(r.bar * bar + 0.01) !== "chorus") continue;
      expect((r.bar - first) % 2, `bar ${r.bar}`).toBe(0);
    }
  });
  it("is deterministic", () => {
    expect(JSON.stringify(runsOf(["TZX", "RZV", "OGU"]).runs)).toBe(JSON.stringify(runsOf(["TZX", "RZV", "OGU"]).runs));
  });
});
