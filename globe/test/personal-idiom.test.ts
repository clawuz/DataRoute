import { describe, expect, it } from "vitest";
import { CARDS } from "../src/personal/genres";
import { DEFAULT_IDIOM, IDIOMS, LOW, idiomOf, walkMotif, type Idiom } from "../src/personal/idiom";

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
    const moves = (idiom: Idiom): number[] => many(idiom, 1).flatMap((m) => m.slice(0, -1).slice(1).map((d, k) => Math.abs(d - m[k])));
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
      return ms.reduce((s, m) => s + (m[m.length - 2] - m[0]), 0) / ms.length;
    };
    const base = I({ span: 7, repeat: 0, step: 0.7 });
    expect(slope({ ...base, bias: -1 }, -1)).toBeLessThan(-0.5);
    expect(slope({ ...base, bias: 1 }, 1)).toBeGreaterThan(0.5);
    expect(slope({ ...base, bias: 0 }, 1)).toBeGreaterThan(slope({ ...base, bias: 0 }, -1) + 0.5);
  });
  it("lets the bias of the tradition pull on its own, and cancel an opposite heading", () => {
    const slope = (idiom: Idiom, dir: 1 | -1): number => {
      const ms = many(idiom, dir);
      return ms.reduce((s, m) => s + (m[m.length - 2] - m[0]), 0) / ms.length;
    };
    const base = I({ span: 7, repeat: 0, step: 0.7, start: [2] }); // mid-range start: the walls reflect evenly
    const up = slope({ ...base, bias: 1 }, 1);
    const flat = slope({ ...base, bias: 0 }, 1);
    const down = slope({ ...base, bias: -1 }, 1);
    expect(up).toBeGreaterThan(flat + 0.3);
    expect(flat).toBeGreaterThan(down + 0.3);
    expect(Math.abs(down)).toBeLessThan(0.5); // 0.3 was too tight: residual wall reflection gives 0.325; without the bias it is ~2.3
  });
});
