import { describe, expect, it } from "vitest";
import { CARDS, planCards, type CardPlan, type GenreCard } from "../src/personal/genres";
import { EPISODE_CAP, episodeAt, episodeCards } from "../src/personal/episodes";
import { buildRoutes } from "../src/personal/routes";
import { composePiece } from "../src/personal/compose";
import { routeHash } from "../src/audio/theory";

const card = (id: string): GenreCard => CARDS.find((c) => c.id === id)!;
const plan = (main: string, per: string[]): CardPlan => ({ main: card(main), perRoute: per.map(card) });

describe("episodeCards", () => {
  it("is empty when no route is coloured", () => {
    expect(episodeCards(plan("anatolian", ["anatolian", "anatolian"]))).toEqual([]);
  });
  it("orders the colours by their number of routes, most first, and counts only coloured routes", () => {
    const got = episodeCards(plan("anatolian", ["eastasia", "westafrica", "eastasia", "anatolian", "eastasia", "westafrica"]));
    expect(got.map((c) => c.id)).toEqual(["eastasia", "westafrica"]);
  });
  it("keeps at most three colours and breaks ties by the hash of the card id the same way every time", () => {
    const per = ["eastasia", "westafrica", "persian", "tango", "salsa"];
    const a = episodeCards(plan("anatolian", per)).map((c) => c.id);
    expect(a.length).toBe(EPISODE_CAP);
    expect(episodeCards(plan("anatolian", [...per].reverse())).map((c) => c.id)).toEqual(a);
  });
});

describe("episodeAt", () => {
  const E = [card("eastasia"), card("westafrica"), card("persian")];
  const ids = (n: number): (string | null)[] => {
    const cards = E.slice(0, n);
    return [8, 12, 16, 20].map((b) => episodeAt(b, 8, cards).card?.id ?? null);
  };
  it("plays the verse as A A A A, A B A B, A B A C or A B C D", () => {
    expect(ids(0)).toEqual([null, null, null, null]);
    expect(ids(1)).toEqual([null, "eastasia", null, "eastasia"]);
    expect(ids(2)).toEqual([null, "eastasia", null, "westafrica"]);
    expect(ids(3)).toEqual([null, "eastasia", "westafrica", "persian"]);
  });
  it("holds a card for the four bars of its block and marks the last bar", () => {
    const at = (b: number) => episodeAt(b, 8, E);
    expect([12, 13, 14, 15].map((b) => at(b).card?.id)).toEqual(["eastasia", "eastasia", "eastasia", "eastasia"]);
    expect([8, 9, 10, 11, 12, 15, 19, 20, 23].map((b) => at(b).blockEnd)).toEqual([false, false, false, true, false, true, true, false, true]);
    expect([8, 11, 12, 23].map((b) => at(b).block)).toEqual([0, 0, 1, 3]);
  });
  it("is home with no block outside the verse", () => {
    for (const b of [0, 7, 24, 40, 63]) expect(episodeAt(b, 8, E)).toEqual({ card: null, blockEnd: false, block: -1 });
  });
  it("works on a real plan", () => {
    const p = planCards("visited", buildRoutes(["NRT", "LOS", "GRU", "LHR"], "IST"));
    for (const c of episodeCards(p)) expect(c).not.toBe(p.main);
  });
});

// GOLDEN: hashes captured with the code BEFORE the episodes (Step 0); fill in the numbers the throwaway script printed
const GOLDEN_NO_COLOUR: [string, "visited" | "wish", number][] = [
  // [places joined by ",", mode, hash of JSON.stringify(notes)]; none of these has a coloured route (episodeCards = [])
  ["ESB,TZX,ADB", "visited", 32489119],
  ["ESB,SAW,GZT", "wish", 1056091515],
  ["ADB,VAN,AYT", "wish", 891239137],
  ["SAW,ESB,TZX", "visited", 3110968725],
  ["ESB", "visited", 2318824395],
  ["LHR", "wish", 3509170890],
  ["SAW,DLM,VAN", "wish", 1106856034],
];
const GOLDEN_OUTSIDE_VERSE: [string, "visited" | "wish", number][] = [
  // [places joined by ",", mode, hash of JSON.stringify(notes outside bars 8-23)]; each has 3 episode cards
  ["NRT,LOS,GRU,LHR,DEL,CAI", "visited", 1449848370],
  ["NRT,LOS,GRU,LHR,DEL,CAI", "wish", 2494436853],
  ["IKA,NRT,JFK,LOS,SYD,GRU", "visited", 576720069],
];
const routesOf = (places: string): ReturnType<typeof buildRoutes> => buildRoutes(places.split(","), "IST");
const outside = (p: ReturnType<typeof composePiece>): typeof p.notes => {
  const bar = 240 / p.bpm;
  return p.notes.filter((n) => n.t < 8 * bar || n.t >= 24 * bar);
};

