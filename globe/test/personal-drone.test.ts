import { describe, expect, it } from "vitest";
import { clipNotes, clipStart, composePiece } from "../src/personal/compose";
import { buildRoutes } from "../src/personal/routes";
import { droneVoice } from "../src/personal/world-voices";

const bars = (p: ReturnType<typeof composePiece>): number => (60 / p.bpm) * 4;
const drone = (p: ReturnType<typeof composePiece>) => p.notes.filter((n) => n.show === false && n.route === 0 && n.vel > 0 && n.pan === 0);

describe("home drone", () => {
  it("is chosen by the card of home, with a held low voice as the default", () => {
    expect(droneVoice("hindustani")).toBe("TANPURA");
    expect(droneVoice("celtic")).toBe("BAGPIPE_DRONE");
    expect(droneVoice("baroque")).toBe("RENORGAN");
    expect(droneVoice("anything-else")).toBe("CELLO");
  });
  const routes = buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST");
  const p = composePiece("visited", routes);
  it("belongs to the first route, is not drawn again and sounds from the start", () => {
    const d = drone(p);
    expect(d.length).toBeGreaterThan(4);
    expect(d.every((n) => n.route === 0 && n.show === false)).toBe(true);
    expect(Math.min(...d.map((n) => n.t))).toBeLessThan(2 * bars(p));
  });
  it("is silent in the break and in the lifted bars, and back in the outro", () => {
    const d = drone(p);
    const inBars = (a: number, b: number): number => d.filter((n) => n.t >= a * bars(p) - 1e-6 && n.t < b * bars(p) - 1e-6).length;
    expect(inBars(44, 52)).toBe(0); // the lifted bars (visited trip across regions)
    expect(inBars(52, 56)).toBe(0); // the break
    expect(inBars(56, 64)).toBeGreaterThan(0); // the outro: home again
    expect(inBars(8, 44)).toBeGreaterThan(0);
    for (const n of d) expect(n.t + n.d).toBeLessThanOrEqual(44 * bars(p) + 1e-6 + (n.t >= 56 * bars(p) ? 1e9 : 0));
  });
  it("is the tonic and its fifth, in the octave of the bass", () => {
    const pcs = new Set(drone(p).map((n) => ((Math.round(12 * Math.log2(n.freq / 110)) % 12) + 12) % 12));
    expect(pcs.size).toBe(2);
    const [a, b] = [...pcs].sort((x, y) => x - y);
    expect([(b - a) % 12, (a - b + 12) % 12]).toContain(7);
  });
  it("is not in a solo piece, and does not change the composition of the same selection", () => {
    expect(drone(composePiece("visited", buildRoutes(["JFK"], "IST"))).length).toBe(0);
    expect(JSON.stringify(composePiece("visited", routes).notes)).toBe(JSON.stringify(p.notes));
  });
});

describe("clipNotes", () => {
  const p = composePiece("visited", buildRoutes(["JFK", "NRT", "LHR", "DEL"], "IST"));
  const base = { instrument: "CELLO" as const, freq: 110, vel: 0.5, key: "k", route: 0, via: 0, alt: 0 };
  it("keeps a downbeat that humanize moved a few ms before the clip's start, at 0", () => {
    const got = clipNotes([{ ...base, t: 9.985, d: 0.5 }, { ...base, t: 9.5, d: 0.2 }, { ...base, t: 11, d: 0.5 }], 10);
    expect(got.map((n) => n.t)).toEqual([0, 1]);
  });
  it("keeps the drone still sounding at the start, trimmed to begin with the clip", () => {
    const got = clipNotes([{ ...base, t: 8, d: 4, drawDur: 4, show: false }, { ...base, t: 6, d: 3, show: false }], 10);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ t: 0, d: 2, drawDur: 2, show: false });
  });
  it("carries a hidden note across the start only while it has more than 0.2 s left (not the tail of a tremolo)", () => {
    const hid = (t: number, d: number) => ({ ...base, t, d, show: false });
    // a clip that starts in the middle of a tremolo: the hits of 75 ms and the short end of a note are not carried
    const got = clipNotes([hid(9.95, 0.075), hid(9.9, 0.25), hid(9.8, 0.5), hid(8, 4)], 10);
    expect(got.map((n) => [n.t, +n.d.toFixed(3)])).toEqual([[0, 0.3], [0, 2]]);
  });
  it("gives a real piece's clip a downbeat and the drone at once", () => {
    const from = clipStart(p);
    const clip = clipNotes(p.notes, from);
    expect(clip.some((n) => n.show === false && n.t === 0)).toBe(true);
    expect(clip.filter((n) => n.show !== false && n.t < 0.03).length).toBeGreaterThan(0);
    expect(clip.every((n) => n.t >= 0)).toBe(true);
  });
});
