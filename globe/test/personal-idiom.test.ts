import { describe, expect, it } from "vitest";
import { CARDS } from "../src/personal/genres";
import { DEFAULT_IDIOM, IDIOMS, LOW, idiomOf, phraseMotifs, walkMotif, type Idiom } from "../src/personal/idiom";

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};
const I = (o: Partial<Idiom>): Idiom => ({ ...DEFAULT_IDIOM, ...o });
const many = (idiom: Idiom, dir: 1 | -1, n = 600, hits = 8): number[][] => {
  const r = lcg(12345);
  return Array.from({ length: n }, () => walkMotif(idiom, hits, dir, r, idiom.start[0], 2));
};

describe("idiomOf", () => {
  it("gives every card an idiom with sane values", () => {
    for (const c of CARDS) {
      const i = idiomOf(c);
      expect(i.step).toBeGreaterThanOrEqual(0.3);
      expect(i.step).toBeLessThanOrEqual(0.9);
      expect(i.repeat).toBeGreaterThanOrEqual(0);
      expect(i.repeat).toBeLessThanOrEqual(0.4);
      expect(i.leaps.length).toBeGreaterThan(0);
      expect(i.span).toBeGreaterThanOrEqual(4);
      expect(i.span).toBeLessThanOrEqual(7);
      expect(i.arc).toBeGreaterThanOrEqual(1);
      expect(i.arc).toBeLessThanOrEqual(4);
      expect(i.start.every((s) => s >= LOW && s <= i.span)).toBe(true);
    }
  });
  it("names only cards that exist, and falls back to the default", () => {
    const ids = new Set(CARDS.map((c) => c.id));
    for (const id of Object.keys(IDIOMS)) expect(ids.has(id), id).toBe(true);
    expect(idiomOf({ id: "no-such-card" })).toEqual(DEFAULT_IDIOM);
  });
  it("makes makam cards descend and Hindustani ascend", () => {
    expect(idiomOf({ id: "anatolian" }).bias).toBe(-1);
    expect(idiomOf({ id: "hindustani" }).bias).toBe(1);
  });
});

describe("walkMotif", () => {
  it("is deterministic and ends on the cadence degree", () => {
    const a = walkMotif(I({}), 6, 1, lcg(7), 2, 4);
    const b = walkMotif(I({}), 6, 1, lcg(7), 2, 4);
    expect(a).toEqual(b);
    expect(a.length).toBe(6);
    expect(a[a.length - 1]).toBe(4);
    expect(a[0]).toBe(2);
  });
  it("stays inside [LOW, span]", () => {
    for (const dir of [1, -1] as const) for (const span of [4, 6, 7]) for (const m of many(I({ span, leaps: [2, 4] }), dir)) for (const d of m) {
      expect(d).toBeGreaterThanOrEqual(LOW);
      expect(d).toBeLessThanOrEqual(span);
    }
  });
  it("copes with one hit and with many", () => {
    expect(walkMotif(I({}), 1, 1, lcg(1), 3, 0)).toEqual([0]);
    expect(walkMotif(I({}), 12, -1, lcg(1), 3, 2).length).toBe(12);
  });
  it("follows the share of steps, repeats and leaps of the idiom", () => {
    const moves = (idiom: Idiom): number[] => many(idiom, 1).flatMap((m) => m.slice(0, -2).slice(1).map((d, k) => Math.abs(d - m[k])));
    const stepwise = moves(I({ step: 0.9, repeat: 0, leaps: [3], span: 7 }));
    const leaping = moves(I({ step: 0.3, repeat: 0, leaps: [3], span: 7 }));
    const share1 = (xs: number[]): number => xs.filter((x) => x === 1).length / xs.length;
    expect(share1(stepwise)).toBeGreaterThan(share1(leaping) + 0.4);
    const rep = moves(I({ step: 0.6, repeat: 0.3, span: 7 }));
    expect(rep.filter((x) => x === 0).length / rep.length).toBeGreaterThan(0.2);
    expect(rep.filter((x) => x === 0).length / rep.length).toBeLessThan(0.4);
  });
  it("walks the way the route and the tradition pull", () => {
    const slope = (idiom: Idiom, dir: 1 | -1): number => {
      const ms = many(idiom, dir);
      return ms.reduce((s, m) => s + (m[m.length - 3] - m[0]), 0) / ms.length;
    };
    const base = I({ span: 7, repeat: 0, step: 0.7 });
    expect(slope({ ...base, bias: -1 }, -1)).toBeLessThan(-0.5);
    expect(slope({ ...base, bias: 1 }, 1)).toBeGreaterThan(0.5);
    expect(slope({ ...base, bias: 0 }, 1)).toBeGreaterThan(slope({ ...base, bias: 0 }, -1) + 0.5);
  });
  it("lets the bias of the tradition win over an opposite heading", () => {
    const slope = (idiom: Idiom, dir: 1 | -1): number => {
      const ms = many(idiom, dir);
      return ms.reduce((s, m) => s + (m[m.length - 3] - m[0]), 0) / ms.length;
    };
    const base = I({ span: 7, repeat: 0, step: 0.7, start: [3] });
    expect(slope({ ...base, bias: -1 }, 1)).toBeLessThan(-0.5); // descends although it flies east
    expect(slope({ ...base, bias: -1 }, -1)).toBeLessThan(-0.5);
    expect(slope({ ...base, bias: 1 }, -1)).toBeGreaterThan(0.5); // ascends although it flies west
    expect(slope({ ...base, bias: 1 }, 1)).toBeGreaterThan(0.5);
  });
});

