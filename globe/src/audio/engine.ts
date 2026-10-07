import { playNote } from "./instruments";
import { CHORDS, type Chord } from "./harmony";
import { chordAtStep, sectionAt, stepDur, type Section, type SectionId } from "./form";
import { selectLines, type SkyFlight } from "./lines";
import { createNoteBus, laneOf, type NoteEvent } from "./notes-bus";
import { initNey, type NeyState } from "./melody";
import { planNotes, planStep, stepTime, type PlannedNote, type ScoreEvent } from "./score";
import { freqOf, type Instrument } from "./theory";

export interface SoundFocus {
  regionIdx: number | null;
  alt100: number;
}

export type Pans = Map<string, { pan: number; visible: boolean }>;

export interface RouteSound {
  setEnabled(on: boolean): void;
  /**
   * The airborne flights (the 12 lines are re-selected from the latest sky on every tick) and the followed flight id;
   * `localHour` (Istanbul local hour of the flight time), when given, selects the section.
   */
  setSky(flights: SkyFlight[], followedId: string | null, localHour?: number): void;
  /**
   * Istanbul-end events → ney cells and winds; `pans` (route key → stereo pan) is kept for the flight lines;
   * `localHour`, when given, selects the section. `focus` is accepted for compatibility: v3 emphasises the followed
   * flight given to `setSky` instead.
   */
  schedule(events: ScoreEvent[], focus?: SoundFocus | null, pans?: Pans, localHour?: number): void;
  /** traffic energy 0..1: velocities × (0.6 + 0.4·e) and the pad bed level */
  setEnergy(e: number): void;
  /** advances the 16th-step clock (plans every step up to `now + LOOKAHEAD_SEC`); runs every 40 ms unless `autoTick: false` */
  tick(): void;
  /** every planned note (also while muted); returns the unsubscribe */
  onNote(fn: (n: NoteEvent) => void): () => void;
  /**
   * The section, the chord at the wall-clock now, the tempo and the ensemble — of `localHour`'s section when given
   * (read-only: planning switches its section on the next `schedule`/`setSky` with an hour), else of the planning section.
   */
  info(localHour?: number): SoundInfo;
  dispose(): void;
}

export interface SoundInfo {
  section: SectionId;
  chord: string;
  bpm: number;
  instruments: Instrument[];
}

/** The planner looks this far ahead of the wall clock. */
export const LOOKAHEAD_SEC = 0.25;
/** Steps later than this behind the wall clock (a stalled or throttled timer) are skipped, not played in a burst. */
export const LATE_SEC = 0.1;
export const TICK_MS = 40;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The four bed voices of a chord: root (oct 2), fifth (oct 3), seventh or third (oct 3), ninth or fifth (oct 4). */
export const bedVoicing = (c: Chord): [number, number][] => [
  [2, c.root],
  [3, c.tones[2]],
  [3, c.tones[3] ?? c.tones[1]],
  [4, c.tones[4] ?? c.tones[2]],
];

const defaultCreate = (): AudioContext => {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return new Ctor!();
};

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  bus: GainNode;
  bedGain: GainNode;
  bed: OscillatorNode[];
  wet: GainNode;
  /** section id + progression index of the bed's chord */
  chordKey: string;
}

const defaultNow = (): number => performance.now() / 1000;

/**
 * The planner runs on the wall clock (`now()`, seconds) as a continuous 16th-step clock (spec §4e) and always plans,
 * also while muted, publishing every note through `onNote`; notes are played only when enabled with an audio context,
 * at `ctx.currentTime + (when − now())`.
 */
