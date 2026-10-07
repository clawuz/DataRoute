import { describe, expect, it } from "vitest";
import {
  INSTRUMENT_MENU, MOTIFS, continentInstrument, isPhraseStart, lineGain, lineInstrument, lineNote, linePattern, motifFor, phrase, rotate, selectLines,
  type PhraseNote, type SkyFlight,
} from "../src/audio/lines";
import { CHORDS, scaleLadder } from "../src/audio/harmony";
import { euclid, routeHash } from "../src/audio/theory";

const pc = (s: number) => ((s % 12) + 12) % 12;
const [DOM, EUR, MEA, AFR, ASI, AME, UNK] = [0, 1, 2, 3, 4, 5, 6]; // REGIONS order
const fl = (id: string, key: string, regionIdx: number, extra: Partial<SkyFlight> = {}): SkyFlight => ({
  id, key, regionIdx, alt100: 350, vsFpm: 0, ...extra,
});
const byHash = (a: string, b: string) => routeHash(a) - routeHash(b) || (a < b ? -1 : 1);

describe("selectLines: one line per route (spec §4g)", () => {
  // routeHash: IST-LHR 2309319524 < IST-DXB 3498824140 < IST-JFK 3711461931 < IST-NRT 3966011162
  it("N flights sharing a key collapse to one line: routeCount = N, the representative is the newest (smallest ageSec)", () => {
    const fs = [fl("a1", "IST-LHR", EUR, { ageSec: 900 }), fl("a2", "IST-LHR", EUR, { ageSec: 120 }), fl("a3", "IST-LHR", EUR, { ageSec: 4000 })];
    const out = selectLines(fs, null);
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("a2");
    expect(out[0].routeCount).toBe(3);
    expect(out[0]).toEqual({ ...fs[1], routeCount: 3 });
    expect(fs[1].routeCount).toBeUndefined(); // inputs are not mutated
  });
  it("orders by route count (descending), ties by routeHash(key); no key twice", () => {
    const fs = [
      fl("n1", "IST-NRT", ASI), fl("j1", "IST-JFK", AME), fl("l1", "IST-LHR", EUR), fl("d1", "IST-DXB", MEA),
      fl("l2", "IST-LHR", EUR), fl("j2", "IST-JFK", AME), fl("d2", "IST-DXB", MEA), fl("l3", "IST-LHR", EUR),
    ];
    const out = selectLines(fs, null);
    expect(out.map((f) => f.key)).toEqual(["IST-LHR", "IST-DXB", "IST-JFK", "IST-NRT"]);
    expect(out.map((f) => f.routeCount)).toEqual([3, 2, 2, 1]);
    expect(new Set(out.map((f) => f.key)).size).toBe(out.length);
  });
  it("the followed flight represents its route (even if not the newest) and comes first", () => {
    const fs = [
      fl("l1", "IST-LHR", EUR, { ageSec: 10 }), fl("l2", "IST-LHR", EUR, { ageSec: 20 }), fl("l3", "IST-LHR", EUR, { ageSec: 30 }),
      fl("old", "IST-NRT", ASI, { ageSec: 9000 }), fl("new", "IST-NRT", ASI, { ageSec: 5 }),
    ];
    const out = selectLines(fs, "old");
    expect(out.map((f) => [f.id, f.routeCount])).toEqual([["old", 2], ["l1", 3]]);
    expect(selectLines(fs, "l3").map((f) => f.id)).toEqual(["l3", "new"]);
    expect(selectLines(fs, "not-airborne").map((f) => f.id)).toEqual(["l1", "new"]);
  });
  it("without ageSec the representative is the lowest routeHash(id), then id (deterministic)", () => {
    const fs = [fl("x2", "K", EUR), fl("x1", "K", EUR), fl("x3", "K", EUR)];
    const first = ["x1", "x2", "x3"].sort(byHash)[0];
    expect(selectLines(fs, null).map((f) => f.id)).toEqual([first]);
  });
  it("caps at max (12 by default) and at 4 routes per region, the followed route counting toward its region", () => {
    const fs: SkyFlight[] = [];
    for (const r of [DOM, EUR, MEA, AFR, ASI, AME]) for (let i = 0; i < 6; i++) fs.push(fl(`r${r}-${i}`, `K${r}-${i}`, r));
    const out = selectLines(fs, null);
    expect(out.length).toBe(12);
    const perRegion = new Map<number, number>();
    for (const f of out) perRegion.set(f.regionIdx, (perRegion.get(f.regionIdx) ?? 0) + 1);
    for (const n of perRegion.values()) expect(n).toBeLessThanOrEqual(4);
    expect(selectLines(fs, null, 5).length).toBe(5);
    expect(selectLines(fs.filter((f) => f.regionIdx === EUR), null).length).toBe(4);
    const eur = fs.filter((f) => f.regionIdx === EUR);
    const withFollow = selectLines(eur, "r1-5");
    expect(withFollow[0].id).toBe("r1-5");
    expect(withFollow.length).toBe(4); // r1-5 + 3 others
  });
  it("is deterministic and independent of the input order", () => {
    const fs = Array.from({ length: 40 }, (_, i) => fl(`f${i}`, `K${i % 9}`, i % 7, { ageSec: (i * 37) % 11 }));
    const a = selectLines(fs, "f13");
    expect(selectLines([...fs].reverse(), "f13")).toEqual(a);
    expect(a[0].id).toBe("f13");
    expect(new Set(a.map((f) => f.key)).size).toBe(a.length);
  });
  it("empty sky → no lines", () => {
    expect(selectLines([], null)).toEqual([]);
    expect(selectLines([], "x")).toEqual([]);
  });
});

