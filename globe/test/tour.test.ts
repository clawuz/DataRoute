import { describe, expect, it } from "vitest";
import { buildGlobeModel } from "../src/model/globe-model";
import {
  TOUR_GLOBE_SEC, TOUR_RECENT, initTour, pickTourFlight, stepTour, type TourCtx,
} from "../src/model/tour";
import { FROM, flight, makeDay } from "./helpers";

const track = (lon: number): [number, number, number, number][] => [
  [0, 300, 41, 29], [2000, 350, 42, lon], [4000, 370, 44, lon + 5], [6000, 370, 45, lon + 10],
];
const model = () =>
  buildGlobeModel(
    makeDay({
      flights: [
        flight({ from: "IST", to: "ESB", arr: null, end: "AIRBORNE", s: track(30) }), // ≈ 350 km
        flight({ from: "IST", to: "JFK", arr: null, end: "AIRBORNE", s: track(20) }), // ≈ 8 000 km
        flight({ from: "IST", to: "LHR", arr: null, end: "AIRBORNE", s: track(10) }), // ≈ 2 500 km
        flight({ from: "IST", to: "JFK", arr: FROM + 6000, end: "LANDED", s: track(5) }),
      ],
    }),
  );
const CUR = 6100; // 100 s after every last sample
const mid = () => 0.5;

describe("pickTourFlight", () => {
  it("prefers the longest airborne route", () => {
    const m = model();
    expect(pickTourFlight(m, CUR, [], mid)).toBe(1);
  });

  it("skips recent flights but falls back when nothing else qualifies", () => {
    const m = model();
    expect(pickTourFlight(m, CUR, [m.flights[1].id], mid)).toBe(2);
    expect(pickTourFlight(m, CUR, m.flights.map((f) => f.id), mid)).toBe(1);
  });

  it("ignores landed flights, short tracks and heads past the extrapolation limit", () => {
    const m = model();
    expect(pickTourFlight(m, 6000 + 1000, [], mid)).toBe(-1);
    const short = buildGlobeModel(makeDay({ flights: [flight({ arr: null, end: "AIRBORNE", s: [[0, 300, 0, 0], [60, 300, 0, 1]] })] }));
    expect(pickTourFlight(short, 100, [], mid)).toBe(-1);
  });
});

describe("stepTour", () => {
  const ctx = (o: Partial<TourCtx> = {}): TourCtx => ({
    following: false, followDone: false, manual: false, model: model(), cur: CUR, rand: mid, ...o,
  });

  it("does nothing when disabled or while the user is interacting", () => {
    const s = initTour(false);
    expect(stepTour(s, 100, ctx())).toEqual({ s, a: { type: "none" } });
    const on = initTour(true);
    expect(stepTour(on, 100, ctx({ manual: true }))).toEqual({ s: on, a: { type: "none" } });
  });

  it("after the GLOBE phase it picks a flight and enters FOLLOW, remembering the last three", () => {
    let s = initTour(true);
    const m = model();
    let r = stepTour(s, TOUR_GLOBE_SEC - 1, ctx({ model: m }));
    expect(r.a).toEqual({ type: "none" });
    r = stepTour(r.s, 2, ctx({ model: m }));
    expect(r.a).toEqual({ type: "follow", index: 1 });
    expect(r.s.phase).toBe("FOLLOW");
    expect(r.s.recent).toEqual([m.flights[1].id]);
    s = r.s;
    for (let i = 0; i < 5; i++) s = { ...s, recent: [`x${i}`, ...s.recent].slice(0, TOUR_RECENT) };
    expect(s.recent).toHaveLength(TOUR_RECENT);
  });

  it("retries sooner when nothing qualifies", () => {
    const empty = buildGlobeModel(makeDay({ flights: [] }));
    const r = stepTour(initTour(true), TOUR_GLOBE_SEC + 1, ctx({ model: empty }));
    expect(r.a).toEqual({ type: "none" });
    expect(r.s.phase).toBe("GLOBE");
    expect(r.s.t).toBeLessThan(TOUR_GLOBE_SEC);
  });

  it("FOLLOW ends with an exit action when the follow is done, or silently when the user left", () => {
    const f = { ...initTour(true), phase: "FOLLOW" as const, t: 3 };
    expect(stepTour(f, 1, ctx({ following: true, followDone: true })).a).toEqual({ type: "exit" });
    const left = stepTour(f, 1, ctx({ following: false }));
    expect(left.a).toEqual({ type: "none" });
    expect(left.s.phase).toBe("GLOBE");
    expect(stepTour(f, 1, ctx({ following: true })).s.t).toBe(4);
  });

  it("adopts a follow the user started once input stops", () => {
    const r = stepTour(initTour(true), 1, ctx({ following: true }));
    expect(r.s.phase).toBe("FOLLOW");
    expect(r.a).toEqual({ type: "none" });
  });
});
