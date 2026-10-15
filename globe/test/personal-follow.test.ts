import { describe, expect, it } from "vitest";
import { analyze } from "../src/personal/analyze";
import { assignToRoutes } from "../src/personal/follow";
import { buildRoutes } from "../src/personal/routes";

/** a few plucked tones: [start s, Hz, length s] */
function tones(list: [number, number, number][], seconds: number, sr = 22050): Float32Array {
  const x = new Float32Array(Math.floor(seconds * sr));
  for (const [t0, hz, len] of list) {
    const a = Math.floor(t0 * sr);
    const m = Math.floor(len * sr);
    for (let i = 0; i < m && a + i < x.length; i++) {
      const env = Math.min(1, i / (0.004 * sr)) * Math.exp(-3 * (i / sr) / len * 3);
      x[a + i] += 0.6 * env * (Math.sin((2 * Math.PI * hz * i) / sr) + 0.3 * Math.sin((4 * Math.PI * hz * i) / sr));
    }
  }
  return x;
}

describe("listening to a piece of audio", () => {
  const list: [number, number, number][] = [[0.5, 220, 0.8], [1.5, 330, 0.8], [2.5, 440, 0.8], [3.5, 262, 0.8], [4.5, 392, 0.8]];
  const x = tones(list, 6);
  it("finds the notes, when they begin and what pitch they have", () => {
    const got = analyze(x, 22050);
    expect(got.length).toBeGreaterThanOrEqual(5);
    for (const [t0, hz] of list) {
      const near = got.filter((o) => Math.abs(o.t - t0) < 0.08);
      expect(near.length, `onset near ${t0}`).toBeGreaterThan(0);
      const o = near[0];
      expect(o.voiced).toBe(true);
      expect(Math.abs(o.midi - (69 + 12 * Math.log2(hz / 440)))).toBeLessThan(0.7);
    }
  });
  it("hears nothing in silence", () => {
    expect(analyze(new Float32Array(22050 * 4), 22050)).toEqual([]);
  });
});

describe("handing the heard notes to the routes", () => {
  const routes = buildRoutes(["DPS", "JFK", "NRT"], "IST");
  const on = [0.5, 1, 1.4, 2, 2.2, 3, 3.1, 4, 5, 5.2].map((t, i) => ({ t, d: 0.5, midi: 48 + (i % 7) * 3, vel: 0.7, voiced: true }));
  it("gives every note to one route, and a route one note at a time", () => {
    const notes = assignToRoutes(on, routes);
    expect(notes.length).toBeGreaterThan(5);
    for (const n of notes) {
      expect(n.route).toBeGreaterThanOrEqual(0);
      expect(n.route).toBeLessThan(routes.length);
      expect(n.key).toBe(routes[n.route].key);
    }
    for (let r = 0; r < routes.length; r++) {
      const mine = notes.filter((n) => n.route === r).sort((a, b) => a.t - b.t);
      for (let k = 0; k + 1 < mine.length; k++) expect(mine[k].t + mine[k].d).toBeLessThanOrEqual(mine[k + 1].t + 0.08 + 1e-6);
    }
  });
  it("is the same every time", () => {
    expect(assignToRoutes(on, routes)).toEqual(assignToRoutes(on, routes));
  });
});
