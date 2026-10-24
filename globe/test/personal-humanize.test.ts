import { describe, expect, it } from "vitest";
import type { PersonalNote } from "../src/personal/compose";
import { composePiece } from "../src/personal/compose";
import { humanize, looseness, timeZonesSpanned } from "../src/personal/humanize";
import { buildRoutes } from "../src/personal/routes";

const mk = (route: number, t: number, vel = 0.5): PersonalNote => ({ t, d: 0.2, instrument: "PNO", freq: 440, vel, key: `R${route}`, route, via: route, alt: 0 });
const grid = (n: number, gap: number, route = 0): PersonalNote[] => Array.from({ length: n }, (_, k) => mk(route, 1 + k * gap));
const copy = (a: PersonalNote[]): PersonalNote[] => a.map((n) => ({ ...n }));
const meanAbs = (a: PersonalNote[], b: PersonalNote[]): number => a.reduce((s, n, i) => s + Math.abs(n.t - b[i].t), 0) / a.length;

describe("time zones", () => {
  it("measures the span of the end points in hours, over the date line too", () => {
    expect(timeZonesSpanned([{ fromLon: 28.8, toLon: -73.8 }])).toBeCloseTo(102.6 / 15, 1);
    expect(timeZonesSpanned([{ fromLon: 170, toLon: -170 }])).toBeCloseTo(20 / 15, 1);
    expect(timeZonesSpanned([{ fromLon: 10, toLon: 10 }])).toBe(0);
  });
  it("turns them into a looseness between 0 and 1", () => {
    expect(looseness(0)).toBe(0);
    expect(looseness(5)).toBeCloseTo(0.5, 6);
    expect(looseness(30)).toBe(1);
  });
});

describe("humanize", () => {
  it("moves a note by a few milliseconds, never past 20% of the gap, never before zero", () => {
    const a = grid(40, 0.5);
    const b = copy(a);
    humanize(b, { loose: 1 });
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(b[i].t - a[i].t)).toBeLessThanOrEqual(0.018 + 1e-9);
      expect(Math.abs(b[i].t - a[i].t)).toBeLessThanOrEqual(0.2 * 0.5 + 1e-9);
      expect(b[i].t).toBeGreaterThanOrEqual(0);
    }
    expect(meanAbs(a, b)).toBeGreaterThan(0.003);
  });
  it("keeps a route's notes in order, even when they are close together", () => {
    const a = grid(60, 0.05);
    const b = copy(a);
    humanize(b, { loose: 1 });
    for (let i = 0; i + 1 < b.length; i++) expect(b[i + 1].t).toBeGreaterThan(b[i].t);
    for (let i = 0; i < a.length; i++) expect(Math.abs(b[i].t - a[i].t)).toBeLessThanOrEqual(0.2 * 0.05 + 1e-9);
  });
  it("moves the notes of a route that sound together, together", () => {
    const a = [mk(0, 1), mk(0, 1), mk(0, 1), mk(0, 2)];
    const b = copy(a);
    humanize(b, { loose: 1 });
    expect(b[1].t).toBe(b[0].t);
    expect(b[2].t).toBe(b[0].t);
  });
  it("changes the loudness by at most 6%", () => {
    const a = grid(40, 0.5, 3);
    const b = copy(a);
    humanize(b, { loose: 0.5 });
    for (let i = 0; i < a.length; i++) expect(Math.abs(b[i].vel / a[i].vel - 1)).toBeLessThanOrEqual(0.06 + 1e-9);
  });
  it("drifts more over more time zones, and tight notes less than the others", () => {
    const a = grid(200, 0.5);
    const loose = copy(a), calm = copy(a), tight = copy(a);
    humanize(loose, { loose: 1 });
    humanize(calm, { loose: 0 });
    humanize(tight, { loose: 1, tight: () => true });
    expect(meanAbs(a, loose)).toBeGreaterThan(meanAbs(a, calm));
    expect(meanAbs(a, tight)).toBeLessThan(meanAbs(a, loose) * 0.5);
  });
  it("leaves skipped notes alone and is the same every time", () => {
    const a = grid(30, 0.5);
    const b = copy(a), c = copy(a);
    humanize(b, { loose: 1, skip: (n) => n.t < 5 });
    humanize(c, { loose: 1, skip: (n) => n.t < 5 });
    expect(b.filter((n) => n.t < 5).every((n, i) => n.t === a[i].t && n.vel === a[i].vel)).toBe(true);
    expect(b.map((n) => n.t)).toEqual(c.map((n) => n.t));
  });
});

describe("humanize in a piece", () => {
  it("composes the same piece every time, and a far trip is looser than a near one", () => {
    const near = buildRoutes(["ESB", "ADB", "AYT", "TZX"], "IST");
    const far = buildRoutes(["JFK", "NRT", "LAX", "SYD"], "IST");
    const a = composePiece("visited", far);
    expect(JSON.stringify(composePiece("visited", far).notes)).toBe(JSON.stringify(a.notes));
    // swing and other rules also leave the beat grid, so compare the trips by their time zones, and check that
    // the notes of the far trip are not all on the exact sixteenth grid
    expect(timeZonesSpanned(far)).toBeGreaterThan(timeZonesSpanned(near));
    const beat = 60 / a.bpm / 4;
    expect(a.notes.some((n) => Math.abs(((n.t / beat + 0.5) % 1) - 0.5) > 0.002 / beat)).toBe(true);
  });
});
