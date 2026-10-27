import { describe, expect, it } from "vitest";
import { CARDS, cellOf, cellSeedOf, planCards, type GenreCard } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import { composePiece } from "../src/personal/compose";
import { episodeCards } from "../src/personal/episodes";

const card = (id: string): GenreCard => CARDS.find((c) => c.id === id)!;
const WITH_CELLS = ["karadeniz", "dogu", "zeybek"];

describe("metre variants (cells) of a card", () => {
  it("the horon, the halay and the zeybek list the figures of the research", () => {
    expect(card("karadeniz").cells!.map((x) => x.cell)).toEqual([[2, 2, 3], [2, 2, 2, 3], [1, 1, 1, 1], [3, 2, 2]]);
    expect(card("dogu").cells!.map((x) => x.cell)).toEqual([[1, 1, 1, 1], [1, 1], [2, 2, 2, 3], [2, 2, 1]]);
    expect(card("zeybek").cells!.map((x) => x.cell)).toEqual([[3, 2, 2, 2], [2, 2, 2, 3], [2, 2, 3, 2]]);
  });
  it("every entry hits, has a matching accent length and keeps the card's own figure among the choices", () => {
    for (const c of CARDS.filter((x) => x.cells)) {
      expect(c.cells!.length).toBeGreaterThanOrEqual(2);
      expect(c.cells!.some((x) => x.cell.join() === c.cell.join()), c.id).toBe(true);
      for (const e of c.cells!) {
        expect(e.cell.some((u) => u > 0), c.id).toBe(true);
        expect(e.cell.reduce((a, u) => a + Math.abs(u), 0)).toBeGreaterThanOrEqual(2);
        if (e.accent) expect(e.accent.length, `${c.id} ${e.cell}`).toBe(e.cell.length);
      }
    }
    expect(CARDS.filter((x) => x.cells).map((x) => x.id).sort()).toEqual([...WITH_CELLS].sort());
  });
  it("cellOf is deterministic, stays in the list and reaches every entry", () => {
    for (const id of WITH_CELLS) {
      const c = card(id);
      const seen = new Set<string>();
      for (let s = 0; s < 400; s++) {
        const a = cellOf(c, s * 7919);
        expect(cellOf(c, s * 7919)).toEqual(a);
        expect(c.cells!.map((x) => x.cell.join())).toContain(a.cell.join());
        seen.add(a.cell.join());
      }
      expect(seen.size, id).toBe(c.cells!.length);
    }
  });
  it("a card without cells keeps its figure and accents whatever the seed", () => {
    for (const c of CARDS.filter((x) => !x.cells)) for (const s of [0, 1, 12345, 4294967295]) expect(cellOf(c, s)).toEqual({ cell: c.cell, accent: c.accent });
  });
  it("the seed is the hash of the main card and the first route", () => {
    const rs = buildRoutes(["TZX", "RZV", "OGU"], "IST");
    const main = planCards("visited", rs).main;
    expect(cellSeedOf(main, rs)).toBe(cellSeedOf(main, buildRoutes(["TZX", "RZV", "OGU"], "IST")));
    expect(cellSeedOf(main, rs)).not.toBe(cellSeedOf(main, buildRoutes(["RZV", "TZX", "OGU"], "IST")));
  });
});

/** the strong places (beats) of a figure as composePiece builds them: the first hit and the ones with accent >= 1.1, at most four */
const strongOf = (cell: number[], accent?: number[]): number[] => {
  const total = cell.reduce((x, y) => x + Math.abs(y), 0);
  let at = 0;
  const hits: { s: number; a: number }[] = [];
  cell.forEach((u, k) => {
    if (u > 0) hits.push({ s: (at / total) * 4, a: accent?.[k] || 1 });
    at += Math.abs(u);
  });
  return hits.filter((h, k) => k === 0 || h.a >= 1.1).slice(0, 4).map((h) => h.s);
};

describe("a piece plays the figure its card chose", () => {
  // Black Sea and East Anatolian selections (no colour: the verse is the main card's), home Istanbul
  const SELS = [
    ["TZX", "RZV", "OGU"], ["RZV", "TZX", "OGU"], ["OGU", "SZF", "TZX"], ["SZF", "NOP", "RZV"], ["TZX", "ONQ", "KFS"], ["MZH", "TZX", "RZV"],
    ["VAN", "ERZ", "ERC"], ["ERZ", "VAN", "KSY"], ["DIY", "VAN", "MLX"], ["GZT", "ERZ", "VAN"], ["MLX", "ERC", "BAL"],
  ];
  it("the bass of the verse plays the strong places of the chosen figure, and the selections use more than one figure", () => {
    const used = new Map<string, Set<string>>();
    for (const sel of SELS) {
      const rs = buildRoutes(sel, "IST");
      const pl = planCards("visited", rs);
      if (!pl.main.cells || episodeCards(pl).length) continue;
      const ch = cellOf(pl.main, cellSeedOf(pl.main, rs));
      used.set(pl.main.id, (used.get(pl.main.id) ?? new Set()).add(ch.cell.join()));
      const p = composePiece("visited", rs);
      const n = rs.length;
      const order = rs.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i);
      const bassRoute = order[n === 2 ? 0 : n <= 3 ? 0 : 1].i;
      const bar = 240 / p.bpm;
      const beat = bar / 4;
      const want = strongOf(ch.cell, ch.accent);
      for (const b of [8, 9, 10, 11]) {
        const got = p.notes.filter((x) => x.route === bassRoute && x.show !== false && x.t >= b * bar - 0.05 && x.t < (b + 1) * bar - 0.05).map((x) => (x.t - b * bar) / beat).sort((x, y) => x - y);
        expect(got.length, `${sel} bar ${b}`).toBe(want.length);
        got.forEach((x, k) => expect(Math.abs(x - want[k]), `${sel} bar ${b}`).toBeLessThan(0.15));
      }
    }
    expect([...used.values()].some((s) => s.size >= 2)).toBe(true);
  });
});
