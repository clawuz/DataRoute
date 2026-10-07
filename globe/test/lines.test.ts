import { describe, expect, it } from "vitest";
import { lineGain, lineInstrument, lineNote, linePattern, rotate, selectLines, type SkyFlight } from "../src/audio/lines";
import { CHORDS, scaleLadder } from "../src/audio/harmony";
import { euclid, routeHash } from "../src/audio/theory";

const pc = (s: number) => ((s % 12) + 12) % 12;
const [DOM, EUR, MEA, AFR, ASI, AME, UNK] = [0, 1, 2, 3, 4, 5, 6]; // REGIONS order
const fl = (id: string, key: string, regionIdx: number, extra: Partial<SkyFlight> = {}): SkyFlight => ({
  id, key, regionIdx, alt100: 350, vsFpm: 0, ...extra,
});
const byHash = (a: string, b: string) => routeHash(a) - routeHash(b) || (a < b ? -1 : 1);

describe("selectLines", () => {
  it("orders by route count, then by the hash of the flight id", () => {
    const fs = [fl("a1", "IST-LHR", EUR), fl("b1", "IST-JFK", AME), fl("a2", "IST-LHR", EUR), fl("c1", "IST-DXB", MEA), fl("b2", "IST-JFK", AME), fl("a3", "IST-LHR", EUR)];
    const ids = selectLines(fs, null).map((f) => f.id);
    expect(ids.slice(0, 3).sort(byHash)).toEqual(ids.slice(0, 3)); // the three IST-LHR flights (count 3), by hash
    expect(new Set(ids.slice(0, 3))).toEqual(new Set(["a1", "a2", "a3"]));
    expect(new Set(ids.slice(3, 5))).toEqual(new Set(["b1", "b2"])); // count 2
    expect(ids.slice(3, 5)).toEqual(["b1", "b2"].sort(byHash));
    expect(ids[5]).toBe("c1");
  });
  it("caps at max (12 by default) and at 4 lines per region", () => {
    const fs: SkyFlight[] = [];
    for (const r of [DOM, EUR, MEA, AFR, ASI, AME]) for (let i = 0; i < 6; i++) fs.push(fl(`r${r}-${i}`, `K${r}-${i}`, r));
    const out = selectLines(fs, null);
    expect(out.length).toBe(12);
    const perRegion = new Map<number, number>();
    for (const f of out) perRegion.set(f.regionIdx, (perRegion.get(f.regionIdx) ?? 0) + 1);
    for (const n of perRegion.values()) expect(n).toBeLessThanOrEqual(4);
    expect(selectLines(fs, null, 5).length).toBe(5);
    // a single region can contribute at most 4 even if nothing else is airborne
    expect(selectLines(fs.filter((f) => f.regionIdx === EUR), null).length).toBe(4);
  });
  it("the followed flight is always first, even with the lowest rank, and counts toward its region cap", () => {
    const fs: SkyFlight[] = [];
    for (let i = 0; i < 6; i++) fs.push(fl(`e${i}`, "IST-LHR", EUR));
    fs.push(fl("lonely", "IST-OSL", EUR));
    const out = selectLines(fs, "lonely");
    expect(out[0].id).toBe("lonely");
    expect(out.filter((f) => f.regionIdx === EUR).length).toBe(4); // lonely + 3 IST-LHR
    expect(out.length).toBe(4);
    expect(selectLines(fs, "not-airborne").map((f) => f.id)).not.toContain("not-airborne");
    expect(selectLines(fs, "not-airborne").length).toBe(4);
  });
  it("is deterministic and independent of the input order", () => {
    const fs = Array.from({ length: 40 }, (_, i) => fl(`f${i}`, `K${i % 7}`, i % 7));
    const a = selectLines(fs, "f13").map((f) => f.id);
    const b = selectLines([...fs].reverse(), "f13").map((f) => f.id);
    expect(a).toEqual(b);
    expect(selectLines(fs, "f13").map((f) => f.id)).toEqual(a);
    expect(a[0]).toBe("f13");
    expect(new Set(a).size).toBe(a.length);
  });
  it("empty sky → no lines", () => {
    expect(selectLines([], null)).toEqual([]);
    expect(selectLines([], "x")).toEqual([]);
  });
});

describe("lineInstrument", () => {
  it("maps regions to instruments; west/north Europe plays the piano; domestic and unknown play the Rhodes", () => {
    expect(lineInstrument(fl("x", "k", EUR, { farLat: 51.5, farLon: -0.1 }))).toBe("PNO"); // London: west of 20°E
    expect(lineInstrument(fl("x", "k", EUR, { farLat: 59.9, farLon: 30.3 }))).toBe("PNO"); // St Petersburg: north of 52°N
    expect(lineInstrument(fl("x", "k", EUR, { farLat: 37.9, farLon: 23.7 }))).toBe("EUR"); // Athens
    expect(lineInstrument(fl("x", "k", EUR))).toBe("EUR"); // no far end known
    expect([MEA, AFR, ASI, AME].map((r) => lineInstrument(fl("x", "k", r)))).toEqual(["MEA", "AFR", "ASI", "AME"]);
    expect(lineInstrument(fl("x", "k", DOM))).toBe("EP");
    expect(lineInstrument(fl("x", "k", UNK))).toBe("EP");
    expect(lineInstrument(fl("x", "k", 99))).toBe("EP");
  });
});