describe("continentInstrument (v4, kept for the engine until Task 19)", () => {
  it("maps regions to instruments; west/north Europe plays the piano; domestic and unknown play the Rhodes", () => {
    expect(continentInstrument(fl("x", "k", EUR, { farLat: 51.5, farLon: -0.1 }))).toBe("PNO");
    expect(continentInstrument(fl("x", "k", EUR, { farLat: 59.9, farLon: 30.3 }))).toBe("PNO");
    expect(continentInstrument(fl("x", "k", EUR, { farLat: 37.9, farLon: 23.7 }))).toBe("EUR");
    expect(continentInstrument(fl("x", "k", EUR))).toBe("EUR");
    expect([MEA, AFR, ASI, AME].map((r) => continentInstrument(fl("x", "k", r)))).toEqual(["MEA", "AFR", "ASI", "AME"]);
    expect(continentInstrument(fl("x", "k", DOM))).toBe("EP");
    expect(continentInstrument(fl("x", "k", UNK))).toBe("EP");
    expect(continentInstrument(fl("x", "k", 99))).toBe("EP");
  });
});

describe("INSTRUMENT_MENU / lineInstrument: the route key picks from its continent's menu", () => {
  it("menus as in spec §4g", () => {
    expect(INSTRUMENT_MENU).toEqual({
      EUR_W: ["PNO", "HARP", "FLUTE"], EUR_E: ["EUR", "MARIMBA", "GUITAR"], MEA: ["MEA", "KANUN", "VIOLIN"],
      AFR: ["AFR", "MARIMBA", "GUITAR"], ASI: ["ASI", "FLUTE", "HARP"], AME: ["CELLO", "GUITAR", "ORGAN"],
      DOM: ["SAZ", "EP", "ORGAN"], UNK: ["EP"],
    });
  });
  it("hand-checked: routeHash % 3 picks the entry (IST-LHR 2, IST-JFK 0, IST-DXB 1)", () => {
    expect(lineInstrument(fl("x", "IST-LHR", EUR, { farLat: 51.5, farLon: -0.1 }))).toBe("FLUTE"); // EUR_W[2]
    expect(lineInstrument(fl("x", "IST-LHR", EUR, { farLat: 37.9, farLon: 23.7 }))).toBe("GUITAR"); // EUR_E[2]
    expect(lineInstrument(fl("x", "IST-LHR", EUR))).toBe("GUITAR"); // no far end → EUR_E
    expect(lineInstrument(fl("x", "IST-JFK", AME))).toBe("CELLO"); // AME[0]
    expect(lineInstrument(fl("x", "IST-DXB", MEA))).toBe("KANUN"); // MEA[1]
    expect(lineInstrument(fl("x", "IST-DXB", DOM))).toBe("EP"); // DOM[1]
    expect(lineInstrument(fl("x", "IST-DXB", UNK))).toBe("EP");
    expect(lineInstrument(fl("x", "IST-DXB", 99))).toBe("EP");
  });
  it("stable per key (independent of the flight id); 40 keys cover every entry of a menu", () => {
    for (const r of [EUR, MEA, AFR, ASI, AME, DOM]) {
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const a = lineInstrument(fl(`a${i}`, `IST-K${i}`, r));
        expect(lineInstrument(fl(`b${i}`, `IST-K${i}`, r, { alt100: 12 }))).toBe(a);
        seen.add(a);
      }
      expect(seen.size).toBe(3);
    }
  });
});

