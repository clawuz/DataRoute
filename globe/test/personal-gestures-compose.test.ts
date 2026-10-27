import { describe, expect, it } from "vitest";
import { composePiece, limitsOf, type PersonalNote } from "../src/personal/compose";
import { drawLength } from "../src/personal/flight";
import { planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import destinations from "../src/personal/destinations.json";

// a seeded generator so the audit is the same every run
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const codes = (destinations as { i: string }[]).map((d) => d.i);
const rnd = lcg(20261027);
const picks: { places: string[]; home?: string; mode: "visited" | "wish" }[] = [];
for (let k = 0; k < 300; k++) {
  const n = 3 + Math.floor(rnd() * 6);
  const places = new Set<string>();
  while (places.size < n) places.add(codes[Math.floor(rnd() * codes.length)]);
  picks.push({ places: [...places], home: k % 2 ? "IST" : undefined, mode: k % 3 === 0 ? "wish" : "visited" });
}
const pieces = picks
  .map((p) => ({ p, routes: buildRoutes(p.places, p.home) }))
  .filter((x) => x.routes.length > 0)
  .map((x) => ({ ...x, piece: composePiece(x.p.mode, x.routes) }));

describe("composed pieces with gestures (300 selections)", { timeout: 60000 }, () => {
  it("compose a good number of pieces", () => {
    expect(pieces.length).toBeGreaterThan(250);
  });
  it("no NaN, no negative time, every pitch inside its instrument's limits, at most 6000 notes", () => {
    for (const { p, piece } of pieces) {
      expect(piece.notes.length, JSON.stringify(p)).toBeLessThanOrEqual(6000);
      for (const n of piece.notes) {
        expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite), JSON.stringify(p)).toBe(true);
        expect(n.t).toBeGreaterThanOrEqual(0);
        expect(n.d).toBeGreaterThan(0);
        const { cap, floor } = limitsOf(n.instrument);
        if (cap) expect(n.freq, `${String(n.instrument)} ${JSON.stringify(p)}`).toBeLessThanOrEqual(cap * (1 + 1e-9));
        if (floor) expect(n.freq, `${String(n.instrument)} ${JSON.stringify(p)}`).toBeGreaterThanOrEqual(floor * (1 - 1e-9));
      }
    }
  });
  it("hidden notes never change what the box draws: each drawn note is drawn until the next drawn note of its route", () => {
    for (const { p, piece } of pieces) {
      const drawn = piece.notes.filter((n) => n.show !== false);
      for (const route of new Set(drawn.map((n) => n.route))) {
        const list = drawn.filter((n) => n.route === route).sort((a, b) => a.t - b.t);
        // (a route whose role is the drone is drawn in full, as before: every one of its notes then has drawDur = d)
        const heldRoute = list.every((x) => x.drawDur === x.d);
        list.forEach((x, k) => {
          const next = list.slice(k + 1).find((y) => y.t > x.t + 1e-6);
          if (!heldRoute) expect(x.drawDur, JSON.stringify(p)).toBeCloseTo(drawLength(x.d, next ? next.t - x.t : null), 9);
          expect(x.drawDur!).toBeLessThanOrEqual(x.d + 1e-9);
        });
      }
    }
  });
  it("no note sounds after the piece's end", () => {
    for (const { piece } of pieces) for (const n of piece.notes) expect(n.t).toBeLessThan(piece.duration);
  });
  it("is deterministic", () => {
    for (const { p, routes, piece } of pieces.slice(0, 40)) expect(composePiece(p.mode, routes).notes).toEqual(piece.notes);
  });
});

describe("the gestures are heard in composed pieces", () => {
  it("a kemençe voice gets a hidden double stop a fourth below its drawn hook notes", () => {
    const routes = buildRoutes(["TZX", "RZV", "OGU"], "IST");
    const piece = composePiece("visited", routes);
    const kem = piece.notes.filter((n) => n.instrument === "KEMENCE_MAKAM");
    expect(kem.some((n) => n.show === false)).toBe(true);
    const drawn = kem.filter((n) => n.show !== false);
    const pairs = kem.filter((h) => h.show === false && drawn.some((d) => d.route === h.route && Math.abs(d.t - h.t) < 1e-6 && Math.abs(12 * Math.log2(d.freq / h.freq) - 5) < 1e-6));
    expect(pairs.length).toBeGreaterThan(0);
  });
  it("a jazz piece with an upright bass walks four notes a bar", () => {
    let found = false;
    // find a jazz upright-bass voice by probing selections
    const lcg2 = lcg(77);
    for (let k = 0; k < 600 && !found; k++) {
      const n = 3 + Math.floor(lcg2() * 5);
      const places = new Set<string>();
      while (places.size < n) places.add(codes[Math.floor(lcg2() * codes.length)]);
      const routes = buildRoutes([...places], "IST");
      if (routes.length === 0) continue;
      const plan = planCards("visited", routes);
      const piece = composePiece("visited", routes);
      const bar = 240 / piece.bpm;
      for (let i = 0; i < routes.length && !found; i++) {
        if (plan.perRoute[i].id !== "jazz") continue;
        const bass = piece.notes.filter((x: PersonalNote) => x.route === i && x.instrument === "UPRIGHTBASS");
        if (bass.length === 0) continue;
        const sec = piece.sections.find((s) => s.name === "chorus")!;
        const b = Math.round(sec.start / bar) + 1;
        const inBar = bass.filter((x) => x.t >= b * bar - 0.05 && x.t < (b + 1) * bar - 0.05);
        if (inBar.length === 0) continue;
        expect(inBar.length).toBe(4);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});
