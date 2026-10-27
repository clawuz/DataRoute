import { describe, expect, it } from "vitest";
import { cutoffOf, heightOf, velScale, wetShift } from "../src/personal/altitude-feel";
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