describe("MOTIFS / motifFor / isPhraseStart", () => {
  it("twelve motifs of four offsets whose durations fill one bar (16 steps)", () => {
    expect(MOTIFS.length).toBe(12);
    for (const m of MOTIFS) {
      expect(m.offsets.length).toBe(4);
      expect(m.durs.length).toBe(4);
      expect(m.durs.reduce((a, b) => a + b, 0)).toBe(16);
    }
    expect(MOTIFS[0]).toEqual({ offsets: [0, 2, 1, 0], durs: [4, 4, 4, 4] });
    expect(MOTIFS[3]).toEqual({ offsets: [0, 2, 4, 2], durs: [2, 2, 2, 10] });
    expect(MOTIFS[8]).toEqual({ offsets: [0, 2, 3, 2], durs: [8, 2, 2, 4] });
    expect(MOTIFS[11]).toEqual({ offsets: [1, 0, 2, 4], durs: [2, 2, 4, 8] });
  });
  it("hand-checked: IST-LHR (0x89a56b64) → m8, start 4, parity 1; IST-JFK (0xdd386a2b) → m3, start 4, parity 0", () => {
    expect(motifFor("IST-LHR", 1)).toEqual({ motif: MOTIFS[8], startStep: 4, everyBars: 2, barParity: 1 });
    expect(motifFor("IST-LHR", 3)).toEqual({ motif: MOTIFS[8], startStep: 4, everyBars: 1, barParity: 1 });
    expect(motifFor("IST-JFK", 2)).toEqual({ motif: MOTIFS[3], startStep: 4, everyBars: 2, barParity: 0 });
    expect(motifFor("IST-DXB", 1).startStep).toBe(0); // 0xd08bd1cc: nibble c → 12 % 4 = 0
    expect(motifFor("IST-NRT", 1).startStep).toBe(2); // 0xec64871a: nibble 1 → 1 % 4 = 1
  });
  it("start ∈ {0,2,4,6}, parity ∈ {0,1}, everyBars by route count, deterministic", () => {
    const starts = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const m = motifFor(`IST-K${i}`, 1);
      expect([0, 2, 4, 6]).toContain(m.startStep);
      expect([0, 1]).toContain(m.barParity);
      expect(m.everyBars).toBe(2);
      expect(motifFor(`IST-K${i}`, 3).everyBars).toBe(1);
      expect(motifFor(`IST-K${i}`, 7).everyBars).toBe(1);
      expect(motifFor(`IST-K${i}`, 1)).toEqual(m);
      starts.add(m.startStep);
    }
    expect(starts.size).toBe(4);
  });
  it("isPhraseStart over 8 bars: exactly the expected global steps", () => {
    const starts = (key: string, n: number) => Array.from({ length: 128 }, (_, k) => k).filter((k) => isPhraseStart(key, n, k));
    expect(starts("IST-LHR", 1)).toEqual([20, 52, 84, 116]); // odd bars 1, 3, 5, 7 at step 4
    expect(starts("IST-LHR", 3)).toEqual([4, 20, 36, 52, 68, 84, 100, 116]); // every bar at step 4
    expect(starts("IST-JFK", 2)).toEqual([4, 36, 68, 100]); // even bars 0, 2, 4, 6 at step 4
    expect(starts("IST-DXB", 1)).toEqual([16, 48, 80, 112]); // 0xd08bd1cc: parity d → 1, step 0
  });
});