describe("episodes in a piece: what must not change", () => {
  it("has golden hashes for both kinds of piece", () => {
    expect(GOLDEN_NO_COLOUR.length).toBeGreaterThanOrEqual(4);
    expect(GOLDEN_OUTSIDE_VERSE.length).toBeGreaterThanOrEqual(3);
  });
  it("a piece without colours is exactly the piece of before", () => {
    for (const [places, mode, h] of GOLDEN_NO_COLOUR) expect(routeHash(JSON.stringify(composePiece(mode, routesOf(places)).notes)), places).toBe(h);
  });
  it("every note outside the verse is exactly the note of before", () => {
    for (const [places, mode, h] of GOLDEN_OUTSIDE_VERSE) expect(routeHash(JSON.stringify(outside(composePiece(mode, routesOf(places))))), places).toBe(h);
  });
});

describe("episodes in a piece: what changes in the verse", () => {
  const places = "NRT,LOS,GRU,LHR,DEL,CAI";
  const routes = routesOf(places);
  const p = composePiece("visited", routes);
  const bar = 240 / p.bpm;
  const inBars = (a: number, b: number) => p.notes.filter((n) => n.show !== false && n.t >= a * bar - 0.05 && n.t < b * bar - 0.05);
  it("records the episode cards in the style", () => {
    const eps = episodeCards(planCards("visited", routes)).map((c) => c.id);
    expect(eps.length).toBeGreaterThanOrEqual(1);
    expect(p.style.episodes).toEqual(eps);
  });
  it("ends every verse block with a drum fill: a kick on beat 3 and a backbeat on beat 3.5", () => {
    const beat = bar / 4;
    const fill = (b: number): number => inBars(b, b + 1).filter((n) => Math.abs(((n.t - b * bar) / beat) - 3.5) < 0.05 && n.d < beat * 0.3).length;
    expect([11, 15, 19, 23].filter((b) => fill(b) > 0).length).toBeGreaterThanOrEqual(2);
    expect(fill(9) + fill(10)).toBe(0);
  });
  it("is deterministic and keeps the invariants (no negative times, no NaN, notes of a route in order)", () => {
    expect(JSON.stringify(composePiece("visited", routes).notes)).toBe(JSON.stringify(p.notes));
    for (const n of p.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite)).toBe(true);
    }
  });
});

// the roles of the routes, recomputed the way composePiece deals them (longest route first), so the tests can tell a bass from a hat
type Role = "pad" | "bass" | "hook" | "pluck" | "kick" | "backbeat" | "hat";
const BASE: Role[] = ["pad", "bass", "hook", "pluck", "kick", "backbeat", "hat"];
const SMALL: Record<number, Role[]> = { 2: ["bass", "hook"], 3: ["bass", "hook", "pluck"], 4: ["pad", "bass", "hook", "pluck"], 5: ["pad", "bass", "hook", "pluck", "kick"], 6: ["pad", "bass", "hook", "pluck", "kick", "backbeat"] };
const rolesOf = (routes: ReturnType<typeof buildRoutes>): Role[] => {
  const n = routes.length;
  const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i);
  const role: Role[] = new Array(n);
  order.forEach((x, k) => (role[x.i] = n <= 6 ? SMALL[n][k] : BASE[Math.floor((k * 7) / n)]));
  return role;
};
/** the groove of a card as composePiece builds it: the hit places and the strong ones (first, or accent >= 1.1; at most four), in beats */
const grooveStarts = (c: GenreCard): { hits: number[]; strong: number[] } => {
  const total = c.cell.reduce((x, y) => x + Math.abs(y), 0);
  let at = 0;
  const hits: { start: number; accent: number }[] = [];
  c.cell.forEach((u, k) => {
    if (u > 0) hits.push({ start: (at / total) * 4, accent: c.accent?.[k] || 1 });
    at += Math.abs(u);
  });
  return { hits: hits.map((h) => h.start), strong: hits.filter((h, k) => k === 0 || h.accent >= 1.1).slice(0, 4).map((h) => h.start) };
};
const SPOT_ON = 1.15;
const SPOT_OFF = 0.85;
const meanOf = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const quarter = (x: number): number => Math.round(x * 4) / 4 + 0;

