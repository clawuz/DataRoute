import { REGIONS } from "@web/data/palette";
import { playNote } from "./instruments";
import { sectionAt, type Section } from "./form";
import { initNey, initPiano, type NeyState, type PianoState } from "./melody";
import { planNotes, type ScoreEvent } from "./score";
import { chordAtBeat, freqOf, type Chord, type Instrument } from "./theory";

export interface SoundFocus {
  regionIdx: number | null;
  alt100: number;
}

export interface RouteSound {
  setEnabled(on: boolean): void;
  /** `localHour`: Istanbul local hour of the flight time (selects the section; defaults to midday) */
  schedule(events: ScoreEvent[], focus?: SoundFocus | null, pans?: Map<string, { pan: number; visible: boolean }>, localHour?: number): void;
  setEnergy(e: number): void;
  dispose(): void;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Region index whose focus boost applies to an instrument; the ney and its wind ensemble ignore focus. */
export function instrumentRegionIdx(i: Instrument): number | null {
  if (i === "NEY" || i === "CLA" || i === "SAX" || i === "TPT") return null;
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

export function createRouteSound(opts: { createContext?: () => AudioContext } = {}): RouteSound {
  const create = opts.createContext ?? defaultCreate;
  let g: Graph | null = null;
  let enabled = false;
  let disposed = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let onVis: (() => void) | null = null;
  let onGesture: (() => void) | null = null;
  // the only mutable music state: current section, its epoch (audio time) and the melodic states
  let section: Section = sectionAt(12);
  let epoch = 0;
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

  function bedChord(now: number): { chord: Chord; key: string } {
    const beat = Math.floor(Math.max(0, now - epoch) / (60 / section.bpm));
    const idx = Math.floor(beat / section.beatsPerChord) % section.progression.length;
    return { chord: chordAtBeat(beat, section.progression, section.beatsPerChord), key: `${section.id}:${idx}` };
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
    epoch = ctx.currentTime;
    const { chord, key } = bedChord(ctx.currentTime);
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
    if (!enabled || !g) return;
    const { ctx, bus } = g;
    safe(() => {
      const sec = sectionAt(localHour ?? 12); // art:sound
      if (sec.id !== section.id) {
        section = sec;
        epoch = ctx.currentTime;
        neyState = initNey(sec);
      }
      const plan = planNotes(events, ctx.currentTime, { epoch, section, ney: neyState, piano: pianoState });
      neyState = plan.ney;
      pianoState = plan.piano;
      const dyn = 0.6 + 0.4 * clamp(energy, 0, 1);
      for (const n of plan.notes) {
        // art:sound
        const match = focus?.regionIdx != null && instrumentRegionIdx(n.instrument) === focus.regionIdx;
        const p = pans?.get(n.key);
        playNote(ctx, bus, n, {
          gainScale: dyn * (focus?.regionIdx == null ? 1 : match ? 1.6 : 0.7) * (p?.visible === false ? 0.3 : 1),
          cutoffScale: match && focus ? 0.6 + 0.8 * clamp(focus.alt100 / 410, 0, 1) : 1,
          pan: clamp(p?.pan ?? 0, -1, 1),
        });
      }
    });
  }

  function setEnergy(e: number): void {
    if (!enabled || !g) return;
    const { ctx, bedGain, bed, wet } = g;
    energy = clamp(e, 0, 1);
    safe(() => {
      const now = ctx.currentTime;
      bedGain.gain.setTargetAtTime(0.035 * energy ** 0.7, now, 0.8);
      wet.gain.setTargetAtTime(section.wet, now, 1.5);
      const { chord, key } = bedChord(now);
      if (key !== g!.chordKey) {
        g!.chordKey = key;
        bedVoicing(chord).forEach(([oct, semis], i) => bed[i].frequency.setTargetAtTime(freqOf(oct, semis), now, 1.2));
      }
    });
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

  return { setEnabled, schedule, setEnergy, dispose };
}
