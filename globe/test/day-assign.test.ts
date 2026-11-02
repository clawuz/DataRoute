import { describe, expect, it } from "vitest";
import type { SkyFlight } from "../src/audio/lines";
import type { TrackNote } from "../src/audio/day-track";
import { assignDay, spearman } from "../src/audio/day-assign";
import { routeKm } from "../src/audio/route-fit";

// a small synthetic day: 40 routes of 600 to 11000 km; at every moment of the day 13 of them are airborne, short and long ones among them
// (a real sky has every length in the air at once); the set changes through the day
const KM = Array.from({ length: 40 }, (_, i) => 600 + i * 270);
const lat = (km: number): number => 41.2613 + (km / 6371) * (180 / Math.PI); // due north of Istanbul: the great-circle distance is then `km`
const sky = (frac: number): SkyFlight[] => {
  const shift = Math.floor(frac * 6);
  return KM.map((km, i) => ({ km, i })).filter(({ i }) => (i + shift) % 3 === 0).map(({ km, i }) => ({ id: `f${i}`, key: `IST-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}Z`, regionIdx: 0, alt100: 300, vsFpm: 0, farLat: Math.min(89, lat(km)), farLon: 28.742 }));
};
const notes: TrackNote[] = Array.from({ length: 400 }, (_, i) => ({ t: i * 0.5, d: 0.2 + ((i * 37) % 100) / 40, p: 48 + ((i * 7) % 30), v: 0.6, k: "OLD-KEY", from: "OLD", to: "KEY", alt: 30000 }));

describe("assignDay: the notes of the recording go to the flights of the day", () => {
  const plan = assignDay(notes, 200, sky, { jitter: () => 0.5 });
  it("every note gets a flight that is in the air at that moment of the replay", () => {
    expect(plan.size).toBe(notes.length);
    for (const n of notes) {
      const f = plan.get(n)!;
      expect(sky(n.t / 200).some((s) => s.id === f.id), `note at ${n.t}`).toBe(true);
    }
  });
  it("a long note goes to a long route and a short note to a short one (rank correlation of note length and route length)", () => {
    const xs = notes.map((n) => n.d);
    const ys = notes.map((n) => routeKm(plan.get(n)!) ?? 0);
    expect(spearman(xs, ys)).toBeGreaterThan(0.5);
  });
  it("no route takes more than 12% of the notes (the lit routes change all the time)", () => {
    const count = new Map<string, number>();
    for (const n of notes) count.set(plan.get(n)!.key, (count.get(plan.get(n)!.key) ?? 0) + 1);
    expect(Math.max(...count.values()) / notes.length).toBeLessThan(0.12);
  });
  it("the same day gives the same plan with the same jitter, another one with another jitter", () => {
    const again = assignDay(notes, 200, sky, { jitter: () => 0.5 });
    expect(notes.map((n) => again.get(n)!.id)).toEqual(notes.map((n) => plan.get(n)!.id));
    let k = 0;
    const other = assignDay(notes, 200, sky, { jitter: () => ((k = (k * 7 + 3) % 11) / 11) });
    expect(notes.some((n) => other.get(n)!.id !== plan.get(n)!.id)).toBe(true);
  });
  it("an empty sky gives no flight for that note", () => {
    const p = assignDay(notes.slice(0, 5), 200, () => [], { jitter: () => 0.5 });
    expect(p.size).toBe(0);
  });
});