describe("episodes in a piece: the voices and the groove follow the episode card", () => {
  const places = "NRT,LOS,GRU,LHR,DEL,CAI,SYD,JFK";
  const rs = routesOf(places);
  const pl = planCards("visited", rs);
  const p = composePiece("visited", rs);
  const role = rolesOf(rs);
  const eps = episodeCards(pl);
  const bar = 240 / p.bpm;
  const beat = bar / 4;
  const blockCard = (b: number): GenreCard | null => episodeAt(b, 8, eps).card;
  const barNotes = (route: number, b: number) => p.notes.filter((n) => n.route === route && n.show !== false && n.t >= b * bar - 0.05 && n.t < (b + 1) * bar - 0.05);
  const onsets = (route: number, b: number): number[] => barNotes(route, b).map((n) => (n.t - b * bar) / beat);
  const cardOf = (b: number): GenreCard => blockCard(b) ?? pl.main;
  const barsOfBlock = (blk: number): number[] => [0, 1, 2].map((k) => 8 + blk * 4 + k); // the three bars before the fill bar
  const first = (r: Role): number => role.indexOf(r);

  it("deals one route to each role, and the episodes are not the main card (the checks below are not vacuous)", () => {
    expect(new Set(role).size).toBe(7);
    expect(eps.length).toBeGreaterThanOrEqual(2);
    expect(eps.every((c) => c !== pl.main)).toBe(true);
    // at least one episode card has other strong places and other hit count than the main card
    const m = grooveStarts(pl.main);
    expect(eps.some((c) => grooveStarts(c).strong.join() !== m.strong.join())).toBe(true);
    expect(eps.some((c) => grooveStarts(c).hits.length !== 8)).toBe(true);
  });
  it("the bass plays the strong places of the episode card in an episode block and those of the main card in the home block", () => {
    const r = first("bass");
    for (let blk = 0; blk < 4; blk++) for (const b of barsOfBlock(blk)) {
      const want = grooveStarts(cardOf(b)).strong;
      const got = onsets(r, b);
      expect(got.length, `bar ${b}`).toBe(want.length);
      got.forEach((x, k) => expect(Math.abs(x - want[k]), `bar ${b} note ${k}`).toBeLessThan(0.15));
    }
  });
  it("the kick plays beat 1 and the strong places (rounded to quarter beats) in an episode block, beats 1 and 3 at home; the fill adds beat 4", () => {
    const r = first("kick");
    for (let blk = 0; blk < 4; blk++) for (const b of [...barsOfBlock(blk), 11 + blk * 4]) {
      const c = blockCard(b);
      const want = c ? [...new Set([0, ...grooveStarts(c).strong.map(quarter)])] : [0, 2];
      if (b % 4 === 3) { if (!want.includes(3)) want.push(3); }
      want.sort((x, y) => x - y);
      const got = onsets(r, b).map(quarter).sort((x, y) => x - y);
      expect(got, `bar ${b}`).toEqual(want);
    }
  });
  it("the hat plays the hit places of the episode figure in an episode block and eight eighths at home", () => {
    const r = first("hat");
    for (let blk = 0; blk < 4; blk++) for (const b of barsOfBlock(blk)) {
      const c = blockCard(b);
      expect(barNotes(r, b).length, `bar ${b}`).toBe(c ? grooveStarts(c).hits.length : 8);
    }
  });
  it("the voices of the episode card come forward (x1.15) and the others step back (x0.85) against the home block of the verse", () => {
    let checked = 0;
    for (const role2 of ["pad", "pluck"] as Role[]) {
      const r = first(role2);
      const home = meanOf([0, 1, 2, 3].flatMap((k) => barNotes(r, 8 + k)).map((n) => n.vel));
      for (let blk = 1; blk < 4; blk++) {
        const c = blockCard(8 + blk * 4);
        if (!c) continue;
        const mean = meanOf([0, 1, 2, 3].flatMap((k) => barNotes(r, 8 + blk * 4 + k)).map((n) => n.vel));
        const want = pl.perRoute[r] === c ? SPOT_ON : SPOT_OFF;
        expect(mean / home, `${role2} in block ${blk}`).toBeGreaterThan(want - 0.06);
        expect(mean / home, `${role2} in block ${blk}`).toBeLessThan(want + 0.06);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});

describe("episodes in a piece: a tune that runs on from a home block into an episode block", () => {
  const rs = routesOf("NRT,LOS,GRU,LHR,DEL,CAI");
  const pl = planCards("visited", rs);
  const p = composePiece("visited", rs);
  const role = rolesOf(rs);
  const bar = 240 / p.bpm;
  const r = role.indexOf("hook");
  const mean = (a: number, b: number): number => meanOf(p.notes.filter((n) => n.route === r && n.show !== false && n.t >= a * bar - 0.05 && n.t < b * bar - 0.05).map((n) => n.vel));
  it("has a tune and an episode in the second block of the verse", () => {
    expect(p.style.tune).toBeTruthy();
    expect(episodeAt(12, 8, episodeCards(pl)).card).toBeTruthy();
  });
  it("spotlights the notes by the bar they sound in: x0.85 (or x1.15) in bars 12-15 against bars 8-11", () => {
    const c = episodeAt(12, 8, episodeCards(pl)).card!;
    const want = pl.perRoute[r] === c ? SPOT_ON : SPOT_OFF;
    expect(mean(12, 16) / mean(8, 12)).toBeGreaterThan(want - 0.06);
    expect(mean(12, 16) / mean(8, 12)).toBeLessThan(want + 0.06);
  });
});
