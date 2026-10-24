import { describe, expect, it } from "vitest";
import { composePiece } from "../src/personal/compose";
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
