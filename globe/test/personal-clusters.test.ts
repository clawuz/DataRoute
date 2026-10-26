import { describe, expect, it } from "vitest";
import { routeHash } from "../src/audio/theory";
import { CARDS, CLUSTER_OF, clusterOf, colourCardOf, planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";

type R = ReturnType<typeof buildRoutes>;

/** the rule written out: the cluster with the most routes (ties: larger total distance, smaller hash of the cluster id),
 *  inside it the card with the most routes (ties: distance, hash of the card id) */
function expectedMain(routes: R) {
  const cl = new Map<string, { n: number; km: number }>();
  const cd = new Map<string, { card: ReturnType<typeof colourCardOf>; n: number; km: number }>();
  routes.forEach((r, i) => {
    const c = colourCardOf(r, i);
    const id = clusterOf(c);
    const a = cl.get(id) ?? { n: 0, km: 0 };
    a.n++;
    a.km += r.distKm;
    cl.set(id, a);
    const t = cd.get(c.id) ?? { card: c, n: 0, km: 0 };
    t.n++;
    t.km += r.distKm;
    cd.set(c.id, t);
  });
  const lead = [...cl.entries()].sort((a, b) => b[1].n - a[1].n || b[1].km - a[1].km || routeHash(a[0]) - routeHash(b[0]))[0][0];
  return [...cd.values()]
    .filter((t) => clusterOf(t.card) === lead)
    .sort((a, b) => b.n - a.n || b.km - a.km || routeHash(a.card.id) - routeHash(b.card.id))[0].card;
}

describe("clusters of the cards", () => {
  it("every card is in exactly one cluster and every key is a card", () => {
    const ids = new Set(CARDS.map((c) => c.id));
    for (const c of CARDS) expect(CLUSTER_OF[c.id], c.id).toBeTruthy();
    for (const k of Object.keys(CLUSTER_OF)) expect(ids.has(k), k).toBe(true);
    expect(Object.keys(CLUSTER_OF).length).toBe(CARDS.length);
    expect(new Set(Object.values(CLUSTER_OF)).size).toBe(13);
  });
});

describe("the main card follows the dominant region", () => {
  it("follows the written rule on several selections", () => {
    for (const [places, home] of [
      [["NRT", "PEK", "SIN", "CAI", "LOS", "GRU"], "IST"],
      [["NRT", "LOS", "GRU", "DEL", "MAD", "JFK", "CAI", "FCO"], "IST"],
      [["DXB", "RUH", "DOH", "KWI", "CMN", "CAI", "NRT", "JFK"], "IST"],
      [["JFK", "LAX", "MIA", "ORD", "SFO", "ATL", "SEA", "BOS"], "IST"],
      [["NMI", "LHR", "JFK", "NRT"], undefined],
    ] as [string[], string | undefined][]) {
      for (const mode of ["visited", "wish"] as const) {
        const routes = buildRoutes(places, home);
        expect(planCards(mode, routes).main).toBe(expectedMain(routes));
      }
    }
  });

  it("a leading cluster wins over a single card with more routes", () => {
    // search a selection where the Gulf/Arab cluster has more routes in total than the most frequent single card
    const routes = buildRoutes(["DXB", "RUH", "DOH", "KWI", "CMN", "AMM", "NRT", "NRT"], "IST");
    const votes = routes.map((r, i) => colourCardOf(r, i));
    const byCard = new Map<string, number>();
    const byCluster = new Map<string, number>();
    for (const c of votes) {
      byCard.set(c.id, (byCard.get(c.id) ?? 0) + 1);
      byCluster.set(clusterOf(c), (byCluster.get(clusterOf(c)) ?? 0) + 1);
    }
    const topCard = Math.max(...byCard.values());
    const topCluster = Math.max(...byCluster.values());
    expect(topCluster).toBeGreaterThan(topCard);
    const main = planCards("visited", routes).main;
    expect(byCluster.get(clusterOf(main))).toBe(topCluster);
  });

  it("one route: main is its far-end card; no routes: unchanged", () => {
    const routes = buildRoutes(["JFK"], "IST");
    expect(planCards("visited", routes).main).toBe(colourCardOf(routes[0], 0));
    const p = planCards("visited", []);
    expect(p.main).toBe(CARDS[0]);
  });
});
