import { describe, expect, it } from "vitest";
import { FILM_DESTINATIONS, FILM_SECONDS, filmPiece, filmRoutes, shotAt } from "../src/personal/intro-film";

describe("the opening film", () => {
  it("starts far and dark, and ends at the live screen's distance with the furniture shown", () => {
    const a = shotAt(0);
    expect(a.dist).toBeCloseTo(9, 0);
    expect(a.fade).toBe(0);
    expect(a.open).toBe(0);
    const z = shotAt(FILM_SECONDS);
    expect(z.dist).toBeCloseTo(3.2, 5);
    expect(z.hud).toBe(1);
    expect(z.text.every + z.text.sound).toBe(0); // only the headline: the film says almost nothing
  });
  it("closes in on Istanbul in the first three seconds, opens the routes one by one, then pulls back", () => {
    expect(shotAt(3).dist).toBeLessThan(1.6); // the globe fills the screen
    expect(shotAt(3.5).open).toBe(0);
    expect(shotAt(3.5 + 0.18 * 4).open).toBeCloseTo(4, 5);
    expect(shotAt(5).open).toBe(FILM_DESTINATIONS.length);
    expect(shotAt(7).dist).toBeCloseTo(2.4, 5);
    expect(shotAt(10).dist).toBeCloseTo(3.2, 5);
  });
  it("says the words in their own seconds", () => {
    expect(shotAt(2).text.every).toBe(1);
    expect(shotAt(4.6).text.sound).toBe(1);
    expect(shotAt(6).text.every).toBe(0);
  });
  it("scores 15 seconds on the film's routes, one voice per route at first", () => {
    const routes = filmRoutes();
    expect(routes.length).toBeGreaterThan(150); // the live screen's hundreds of routes
    expect(routes.slice(0, FILM_DESTINATIONS.length).map((r) => r.to)).toEqual(FILM_DESTINATIONS);
    const p = filmPiece(routes);
    expect(p.duration).toBe(FILM_SECONDS);
    for (const n of p.notes) {
      expect(n.t).toBeGreaterThanOrEqual(0);
      expect(n.t + n.d).toBeLessThanOrEqual(FILM_SECONDS + 1);
      expect(routes[n.route]).toBeTruthy();
    }
    const voices = new Set(p.notes.filter((n) => n.t >= 3.5 && n.t < 5.2 && n.show).map((n) => n.instrument));
    expect(voices.size).toBeGreaterThanOrEqual(6);
  });
});