export function createRouteSound(opts: { createContext?: () => AudioContext; now?: () => number; autoTick?: boolean } = {}): RouteSound {
  const create = opts.createContext ?? defaultCreate;
  const now = opts.now ?? defaultNow;
  const notes = createNoteBus();
  let g: Graph | null = null;
  let enabled = false;
  let disposed = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let onVis: (() => void) | null = null;
  let onGesture: (() => void) | null = null;
  // the mutable music state: the section, its epoch (wall-clock seconds of step 0), the next unplanned step, the ney
  let section: Section = sectionAt(12);
  let epoch = now();
  let nextStep = 0;
  let neyState: NeyState = initNey(section);
  let energy = 0.5;
  let sky: SkyFlight[] = [];
  let followedId: string | null = null;
  let pans: Pans | undefined;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* silent no-op when Web Audio is missing or blocked */
    }
  };
  const resume = () => safe(() => void g?.ctx.resume()?.catch?.(() => {}));

  /** the step sounding at wall time `t` of the current section (0 before the epoch) */
  const stepAt = (t: number): number => Math.max(0, Math.floor((t - epoch) / stepDur(section)));

  function bedChord(t: number): { chord: Chord; key: string } {
    const bar = Math.floor(stepAt(t) / 16);
    const idx = Math.floor(bar / section.barsPerChord) % section.progression.length;
    return { chord: chordAtStep(stepAt(t), section), key: `${section.id}:${idx}` };
  }

  function switchSection(localHour: number | undefined): void {
    if (localHour === undefined) return;
    const sec = sectionAt(localHour); // art:sound
    if (sec.id === section.id) return;
    section = sec;
    epoch = now();
    nextStep = 0;
    neyState = initNey(sec);
  }

  function build(): Graph {
    const ctx = create();
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    const bus = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    bus.connect(dry);
    dry.connect(master);
    const convolver = ctx.createConvolver();
    const len = Math.floor(2.5 * ctx.sampleRate);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    convolver.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = section.wet;
    bus.connect(convolver);
    convolver.connect(wet);
    wet.connect(master);

    const bedGain = ctx.createGain();
    bedGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    lp.connect(bedGain);
    bedGain.connect(bus);
    const { chord, key } = bedChord(now());
    const types: OscillatorType[] = ["sine", "sine", "triangle", "sine"];
    const bed = bedVoicing(chord).map(([oct, semis], i) => {
      const o = ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = freqOf(oct, semis);
      o.connect(lp);
      o.start();
      return o;
    });
    return { ctx, master, bus, bedGain, bed, wet, chordKey: key };
  }

  function setEnabled(on: boolean): void {
    if (disposed) return;
    safe(() => {
      if (on) {
        enabled = true;
        if (suspendTimer) clearTimeout(suspendTimer);
        suspendTimer = null;
        if (!g) g = build();
        const { ctx, master } = g;
        resume();
        master.gain.setTargetAtTime(1, ctx.currentTime, 0.25);
        if (!onVis && typeof document !== "undefined") {
          onVis = () => {
            if (!g) return;
            if (document.hidden && enabled) safe(() => void g?.ctx.suspend());
            else if (!document.hidden && enabled) resume();
          };
          document.addEventListener("visibilitychange", onVis);
        }
        if (ctx.state === "suspended" && !onGesture && typeof window !== "undefined") {
          onGesture = () => {
            resume();
            removeGesture();
          };
          window.addEventListener("pointerdown", onGesture);
          window.addEventListener("keydown", onGesture);
        }
      } else {
        enabled = false;
        if (!g) return;
        const { ctx, master } = g;
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
        if (suspendTimer) clearTimeout(suspendTimer);
        suspendTimer = setTimeout(() => {
          if (!enabled) safe(() => void g?.ctx.suspend());
        }, 1000);
      }
    });
  }

  function removeGesture(): void {
    if (!onGesture) return;
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    onGesture = null;
  }

  /** publishes every planned note and, when audible, plays it on the audio clock */
  function emit(planned: PlannedNote[], t: number): void {
    for (const n of planned) {
      safe(() =>
        notes.emit({
          instrument: n.instrument, lane: laneOf(n.instrument), freq: n.freq, pitch: n.freq, vel: n.vel, kind: n.kind, key: n.key, at: n.when,
          ...(n.long ? { long: true } : {}), ...(n.lineId !== undefined ? { lineId: n.lineId } : {}),
        }),
      );
    }
    if (!enabled || !g) return;
    const { ctx, bus } = g;
    const dyn = 0.6 + 0.4 * energy;
    for (const n of planned) {
      // art:sound
      const p = n.key ? pans?.get(n.key) : undefined;
      const when = Math.max(ctx.currentTime, ctx.currentTime + (n.when - t)); // wall clock → audio clock
      safe(() =>
        playNote(ctx, bus, { ...n, when }, {
          gainScale: dyn * (p?.visible === false ? 0.3 : 1),
          cutoffScale: 1,
          pan: clamp(p?.pan ?? 0, -1, 1),
        }),
      );
    }
  }

  function tick(): void {
    if (disposed) return;
    safe(() => {
      const t = now();
      const sec = section;
      // after a stall, skip the steps that are already late instead of playing them in a burst
      if (stepTime(nextStep, epoch, sec) < t - LATE_SEC) nextStep = Math.max(nextStep, Math.ceil((t - LATE_SEC - epoch) / stepDur(sec) - 1e-9));
      const lines = selectLines(sky, followedId);
      const planned: PlannedNote[] = [];
      for (; stepTime(nextStep, epoch, sec) <= t + LOOKAHEAD_SEC; nextStep++) planned.push(...planStep(nextStep, { epoch, section: sec }, lines, followedId));
      emit(planned, t);
      if (!enabled || !g) return;
      const { chord, key } = bedChord(t);
      if (key !== g.chordKey) {
        g.chordKey = key;
        const at = g.ctx.currentTime;
        bedVoicing(chord).forEach(([oct, semis], i) => g!.bed[i].frequency.setTargetAtTime(freqOf(oct, semis), at, 1.2));
      }
    });
  }

  function setSky(flights: SkyFlight[], followed: string | null, localHour?: number): void {
    if (disposed) return;
    sky = flights;
    followedId = followed;
    switchSection(localHour);
  }

  function schedule(events: ScoreEvent[], _focus?: SoundFocus | null, p?: Pans, localHour?: number): void {
    if (disposed) return;
    safe(() => {
      if (p) pans = p;
      switchSection(localHour);
      const t = now();
      const plan = planNotes(events, t, { epoch, section, ney: neyState });
      neyState = plan.ney;
      emit(plan.notes, t);
    });
  }

  function setEnergy(e: number): void {
    if (disposed) return;
    energy = clamp(e, 0, 1);
    if (!enabled || !g) return;
    const { ctx, bedGain, wet } = g;
    safe(() => {
      const at = ctx.currentTime;
      bedGain.gain.setTargetAtTime(0.035 * energy ** 0.7, at, 0.8);
      wet.gain.setTargetAtTime(section.wet, at, 1.5);
    });
  }

  function info(localHour?: number): SoundInfo {
    const sec = localHour === undefined ? section : sectionAt(localHour);
    // a section the planner has not switched to yet starts at its first chord
    const chord = sec.id === section.id ? chordAtStep(stepAt(now()), sec) : CHORDS[sec.progression[0]];
    return { section: sec.id, chord: chord.name, bpm: sec.bpm, instruments: [...sec.instruments] };
  }

  const timer = opts.autoTick === false ? null : setInterval(tick, TICK_MS);

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    enabled = false;
    if (timer) clearInterval(timer);
    if (suspendTimer) clearTimeout(suspendTimer);
    suspendTimer = null;
    removeGesture();
    if (onVis) document.removeEventListener("visibilitychange", onVis);
    onVis = null;
    const cur = g;
    g = null;
    if (!cur) return;
    safe(() => {
      for (const o of cur.bed) {
        safe(() => o.stop());
        safe(() => o.disconnect());
      }
      void cur.ctx.close()?.catch?.(() => {});
    });
  }

  return { setEnabled, setSky, schedule, setEnergy, tick, onNote: (fn) => notes.subscribe(fn), info, dispose };
}
