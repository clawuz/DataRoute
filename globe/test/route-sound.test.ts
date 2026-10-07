import { afterEach, describe, expect, it, vi } from "vitest";
import { freqOf } from "../src/audio/theory";
import { SECTIONS } from "../src/audio/form";
import { createRouteSound } from "../src/audio/engine";
import { playNote, type SynthNote } from "../src/audio/instruments";
import { linePattern, lineGain, type SkyFlight } from "../src/audio/lines";
import { LINE_VEL, stepTime, type ScoreEvent } from "../src/audio/score";
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
    filts: [] as Filt[],
    createOscillator() { const o = new Osc(); c.oscs.push(o); return o; },
    createBufferSource() { const b = new Src(); c.srcs.push(b); return b; },
    createGain() { const g = new Gain(); c.gains.push(g); return g; },
    createBiquadFilter() { const f = new Filt(); c.filts.push(f); return f; },
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
type FakeCtx = ReturnType<typeof fakeCtx>;

const { DAY, NIGHT } = SECTIONS;
const D = 60 / 116 / 4; // DAY 16th step
const DN = 60 / 84 / 4; // NIGHT 16th step
const NIGHT_H = 2;
const BED_OSCS = 0; // the continuous pad bed was removed: music is discrete notes only

/** an engine on a manual clock (no interval); `ctx` is created on enable */
function make(t0 = 0) {
  const ctx = fakeCtx();
  const clock = { t: t0 };
  const create = vi.fn(() => ctx as unknown as AudioContext);
  const s = createRouteSound({ createContext: create, now: () => clock.t, autoTick: false });
  const notes: NoteEvent[] = [];
  s.onNote((n) => notes.push(n));
  /** advance the clock to `t` and tick */
  const at = (t: number) => {
    clock.t = t;
    s.tick();
  };
  /** tick every 40 ms from the current time up to `t` */
  const run = (t: number) => {
    while (clock.t + 0.04 <= t + 1e-9) at(clock.t + 0.04);
  };
  return { ctx, clock, create, s, notes, at, run };
}
const stepOf = (n: NoteEvent, epoch = 0, d = D) => Math.round((n.at - epoch) / d);
const stepsOf = (notes: NoteEvent[], inst: string, epoch = 0, d = D) => notes.filter((n) => n.instrument === inst).map((n) => stepOf(n, epoch, d));
const sky = (id: string, o: Partial<SkyFlight> = {}): SkyFlight => ({ id, key: `IST-${id}`, regionIdx: 1, alt100: 350, vsFpm: 0, ...o });
const ev = (o: Partial<ScoreEvent> = {}): ScoreEvent => ({ kind: "dep", key: "IST-FRA", regionIdx: 1, distKm: 2000, at: 0, istanbul: true, ...o });
const peaks = (ctx: FakeCtx, from: number) => ctx.gains.slice(from).flatMap((g) => g.gain.calls.filter((c) => c.fn === "lin").map((c) => c.args[0]));

afterEach(() => {
  vi.useRealTimers();
});

