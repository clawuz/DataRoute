import { REGIONS } from "@web/data/palette";
import { playNote } from "./instruments";
import { legacySectionAt as sectionAt, type LegacySection as Section, type SectionId } from "./form"; // v2 path until Task 13
import { createNoteBus, type NoteEvent } from "./notes-bus";
import { initNey, initPiano, type NeyState, type PianoState } from "./melody";
import { planNotes, type ScoreEvent } from "./score";
import { chordAtBeat, freqOf, type LegacyChord as Chord, type Instrument } from "./theory";

export interface SoundFocus {
  regionIdx: number | null;
  alt100: number;
}

export interface RouteSound {
  setEnabled(on: boolean): void;
  /** `localHour`: Istanbul local hour of the flight time (selects the section; defaults to midday) */
  schedule(events: ScoreEvent[], focus?: SoundFocus | null, pans?: Map<string, { pan: number; visible: boolean }>, localHour?: number): void;
  setEnergy(e: number): void;
  /** every planned note (also while muted); returns the unsubscribe */
  onNote(fn: (n: NoteEvent) => void): () => void;
  /**
   * The section, the chord at the wall-clock now, the tempo and the ensemble — of `localHour`'s section when given
   * (read-only: planning switches its section on the next `schedule`), else of the planning section.
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

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Region index whose focus boost applies to an instrument; the ney and its wind ensemble ignore focus. */
export function instrumentRegionIdx(i: Instrument): number | null {
  if (i === "NEY" || i === "CLA" || i === "SAX" || i === "TPT") return null;
  if (i === "EP") return REGIONS.indexOf("DOM"); // v3 Rhodes of domestic/unknown lines
  if (i === "BASS" || i === "KICK" || i === "SNARE" || i === "HAT" || i === "OHAT" || i === "KEYS" || i === "BRASS" || i === "SAXPAD") return null; // v3 groove voices
  return REGIONS.indexOf(i === "PNO" ? "EUR" : i);
}

/** The four bed voices of a chord: root (oct 2), fifth (oct 3), seventh or third (oct 3), ninth or fifth (oct 4). */
export const bedVoicing = (c: Chord): [number, number][] => [
  [2, c.root],
  [3, c.fifth],
  [3, c.seventh ?? c.third],
  [4, c.ninth ?? c.fifth],
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
 * The planner runs on the wall clock (`now()`, seconds) and always plans, also while muted, publishing every
 * note through `onNote`; notes are played only when enabled with an audio context, at
 * `ctx.currentTime + (when − now())`.
 */
export function createRouteSound(opts: { createContext?: () => AudioContext; now?: () => number } = {}): RouteSound {
  const create = opts.createContext ?? defaultCreate;
  const now = opts.now ?? defaultNow;
  const notes = createNoteBus();
  let g: Graph | null = null;
  let enabled = false;
  let disposed = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let onVis: (() => void) | null = null;
  let onGesture: (() => void) | null = null;
  // the only mutable music state: current section, its epoch (wall-clock seconds) and the melodic states
  let section: Section = sectionAt(12);
  let epoch = now();
  let neyState: NeyState = initNey(section);
  let pianoState: PianoState = initPiano();
  let energy = 0.5;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* silent no-op when Web Audio is missing or blocked */
    }
  };
  const resume = () => safe(() => void g?.ctx.resume()?.catch?.(() => {}));

  function bedChord(t: number, sec: Section = section): { chord: Chord; key: string } {
    const beat = Math.floor(Math.max(0, t - epoch) / (60 / sec.bpm));
    const idx = Math.floor(beat / sec.beatsPerChord) % sec.progression.length;
    return { chord: chordAtBeat(beat, sec.progression, sec.beatsPerChord), key: `${sec.id}:${idx}` };
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

  function schedule(
    events: ScoreEvent[], focus?: SoundFocus | null, pans?: Map<string, { pan: number; visible: boolean }>, localHour?: number,
  ): void {
    if (disposed) return;
    safe(() => {
      const t = now();
      const sec = sectionAt(localHour ?? 12); // art:sound
      if (sec.id !== section.id) {
        section = sec;
        epoch = t;
        neyState = initNey(sec);
      }
      const plan = planNotes(events, t, { epoch, section, ney: neyState, piano: pianoState });
      neyState = plan.ney;
      pianoState = plan.piano;
      for (const n of plan.notes) {
        safe(() =>
          notes.emit({
            instrument: n.instrument, freq: n.freq, vel: n.vel, kind: n.kind, key: n.key, at: n.when, ...(n.long ? { long: true } : {}),
          }),
        );
      }
      if (!enabled || !g) return;
      const { ctx, bus } = g;
      const dyn = 0.6 + 0.4 * clamp(energy, 0, 1);
      for (const n of plan.notes) {
        // art:sound
        const match = focus?.regionIdx != null && instrumentRegionIdx(n.instrument) === focus.regionIdx;
        const p = pans?.get(n.key);
        const when = Math.max(ctx.currentTime, ctx.currentTime + (n.when - t)); // wall clock → audio clock
        playNote(ctx, bus, { ...n, when }, {
          gainScale: dyn * (focus?.regionIdx == null ? 1 : match ? 1.6 : 0.7) * (p?.visible === false ? 0.3 : 1),
          cutoffScale: match && focus ? 0.6 + 0.8 * clamp(focus.alt100 / 410, 0, 1) : 1,
          pan: clamp(p?.pan ?? 0, -1, 1),
        });
      }
    });
  }

  function setEnergy(e: number): void {
    if (disposed) return;
    energy = clamp(e, 0, 1);
    if (!enabled || !g) return;
    const { ctx, bedGain, bed, wet } = g;
    safe(() => {
      const at = ctx.currentTime;
      bedGain.gain.setTargetAtTime(0.035 * energy ** 0.7, at, 0.8);
      wet.gain.setTargetAtTime(section.wet, at, 1.5);
      const { chord, key } = bedChord(now());
      if (key !== g!.chordKey) {
        g!.chordKey = key;
        bedVoicing(chord).forEach(([oct, semis], i) => bed[i].frequency.setTargetAtTime(freqOf(oct, semis), at, 1.2));
      }
    });
  }

  function info(localHour?: number): SoundInfo {
    const sec = localHour === undefined ? section : sectionAt(localHour);
    // a section the planner has not switched to yet starts at its first chord
    const chord = sec.id === section.id ? bedChord(now(), sec).chord : sec.progression[0];
    return { section: sec.id, chord: chord.name, bpm: sec.bpm, instruments: [...sec.instruments] };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    enabled = false;
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

  return { setEnabled, schedule, setEnergy, onNote: (fn) => notes.subscribe(fn), info, dispose };
}
