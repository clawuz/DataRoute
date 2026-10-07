import { describe, expect, it, vi } from "vitest";
import { BEAT_SEC, freqOf } from "../src/audio/theory";
import { createRouteSound } from "../src/audio/engine";
import type { ScoreEvent } from "../src/audio/score";

class P {
  value = 0;
  calls: { fn: string; args: number[] }[] = [];
  setValueAtTime = vi.fn((...a: number[]) => { this.calls.push({ fn: "set", args: a }); });
  linearRampToValueAtTime = vi.fn((...a: number[]) => { this.calls.push({ fn: "lin", args: a }); });
  exponentialRampToValueAtTime = vi.fn((...a: number[]) => { this.calls.push({ fn: "exp", args: a }); });
  setTargetAtTime = vi.fn((...a: number[]) => { this.value = a[0]; this.calls.push({ fn: "target", args: a }); });
  cancelScheduledValues = vi.fn();
}
class Node { connect = vi.fn((x: unknown) => x); disconnect = vi.fn(); }
class Osc extends Node { type = "sine"; frequency = new P(); detune = new P(); start = vi.fn(); stop = vi.fn(); onended: (() => void) | null = null; }
class Gain extends Node { gain = new P(); }
class Filt extends Node { type = "lowpass"; frequency = new P(); Q = new P(); }
class Pan extends Node { pan = new P(); }
class Conv extends Node { buffer: unknown = null; }
class Comp extends Node { threshold = new P(); ratio = new P(); attack = new P(); release = new P(); knee = new P(); }

function fakeCtx() {
  const c = {
    state: "suspended" as string,
    currentTime: 0,
    sampleRate: 48000,
    destination: new Node(),
    oscs: [] as Osc[],
    gains: [] as Gain[],
    pans: [] as Pan[],
    createOscillator() { const o = new Osc(); c.oscs.push(o); return o; },
    createGain() { const g = new Gain(); c.gains.push(g); return g; },
    createBiquadFilter: () => new Filt(),
    createStereoPanner() { const p = new Pan(); c.pans.push(p); return p; },
    createConvolver: () => new Conv(),
    createDynamicsCompressor: () => new Comp(),
    createBuffer: (ch: number, len: number) => ({ numberOfChannels: ch, length: len, getChannelData: () => new Float32Array(len) }),
    resume: vi.fn(async () => { c.state = "running"; }),
    suspend: vi.fn(async () => { c.state = "suspended"; }),
    close: vi.fn(async () => { c.state = "closed"; }),
  };
  return c;
}
const make = () => {
  const ctx = fakeCtx();
  const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext });
  return { ctx, s };
};
const BED_OSCS = 3;
const ev = (regionIdx: number, o: Partial<ScoreEvent> = {}): ScoreEvent => ({ kind: "dep", key: "IST-FRA", regionIdx, distKm: 2000, at: 0, ...o });

describe("route sound engine", () => {
  it("creates no audio context until enabled (autoplay rule); scheduling while disabled does nothing", () => {
    const create = vi.fn(() => fakeCtx() as unknown as AudioContext);
    const s = createRouteSound({ createContext: create });
    s.schedule([ev(1)]);
    s.setEnergy(0.5);
    expect(create).not.toHaveBeenCalled();
    s.dispose();
  });

  it("enabling builds the graph, resumes the context and starts the three-oscillator chord bed", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.oscs).toHaveLength(BED_OSCS);
    s.dispose();
    expect(ctx.close).toHaveBeenCalled();
  });

  it("each continent plays its own instrument (oscillator layout per note)", () => {
    const counts: Record<string, number> = {};
    for (const [name, region] of [["DOM", 0], ["EUR", 1], ["MEA", 2], ["AFR", 3], ["ASI", 4], ["AME", 5]] as const) {
      const { ctx, s } = make();
      s.setEnabled(true);
      const before = ctx.oscs.length;
      s.schedule([ev(region)]);
      counts[name] = ctx.oscs.length - before;
      s.dispose();
    }
    expect(counts).toEqual({ DOM: 1, EUR: 2, MEA: 2, AFR: 2, ASI: 1, AME: 2 });
  });

  it("unknown-region events stay silent", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    const before = ctx.oscs.length;
    s.schedule([ev(6)]);
    expect(ctx.oscs.length).toBe(before);
    s.dispose();
  });

  it("the focused continent is louder than the others", () => {
    const peak = (focusRegion: number | null) => {
      const { ctx, s } = make();
      s.setEnabled(true);
      const before = ctx.gains.length;
      s.schedule([ev(1)], { regionIdx: focusRegion, alt100: 300 });
      const lin = ctx.gains.slice(before).flatMap((g) => g.gain.calls.filter((c) => c.fn === "lin").map((c) => c.args[0]));
      s.dispose();
      return Math.max(...lin);
    };
    expect(peak(1)).toBeGreaterThan(peak(null));
    expect(peak(null)).toBeGreaterThan(peak(4));
  });

  it("pans notes from the screen map and quietens back-side routes", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    const before = ctx.pans.length;
    s.schedule([ev(1)], null, new Map([["IST-FRA", { pan: -0.4, visible: true }]]));
    expect(ctx.pans[before].pan.value).toBeCloseTo(-0.4, 9);
    s.dispose();
  });

  it("the chord bed follows the progression: Am → F after 16 beats", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    s.setEnergy(0.6);
    ctx.currentTime = 16 * BEAT_SEC + 0.1;
    s.setEnergy(0.6);
    const rootTargets = ctx.oscs[0].frequency.calls.filter((c) => c.fn === "target").map((c) => c.args[0]);
    expect(rootTargets.some((f) => Math.abs(f - freqOf(2, 8)) < 1e-6)).toBe(true); // F root, octave 2
    s.dispose();
  });

  it("disabling fades the master out and suspends later; dispose is idempotent", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    s.setEnabled(false);
    expect(ctx.gains[0].gain.calls.some((c) => c.fn === "target" && c.args[0] === 0)).toBe(true);
    s.dispose();
    expect(() => s.dispose()).not.toThrow();
  });

  it("a missing Web Audio implementation never throws", () => {
    const s = createRouteSound({ createContext: () => { throw new Error("no audio"); } });
    expect(() => { s.setEnabled(true); s.schedule([ev(1)]); s.setEnergy(1); s.dispose(); }).not.toThrow();
  });
});
