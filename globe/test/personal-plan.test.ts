import { describe, expect, it } from "vitest";
import { routeHash } from "../src/audio/theory";
import { cardsOfAirport, clusterOf, colourCardOf, planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";

/** the expectation, written out: the cluster with most routes (ties: the larger sum of distKm, then the smaller routeHash(cluster id)), inside it the card with most routes (same ties, by card id) */
function expectedMain(routes: ReturnType<typeof buildRoutes>) {
  type T = { card: ReturnType<typeof colourCardOf>; n: number; km: number };
  const byCard = new Map<string, T>();
  const byCluster = new Map<string, { id: string; n: number; km: number }>();
  routes.forEach((r, i) => {
    const c = colourCardOf(r, i);
    const t = byCard.get(c.id) ?? { card: c, n: 0, km: 0 };
    t.n++;
    t.km += r.distKm;
    byCard.set(c.id, t);
    const k = clusterOf(c);
    const u = byCluster.get(k) ?? { id: k, n: 0, km: 0 };
    u.n++;
    u.km += r.distKm;
    byCluster.set(k, u);
  });
  const lead = [...byCluster.values()].sort((a, b) => b.n - a.n || b.km - a.km || routeHash(a.id) - routeHash(b.id))[0].id;
  return [...byCard.values()]
    .filter((t) => clusterOf(t.card) === lead)
    .sort((a, b) => b.n - a.n || b.km - a.km || routeHash(a.card.id) - routeHash(b.card.id))[0].card;
}

describe("the main card follows the destinations", () => {
  it("is the card most routes go to, with the tie rule", () => {
    for (const [places, home] of [
      [["JFK", "LAX", "MIA"], "IST"],
      [["JFK", "LAX", "MIA", "ORD", "SFO", "ATL", "SEA", "BOS"], "IST"],
      [["NRT", "LOS", "GRU", "LHR", "DEL", "CAI"], "IST"],
      [["NMI", "LHR", "JFK", "NRT"], undefined],
      [["ATH", "FCO", "BCN", "MAD"], "IST"],
    ] as [string[], string | undefined][]) {
      for (const mode of ["visited", "wish"] as const) {
        const routes = buildRoutes(places, home);
        expect(planCards(mode, routes).main).toBe(expectedMain(routes));
      }
    }
  });

  it("eight US routes from Istanbul do not give a Turkish main unless the destinations vote for it", () => {
    const routes = buildRoutes(["JFK", "LAX", "MIA", "ORD", "SFO", "ATL", "SEA", "BOS"], "IST");
    const plan = planCards("visited", routes);
    const votes = new Set(routes.map((r, i) => colourCardOf(r, i).id));
    expect(votes.has(plan.main.id)).toBe(true);
    expect(["anatolian", "karsilama"].includes(plan.main.id)).toBe(false);
  });

  it("one route: main is the card of its far end", () => {
    const routes = buildRoutes(["JFK"], "IST");
    expect(planCards("visited", routes).main).toBe(colourCardOf(routes[0], 0));
  });

  it("home is the old choice: among the cards of the airport or the generic pool; deterministic", () => {
    const routes = buildRoutes(["JFK", "LAX", "MIA", "ORD"], "IST");
    const plan = planCards("visited", routes);
    const allowed = new Set([...cardsOfAirport("IST", "TR"), "calm", "nordic", "romantic", "cinematic", "baroque", "dance", "jazz", "pop", "epic"].map((c) => (typeof c === "string" ? c : c.id)));
    expect(allowed.has(plan.home.id)).toBe(true);
    const again = planCards("visited", buildRoutes(["JFK", "LAX", "MIA", "ORD"], "IST"));
    expect(again.main.id).toBe(plan.main.id);
    expect(again.home.id).toBe(plan.home.id);
  });

  it("no routes keep the first card as both", () => {
    const p = planCards("visited", []);
    expect(p.home).toBe(p.main);
    expect(p.perRoute).toEqual([]);
  });
});