describe("phrase: the route motif on the chord-scale ladders", () => {
  const { Dm9, A7b9 } = CHORDS;
  const desc = (ns: PhraseNote[]) => ns.map((n) => [n.stepOffset, n.durSteps, n.semis, n.vel]);
  it("hand-checked IST-LHR (m8) at FL350 on Dm9: rungs 17, 19, 20, 19", () => {
    // Dm9 ladder rung 14 = 36 … 17 = 41 (D), 18 = 43, 19 = 44 (F), 20 = 46 (G); offsets [0,2,3,2] at steps 0, 8, 10, 12
    expect(desc(phrase(fl("x", "IST-LHR", EUR, { alt100: 350 }), () => Dm9))).toEqual([
      [0, 8, 41, 0.5], [8, 2, 44, 0.42], [10, 2, 46, 0.42], [12, 4, 44, 0.42],
    ]);
    // America: base rung 17 − 7 = 10 → rungs 10, 12, 13, 12 = 29, 32, 34, 32
    expect(phrase(fl("x", "IST-LHR", AME, { alt100: 350 }), () => Dm9).map((n) => n.semis)).toEqual([29, 32, 34, 32]);
    // IST-JFK (m3: [0,2,4,2] / [2,2,2,10]) climbing at FL100: round(100/410 · 20) = 5, +1 → 6 (22, G: snapped to F 20)
    expect(desc(phrase(fl("x", "IST-JFK", EUR, { alt100: 100, vsFpm: 1500 }), () => Dm9))).toEqual([
      [0, 2, 20, 0.5], [2, 2, 26, 0.42], [4, 2, 29, 0.42], [6, 10, 26, 0.42],
    ]);
  });
  it("each note is placed on the chord sounding at its own step", () => {
    const at: number[] = [];
    phrase(fl("x", "IST-LHR", EUR), (o) => (at.push(o), Dm9));
    expect(at).toEqual([0, 8, 10, 12]);
  });
  it("cumulative offsets, motif durations, scale and chord-tone rules for every chord, region, altitude", () => {
    const chords = Object.values(CHORDS);
    for (let i = 0; i < 24; i++) {
      const key = `IST-K${i}`;
      const { motif } = motifFor(key, 1);
      for (const region of [EUR, AME, DOM]) for (const alt of [0, 60, 180, 350, 410]) for (const vs of [-1500, 0, 1500]) {
        const chordAt = (o: number) => chords[(o + i) % chords.length];
        const ns = phrase(fl("x", key, region, { alt100: alt, vsFpm: vs }), chordAt);
        expect(ns.map((n) => n.durSteps)).toEqual(motif.durs);
        expect(ns.map((n) => n.stepOffset)).toEqual([0, motif.durs[0], motif.durs[0] + motif.durs[1], motif.durs[0] + motif.durs[1] + motif.durs[2]]);
        expect(ns.map((n) => n.vel)).toEqual([0.5, 0.42, 0.42, 0.42]);
        for (const [k, n] of ns.entries()) {
          const c = chordAt(n.stepOffset);
          expect(c.scale.includes(pc(n.semis))).toBe(true);
          if (k === 0 || n.stepOffset % 4 === 0) expect(c.tones.includes(pc(n.semis))).toBe(true);
        }
      }
    }
  });
  it("pitch rises with altitude, America sits lower, the same input gives the same output", () => {
    for (let i = 0; i < 24; i++) {
      const key = `IST-K${i}`;
      const chordAt = (o: number) => (o < 8 ? Dm9 : A7b9);
      const low = phrase(fl("x", key, EUR, { alt100: 100 }), chordAt);
      const high = phrase(fl("x", key, EUR, { alt100: 380 }), chordAt);
      const ame = phrase(fl("x", key, AME, { alt100: 380 }), chordAt);
      for (let k = 0; k < 4; k++) {
        expect(high[k].semis).toBeGreaterThan(low[k].semis);
        expect(ame[k].semis).toBeLessThan(high[k].semis);
      }
      expect(phrase(fl("x", key, EUR, { alt100: 380 }), chordAt)).toEqual(high);
    }
  });
  it("routeCount does not change the notes (only when the phrase plays)", () => {
    const f = fl("x", "IST-LHR", EUR);
    expect(phrase({ ...f, routeCount: 5 }, () => Dm9)).toEqual(phrase(f, () => Dm9));
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

describe("selectLines with active region layers", () => {
  const fs = [fl("e1", "IST-LHR", EUR), fl("e2", "IST-LHR", EUR, { ageSec: 1 }), fl("m1", "IST-DXB", MEA), fl("a1", "IST-JFK", AME), fl("d1", "IST-ESB", DOM)];
  it("only routes of active regions are candidates", () => {
    const ids = selectLines(fs, null, 12, new Set(["EUR", "AME"])).map((f) => f.id);
    expect(ids).toEqual(["e2", "a1"]); // IST-LHR (2 flights, newest e2), then IST-JFK
    expect(selectLines(fs, null, 12, new Set())).toEqual([]);
  });
  it("the followed route plays even when its region is not active", () => {
    expect(selectLines(fs, "m1", 12, new Set(["EUR"])).map((f) => f.id)).toEqual(["m1", "e2"]);
    expect(selectLines(fs, "m1", 12, new Set()).map((f) => f.id)).toEqual(["m1"]);
  });
  it("without `active` nothing is filtered", () => {
    expect(selectLines(fs, "m1", 12, undefined)).toEqual(selectLines(fs, "m1"));
    expect(selectLines(fs, null).length).toBe(4);
  });
});