describe("phraseMotifs", () => {
  const phrases = (idiom: Idiom, dir: 1 | -1, hits: number, n = 500): number[][][] => {
    const r = lcg(2024);
    return Array.from({ length: n }, () => phraseMotifs(idiom, hits, dir, r, () => idiom.start[Math.floor(r() * idiom.start.length)]));
  };
  /** first degree of the phrase to the degree before the cadence of its last bar */
  const rise = (ps: number[][][]): number => ps.reduce((s, p) => s + (p[3][p[3].length - 2] - p[0][0]), 0) / ps.length;
  const card = (id: string): Idiom => idiomOf({ id });
  it("a descending idiom descends over a phrase at both headings, an ascending one rises, a neutral one follows the heading", () => {
    for (const hits of [4, 6]) for (const dir of [1, -1] as const) {
      expect(rise(phrases(card("anatolian"), dir, hits)), `anatolian ${dir} ${hits}`).toBeLessThan(0);
      expect(rise(phrases(card("arabic"), dir, hits)), `arabic ${dir} ${hits}`).toBeLessThan(0);
      expect(rise(phrases(card("hindustani"), dir, hits)), `hindustani ${dir} ${hits}`).toBeGreaterThan(0);
    }
    const neutral = I({ span: 7, start: [3] });
    expect(rise(phrases(neutral, 1, 6))).toBeGreaterThan(rise(phrases(neutral, -1, 6)) + 0.5);
  });
  it("the third bar is the first again, and each bar ends on its cadence degree", () => {
    for (const id of ["anatolian", "hindustani", "pop"]) {
      const idiom = card(id);
      for (const p of phrases(idiom, 1, 5, 100)) {
        expect(p.length).toBe(4);
        p.forEach((bar, k) => expect(bar[bar.length - 1]).toBe(idiom.cadence[k]));
        if (idiom.cadence[0] === idiom.cadence[2]) expect(p[2]).toEqual(p[0]);
      }
    }
    const own = I({ cadence: [2, 0, 4, 4] });
    for (const p of phrases(own, 1, 5, 50)) expect(p[2][p[2].length - 1]).toBe(4);
  });
  it("comes into the cadence with a small move", () => {
    for (const id of ["anatolian", "hindustani", "pop", "eastasia"]) for (const hits of [3, 4, 6]) {
      const bars = phrases(card(id), 1, hits).flat();
      const small = bars.filter((m) => Math.abs(m[m.length - 1] - m[m.length - 2]) <= 2).length / bars.length;
      expect(small, `${id} ${hits}`).toBeGreaterThanOrEqual(0.9);
    }
  });
  it("derives the cadence from the bias unless the table gives one", () => {
    expect(card("anatolian").cadence).toEqual([2, 0, 2, 0]);
    expect(card("hindustani").cadence).toEqual([2, 2, 4, 4]);
    expect(card("pop").cadence).toEqual([2, 0, 2, 4]);
  });
});
import { composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";

const SELECTIONS: [string, string | undefined][] = [
  ["NRT,LOS,GRU,LHR,DEL,CAI", "IST"], ["ESB,ADB,AYT", "IST"], ["IKA,NRT,JFK,LOS,SYD,GRU", "IST"], ["CAI,AMM,BEY", "DXB"],
  ["ICN,PEK,BKK", "NRT"], ["VIE,FCO,MXP,ZRH,BRU,WAW,PRG,BUD", "IST"], ["NRT,DPS,JFK,LOS,GRU,LHR,DEL,NBO,SYD,CAI", "IST"], ["MAD,LHR,CDG,FRA,AMS", undefined],
];
const routesOf = (s: string, home?: string) => buildRoutes(s.split(","), home);

describe("tunes are off by default", () => {
  it("no piece plays a tune unless it is asked to", () => {
    for (const [s, h] of SELECTIONS) for (const mode of ["visited", "wish"] as const) expect(composePiece(mode, routesOf(s, h)).style.tune, `${s} ${mode}`).toBeUndefined();
  });
  it("still plays one with { tunes: true } for some pieces (the tune code is kept)", () => {
    const withTune = SELECTIONS.flatMap(([s, h]) => (["visited", "wish"] as const).map((m) => composePiece(m, routesOf(s, h), { tunes: true }).style.tune)).filter(Boolean);
    expect(withTune.length).toBeGreaterThan(0);
  });
  it("is deterministic with and without the option", () => {
    const [s, h] = SELECTIONS[0];
    expect(JSON.stringify(composePiece("visited", routesOf(s, h)).notes)).toBe(JSON.stringify(composePiece("visited", routesOf(s, h)).notes));
    expect(JSON.stringify(composePiece("visited", routesOf(s, h), { tunes: true }).notes)).toBe(JSON.stringify(composePiece("visited", routesOf(s, h), { tunes: true }).notes));
  });
});

describe("the hook is an original melody of the idiom", () => {
  it("has no NaN or out-of-range notes over many selections, with and without tunes", () => {
    for (const [s, h] of SELECTIONS) for (const mode of ["visited", "wish"] as const) for (const tunes of [false, true]) {
      const p = composePiece(mode, routesOf(s, h), { tunes });
      for (const n of p.notes) expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite), `${s} ${mode}`).toBe(true);
    }
  });
});
// The direction of the hook by the idiom is pinned on `phraseMotifs` above (the production path of compose.ts), not on composed notes: the
// altitude arc and the chord-tone snapping blur a single bar there, but the real obstacles in the first version were the cadence forced
// onto fixed degrees and a heading that cancelled the bias.
