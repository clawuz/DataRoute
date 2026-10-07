import { describe, expect, it } from "vitest";
import { hzOfMidi, instrumentOf, noteEventOf, notesBetween, targetTime, type TrackNote } from "../src/audio/day-track";

const n = (t: number, p = 60): TrackNote => ({ t, d: 0.5, p, v: 0.5, k: "IST-JFK", from: "IST", to: "JFK", alt: 30000 });

describe("day track", () => {
  const notes = [n(1), n(2), n(2), n(3), n(5)];
  it("notesBetween returns the onsets in (a, b]", () => {
    expect(notesBetween(notes, 1, 3).map((x) => x.t)).toEqual([2, 2, 3]);
    expect(notesBetween(notes, 0, 1).map((x) => x.t)).toEqual([1]);
    expect(notesBetween(notes, 3, 3)).toEqual([]);
    expect(notesBetween(notes, 4, 9).map((x) => x.t)).toEqual([5]);
  });
  it("maps pitch to a register instrument and Hz", () => {
    expect(instrumentOf(40)).toBe("CELLO");
    expect(instrumentOf(60)).toBe("STR");
    expect(instrumentOf(70)).toBe("VIOLIN");
    expect(instrumentOf(80)).toBe("FLUTE");
    expect(hzOfMidi(69)).toBeCloseTo(440);
  });
  it("builds a scope event keyed by the route", () => {
    const e = noteEventOf(n(1, 69), 100);
    expect(e.key).toBe("IST-JFK");
    expect(e.at).toBe(100);
    expect(e.kind).toBe("line");
    expect(e.vel).toBeGreaterThan(0.3);
  });
  it("targetTime seeks only when the drift is large", () => {
    expect(targetTime(0.5, 180, 90.2)).toEqual({ t: 90, seek: false });
    expect(targetTime(0.5, 180, 80).seek).toBe(true);
    expect(targetTime(2, 180, 0).t).toBe(180);
  });
});

import { noteName, playingNow, playingPush, routeColor, routeOfNote } from "../src/audio/scope";

describe("now playing", () => {
  const ev = (lineId: string | undefined, at = 0, freq = 440, durSec = 1) => noteEventOf({ ...n(0, 69), d: durSec }, at) && { ...noteEventOf(n(0, 69), at), lineId, freq, durSec, alt: 34000 };
  it("names notes and reads routes only from track notes", () => {
    expect(noteName(440)).toBe("A4");
    expect(noteName(261.63)).toBe("C4");
    expect(routeOfNote(ev("IST-JFK"))).toBe("IST-JFK");
    expect(routeOfNote(ev("4bb0e9-1791287466"))).toBeNull();
  });
  it("keeps one entry per route, newest first, until the note ends", () => {
    let l = playingPush([], ev("IST-JFK"), 10);
    l = playingPush(l, ev("KUL-SYD", 0, 330), 10.1);
    l = playingPush(l, ev("IST-JFK", 0, 523.25), 10.2);
    expect(l.map((p) => p.route)).toEqual(["IST-JFK", "KUL-SYD"]);
    expect(l[0].note).toBe("C5");
    expect(playingNow(l, 10.5).length).toBe(2);
    expect(playingNow(l, 11.5).length).toBe(0);
  });
  it("gives a route the same colour every time", () => {
    expect(routeColor("IST-JFK")).toBe(routeColor("IST-JFK"));
    expect(routeColor("IST-JFK")).not.toBe(routeColor("KUL-SYD"));
  });
});

import { bestRoute, pcOfRoute } from "../src/audio/route-fit";
import type { SkyFlight } from "../src/audio/lines";

describe("route fit (LIVE)", () => {
  const sky = (key: string, alt100 = 350): SkyFlight => ({ id: key, key, regionIdx: 0, alt100, vsFpm: 0 });
  it("hands a note to a live route and rests that route between notes", () => {
    const one = [sky("IST-JFK")];
    const recent = new Map<string, number>();
    expect(bestRoute(n(0, 60), one, recent, 10)?.key).toBe("IST-JFK");
    recent.set("IST-JFK", 10);
    expect(bestRoute(n(0, 60), one, recent, 10.5)).toBeNull();
    expect(bestRoute(n(0, 60), [sky("4bb0e9-1791287466")], new Map(), 10)).toBeNull();
    expect(pcOfRoute("IST-JFK")).toBe(pcOfRoute("IST-JFK"));
  });
  it("prefers the route whose colour matches the note", () => {
    const routes = ["IST-JFK", "IST-CDG", "AYT-IST", "SAW-ESB", "IST-LHR", "IST-FRA"].map((k) => sky(k));
    const pick = bestRoute(n(0, 62), routes, new Map(), 5)!;
    const dist = (a: number, b: number) => Math.min(Math.abs(a - b) % 12, 12 - (Math.abs(a - b) % 12));
    expect(dist(pcOfRoute(pick.key), 62 % 12)).toBeLessThanOrEqual(1);
  });
});

import { dayLabel, windowAt } from "../src/audio/scope";
describe("day curve", () => {
  it("labels the hour and the airborne count", () => {
    expect(dayLabel({ hour: 7.9, airborne: 158 })).toBe("ROUTES → MUSIC · 07:00 İST · 158 AIRBORNE");
  });
  it("finds the music window of a position", () => {
    expect(windowAt(0, 8)).toBe(0);
    expect(windowAt(0.5, 8)).toBe(4);
    expect(windowAt(1, 8)).toBe(7);
    expect(windowAt(-1, 8)).toBe(0);
  });
});
