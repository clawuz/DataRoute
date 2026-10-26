import { describe, expect, it } from "vitest";
import { styleFor } from "../src/personal/compose";
import { planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import destinations from "../src/personal/destinations.json";

// a seeded generator so the audit is the same every run
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

describe("variety: the main style spreads over the cards", () => {
  const codes = (destinations as { i: string }[]).map((d) => d.i);
  const rnd = lcg(20261026);
  const picks: { main: string; home: string; bpm: number }[] = [];
  for (let k = 0; k < 120; k++) {
    const n = 3 + Math.floor(rnd() * 6);
    const places = new Set<string>();
    while (places.size < n) places.add(codes[Math.floor(rnd() * codes.length)]);
    const routes = buildRoutes([...places], k % 2 ? "IST" : undefined);
    if (routes.length === 0) continue;
    const plan = planCards("visited", routes);
    picks.push({ main: plan.main.id, home: plan.home.id, bpm: styleFor("visited", routes).bpm });
  }
  it("many different main cards, none dominating", () => {
    const count = new Map<string, number>();
    for (const p of picks) count.set(p.main, (count.get(p.main) ?? 0) + 1);
    expect(count.size).toBeGreaterThanOrEqual(15);
    expect(Math.max(...count.values()) / picks.length).toBeLessThanOrEqual(0.25);
  });
  it("the tempo spreads over a wide range", () => {
    const bpms = picks.map((p) => p.bpm);
    expect(Math.max(...bpms) - Math.min(...bpms)).toBeGreaterThanOrEqual(30);
  });
});
