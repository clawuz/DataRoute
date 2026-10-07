import { describe, expect, it } from "vitest";
import {
  activeLayers, buildup, intensityOf, levelFor, nextLevel, regionShares, smoothIntensity, type Level,
} from "../src/audio/arrangement";
import { SECTIONS } from "../src/audio/form";
import type { SkyFlight } from "../src/audio/lines";
import type { RegionName } from "../src/audio/theory";

const [DOM, EUR, MEA, AFR, ASI, AME, UNK] = [0, 1, 2, 3, 4, 5, 6]; // REGIONS order
const fl = (id: string, regionIdx: number): SkyFlight => ({ id, key: id, regionIdx, alt100: 350, vsFpm: 0 });
const set = (...r: RegionName[]): ReadonlySet<RegionName> => new Set(r);
/** shares array in REGIONS order from a partial map */
const shares = (m: Partial<Record<RegionName, number>>): number[] =>
  (["DOM", "EUR", "MEA", "AFR", "ASI", "AME", "UNK"] as RegionName[]).map((r) => m[r] ?? 0);

describe("intensity", () => {
  it("intensityOf = clamp(airborne / 150, 0, 1)", () => {
    expect(intensityOf(0)).toBe(0);
    expect(intensityOf(75)).toBe(0.5);
    expect(intensityOf(150)).toBe(1);
    expect(intensityOf(300)).toBe(1);
    expect(intensityOf(-5)).toBe(0);
  });
  it("smoothIntensity: exponential approach with a 2 s time constant", () => {
    // after 2 s the gap closes by 1 − e^−1 ≈ 63.2 %
    expect(smoothIntensity(0, 1, 2)).toBeCloseTo(1 - Math.exp(-1), 12);
    expect(smoothIntensity(0, 1, 2)).toBeCloseTo(0.632, 3);
    expect(smoothIntensity(1, 0, 2)).toBeCloseTo(Math.exp(-1), 12);
    expect(smoothIntensity(0.3, 0.3, 5)).toBe(0.3);
    expect(smoothIntensity(0.2, 0.8, 0)).toBe(0.2);
    let x = 0;
    for (let i = 0; i < 600; i++) x = smoothIntensity(x, 1, 0.05); // 30 s
    expect(x).toBeCloseTo(1, 4);
  });
});

describe("levels", () => {
  it("levelFor = clamp(round(intensity · 4), section range)", () => {
    expect(levelFor(SECTIONS.NIGHT, 1)).toBe(1); // round(4) → clamp [0,1]
    expect(levelFor(SECTIONS.NIGHT, 0)).toBe(0);
    expect(levelFor(SECTIONS.DAY, 0)).toBe(2); // clamp [2,4]
    expect(levelFor(SECTIONS.DAY, 1)).toBe(4);
    expect(levelFor(SECTIONS.MORNING, 1)).toBe(3); // clamp [1,3]
    expect(levelFor(SECTIONS.MORNING, 0)).toBe(1);
    expect(levelFor(SECTIONS.EVENING, 0.5)).toBe(2); // round(2)
    expect(levelFor(SECTIONS.DAY, 0.7)).toBe(3); // round(2.8)
    expect(levelFor(SECTIONS.DAY, 0.6)).toBe(2); // round(2.4)
  });
  it("nextLevel rises at once and falls one level per bar", () => {
    const cases: [Level, Level, Level][] = [[3, 1, 2], [1, 3, 3], [0, 4, 4], [4, 0, 3], [2, 2, 2], [1, 0, 0]];
    for (const [cur, wanted, out] of cases) expect([cur, wanted, nextLevel(cur, wanted)]).toEqual([cur, wanted, out]);
  });
});

describe("region layers", () => {
  it("regionShares: shares per region in REGIONS order, summing to 1", () => {
    const fs = [fl("a", EUR), fl("b", EUR), fl("c", MEA), fl("d", AME)];
    expect(regionShares(fs)).toEqual([0, 0.5, 0.25, 0, 0, 0.25, 0]);
    const many = Array.from({ length: 37 }, (_, i) => fl(`f${i}`, i % 7));
    const s = regionShares(many);
    expect(s.length).toBe(7);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(s[DOM]).toBeCloseTo(6 / 37, 12); // indices 0, 7, …, 35 → 6 flights
    expect(s[AFR]).toBeCloseTo(5 / 37, 12);
    expect(regionShares([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(regionShares([fl("x", UNK)])).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
  it("enter at ≥ 0.14, stay at ≥ 0.08, leave below 0.08", () => {
    expect(activeLayers(set(), shares({ EUR: 0.14, MEA: 0.1 }))).toEqual(new Set(["EUR"]));
    expect(activeLayers(set("MEA"), shares({ EUR: 0.14, MEA: 0.1 }))).toEqual(new Set(["EUR", "MEA"]));
    expect(activeLayers(set("MEA"), shares({ MEA: 0.08 }))).toEqual(new Set(["MEA"]));
    expect(activeLayers(set("MEA"), shares({ MEA: 0.079 }))).toEqual(new Set());
    expect(activeLayers(set(), shares({ ASI: 0.139 }))).toEqual(new Set());
    expect(activeLayers(set("ASI"), shares({}))).toEqual(new Set());
  });
  it("at most `max` layers: the highest shares win, ties by REGIONS order", () => {
    const sh = shares({ DOM: 0.3, EUR: 0.15, MEA: 0.15, AFR: 0.14, ASI: 0.16, AME: 0.1 });
    expect([...activeLayers(set("AME"), sh)].sort()).toEqual(["ASI", "DOM", "EUR", "MEA"]); // AFR 0.14 and AME 0.10 drop
    expect([...activeLayers(set(), sh, 2)].sort()).toEqual(["ASI", "DOM"]);
    expect([...activeLayers(set(), shares({ EUR: 0.2, MEA: 0.2, AFR: 0.2 }), 2)].sort()).toEqual(["EUR", "MEA"]); // tie → REGIONS order
  });
});

describe("build-up", () => {
  it("replay: build in the last 0.55 h before a boundary, hit in the first 0.1 h after it", () => {
    expect(buildup(1, 5, true)).toEqual({ phase: "none", amount: 0 });
    expect(buildup(0.55, 5.45, true)).toEqual({ phase: "build", amount: 0 });
    const b = buildup(0.2, 5.8, true);
    expect(b.phase).toBe("build");
    expect(b.amount).toBeCloseTo(1 - 0.2 / 0.55, 12); // ≈ 0.636
    expect(b.amount).toBeCloseTo(0.636, 3);
    expect(buildup(0, 6, true)).toEqual({ phase: "build", amount: 1 });
    expect(buildup(5.95, 0.05, true)).toEqual({ phase: "hit", amount: 1 });
    expect(buildup(5.9, 0.1, true)).toEqual({ phase: "none", amount: 0 });
  });
  it("live: never", () => {
    for (const [to, since] of [[0.2, 5.8], [5.95, 0.05], [3, 3]])
      expect(buildup(to, since, false)).toEqual({ phase: "none", amount: 0 });
  });
});