describe("route sound engine: the step clock", () => {
  it("creates no audio context until enabled; ticking while disabled is a dry run publishing every note", () => {
    const h = make(10);
    h.s.setSky([sky("A")], null);
    h.at(10);
    h.s.setEnergy(0.5);
    expect(h.create).not.toHaveBeenCalled();
    // horizon 10.25: steps 0 (10) and 1 (10 + 1.1 · 0.1293); step 2 (10.259) is later
    expect([...new Set(h.notes.map((n) => n.at))]).toEqual([10, stepTime(1, 10, DAY)]);
    expect(h.notes.filter((n) => n.at === 10).map((n) => n.instrument).sort()).toEqual(
      ["BASS", "HAT", "KICK", ...(linePattern("A")[0] ? ["EUR"] : [])].sort(),
    );
    h.s.dispose();
  });

  it("plans each step once on epoch + k · stepDur + swing, ticking at several times", () => {
    const h = make(10);
    h.at(10);
    h.at(10.3); // horizon 10.55: steps 2, 3, 4 (step 5 = 10.66)
    h.at(10.3); // nothing new
    const times = [...new Set(h.notes.map((n) => n.at))];
    expect(times.length).toBe(5);
    times.forEach((t, k) => expect(t).toBeCloseTo(stepTime(k, 10, DAY), 12));
    expect(h.notes.filter((n) => n.instrument === "KICK")).toHaveLength(1); // step 0 only, not twice
    h.s.dispose();
  });

  it("drum and bass hits land on the groove steps (DAY bar 0: kick 0, 6, 10)", () => {
    const h = make(0);
    h.at(0);
    h.run(16 * D - 0.3); // the whole first bar is planned (horizon 0.25 s ahead), not the next downbeat
    expect(stepsOf(h.notes, "KICK")).toEqual([0, 6, 10]);
    expect(stepsOf(h.notes, "SNARE")).toEqual([4, 12]);
    expect(stepsOf(h.notes, "OHAT")).toEqual([14]);
    expect(stepsOf(h.notes, "BASS")).toEqual([0, 3, 6, 8, 11, 14]);
    expect(stepsOf(h.notes, "KEYS")).toEqual([2, 7, 10]);
    expect(stepsOf(h.notes, "BRASS")).toEqual([3, 11]);
    const kick = h.notes.find((n) => n.instrument === "KICK")!;
    expect(kick).toMatchObject({ lane: "KICK", kind: "groove", key: "", vel: 1 });
    expect(h.notes.find((n) => n.instrument === "OHAT")!.lane).toBe("HAT"); // the open hat shares the hat lane
    h.s.dispose();
  });

  it("flight lines: notes only on each flight's euclidean steps, at most 12 lines, the followed flight always among them", () => {
    const h = make(0);
    const flights: SkyFlight[] = [];
    for (let i = 0; i < 24; i++) flights.push(sky(`F${i}`, { key: `IST-R${i % 6}`, regionIdx: i % 6, alt100: 50 + 15 * i }));
    flights.push(sky("SOLO", { key: "IST-SOLO", regionIdx: 1 })); // alone on its route: last in the ranking
    h.s.setSky(flights, "SOLO");
    h.at(0);
    h.run(32 * D - 0.3);
    const lines = h.notes.filter((n) => n.kind === "line");
    const ids = new Set(lines.map((n) => n.lineId));
    expect(ids.size).toBe(12);
    expect(ids.has("SOLO")).toBe(true);
    for (const n of lines) {
      expect(linePattern(n.lineId!)[stepOf(n) % 16]).toBe(true);
      expect(n.lane).toBe(n.instrument);
      expect(n.pitch).toBe(n.freq);
      expect(n.key).toBe(flights.find((f) => f.id === n.lineId)!.key);
    }
    const vel = (id: string) => lines.find((n) => n.lineId === id)!.vel;
    expect(vel("SOLO")).toBeCloseTo(1.4 * LINE_VEL * lineGain(12), 12);
    const other = [...ids].find((id) => id !== "SOLO")!;
    expect(vel(other)).toBeCloseTo(LINE_VEL * lineGain(12), 12);
    h.s.dispose();
  });

  it("the lines are re-selected on every tick from the latest sky", () => {
    const h = make(0);
    h.s.setSky([sky("A")], null);
    h.at(0);
    h.s.setSky([sky("B")], null);
    h.run(16 * D - 0.3);
    const later = h.notes.filter((n) => n.kind === "line" && n.at > 0.25);
    expect(new Set(later.map((n) => n.lineId))).toEqual(new Set(["B"]));
    h.s.dispose();
  });

  it("a stall skips the steps that are already late instead of playing them all at once", () => {
    const h = make(0);
    h.at(0);
    h.at(5);
    const late = h.notes.filter((n) => n.at > 0.25);
    expect(Math.min(...late.map((n) => n.at))).toBeGreaterThanOrEqual(5 - 0.1);
    expect(Math.max(...late.map((n) => n.at))).toBeLessThanOrEqual(5.25);
    h.s.dispose();
  });

  it("muted and enabled engines publish the same notes", () => {
    const a = make(0);
    const b = make(0);
    b.s.setEnabled(true);
    for (const h of [a, b]) {
      h.s.setSky([sky("A"), sky("B", { regionIdx: 4, alt100: 120 })], "B");
      h.s.schedule([ev()], null, undefined, 13);
      h.run(2);
    }
    expect(b.notes.length).toBeGreaterThan(30);
    expect(b.notes).toEqual(a.notes);
    a.s.dispose();
    b.s.dispose();
  });

  it("while enabled, notes play at ctx.currentTime + (when − now())", () => {
    const h = make(100);
    h.s.setEnabled(true);
    h.ctx.currentTime = 5;
    const o0 = h.ctx.oscs.length;
    h.at(100);
    const kick = h.ctx.oscs.slice(o0).find((o) => o.frequency.calls.some((c) => c.fn === "set" && c.args[0] === 130))!;
    expect(kick.start.mock.calls[0][0]).toBe(5);
    const hat1 = h.ctx.srcs.at(-1)!; // the step-1 hat (the last noise burst planned)
    expect(hat1.start.mock.calls[0][0]).toBeCloseTo(5 + 1.1 * D, 9);
    h.s.dispose();
  });

  it("a section change resets the epoch, re-plans from step 0 and restarts the ney", () => {
    const h = make(0);
    h.at(0);
    h.clock.t = 3;
    h.s.setSky([], null, NIGHT_H);
    expect(h.s.info()).toMatchObject({ section: "NIGHT", bpm: 84, chord: "Dm9" });
    h.notes.length = 0;
    h.at(3);
    // NIGHT step 0 at the new epoch 3: kick, the long bass and the first arpeggio note; step 1 (3.205) has no hits
    expect(h.notes.map((n) => [n.instrument, n.at]).sort()).toEqual([["BASS", 3], ["KEYS", 3], ["KICK", 3]]);
    expect(h.notes.find((n) => n.instrument === "BASS")!.long).toBe(true);
    h.notes.length = 0;
    h.s.schedule([ev()], null, undefined, NIGHT_H);
    const ney = h.notes.filter((n) => n.instrument === "NEY");
    expect(ney.map((n) => stepOf(n, 3, DN))).toEqual([2, 4, 6]); // even steps of the NIGHT clock from epoch 3
    for (const n of ney) expect(12 * Math.log2(n.freq / 110)).toBeLessThanOrEqual(31 + 1e-9); // the night ney window A3 … E5
    h.s.schedule([ev()], null, undefined, 13); // back to DAY via schedule
    expect(h.s.info().section).toBe("DAY");
    h.s.dispose();
  });

  it("schedule plays Istanbul events as a ney cell on the step clock (other events are ignored)", () => {
    const h = make(0);
    h.s.schedule([ev({ istanbul: false })]);
    expect(h.notes).toEqual([]);
    h.s.schedule([ev()]);
    expect(h.notes.map((n) => [n.instrument, stepOf(n)])).toEqual([["CLA", 2], ["NEY", 2], ["CLA", 4], ["NEY", 4], ["CLA", 6], ["NEY", 6]]);
    expect(h.notes.every((n) => n.kind === "dep" && n.key === "IST-FRA" && n.lineId === undefined)).toBe(true);
    h.s.dispose();
  });

  it("onNote unsubscribes", () => {
    const h = make(0);
    const fn = vi.fn();
    const off = h.s.onNote(fn);
    h.at(0);
    const n = fn.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    off();
    h.at(1);
    expect(fn).toHaveBeenCalledTimes(n);
    h.s.dispose();
  });

  it("autoTick drives the clock every 40 ms; dispose clears the interval", () => {
    vi.useFakeTimers();
    const clock = { t: 0 };
    const s = createRouteSound({ createContext: () => fakeCtx() as unknown as AudioContext, now: () => clock.t });
    const fn = vi.fn();
    s.onNote(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    s.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("route sound engine: graph, info, dynamics", () => {
  it("enabling builds the graph and resumes the context; no oscillator exists until a note is played", () => {
    const h = make(0);
    h.s.setEnabled(true);
    expect(h.ctx.resume).toHaveBeenCalled();
    expect(h.ctx.oscs).toHaveLength(BED_OSCS);
    h.s.dispose();
    expect(h.ctx.close).toHaveBeenCalled();
  });

  it("info() chord follows the step clock: Dm9 in bar 0, Bbmaj7 in bar 1 by day", () => {
    const h = make(0);
    expect(h.s.info().chord).toBe("Dm9");
    h.clock.t = 16 * D + 0.01;
    expect(h.s.info().chord).toBe("Bbmaj7");
    h.s.dispose();
  });

  it("the reverb follows the section", () => {
    const h = make(0);
    h.s.setEnabled(true);
    const wet = h.ctx.gains.filter((g) => g.gain.value === DAY.wet);
    expect(wet).toHaveLength(1);
    h.s.setSky([], null, NIGHT_H);
    h.s.setEnergy(0.5);
    expect(wet[0].gain.calls.filter((c) => c.fn === "target").map((c) => c.args[0])).toEqual([NIGHT.wet]);
    h.s.dispose();
  });

  it("info() reports the section, the chord at the wall-clock now, the tempo and the ensemble; info(hour) is read-only", () => {
    const h = make(0);
    expect(h.s.info()).toEqual({ section: "DAY", chord: "Dm9", bpm: 116, instruments: [...DAY.instruments] });
    h.clock.t = 3 * 16 * D + 0.01;
    expect(h.s.info().chord).toBe("C7(9)");
    expect(h.s.info(2)).toMatchObject({ section: "NIGHT", bpm: 84, chord: "Dm9" });
    expect(h.s.info(20)).toMatchObject({ section: "EVENING", bpm: 92, chord: "Fmaj7" });
    expect(h.s.info().section).toBe("DAY");
    h.s.dispose();
  });

  it("louder with more traffic: velocity scales with 0.6 + 0.4 · energy", () => {
    const peak = (energy: number) => {
      const h = make(0);
      h.s.setEnabled(true);
      h.s.setEnergy(energy);
      const g0 = h.ctx.gains.length;
      h.at(0);
      const p = Math.max(...peaks(h.ctx, g0));
      h.s.dispose();
      return p;
    };
    expect(peak(1) / peak(0)).toBeCloseTo(1 / 0.6, 9);
  });

  it("line notes take the stereo pan of their route and back-side routes are quieter; the groove stays centred", () => {
    const run = (visible: boolean) => {
      const h = make(0);
      h.s.setEnabled(true);
      h.s.setSky([sky("A", { key: "IST-JFK", regionIdx: 4 })], null); // ASI: the only triangle voice
      h.s.schedule([], null, new Map([["IST-JFK", { pan: -0.4, visible }]]));
      const p0 = h.ctx.pans.length;
      const o0 = h.ctx.oscs.length;
      h.run(16 * D - 0.3);
      const pans = h.ctx.pans.slice(p0).map((p) => p.pan.value);
      const lineOscs = h.ctx.oscs.slice(o0).filter((o) => o.type === "triangle");
      // triangle → lowpass → envelope gain: its peak
      const peak = (o: Osc) => {
        const filt = o.connect.mock.calls[0][0] as Filt;
        const g = filt.connect.mock.calls[0][0] as Gain;
        return g.gain.calls.find((c) => c.fn === "lin")!.args[0];
      };
      const out = { pans, lines: lineOscs.length, peak: peak(lineOscs[0]) };
      h.s.dispose();
      return out;
    };
    const vis = run(true);
    const steps = linePattern("A").filter(Boolean).length;
    expect(vis.lines).toBe(steps);
    expect(vis.pans.filter((p) => p === -0.4)).toHaveLength(steps);
    expect(vis.pans.filter((p) => p !== -0.4).every((p) => p === 0)).toBe(true);
    expect(run(false).peak / vis.peak).toBeCloseTo(0.3, 9);
  });

  it("disabling fades the master out; dispose is idempotent; a missing Web Audio never throws", () => {
    const h = make(0);
    h.s.setEnabled(true);
    h.s.setEnabled(false);
    expect(h.ctx.gains[0].gain.calls.some((c) => c.fn === "target" && c.args[0] === 0)).toBe(true);
    h.s.dispose();
    expect(() => h.s.dispose()).not.toThrow();
    const s = createRouteSound({ createContext: () => { throw new Error("no audio"); }, autoTick: false });
    expect(() => { s.setEnabled(true); s.setSky([sky("A")], "A"); s.tick(); s.schedule([ev()]); s.setEnergy(1); s.dispose(); }).not.toThrow();
  });
});

describe("instrument recipes (one scheduled hit each)", () => {
  const layout = (instrument: SynthNote["instrument"], o: Partial<SynthNote> = {}) => {
    const ctx = fakeCtx();
    playNote(ctx as unknown as AudioContext, new Node() as unknown as AudioNode, { when: 1, instrument, freq: 220, vel: 1, ...o }, {
      gainScale: 1, cutoffScale: 1, pan: 0,
    });
    return {
      oscs: ctx.oscs.length,
      srcs: ctx.srcs.length,
      filters: ctx.filts.map((f) => `${f.type}:${f.frequency.calls[0]?.args[0]}`),
      ctx,
    };
  };
  const decays = (ctx: FakeCtx) => ctx.gains.flatMap((g) => g.gain.calls.filter((c) => c.fn === "exp").map((c) => +(c.args[1] - 1).toFixed(4)));

  it("Rhodes (EP): sine f, sine 2f, a short 7f tine; tremolo without an extra oscillator", () => {
    const r = layout("EP");
    expect([r.oscs, r.srcs, r.filters]).toEqual([3, 0, []]);
    expect(r.ctx.oscs.map((o) => [o.type, o.frequency.calls[0].args[0]])).toEqual([["sine", 220], ["sine", 440], ["sine", 1540]]);
    expect(decays(r.ctx).slice(0, 3)).toEqual([0.905, 0.355, 0.085]); // attack 0.005 + decay 0.9 / 0.35 / 0.08
    const peaks = r.ctx.gains.flatMap((g) => g.gain.calls.filter((c) => c.fn === "lin" && c.args[1] === 1.005).map((c) => +c.args[0].toFixed(6)));
    expect(peaks).toEqual([0.22, +(0.22 * 0.35).toFixed(6), +(0.22 * 0.12).toFixed(6)]);
  });
  it("bass: sine plus a lowpassed saw (600 Hz × (0.6 + vel)); long notes ring 1.2 s", () => {
    const r = layout("BASS", { vel: 0.8 });
    expect([r.oscs, r.srcs]).toEqual([2, 0]);
    expect(r.ctx.oscs.map((o) => o.type)).toEqual(["sine", "sawtooth"]);
    expect(r.ctx.filts.map((f) => f.type)).toEqual(["lowpass"]);
    expect(r.ctx.filts[0].frequency.calls[0].args[0]).toBeCloseTo(600 * (0.6 + 0.8), 9);
    expect(decays(r.ctx)).toEqual([0.29, 0.29]);
    expect(decays(layout("BASS", { long: true }).ctx)).toEqual([1.21, 1.21]);
  });
  it("kick: one sine falling 130 → 45 Hz over 80 ms", () => {
    const r = layout("KICK");
    expect([r.oscs, r.srcs, r.filters]).toEqual([1, 0, []]);
    const f = r.ctx.oscs[0].frequency.calls;
    expect(f[0]).toEqual({ fn: "set", args: [130, 1] });
    expect(f[1].fn).toBe("exp");
    expect(f[1].args[0]).toBe(45);
    expect(f[1].args[1]).toBeCloseTo(1.08, 12);
  });
  it("snare: a highpassed noise burst plus a 180 Hz tone; hats: highpassed noise, closed 45 ms, open 220 ms", () => {
    const sn = layout("SNARE");
    expect([sn.oscs, sn.srcs, sn.filters]).toEqual([1, 1, ["highpass:1200"]]);
    expect(sn.ctx.oscs[0].frequency.calls[0].args[0]).toBe(180);
    const hat = layout("HAT");
    expect([hat.oscs, hat.srcs, hat.filters]).toEqual([0, 1, ["highpass:7000"]]);
    expect(decays(hat.ctx)).toEqual([0.047]);
    const open = layout("OHAT");
    expect([open.oscs, open.srcs, open.filters]).toEqual([0, 1, ["highpass:7000"]]);
    expect(decays(open.ctx)).toEqual([0.222]);
  });
  it("keys comp: one Rhodes per voicing tone; brass stab: trumpet on the two lower tones, sax on the third; sax pad = sax", () => {
    expect(layout("KEYS", { freqs: [220, 260, 330, 390] }).oscs).toBe(4 * 3);
    expect(layout("KEYS").oscs).toBe(3); // the night arpeggio: one tone
    const brass = layout("BRASS", { freqs: [440, 520, 660] });
    expect([brass.oscs, brass.srcs]).toEqual([2 * 2 + 3, 1]);
    expect(brass.ctx.oscs.filter((o) => o.type === "sawtooth").length).toBe(5);
    expect(Math.max(...decays(brass.ctx))).toBeLessThanOrEqual(0.35 + 0.05 + 1e-9); // short: decay ≤ 0.35 after the attack
    expect(layout("SAXPAD", { long: true })).toMatchObject({ oscs: 3, srcs: 1 });
  });
  it("the kept recipes: line instruments, ney (grace adds one oscillator) and winds", () => {
    const n = (i: SynthNote["instrument"], o: Partial<SynthNote> = {}) => {
      const r = layout(i, o);
      return [r.oscs, r.srcs];
    };
    expect({ PNO: n("PNO"), EUR: n("EUR"), MEA: n("MEA"), AFR: n("AFR"), ASI: n("ASI"), AME: n("AME") }).toEqual({
      PNO: [3, 0], EUR: [2, 0], MEA: [2, 0], AFR: [2, 0], ASI: [1, 0], AME: [2, 0],
    });
    expect(n("NEY")).toEqual([3, 1]); // sine + triangle + vibrato LFO, breath
    expect(n("NEY", { graceFreq: 247 })).toEqual([4, 1]);
    expect({ CLA: n("CLA", { long: true }), SAX: n("SAX", { long: true }), TPT: n("TPT", { long: true }) }).toEqual({
      CLA: [3, 0], SAX: [3, 1], TPT: [2, 0],
    });
    expect(n("DOM")).toEqual([0, 0]); // no event instrument for the domestic region any more (its lines are Rhodes)
  });
});
