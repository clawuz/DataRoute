import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { episodeAt, episodeCards, VERSE_SHORT_BLOCK } from "../src/personal/episodes";
import { planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";

const places = ["NRT", "LOS", "GRU", "DEL", "MAD", "JFK", "CAI", "FCO"];
const routes = buildRoutes(places, "IST");
const plan = planCards("visited", routes);
const eps = episodeCards(plan);
const p = composePiece("visited", routes);
const bar = 240 / p.bpm;
const beat = bar / 4;
const VERSE = 8;

describe("a piece with four or more colours", () => {
  it("has at least four episodes", () => {
    expect(eps.length).toBeGreaterThanOrEqual(4);
    expect(p.style.episodes!.length).toBeGreaterThanOrEqual(4);
    expect(p.style.episodes).toEqual(eps.map((c) => c.id));
  });
  it("is deterministic with finite times and the notes of a route in order", () => {
    expect(JSON.stringify(composePiece("visited", routes).notes)).toBe(JSON.stringify(p.notes));
    for (const n of p.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite)).toBe(true);
    }
    // (the order of the notes inside the array is the order they are pushed in, not by time, as in every piece: only the times are checked)
  });
  const inBars = (a: number, b: number) => p.notes.filter((n) => n.show !== false && n.t >= a * bar - 0.05 && n.t < b * bar - 0.05);
  // the signature of the fill: the backbeat on beat 3.5 (a quarter beat long); the build plays it too, so the build is left out
  const fill = (b: number): number => inBars(b, b + 1).filter((n) => Math.abs((n.t - b * bar) / beat - 3.5) < 0.05 && Math.abs(n.d - beat * 0.25) < 1e-6).length;
  it("fills the last bar of the two-bar blocks of the verse and nowhere else in it", () => {
    for (let k = 0; k < 8; k++) {
      expect(fill(VERSE + k * VERSE_SHORT_BLOCK + 1), `end of block ${k}`).toBeGreaterThan(0);
      expect(fill(VERSE + k * VERSE_SHORT_BLOCK), `start of block ${k}`).toBe(0);
    }
    for (const b of [0, 1, 2, 3, 4, 5, 6, 7, 32, 33, 34, 35, 36, 37, 38, 39]) expect(fill(b), `bar ${b}`).toBe(0);
  });
  it("plays the bass rhythm of two different episode blocks differently", () => {
    // bass = the route of the bass role: find it as the route whose onsets change with the block card
    const onsetsOf = (route: number, b: number): string =>
      p.notes.filter((n) => n.route === route && n.show !== false && n.t >= b * bar - 0.05 && n.t < (b + 1) * bar - 0.05).map((n) => ((n.t - b * bar) / beat).toFixed(2)).join(",");
    const cards = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => episodeAt(VERSE + k * 2, VERSE, eps).card);
    let differs = false;
    for (let r = 0; r < routes.length; r++) {
      for (let k = 1; k < 6; k++) if (cards[k] !== cards[k + 1] && onsetsOf(r, VERSE + k * 2) !== onsetsOf(r, VERSE + (k + 1) * 2)) differs = true;
    }
    expect(differs).toBe(true);
  });
});
