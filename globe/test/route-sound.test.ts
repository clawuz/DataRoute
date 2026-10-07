import { describe, expect, it, vi } from "vitest";
import { freqOf } from "../src/audio/theory";
import { SECTIONS } from "../src/audio/form";
import { createRouteSound } from "../src/audio/engine";
import { playNote } from "../src/audio/instruments";
import type { PlannedNote, ScoreEvent } from "../src/audio/score";
import type { NoteEvent } from "../src/audio/notes-bus";

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
class Src extends Node { buffer: unknown = null; loop = false; start = vi.fn(); stop = vi.fn(); onended: (() => void) | null = null; }
class Conv extends Node { buffer: unknown = null; }
class Comp extends Node { threshold = new P(); ratio = new P(); attack = new P(); release = new P(); knee = new P(); }

function fakeCtx() {
  const c = {
    state: "suspended" as string,
    currentTime: 0,
    sampleRate: 48000,
    destination: new Node(),
    oscs: [] as Osc[],
    srcs: [] as Src[],
    gains: [] as Gain[],
    pans: [] as Pan[],
    createOscillator() { const o = new Osc(); c.oscs.push(o); return o; },
    createBufferSource() { const b = new Src(); c.srcs.push(b); return b; },
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
/** The planner's wall clock follows the fake audio clock here, so planned times equal audio times. */
const make = () => {
  const ctx = fakeCtx();
  const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext, now: () => ctx.currentTime });
  return { ctx, s };
};
const BED_OSCS = 4;
const DAY_BEAT = 60 / 96;
const ATHENS = { farLat: 37.9, farLon: 23.7 };
const JFK = { farLat: 40.6398, farLon: -73.7789 };
const NIGHT_H = 2;
const DAY_H = 13;
const ev = (regionIdx: number, o: Partial<ScoreEvent> = {}): ScoreEvent => ({ kind: "dep", key: "IST-FRA", regionIdx, distKm: 2000, at: 0, istanbul: false, ...o });

