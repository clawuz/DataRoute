import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";

describe("note length follows the rank of the route", () => {
  it("the pad of a longer route is held longer than the pad of a shorter one", () => {
    const routes = buildRoutes(["GRU", "VCP", "EZE", "LAX", "MIA", "EWR", "OAK", "SFO"], "IST");
    const piece = composePiece("wish", routes);
    const longest = routes.map((r, i) => ({ i, d: r.distKm })).sort((a, b) => b.d - a.d);
    const mean = (i: number): number => {
      const ds = piece.notes.filter((n) => n.route === i && n.show !== false && String(n.instrument) !== "CELLO").map((n) => n.d);
      return ds.reduce((a, b) => a + b, 0) / Math.max(1, ds.length);
    };
    // the first two ranks are pads (8 routes): the longest rank is held at least as long as the second
    expect(mean(longest[0].i)).toBeGreaterThan(mean(longest[1].i) * 0.99);
    expect(mean(longest[0].i)).toBeGreaterThan(mean(longest[7].i));
  });

  it("call and response: in the odd bars of the chorus the pluck route answers where the hook rests", () => {
    const routes = buildRoutes(["GRU", "VCP", "EZE", "LAX", "MIA", "EWR", "OAK", "SFO"], "IST");
    const piece = composePiece("wish", routes);
    const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((a, b) => b.d - a.d || a.i - b.i);
    const hook = order[3].i; // 8 routes: pad, pad, bass, hook, pluck, kick, backbeat, hat
    const pluck = order[4].i;
    const bar = 240 / piece.bpm;
    const beat = bar / 4;
    const inBar = (n: { t: number }, b: number): number => (n.t - b * bar) / beat;
    for (const b of [33, 37, 41]) {
      const hookLate = piece.notes.filter((n) => n.route === hook && n.t >= b * bar - 1e-6 && n.t < (b + 1) * bar - 1e-6 && inBar(n, b) >= 1.99 && inBar(n, b) < 3.9);
      const pluckLate = piece.notes.filter((n) => n.route === pluck && n.t >= b * bar - 1e-6 && n.t < (b + 1) * bar - 1e-6 && inBar(n, b) >= 1.99 && inBar(n, b) < 3.9);
      expect(hookLate.length, `bar ${b} hook`).toBe(0);
      expect(pluckLate.length, `bar ${b} answer`).toBeGreaterThan(0);
    }
    // an even bar of the chorus is not answered: the hook plays its second half
    const even = piece.notes.filter((n) => n.route === hook && n.t >= 34 * bar - 1e-6 && n.t < 35 * bar - 1e-6 && inBar(n, 34) >= 1.99 && inBar(n, 34) < 3.9);
    expect(even.length).toBeGreaterThan(0);
  });
});