describe("linePattern", () => {
  it("rotate shifts later by r steps (wrapping)", () => {
    expect(rotate([true, false, false, false], 1)).toEqual([false, true, false, false]);
    expect(rotate([true, false, true, false], 3)).toEqual([false, true, false, true]);
    expect(rotate([true, false, false], -1)).toEqual([false, false, true]);
  });
  it("is a rotated E(3 + hash % 4, 16): 16 steps, the right number of onsets, deterministic", () => {
    for (const id of ["THY1", "BAW22", "UAE7", "abc", "4ba9f2", ""]) {
      const h = routeHash(id);
      const p = linePattern(id);
      expect(p.length).toBe(16);
      expect(p.filter(Boolean).length).toBe(3 + (h % 4));
      expect(p).toEqual(rotate(euclid(3 + (h % 4), 16), h % 16));
      expect(linePattern(id)).toEqual(p);
    }
  });
});

describe("lineNote: altitude is pitch", () => {
  const { Dm9 } = CHORDS;
  // Dm9 ladder: 12 14 15 17 19 20 22 | 24 26 27 29 31 32 34 | 36 38 39 41 43 44 46 (21 rungs)
  it("hand-checked rungs: FL350 → rung 17 (41 = D5); climbing +1, descending −1", () => {
    expect(lineNote(fl("x", "k", EUR, { alt100: 350 }), Dm9, 1)).toBe(41); // round(350/410 · 20) = round(17.07) = 17
    expect(lineNote(fl("x", "k", EUR, { alt100: 350, vsFpm: 1500 }), Dm9, 1)).toBe(43);
    expect(lineNote(fl("x", "k", EUR, { alt100: 350, vsFpm: -1500 }), Dm9, 1)).toBe(39);
    expect(lineNote(fl("x", "k", EUR, { alt100: 350, vsFpm: 300 }), Dm9, 1)).toBe(41); // threshold is strict
    expect(lineNote(fl("x", "k", EUR, { alt100: 350, vsFpm: null }), Dm9, 1)).toBe(41);
    expect(lineNote(fl("x", "k", EUR, { alt100: 0 }), Dm9, 1)).toBe(12);
    expect(lineNote(fl("x", "k", EUR, { alt100: 500 }), Dm9, 1)).toBe(46); // clamped to the top rung
    expect(lineNote(fl("x", "k", EUR, { alt100: 410, vsFpm: 2000 }), Dm9, 1)).toBe(46);
    expect(lineNote(fl("x", "k", EUR, { alt100: 0, vsFpm: -2000 }), Dm9, 1)).toBe(12);
  });
  it("strong steps (step % 4 = 0) lean on the nearest chord tone", () => {
    // alt 21: round(21/410 · 20) = round(1.02) = 1 → 14 (B, not a Dm9 tone); nearest tone C (15)
    expect(lineNote(fl("x", "k", EUR, { alt100: 21 }), Dm9, 1)).toBe(14);
    expect(lineNote(fl("x", "k", EUR, { alt100: 21 }), Dm9, 4)).toBe(15);
    expect(lineNote(fl("x", "k", EUR, { alt100: 350 }), Dm9, 0)).toBe(41); // D is already a tone
  });
  it("America sits 7 rungs lower, clamped at the bottom", () => {
    expect(lineNote(fl("x", "k", AME, { alt100: 350 }), Dm9, 1)).toBe(29); // rung 10
    expect(lineNote(fl("x", "k", AME, { alt100: 50 }), Dm9, 1)).toBe(12); // round(2.44) = 2 → −5 → 0
  });
  it("monotone in altitude on weak steps; every pitch in the scale; climbing ≥ cruise ≥ descending", () => {
    for (const chord of Object.values(CHORDS)) {
      const ladder = scaleLadder(chord, 3, 5);
      for (const region of [EUR, AME, DOM]) {
        let prev = -Infinity;
        for (let alt = 0; alt <= 410; alt += 5) {
          const cruise = lineNote(fl("x", "k", region, { alt100: alt }), chord, 1);
          expect(cruise).toBeGreaterThanOrEqual(prev);
          prev = cruise;
          expect(ladder).toContain(cruise);
          const up = lineNote(fl("x", "k", region, { alt100: alt, vsFpm: 1200 }), chord, 1);
          const down = lineNote(fl("x", "k", region, { alt100: alt, vsFpm: -1200 }), chord, 1);
          expect(up).toBeGreaterThanOrEqual(cruise);
          expect(down).toBeLessThanOrEqual(cruise);
          for (const step of [0, 4, 8, 12]) {
            const strong = lineNote(fl("x", "k", region, { alt100: alt, vsFpm: 800 }), chord, step);
            expect(chord.tones.includes(pc(strong))).toBe(true);
          }
          for (const step of [1, 2, 3, 5, 15]) expect(chord.scale.includes(pc(lineNote(fl("x", "k", region, { alt100: alt }), chord, step)))).toBe(true);
          if (region === EUR) expect(lineNote(fl("x", "k", AME, { alt100: alt }), chord, 1)).toBeLessThanOrEqual(cruise);
        }
      }
      expect(lineNote(fl("x", "k", AME, { alt100: 350 }), chord, 1)).toBeLessThan(lineNote(fl("x", "k", EUR, { alt100: 350 }), chord, 1));
    }
  });
});

describe("lineGain", () => {
  it("is 0.5 / √N (N ≥ 1)", () => {
    expect(lineGain(1)).toBe(0.5);
    expect(lineGain(0)).toBe(0.5);
    expect(lineGain(4)).toBe(0.25);
    expect(lineGain(12)).toBeCloseTo(0.5 / Math.sqrt(12), 12);
  });
});
