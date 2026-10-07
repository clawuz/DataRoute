import { playNote } from "./instruments";
import { CHORDS } from "./harmony";
import { REGIONS } from "@web/data/palette";
import {
  activeLayers, buildup, intensityOf, levelFor, nextLevel, regionShares, smoothIntensity, type BuildPhase, type Level,
} from "./arrangement";
import { chordAtStep, hoursToBoundary, sectionAt, stepDur, type Section, type SectionId } from "./form";
import { MAX_LINES, selectLines, type SkyFlight } from "./lines";
import { createNoteBus, laneOf, type NoteEvent } from "./notes-bus";
import { initNey, type NeyState } from "./melody";
import { planNotes, planStep, stepTime, type PlannedNote, type ScoreEvent, type StepArrangement } from "./score";
import { type Instrument, type RegionName } from "./theory";

export interface SoundFocus {
  regionIdx: number | null;
  alt100: number;
}

export type Pans = Map<string, { pan: number; visible: boolean }>;

export interface RouteSound {
  setEnabled(on: boolean): void;
  /**
   * The airborne flights (the 12 lines are re-selected from the latest sky on every tick, among the active region
   * layers) and the followed flight id; `localHour` (Istanbul local hour of the flight time), when given, selects the
   * section and times the build-ups; `replay` (default false) enables the build-ups into each section boundary;
   * `airborne` (default `flights.length`) is the unfiltered airborne count that drives the rhythm level.
   */
  setSky(flights: SkyFlight[], followedId: string | null, localHour?: number, replay?: boolean, airborne?: number): void;
  /**
   * Istanbul-end events → ney cells and winds; `pans` (route key → stereo pan) is kept for the flight lines;
   * `localHour`, when given, selects the section. `focus` is accepted for compatibility: v3 emphasises the followed
   * flight given to `setSky` instead.
   */
  schedule(events: ScoreEvent[], focus?: SoundFocus | null, pans?: Pans, localHour?: number): void;
  /** traffic energy 0..1: velocities × (0.6 + 0.4·e) (the reverb returns to the section's level) */
  setEnergy(e: number): void;
  /** advances the 16th-step clock (plans every step up to `now + LOOKAHEAD_SEC`); runs every 40 ms unless `autoTick: false` */
  tick(): void;
  /** every planned note (also while muted); returns the unsubscribe */
  onNote(fn: (n: NoteEvent) => void): () => void;
  /**
   * The section, the chord at the wall-clock now, the tempo and the ensemble — of `localHour`'s section when given
   * (read-only: planning switches its section on the next `schedule`/`setSky` with an hour), else of the planning section;
   * the rhythm level, the active region layers (in `REGIONS` order) and the build phase of the latest planned bar.
   */
  info(localHour?: number): SoundInfo;
  dispose(): void;
}

export interface SoundInfo {
  section: SectionId;
  chord: string;
  bpm: number;
  instruments: Instrument[];
  level: Level;
  layers: RegionName[];
  phase: BuildPhase;
}

/** The planner looks this far ahead of the wall clock. */
export const LOOKAHEAD_SEC = 0.25;
/** Steps later than this behind the wall clock (a stalled or throttled timer) are skipped, not played in a burst. */
export const LATE_SEC = 0.1;
export const TICK_MS = 40;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const defaultCreate = (): AudioContext => {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return new Ctor!();
};

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  bus: GainNode;
  wet: GainNode;
}

const defaultNow = (): number => performance.now() / 1000;

