import { describe, expect, it } from "vitest";
import { allocateColour, cardsOfAirport, planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import { composePiece, limitsOf } from "../src/personal/compose";

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

/** every recording a card's world voices may resolve to (families expanded) */
const worldOf = (id: string): Set<string> => {
  const w = WORLD_VOICES[id];
  const out = new Set<string>();
  for (const v of w ? [...(w.held ?? []), ...(w.melody ?? []), ...(w.pluck ?? []), ...(w.bass ?? []), ...(w.perc ? [w.perc] : [])] : []) {
    for (const x of (WORLD_FAMILIES as Record<string, readonly string[]>)[v] ?? [v]) out.add(x);
  }
  return out;
};
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
    const routes = buildRoutes(["IKA", "NRT", "LAX", "SFO", "LOS"], "IST");
    const plan = planCards("visited", routes);
    const piece = composePiece("visited", routes);
    for (const n of piece.notes) {
      expect(n.instrument in WORLD_FAMILIES, n.instrument).toBe(false);
      expect(typeof n.instrument).toBe("string");
    }
    const on = (code: string): Set<string> => new Set(piece.notes.filter((n) => routes[n.route].to === code).map((n) => n.instrument));
    expect(plan.perRoute[routes.findIndex((r) => r.to === "IKA")].id).toBe("persian");
    expect(plan.perRoute[routes.findIndex((r) => r.to === "NRT")].id).toBe("eastasia");
    // a Persian recording on the route to Tehran, a Japanese / East Asian one on the route to Tokyo
    expect([...on("IKA")].some((x) => worldOf("persian").has(x)), [...on("IKA")].join("/")).toBe(true);
    expect([...on("NRT")].some((x) => worldOf("eastasia").has(x)), [...on("NRT")].join("/")).toBe(true);
  });
  it("most coloured routes sound a recording of their own card's world voices (where the card has some)", () => {
    const pool = ["JFK", "NRT", "DPS", "LOS", "GRU", "LHR", "DEL", "NBO", "SYD", "CAI", "IKA", "DXB", "BKK", "MEX", "EZE", "DUB", "MAD", "CDG", "SVO", "TAS", "ICN", "HAV", "ACC", "JNB", "ATH", "BEY", "LIS", "VIE", "FCO", "YYZ"];
    let coloured = 0;
    let world = 0;
    for (let s = 0; s < 60; s++) {
      const home = ["IST", "LHR", "JFK", "DXB"][s % 4];
      const places = pool.filter((x) => x !== home).filter((_, k) => (k * 7 + s * 3) % 5 === 0).slice(0, 3 + (s % 4) * 3);
      const routes = buildRoutes(places, home);
      const plan = planCards(s % 2 ? "wish" : "visited", routes);
      const piece = composePiece(s % 2 ? "wish" : "visited", routes);
      plan.perRoute.forEach((c, i) => {
        const w = worldOf(c.id);
        if (c === plan.main || w.size === 0) return;
        coloured++;
        if (piece.notes.some((n) => n.route === i && w.has(n.instrument))) world++;
      });
    }
    expect(coloured).toBeGreaterThan(100);
    // 0.29 before the coloured routes took their card's world voices first; the rest are mostly bass and drum routes
    // whose card has no world bass or drum
    expect(world / coloured).toBeGreaterThan(0.5);
  });
  it("puts the steady piano of a piece with more than three routes on a route of the main card when one can take it", () => {
    const pool = ["JFK", "NRT", "DPS", "LOS", "GRU", "LHR", "DEL", "NBO", "SYD", "CAI", "IKA", "DXB", "BKK", "MEX", "EZE", "DUB", "MAD", "CDG", "SVO", "ICN"];
    const SMALL: Record<number, string[]> = { 4: ["pad", "bass", "hook", "pluck"], 5: ["pad", "bass", "hook", "pluck", "kick"], 6: ["pad", "bass", "hook", "pluck", "kick", "backbeat"] };
    const BASE = ["pad", "bass", "hook", "pluck", "kick", "backbeat", "hat"];
    let checked = 0;
    for (let s = 0; s < 40; s++) {
      const home = ["IST", "LHR", "JFK", "DXB"][s % 4];
      const places = pool.filter((x) => x !== home).filter((_, k) => (k * 3 + s) % 4 === 0).slice(0, 4 + (s % 5));
      const routes = buildRoutes(places, home);
      const n = routes.length;
      if (n <= 3) continue;
      const plan = planCards("visited", routes);
      const piece = composePiece("visited", routes);
      const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i);
      const role: string[] = [];
      order.forEach((x, k) => (role[x.i] = n <= 6 ? SMALL[n][k] : BASE[Math.floor((k * 7) / n)]));
      const mainMelodic = routes.some((_, i) => plan.perRoute[i] === plan.main && (role[i] === "hook" || role[i] === "pluck"));
      if (!mainMelodic) continue;
      checked++;
      expect(piece.notes.some((x) => x.instrument === "PNO" && plan.perRoute[x.route] === plan.main), places.join(",")).toBe(true);
    }
    expect(checked).toBeGreaterThan(5);
  });
  it("keeps the darbuka family off the hat: the hat routes of a big piece never play DARBUKA_VCSL", () => {
    const places = ["LHR", "CDG", "FRA", "AMS", "MAD", "FCO", "VIE", "ATH", "JFK", "NRT", "SYD", "DXB", "IKA", "DOH", "CAI", "AMM", "BEY", "KWI", "RUH", "TBS", "BAK"];
    let checked = 0;
    for (const home of ["IKA", "CAI", "IST"]) {
      const routes = buildRoutes(places, home);
      const n = routes.length;
      const plan = planCards("visited", routes);
      const piece = composePiece("visited", routes);
      // from 7 routes up the roles follow the distance, longest first, and BASE[floor(k*7/n)] is the role: index 6 is the hat
      const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i);
      order.forEach((x, k) => {
        if (Math.floor((k * 7) / n) !== 6 || !["arabic", "persian"].includes(plan.perRoute[x.i].id)) return;
        const used = new Set(piece.notes.filter((q) => q.route === x.i).map((q) => q.instrument));
        expect(used.size).toBeGreaterThan(0);
        expect(used.has("DARBUKA_VCSL"), `${home} route ${x.i}`).toBe(false);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("range", () => {
  it("keeps every note of a lifted piece inside the range of its instrument", () => {
    const trips: [Parameters<typeof composePiece>[0], string[]][] = [
      ["visited", ["JFK", "NRT", "LHR", "DEL"]],
      ["wish", ["JFK", "NRT", "DPS", "LOS", "GRU", "LHR", "DEL", "NBO", "SYD", "CAI"]],
      ["visited", ["MZH", "OHD", "BJV", "MRU"]],
      ["wish", ["CPT", "AER", "SGC", "HND", "BOG"]],
    ];
    for (const [mode, places] of trips) {
      const p = composePiece(mode, buildRoutes(places, "IST"));
      expect(p.style.lift).toBeGreaterThan(0);
      const out = p.notes.filter((n) => {
        const { cap, floor } = limitsOf(n.instrument);
        return (cap !== undefined && n.freq > cap * 1.0001) || (floor !== undefined && n.freq < floor * 0.9999);
      });
      expect(out.map((n) => `${n.instrument} ${n.freq.toFixed(1)}`)).toEqual([]);
    }
  });
});