describe("route sound engine", () => {
  it("creates no audio context until enabled (autoplay rule); scheduling while disabled is a dry run", () => {
    const create = vi.fn(() => fakeCtx() as unknown as AudioContext);
    const clock = { t: 10 };
    const s = createRouteSound({ createContext: create, now: () => clock.t });
    const notes: NoteEvent[] = [];
    s.onNote((n) => notes.push(n));
    s.schedule([ev(1, ATHENS)]);
    s.setEnergy(0.5);
    expect(create).not.toHaveBeenCalled();
    // the wall-clock epoch is 10 (creation): EUR slot 1 has no onset → slot 2 = 0.625 s after the epoch
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ instrument: "EUR", kind: "dep", key: "IST-FRA", vel: 0.65 });
    expect(notes[0].at).toBeCloseTo(10.625, 9);
    expect(notes[0].freq).toBeGreaterThan(0);
    s.dispose();
  });

  it("the planner runs on the wall clock while muted: the ney melody advances and section changes restart the epoch", () => {
    const clock = { t: 0 };
    const s = createRouteSound({ createContext: () => fakeCtx() as unknown as AudioContext, now: () => clock.t });
    const notes: NoteEvent[] = [];
    s.onNote((n) => notes.push(n));
    clock.t = 3;
    s.schedule([ev(6, { istanbul: true })], null, undefined, NIGHT_H); // NIGHT epoch = 3
    expect(notes.filter((n) => n.instrument === "NEY")).toHaveLength(3);
    expect(notes[0].at).toBeCloseTo(3 + 60 / 72 / 2, 9); // first eighth-note slot after the lookahead
    s.dispose();
  });

  it("while enabled, notes play at ctx.currentTime + (when − now())", () => {
    const ctx = fakeCtx();
    const clock = { t: 100 };
    const s = createRouteSound({ createContext: () => ctx as unknown as AudioContext, now: () => clock.t });
    const notes: NoteEvent[] = [];
    s.onNote((n) => notes.push(n));
    s.setEnabled(true);
    ctx.currentTime = 5;
    const before = ctx.oscs.length;
    s.schedule([ev(1, ATHENS)]);
    expect(notes[0].at).toBeCloseTo(100.625, 9);
    expect(ctx.oscs.length - before).toBe(2);
    expect(ctx.oscs[before].start.mock.calls[0][0]).toBeCloseTo(5.625, 9);
    s.dispose();
  });

  it("info() reports the section, the chord at the wall-clock now, the tempo and the ensemble", () => {
    const clock = { t: 0 };
    const s = createRouteSound({ createContext: () => fakeCtx() as unknown as AudioContext, now: () => clock.t });
    expect(s.info()).toEqual({ section: "DAY", chord: "C", bpm: 96, instruments: [...SECTIONS.DAY.instruments] });
    s.schedule([], null, undefined, NIGHT_H);
    expect(s.info()).toEqual({ section: "NIGHT", chord: "Am(add9)", bpm: 72, instruments: [...SECTIONS.NIGHT.instruments] });
    clock.t = 8 * (60 / 72) + 0.01;
    expect(s.info().chord).toBe("Am9");
    s.dispose();
  });

  it("onNote unsubscribes", () => {
    const { s } = make();
    const fn = vi.fn();
    const off = s.onNote(fn);
    s.schedule([ev(1)]);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    s.schedule([ev(1)]);
    expect(fn).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it("enabling builds the graph, resumes the context and starts the four-oscillator chord bed", () => {
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

  it("piano (west Europe) rolls a new chord open: three notes of three partials; the Istanbul ney plays a cell", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    const o0 = ctx.oscs.length;
    s.schedule([ev(1, { farLat: 51.5, farLon: -0.5 })]);
    expect(ctx.oscs.length - o0).toBe(9);
    expect(ctx.srcs).toHaveLength(0);
    s.dispose();
    const n = make();
    n.s.setEnabled(true);
    const before = n.ctx.oscs.length;
    n.s.schedule([ev(6, { istanbul: true })], null, undefined, NIGHT_H); // the night ney plays alone
    expect(n.ctx.oscs.length - before).toBe(9); // 3 notes × (sine + triangle + vibrato LFO)
    expect(n.ctx.srcs).toHaveLength(3); // one breath source per note
    n.s.dispose();
  });

  it("a ney cell on a strong beat adds a grace note (one oscillator)", () => {
    const count = (now: number) => {
      const { ctx, s } = make();
      s.setEnabled(true);
      s.schedule([ev(6)], null, undefined, NIGHT_H); // silent: starts the night epoch at 0
      ctx.currentTime = now;
      const before = ctx.oscs.length;
      s.schedule([ev(6, { istanbul: true })], null, undefined, NIGHT_H);
      s.dispose();
      return ctx.oscs.length - before;
    };
    const beat = 60 / 72;
    expect(count(4 * beat - 0.07)).toBe(10); // slot 8 = beat 4 (strong)
    expect(count(5 * beat - 0.07)).toBe(9); // slot 10 = beat 5
  });

  it("wind voices: clarinet three partials, saxophone a saw plus growl and vibrato LFOs and a breath, trumpet two saws", () => {
    const layout = (instrument: PlannedNote["instrument"]) => {
      const ctx = fakeCtx();
      playNote(ctx as unknown as AudioContext, new Node() as unknown as AudioNode, { when: 1, instrument, freq: 330, vel: 1, kind: "dep", key: "k", long: true }, {
        gainScale: 1, cutoffScale: 1, pan: 0,
      });
      return { oscs: ctx.oscs.length, srcs: ctx.srcs.length, saws: ctx.oscs.filter((o) => o.type === "sawtooth").length };
    };
    expect(layout("CLA")).toEqual({ oscs: 3, srcs: 0, saws: 0 });
    expect(layout("SAX")).toEqual({ oscs: 3, srcs: 1, saws: 1 });
    expect(layout("TPT")).toEqual({ oscs: 2, srcs: 0, saws: 2 });
  });

  it("the day's trumpet answers the phrase cadence; the morning has no trumpet", () => {
    const tptAtCadence = (hour: number) => {
      const { ctx, s } = make();
      s.setEnabled(true);
      const saws: number[] = [];
      // DAY grid as in score.test: cells at 0, 1.3, 2.6, the cadence at 3.9 (same slot maths at 84 BPM in the morning)
      for (const now of [0, 1.3, 2.6, 3.9]) {
        ctx.currentTime = now;
        const before = ctx.oscs.length;
        s.schedule([ev(6, { istanbul: true, ...JFK })], null, undefined, hour);
        saws.push(ctx.oscs.slice(before).filter((o) => o.type === "sawtooth" && o.detune.calls.some((c) => c.args[0] === 6)).length);
      }
      s.dispose();
      return saws;
    };
    expect(tptAtCadence(DAY_H)).toEqual([0, 0, 0, 1]); // the detuned (+6 cent) one of the two trumpet saws
    expect(tptAtCadence(8)).toEqual([0, 0, 0, 0]);
  });

  it("the night ignores instruments outside its ensemble", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    const before = ctx.oscs.length;
    s.schedule([ev(4, { key: "IST-NRT" })], null, undefined, NIGHT_H);
    expect(ctx.oscs.length).toBe(before);
    s.schedule([ev(4, { key: "IST-NRT" })], null, undefined, DAY_H);
    expect(ctx.oscs.length).toBeGreaterThan(before);
    s.dispose();
  });

  it("a section change restarts the epoch and the chord bed and reverb follow the section", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    const rootTargets = () => ctx.oscs[0].frequency.calls.filter((c) => c.fn === "target").map((c) => c.args[0]);
    const wet = ctx.gains.filter((g) => g.gain.value === SECTIONS.DAY.wet); // built in the default (midday) section
    expect(wet).toHaveLength(1);
    const wetTargets = () => wet[0].gain.calls.filter((c) => c.fn === "target").map((c) => c.args[0]);
    s.schedule([ev(6)], null, undefined, NIGHT_H);
    s.setEnergy(0.5);
    expect(rootTargets().at(-1)).toBeCloseTo(freqOf(2, 0), 6); // Am(add9)
    expect(wetTargets()).toEqual([SECTIONS.NIGHT.wet]);
    ctx.currentTime = 1;
    const before = ctx.oscs.length;
    s.schedule([ev(1, ATHENS)], null, undefined, DAY_H);
    // DAY epoch = 1: EUR slot 1 has no onset → slot 2 = 2 · 0.3125 s after the epoch
    expect(ctx.oscs[before].start).toHaveBeenCalledWith(1.625);
    s.setEnergy(0.5);
    expect(rootTargets().at(-1)).toBeCloseTo(freqOf(2, 3), 6); // C
    expect(wetTargets().at(-1)).toBe(SECTIONS.DAY.wet);
    s.dispose();
  });

  it("louder with more traffic: velocity scales with the energy", () => {
    const peak = (energy: number) => {
      const { ctx, s } = make();
      s.setEnabled(true);
      s.setEnergy(energy);
      const before = ctx.gains.length;
      s.schedule([ev(5)]);
      const lin = ctx.gains.slice(before).flatMap((g) => g.gain.calls.filter((c) => c.fn === "lin").map((c) => c.args[0]));
      s.dispose();
      return Math.max(...lin);
    };
    expect(peak(1) / peak(0)).toBeCloseTo(1 / 0.6, 9);
  });

  it("a followed European flight boosts the piano; the ney ignores focus", () => {
    const peaks = (e: ScoreEvent, focus: number | null) => {
      const { ctx, s } = make();
      s.setEnabled(true);
      const before = ctx.gains.length;
      s.schedule([e], { regionIdx: focus, alt100: 300 });
      const lin = ctx.gains.slice(before).flatMap((g) => g.gain.calls.filter((c) => c.fn === "lin").map((c) => c.args[0]));
      s.dispose();
      return Math.max(...lin);
    };
    const pno = ev(1, { farLat: 51.5, farLon: -0.5 });
    expect(peaks(pno, 1)).toBeGreaterThan(peaks(pno, null));
    expect(peaks(pno, null)).toBeGreaterThan(peaks(pno, 4));
    const ney = ev(6, { istanbul: true });
    expect(peaks(ney, 1)).toBeCloseTo(peaks(ney, null), 12);
    expect(peaks(ney, 4)).toBeCloseTo(peaks(ney, null), 12);
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

  it("the chord bed follows the section's progression: C → G after 8 beats by day, in four voices", () => {
    const { ctx, s } = make();
    s.setEnabled(true);
    expect(ctx.oscs.slice(0, 4).map((o) => o.frequency.value)).toEqual([freqOf(2, 3), freqOf(3, 10), freqOf(3, 2), freqOf(4, 10)]); // C: root, fifth, maj7, fifth
    s.setEnergy(0.6);
    ctx.currentTime = 8 * DAY_BEAT + 0.1;
    s.setEnergy(0.6);
    const targets = (i: number) => ctx.oscs[i].frequency.calls.filter((c) => c.fn === "target").map((c) => c.args[0]);
    expect(targets(0)).toEqual([freqOf(2, 10)]); // G root, octave 2
    expect(targets(1)).toEqual([freqOf(3, 5)]); // fifth D
    expect(targets(2)).toEqual([freqOf(3, 2)]); // no seventh → third B
    expect(targets(3)).toEqual([freqOf(4, 5)]); // no ninth → fifth D
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
