import { describe, expect, it } from "vitest";
import { allocateColour, cardsOfAirport, planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import { composePiece } from "../src/personal/compose";

const keys = (n: number): string[] => Array.from({ length: n }, (_, i) => `R${i}`);
const all = (n: number): boolean[] => Array(n).fill(true);

describe("allocateColour", () => {
  it("gives nothing when there is no candidate or no budget", () => {
    expect(allocateColour(["a", "a"], [false, false], [1, 2], keys(2), 2)).toEqual([]);
    expect(allocateColour(["a", "a"], all(2), [1, 2], keys(2), 0)).toEqual([]);
  });
  it("takes the longest routes of the only colour first", () => {
    const got = allocateColour(["a", "a", "a", "a", "a"], all(5), [10, 50, 30, 40, 20], keys(5), 3);
    expect(got).toEqual([1, 2, 3]);
  });
  it("shares the budget in proportion to the routes going to each colour", () => {
    // six routes to colour a, two to b: a budget of 4 is 3 + 1
    const ids = ["a", "a", "a", "a", "a", "a", "b", "b"];
    const got = allocateColour(ids, all(8), [9, 8, 7, 6, 5, 4, 3, 2], keys(8), 4);
    expect(got.filter((i) => ids[i] === "a").length).toBe(3);
    expect(got.filter((i) => ids[i] === "b").length).toBe(1);
  });
  it("gives every colour present at least one route, even beyond the budget", () => {
    const got = allocateColour(["a", "b", "c"], all(3), [1, 2, 3], keys(3), 2);
    expect(got).toEqual([0, 1, 2]);
  });
  it("never takes an ineligible route and never more than there are candidates", () => {
    const got = allocateColour(["a", "a", "a"], [true, false, true], [1, 2, 3], keys(3), 5);
    expect(got).toEqual([0, 2]);
  });
  it("is deterministic", () => {
    const a = allocateColour(["a", "b", "a", "b", "a"], all(5), [5, 5, 5, 5, 5], keys(5), 3);
    const b = allocateColour(["a", "b", "a", "b", "a"], all(5), [5, 5, 5, 5, 5], keys(5), 3);
    expect(a).toEqual(b);
  });
});

describe("planCards", () => {
  const places = ["JFK", "NRT", "DPS", "LOS", "GRU", "LHR", "DEL", "NBO", "SYD", "CAI"];
  it("colours about 60% of the routes, each from the cards of its own destination", () => {
    const routes = buildRoutes(places, "IST");
    const plan = planCards("visited", routes);
    expect(plan.perRoute.length).toBe(routes.length);
    const coloured = plan.perRoute.map((c, i) => ({ c, i })).filter((x) => x.c !== plan.main);
    expect(coloured.length).toBeGreaterThanOrEqual(1);
    expect(coloured.length).toBeLessThanOrEqual(Math.max(Math.round(0.6 * routes.length), 1 + new Set(coloured.map((x) => x.c.id)).size));
    for (const { c, i } of coloured) {
      const r = routes[i];
      const far = r.to === "IST" ? r.from : r.to;
      expect(cardsOfAirport(far, r.region).map((x) => x.id)).toContain(c.id);
    }
  });
  it("stays the same for the same selection", () => {
    const routes = buildRoutes(places, "IST");
    expect(planCards("wish", routes).perRoute.map((c) => c.id)).toEqual(planCards("wish", routes).perRoute.map((c) => c.id));
  });
  it("keeps a two-route piece on the main card unless a destination colour exists", () => {
    const routes = buildRoutes(["NRT", "DPS"], "IST");
    const plan = planCards("visited", routes);
    expect(plan.perRoute.some((c) => c !== plan.main)).toBe(true);
  });
  it("composes a piece with these cards", () => {
    const routes = buildRoutes(places, "IST");
    const a = composePiece("visited", routes);
    const b = composePiece("visited", routes);
    expect(a.notes.length).toBeGreaterThan(100);
    expect(JSON.stringify(a.notes)).toBe(JSON.stringify(b.notes));
  });
});

import { WORLD_FAMILIES, WORLD_INSTRUMENTS } from "../src/audio/world-pack";
import { CARDS } from "../src/personal/genres";
import { WORLD_VOICES, resolveVoice } from "../src/personal/world-voices";

const isWorld = (v: string): boolean => v in WORLD_FAMILIES || (WORLD_INSTRUMENTS as readonly string[]).includes(v);

describe("world voices", () => {
  it("turns a family into one of its instruments, by hash, and leaves other names alone", () => {
    expect(resolveVoice("PNO", 7)).toBe("PNO");
    expect(resolveVoice("SANTUR", 7)).toBe("SANTUR");
    const list = WORLD_FAMILIES.GUITAR_EL;
    expect(list).toContain(resolveVoice("GUITAR_EL", 5));
    expect(resolveVoice("GUITAR_EL", 5)).toBe(list[5 % list.length]);
  });
  it("only names cards and instruments that exist", () => {
    const ids = new Set(CARDS.map((c) => c.id));
    for (const [id, v] of Object.entries(WORLD_VOICES)) {
      expect(ids.has(id), id).toBe(true);
      for (const list of [v.held, v.melody, v.pluck, v.bass, v.perc ? [v.perc] : []]) for (const x of list ?? []) expect(isWorld(x), `${id}: ${x}`).toBe(true);
    }
  });
  it("puts the overlay voices into the cards", () => {
    const persian = CARDS.find((c) => c.id === "persian")!;
    expect(persian.pluck).toContain("SANTUR");
    expect(persian.perc).toBe("DARBUKA_VCSL");
    expect(CARDS.find((c) => c.id === "jazz")!.bass).toContain("UPRIGHTBASS");
  });
  it("lets a piece to Iran and Japan use their instruments, and only real instrument names reach the notes", () => {
    const routes = buildRoutes(["IKA", "NRT", "JFK", "LOS"], "IST");
    const piece = composePiece("visited", routes);
    for (const n of piece.notes) {
      expect(n.instrument in WORLD_FAMILIES, n.instrument).toBe(false);
      expect(typeof n.instrument).toBe("string");
    }
  });
});
