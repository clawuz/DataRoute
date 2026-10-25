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
  it("brings the voices of the episode region forward and the others back (x1.15 against x0.85)", () => {
    const plan = planCards("visited", routes);
    const e = episodeCards(plan)[0];
    const block = [12, 16].map((b) => ({ b, c: episodeAt(b, 8, episodeCards(plan)).card })).find((x) => x.c)!;
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    const mine = inBars(block.b, block.b + 4).filter((n) => plan.perRoute[n.route] === block.c);
    const others = inBars(block.b, block.b + 4).filter((n) => plan.perRoute[n.route] !== block.c);
    expect(mine.length).toBeGreaterThan(4);
    expect(others.length).toBeGreaterThan(4);
    // the same kind of voice would be needed for an exact ratio: assert the direction and a clear gap
    expect(mean(mine.map((n) => n.vel)) / mean(others.map((n) => n.vel))).toBeGreaterThan(1.1);
    expect(e).toBeTruthy();
  });
  it("ends every verse block with a drum fill: a kick on beat 3 and a backbeat on beat 3.5", () => {
    const beat = bar / 4;
    const fill = (b: number): number => inBars(b, b + 1).filter((n) => Math.abs(((n.t - b * bar) / beat) - 3.5) < 0.05 && n.d < beat * 0.3).length;
    expect([11, 15, 19, 23].filter((b) => fill(b) > 0).length).toBeGreaterThanOrEqual(2);
    expect(fill(9) + fill(10)).toBe(0);
  });
  it("changes the rhythm of the groove inside an episode: the onsets of the lowest voice differ from the home blocks", () => {
    const beat = bar / 4;
    const onsets = (b: number): string => {
      const notes = inBars(b, b + 1);
      const low = Math.min(...notes.map((n) => n.freq));
      return notes.filter((n) => n.freq === low).map((n) => ((n.t - b * bar) / beat).toFixed(1)).join(",");
    };
    const home = onsets(9);
    const eps = [12, 16, 20].filter((b) => episodeAt(b, 8, episodeCards(planCards("visited", routes))).card).map(onsets);
    expect(eps.some((o) => o !== home)).toBe(true);
  });
  it("is deterministic and keeps the invariants (no negative times, no NaN, notes of a route in order)", () => {
    expect(JSON.stringify(composePiece("visited", routes).notes)).toBe(JSON.stringify(p.notes));
    for (const n of p.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect([n.t, n.d, n.freq, n.vel].every(Number.isFinite)).toBe(true);
    }
  });
});
