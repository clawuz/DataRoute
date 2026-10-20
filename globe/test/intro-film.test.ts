import { describe, expect, it } from "vitest";
import { FILM_DESTINATIONS, FILM_ROUTES, FILM_SECONDS, ROUTES_DONE, SETTLE_FROM, SETTLE_TO, filmModel, filmPiece, filmRoutes, modelClock, openTimes, shotAt } from "../src/personal/intro-film";

describe("the opening film", () => {
  it("starts far and dark with no words, and ends at the live screen's view with the film gone", () => {
    const a = shotAt(0);
    expect(a.dist).toBeCloseTo(9, 0);
    expect(a.fade).toBe(0);
    expect(Object.values(a.text).every((v) => v === 0)).toBe(true);
    const z = shotAt(FILM_SECONDS);
    expect(z.dist).toBeCloseTo(3.2, 5);
    expect([z.lat, z.lon]).toEqual([20, 30]);
    expect(z.film).toBe(0);
    expect(Object.values(z.text).every((v) => v === 0)).toBe(true);
  });
  it("closes in on the world first, with no words while the routes are made", () => {
    expect(shotAt(3).dist).toBeLessThan(1.6); // the globe fills the screen
    for (const t of [1, 3, 5, ROUTES_DONE - 0.3]) expect(Object.values(shotAt(t).text).every((v) => v === 0)).toBe(true);
  });
  it("brings the words in one after another, then holds them to be read, then clears them before the globe moves back", () => {
    const order = ["logo", "presents", "world", "l1", "l2"] as const;
    const startOf = order.map((k) => { for (let t = ROUTES_DONE; t < SETTLE_FROM; t += 0.05) if (shotAt(t).text[k] > 0.5) return t; return Infinity; });
    for (let i = 1; i < startOf.length; i++) expect(startOf[i]).toBeGreaterThan(startOf[i - 1]);
    // every line stays whole for long enough to read: the two lines at least 2.5 s with all of them there
    const all = (t: number) => order.every((k) => shotAt(t).text[k] > 0.95);
    let n = 0;
    for (let t = ROUTES_DONE; t < SETTLE_FROM; t += 0.05) if (all(t)) n += 0.05;
    expect(n).toBeGreaterThan(2.5);
    expect(Object.values(shotAt(SETTLE_FROM + 0.5).text).every((v) => v === 0)).toBe(true);
    expect(shotAt(SETTLE_FROM - 1.2).dist).toBeLessThan(2.2); // it moves back only after the words
    expect(shotAt(SETTLE_TO).dist).toBeCloseTo(3.2, 5);
  });
  it("opens the network's routes from the hub, the voiced cities first", () => {
    const routes = filmRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(FILM_ROUTES);
    expect(routes.slice(0, FILM_DESTINATIONS.length).map((r) => r.to)).toEqual(FILM_DESTINATIONS);
    expect(routes.every((r) => r.from === "IST")).toBe(true);
  });
  it("makes as many routes as there are notes, each route at the second of its note", () => {
    const routes = filmRoutes().slice(0, FILM_ROUTES);
    const opens = openTimes(routes.length);
    const piece = filmPiece(routes);
    const shown = piece.notes.filter((n) => n.show);
    expect(shown.length).toBe(routes.length);
    shown.forEach((n, i) => { expect(n.route).toBe(i); expect(n.t).toBeCloseTo(opens[i], 6); });
    // the model's track of a route starts when its note sounds
    const m = filmModel(routes, opens);
    m.flights.forEach((f, i) => { expect(f.dep).toBeCloseTo(modelClock(opens[i]), 3); expect(f.lastT).toBe(f.end); });
    for (const n of piece.notes) { expect(n.t).toBeGreaterThanOrEqual(0); expect(n.t).toBeLessThan(FILM_SECONDS); }
  });
});
