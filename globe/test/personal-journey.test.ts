import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
import { planCards } from "../src/personal/genres";
import { journeyCard, journeyOf } from "../src/personal/journey";
import { buildRoutes } from "../src/personal/routes";

describe("journey: where it leaves, Istanbul, where it arrives", () => {
  it("a trip that changes planes at Istanbul away from home has the Turkish sound in the middle and its destination at the end", () => {
    const routes = buildRoutes(["NMI", "LHR"]); // no home: a journey; Goa to London goes through Istanbul
    expect(routes.some((r) => r.to === "IST")).toBe(true);
    const plan = planCards("visited", routes);
    const j = journeyOf(routes, plan);
    expect(j).not.toBeNull();
    expect(j!.transit).not.toBeNull();
    expect(j!.transit).not.toBe(plan.main);
  });

  it("a trip that fans out of Istanbul has no transit; home is plan.home when it is not the main card", () => {
    const routes = buildRoutes(["NRT", "LOS", "GRU", "LHR", "DEL", "CAI"], "IST");
    const plan = planCards("visited", routes);
    const j = journeyOf(routes, plan);
    expect(plan.home).not.toBe(plan.main);
    expect(j!.transit).toBeNull();
    expect(j!.home).toBe(plan.home);
  });

  it("a trip with one sound has no journey", () => {
    const routes = buildRoutes(["DEL", "ATL"], "IST"); // two routes whose home card is the destination card
    const plan = planCards("visited", routes);
    expect(routes.length).toBe(2);
    expect(plan.home).toBe(plan.main);
    expect(journeyOf(routes, plan)).toBeNull();
    expect(journeyOf([], planCards("visited", routes))).toBeNull();
  });

  it("the sections: home in the intro and outro, Istanbul in the verse and the break, the main card in the build and the chorus", () => {
    const routes = buildRoutes(["NMI", "LHR"]);
    const j = journeyOf(routes, planCards("visited", routes))!;
    expect(journeyCard("intro", j)).toBe(j.home);
    expect(journeyCard("outro", j)).toBe(j.home);
    expect(journeyCard("verse", j)).toBe(j.transit);
    expect(journeyCard("break", j)).toBe(j.transit);
    expect(journeyCard("chorus", j)).toBeNull();
    expect(journeyCard("build", j)).toBeNull();
  });

  it("without a transit the verse is left to its episodes (undefined)", () => {
    const routes = buildRoutes(["NRT", "LOS", "GRU", "LHR", "DEL", "CAI"], "IST");
    const j = journeyOf(routes, planCards("visited", routes))!;
    expect(journeyCard("verse", j)).toBeUndefined();
  });

  it("the piece records the cards of its journey, and a trip with one sound records none", () => {
    const fan = composePiece("visited", buildRoutes(["NRT", "LOS", "GRU", "LHR", "DEL", "CAI"], "IST"));
    expect(fan.style.journey?.length).toBeGreaterThan(0);
    const same = buildRoutes(["DEL", "ATL"], "IST");
    const plan = planCards("visited", same);
    expect(plan.home).toBe(plan.main);
    expect(composePiece("visited", same).style.journey).toBeUndefined();
  });

  it("the journey keeps every note finite, positive-timed and in order of its route", () => {
    for (const places of [["NMI", "LHR"], ["NMI", "LHR", "JFK", "NRT"], ["GRU", "VCP", "EZE", "LAX", "MIA", "EWR", "OAK", "SFO"]]) {
      for (const home of [undefined, "IST"]) {
        const p = composePiece("wish", buildRoutes(places, home));
        for (const n of p.notes) {
          expect(Number.isFinite(n.t) && n.t >= 0 && Number.isFinite(n.d) && Number.isFinite(n.freq)).toBe(true);
        }
      }
    }
  });
});
