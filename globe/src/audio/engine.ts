import { REGIONS } from "@web/data/palette";
import { playNote } from "./instruments";
import { planNotes, type ScoreEvent } from "./score";
import { chordAtTime, freqOf } from "./theory";

export interface SoundFocus {
  regionIdx: number | null;
  alt100: number;
}

export interface RouteSound {
  setEnabled(on: boolean): void;
  schedule(events: ScoreEvent[], focus?: SoundFocus | null, pans?: Map<string, { pan: number; visible: boolean }>): void;
  setEnergy(e: number): void;
  dispose(): void;
}

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
  bedGain: GainNode;
  bed: OscillatorNode[];
  chordName: string;
}

export function createRouteSound(opts: { createContext?: () => AudioContext } = {}): RouteSound {
  const create = opts.createContext ?? defaultCreate;
  let g: Graph | null = null;
  let enabled = false;
  let disposed = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let onVis: (() => void) | null = null;
  let onGesture: (() => void) | null = null;

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* silent no-op when Web Audio is missing or blocked */
    }
  };
  const resume = () => safe(() => void g?.ctx.resume()?.catch?.(() => {}));

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
    wet.gain.value = 0.3;
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
    const chord = chordAtTime(ctx.currentTime);
    const tones: [number, number, OscillatorType][] = [
      [2, chord.root, "sine"],
      [3, chord.third, "triangle"],
      [3, chord.fifth, "sine"],
    ];
    const bed = tones.map(([oct, semis, type]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freqOf(oct, semis);
      o.connect(lp);
      o.start();
      return o;
    });
    return { ctx, master, bus, bedGain, bed, chordName: chord.name };
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

  function schedule(events: ScoreEvent[], focus?: SoundFocus | null, pans?: Map<string, { pan: number; visible: boolean }>): void {
    if (!enabled || !g) return;
    const { ctx, bus } = g;
    safe(() => {
      for (const n of planNotes(events, ctx.currentTime)) {
        const match = focus?.regionIdx != null && REGIONS.indexOf(n.region) === focus.regionIdx;
        const p = pans?.get(n.key);
        playNote(ctx, bus, n, {
          gainScale: (focus?.regionIdx == null ? 1 : match ? 1.6 : 0.7) * (p?.visible === false ? 0.3 : 1),
          cutoffScale: match && focus ? 0.6 + 0.8 * clamp(focus.alt100 / 410, 0, 1) : 1,
          pan: clamp(p?.pan ?? 0, -1, 1),
        });
      }
    });
  }

  function setEnergy(e: number): void {
    if (!enabled || !g) return;
    const { ctx, bedGain, bed } = g;
    safe(() => {
      const now = ctx.currentTime;
      bedGain.gain.setTargetAtTime(0.035 * clamp(e, 0, 1) ** 0.7, now, 0.8);
      const chord = chordAtTime(now);
      if (chord.name !== g!.chordName) {
        g!.chordName = chord.name;
        bed[0].frequency.setTargetAtTime(freqOf(2, chord.root), now, 1.2);
        bed[1].frequency.setTargetAtTime(freqOf(3, chord.third), now, 1.2);
        bed[2].frequency.setTargetAtTime(freqOf(3, chord.fifth), now, 1.2);
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
