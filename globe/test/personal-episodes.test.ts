import { describe, expect, it } from "vitest";
import { CARDS, planCards, type CardPlan, type GenreCard } from "../src/personal/genres";
import { EPISODE_CAP, episodeAt, episodeCards } from "../src/personal/episodes";
import { buildRoutes } from "../src/personal/routes";

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