/**
 * The planner runs on the wall clock (`now()`, seconds) as a continuous 16th-step clock (spec §4e) and always plans,
 * also while muted, publishing every note through `onNote`; notes are played only when enabled with an audio context,
 * at `ctx.currentTime + (when − now())`. At every bar boundary (spec §4f) it smooths the traffic intensity over the
 * wall time since the previous bar, moves the rhythm level (up at once, down one level a bar, within the section's
 * range), updates the region layers (and the lines among them) and latches the REPLAY build-up phase of the bar.
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
  // v4 arrangement (spec §4f), updated at every bar boundary of the planner
  let airborne = 0;
  let hour: number | undefined;
  let replay = false;
  let intensity: number | null = null; // null until the first bar: the first update snaps to the traffic
  let lastBarWall = 0;
  let level: Level = levelFor(section, 0);
  let layers: Set<RegionName> = new Set();
  let phase: BuildPhase = "none";
  let buildAmount = 0;
  let buildBar = 0;
  let hitDone = false; // the tutti plays once per section entry (a paused replay must not repeat it)
  let lines: SkyFlight[] = [];

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

  function switchSection(localHour: number | undefined): void {
    if (localHour === undefined) return;
    const sec = sectionAt(localHour); // art:sound
    if (sec.id === section.id) return;
    section = sec;
    epoch = now();
    nextStep = 0;
    neyState = initNey(sec);
    hitDone = false;
  }

  /** the build-up of the current hour (none in LIVE or without an hour) */
  function buildNow(): { phase: BuildPhase; amount: number } {
    if (hour === undefined) return { phase: "none", amount: 0 };
    const h = ((hour % 24) + 24) % 24;
    const since = (h - Math.floor(h / 6) * 6 + 24) % 24; // hours since the last boundary 0/6/12/18
    return buildup(hoursToBoundary(h), since, replay);
  }

  /** bar boundary at wall time `t`: smoothed intensity → level (one level down at most), layers, lines, build phase */
  function onBar(t: number): void {
    const target = intensityOf(airborne);
    intensity = intensity === null ? target : smoothIntensity(intensity, target, Math.max(0, t - lastBarWall));
    lastBarWall = t;
    const [lo, hi] = section.levelRange;
    level = clamp(nextLevel(level, levelFor(section, intensity)), lo, hi) as Level;
    layers = activeLayers(layers, regionShares(sky));
    lines = selectLines(sky, followedId, MAX_LINES, layers);
    const b = buildNow();
    if (b.phase === "build") {
      buildBar = phase === "build" ? buildBar + 1 : 0;
      phase = "build";
      buildAmount = b.amount;
    } else if (b.phase === "hit" && !hitDone) {
      phase = "hit";
      hitDone = true;
    } else phase = "none";
  }

  /** the arrangement of the next step to plan (the build amount keeps rising inside the bar) */
  function arrangement(): StepArrangement {
    const b = phase === "build" ? buildNow() : null;
    if (b?.phase === "build") buildAmount = b.amount;
    return { level, layers, phase, amount: buildAmount, buildBar };
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

    return { ctx, master, bus, wet };
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
      lines = selectLines(sky, followedId, MAX_LINES, layers);
      const planned: PlannedNote[] = [];
      for (; stepTime(nextStep, epoch, sec) <= t + LOOKAHEAD_SEC; nextStep++) {
        if (nextStep % 16 === 0) onBar(t);
        planned.push(...planStep(nextStep, { epoch, section: sec }, arrangement(), lines, followedId));
      }
      emit(planned, t);
      if (!enabled || !g) return;
    });
  }

  function setSky(flights: SkyFlight[], followed: string | null, localHour?: number, isReplay = false, count?: number): void {
    if (disposed) return;
    sky = flights;
    followedId = followed;
    airborne = count ?? flights.length;
    replay = isReplay;
    if (localHour !== undefined) hour = localHour;
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
    const { ctx, wet } = g;
    safe(() => {
      const at = ctx.currentTime;
      wet.gain.setTargetAtTime(section.wet, at, 1.5);
    });
  }

  function info(localHour?: number): SoundInfo {
    const sec = localHour === undefined ? section : sectionAt(localHour);
    // a section the planner has not switched to yet starts at its first chord
    const chord = sec.id === section.id ? chordAtStep(stepAt(now()), sec) : CHORDS[sec.progression[0]];
    return {
      section: sec.id, chord: chord.name, bpm: sec.bpm, instruments: [...sec.instruments],
      level, layers: REGIONS.filter((r) => layers.has(r)), phase,
    };
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
      void cur.ctx.close()?.catch?.(() => {});
    });
  }

  return { setEnabled, setSky, schedule, setEnergy, tick, onNote: (fn) => notes.subscribe(fn), info, dispose };
}
