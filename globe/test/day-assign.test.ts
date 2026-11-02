import { describe, expect, it } from "vitest";
import type { TrackNote } from "../src/audio/day-track";
import { assignDay, spearman, type DayFlight } from "../src/audio/day-assign";

// a day of 300 flights on 60 routes of 400 to 11000 km: they take off all through the day and stay up for a tenth of it
const KM = Array.from({ length: 60 }, (_, i) => 400 + i * 180);
const key = (i: number): string => `IST-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}Z`;
const flights: DayFlight[] = Array.from({ length: 300 }, (_, i) => {
  const dep = ((i * 0.6180339887) % 1) * 1.1 - 0.05; // some started before the window
  const r = (i * 7) % 60;
  return { id: `f${i}`, key: key(r), dep, end: dep + 0.1, km: KM[r] };
});
const DUR = 180;
const notes: TrackNote[] = Array.from({ length: 700 }, (_, i) => ({ t: (i / 700) * DUR, d: 0.2 + ((i * 37) % 100) / 40, p: 48 + ((i * 7) % 30), v: 0.6, k: "OLD-KEY", from: "OLD", to: "KEY", alt: 30000 }));

describe("assignDay: the recording against the last 24 hours", () => {
  const plan = assignDay(notes, DUR, flights);
  const inWindow = flights.filter((f) => f.dep >= 0 && f.dep <= 1);
  it("every flight that took off in the window gets a note of its own, near its take-off", () => {
    const own = new Map<string, TrackNote[]>();
    for (const [n, f] of plan) own.set(f.id, [...(own.get(f.id) ?? []), n]);
    let missing = 0;
    for (const f of inWindow) {
      const ns = own.get(f.id) ?? [];
      if (!ns.some((n) => Math.abs(n.t - f.dep * DUR) <= 4 * (DUR / flights.length) + 1e-6)) missing++;
    }
    expect(missing).toBeLessThanOrEqual(Math.ceil(inWindow.length * 0.02));
  });
  it("every note lights some flight of the day, and one that is in the air then, or that takes off then", () => {
    expect(plan.size).toBe(notes.length);
    const win = 4 * (DUR / flights.length) + 1e-6;
    for (const [n, f] of plan) {
      const frac = n.t / DUR;
      const air = f.dep <= frac + 1 / 240 && f.end >= frac - 1 / 240; // (the sky is read in steps of 1/240 of the day)
      const near = Math.abs(n.t - f.dep * DUR) <= win;
      expect(air || near, `note at ${n.t}`).toBe(true);
    }
  });
  it("a long note goes to a long route and a short note to a short one", () => {
    const xs = [...plan.keys()].map((n) => n.d);
    const ys = [...plan.values()].map((f) => f.km);
    expect(spearman(xs, ys)).toBeGreaterThan(0.5);
  });
  it("is a pure function: the same recording and day give the same plan; no route takes more than 8% of the notes", () => {
    const again = assignDay(notes, DUR, flights);
    expect(notes.map((n) => again.get(n)!.id)).toEqual(notes.map((n) => plan.get(n)!.id));
    const count = new Map<string, number>();
    for (const f of plan.values()) count.set(f.key, (count.get(f.key) ?? 0) + 1);
    expect(Math.max(...count.values()) / notes.length).toBeLessThan(0.08);
  });
  it("flights without a known route are not used; an empty day gives an empty plan", () => {
    expect(assignDay(notes, DUR, [], {}).size).toBe(0);
    const p = assignDay(notes, DUR, [{ id: "x", key: "x1", dep: 0.5, end: 0.6, km: 1000 }], {});
    expect(p.size).toBe(0);
  });
});
