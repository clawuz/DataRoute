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
});
