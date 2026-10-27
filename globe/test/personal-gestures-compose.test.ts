import { describe, expect, it } from "vitest";
import { composePiece, limitsOf, type PersonalNote } from "../src/personal/compose";
import { drawLength } from "../src/personal/flight";
import { planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import { gesturesOf } from "../src/personal/gestures";
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

describe("coverage: the gestures reach the instruments that are really played", () => {
  // eight selections from different musical regions (home Istanbul, visited); measured 2026-10-27 (docs/music-instrument-idioms.md):
  // six reach 10% hidden notes (13% to 50%); Brazil (a horn alone) and Nigeria (kalimba, tenor sax, bassoon) do not, because
  // their instruments have no gesture that adds notes
  const SELECTIONS: Record<string, string[]> = {
    Karadeniz: ["TZX", "RZV", "OGU"],
    Hindistan: ["DEL", "BOM", "BLR"],
    Brezilya: ["GRU", "GIG", "BSB"],
    Magrip: ["CMN", "ALG", "TUN"],
    Japonya: ["NRT", "KIX", "FUK"],
    Italya: ["FCO", "MXP", "VCE"],
    ABD: ["JFK", "LAX", "ORD"],
    Nijerya: ["LOS", "ABV", "PHC"],
  };
  const share = (places: string[]): number => {
    const notes = composePiece("visited", buildRoutes(places, "IST")).notes;
    return notes.filter((n) => n.show === false).length / notes.length;
  };
  it("at least 6 of the 8 selections have 10% or more hidden (gesture) notes", () => {
    const shares = Object.entries(SELECTIONS).map(([name, places]) => [name, share(places)] as const);
    expect(shares.filter(([, s]) => s >= 0.1).length, JSON.stringify(shares)).toBeGreaterThanOrEqual(6);
  });
});

describe("review fixes (composed pieces)", () => {
  const semi = (a: number, b: number): number => Math.abs(12 * Math.log2(a / b));
  it("M1: no hidden note repeats the pitch of a drawn note of its route and instrument within 50 ms", () => {
    for (const { p, piece } of pieces.slice(0, 120)) {
      const drawn = piece.notes.filter((n) => n.show !== false);
      const bar = 240 / piece.bpm;
      // (the home drone, a bar long, is not a gesture note: it may share the pitch of the voice that plays it)
      for (const h of piece.notes.filter((n) => n.show === false && n.d < 0.9 * bar)) {
        const dup = drawn.find((d) => d.route === h.route && d.instrument === h.instrument && Math.abs(d.t - h.t) < 0.05 && semi(d.freq, h.freq) < 0.5);
        expect(dup, `${String(h.instrument)} t=${h.t} ${JSON.stringify(p)}`).toBeUndefined();
      }
    }
  });
  it("M2: no tremolo hit (a hidden note of the pitch of its source) starts after the next drawn note of its route and instrument", () => {
    for (const { p, piece } of pieces.slice(0, 120)) {
      const drawn = piece.notes.filter((n) => n.show !== false);
      for (const h of piece.notes.filter((n) => n.show === false && n.d <= 0.0751)) {
        const src = drawn
          .filter((d) => {
            const k = (h.t - d.t) / 0.075;
            return d.route === h.route && d.instrument === h.instrument && k > 0.99 && k < 14 && Math.abs(k - Math.round(k)) < 1e-6 && Math.abs(d.freq - h.freq) < 1e-6 * h.freq;
          })
          .pop();
        if (!src) continue;
        const next = drawn.filter((d) => d.route === h.route && d.instrument === h.instrument && d.t > src.t + 1e-6).sort((a, b) => a.t - b.t)[0];
        if (next) expect(h.t, `${String(h.instrument)} ${JSON.stringify(p)}`).toBeLessThan(next.t);
      }
    }
  });
  it("M3: the most hidden notes of a piece over 50 selections stays below the measured bound", () => {
    const most = Math.max(...pieces.slice(0, 50).map(({ piece }) => piece.notes.filter((n) => n.show === false).length));
    expect(most).toBeLessThan(MAX_HIDDEN);
  });
  it("L5: every numbered family a composed piece plays that has a gesture family by prefix has its gestures", () => {
    const names = new Set<string>();
    for (const { piece } of pieces.slice(0, 100)) for (const n of piece.notes) names.add(String(n.instrument));
    const fams = ["NS_EKEYS_", "NS_KEYS_AC_", "NS_GUITAR_AC_", "NS_GUITAR_EL_"];
    const seen = [...names].filter((n) => fams.some((f) => n.startsWith(f)));
    expect(seen.length).toBeGreaterThan(0);
    for (const n of seen) expect(gesturesOf(n), n).toBeDefined();
  });
});
// measured 2026-10-27 after the review fixes: 1303 (1530 before); 20% headroom
const MAX_HIDDEN = 1570;
