import type { PlannedNote } from "./score";
import type { Instrument } from "./theory";

export interface NoteOpts {
  gainScale: number;
  cutoffScale: number;
  pan: number;
}

const FLOOR = 0.0001;

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
}

interface Voice {
  type: OscillatorType;
  freq: number;
  /** optional pitch glide: start frequency reached `f` over `glide` seconds */
  from?: number;
  glide?: number;
  detune?: number;
  /** node whose output (cents) modulates `detune` */
  vibrato?: AudioNode;
  peak: number;
  attack: number;
  decay: number;
  lowpass?: { start: number; end?: number; over?: number; q: number };
  at: number;
}

function voice(ctx: AudioContext, out: AudioNode, v: Voice, onEnd?: () => void): void {
  const osc = ctx.createOscillator();
  osc.type = v.type;
  if (v.from !== undefined && v.glide) {
    osc.frequency.setValueAtTime(v.from, v.at);
    osc.frequency.exponentialRampToValueAtTime(v.freq, v.at + v.glide);
  } else {
    osc.frequency.setValueAtTime(v.freq, v.at);
  }
  if (v.detune) osc.detune.setValueAtTime(v.detune, v.at);
  v.vibrato?.connect(osc.detune);
  const g = ctx.createGain();
  env(g, v.at, v.peak, v.attack, v.decay);
  let filt: BiquadFilterNode | null = null;
  if (!v.lowpass) osc.connect(g);
  else {
    filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.setValueAtTime(v.lowpass.q, v.at);
    filt.frequency.setValueAtTime(v.lowpass.start, v.at);
    if (v.lowpass.end !== undefined && v.lowpass.over) filt.frequency.exponentialRampToValueAtTime(v.lowpass.end, v.at + v.lowpass.over);
    osc.connect(filt);
    filt.connect(g);
  }
  g.connect(out);
  const stopAt = v.at + v.attack + v.decay + 0.1;
  osc.onended = () => {
    osc.disconnect();
    filt?.disconnect();
    g.disconnect();
    onEnd?.();
  };
  osc.start(v.at);
  osc.stop(stopAt);
}

export function playNote(ctx: AudioContext, dest: AudioNode, n: PlannedNote, o: NoteOpts): void {
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan;
  pan.connect(dest);
  let live = 0; // disconnect the panner once its last oscillator has ended
  const v = (vc: Voice) => {
    live++;
    voice(ctx, pan, vc, () => {
      if (--live === 0) pan.disconnect();
    });
  };
  const t = n.when;
  const f = n.freq;
  const land = n.kind === "arr";
  const k = land ? 2 : 1;
  const peak = 0.22 * n.vel * o.gainScale;
  const r: Instrument = n.instrument;
  switch (r) {
    case "DOM":
      v({ type: "sine", freq: f, from: 2 * f, glide: 0.06, peak, attack: 0.005, decay: 0.45 * k, at: t });
      break;
    case "EUR":
      v({ type: "sine", freq: f, peak, attack: 0.004, decay: 1.4 * k, at: t });
      v({ type: "sine", freq: 4 * f, peak: peak * 0.25, attack: 0.004, decay: 0.35 * k, at: t });
      break;
    case "MEA": {
      const oud = (freq: number, at: number, p: number) =>
        v({
          type: "sawtooth", freq, peak: p, attack: 0.005, decay: 0.9 * k, at,
          lowpass: { start: 3200 * o.cutoffScale, end: 600 * o.cutoffScale, over: 0.25, q: 0.8 },
        });
      if (!land) oud(f / 2 ** (2 / 12), t - 0.07, peak * 0.35);
      oud(f, t, peak);
      break;
    }
    case "AFR":
      v({ type: "sine", freq: f, peak, attack: 0.004, decay: 0.6 * k, at: t });
      v({ type: "sine", freq: 2.76 * f, peak: peak * 0.35, attack: 0.004, decay: 0.18 * k, at: t });
      break;
    case "ASI":
      v({
        type: "triangle", freq: f, from: 1.02 * f, glide: 0.03, peak, attack: 0.004, decay: 0.75 * k, at: t,
        lowpass: { start: 4200 * o.cutoffScale, q: 0.8 },
      });
      break;
    case "AME":
      for (const d of [-5, 5])
        v({
          type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 1.2, decay: 2.6 * k, at: t,
          lowpass: { start: 900 * o.cutoffScale, q: 0.8 },
        });
      break;
    case "PNO": {
      const lp = { start: 5000 * o.cutoffScale, q: 0.7 };
      v({ type: "triangle", freq: f, peak, attack: 0.003, decay: 2.0 * k, at: t, lowpass: lp });
      v({ type: "sine", freq: 2 * f, peak: peak * 0.4, attack: 0.003, decay: 1.2 * k, at: t, lowpass: lp });
      v({ type: "sine", freq: 3 * f, peak: peak * 0.15, attack: 0.003, decay: 0.7 * k, at: t, lowpass: lp });
      break;
    }
    case "NEY": {
      const decay = 1.4 * k;
      const lp = { start: 2400 * o.cutoffScale, q: 0.8 };
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(5, t);
      lfoGain.gain.setValueAtTime(0, t);
      lfoGain.gain.setValueAtTime(0, t + 0.15);
      lfoGain.gain.linearRampToValueAtTime(12, t + 0.35);
      lfo.connect(lfoGain);
      const pair: Voice[] = [
        { type: "sine", freq: f, from: 0.97 * f, glide: 0.08, peak, attack: 0.12, decay, at: t, lowpass: lp },
        { type: "triangle", freq: f, from: 0.97 * f, glide: 0.08, peak: peak * 0.5, attack: 0.12, decay, at: t, lowpass: lp },
      ];
      live += 2; // the LFO and the breath source also hold the panner open
      const release = () => {
        if (--live === 0) pan.disconnect();
      };
      for (const vc of pair) v({ ...vc, vibrato: lfoGain });
      lfo.onended = () => {
        lfo.disconnect();
        lfoGain.disconnect();
        release();
      };
      lfo.start(t);
      lfo.stop(t + 0.12 + decay + 0.1);
      breath(ctx, pan, f, t, 0.18 * peak, decay, release);
      break;
    }
    default:
      break;
  }
}

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    const len = Math.floor(0.5 * ctx.sampleRate);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** Ney breath: looped white noise through a bandpass at the pitch. */
function breath(ctx: AudioContext, out: AudioNode, f: number, t: number, peak: number, decay: number, onEnd: () => void): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.setValueAtTime(2, t);
  bp.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  env(g, t, peak, 0.12, decay);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.onended = () => {
    src.disconnect();
    bp.disconnect();
    g.disconnect();
    onEnd();
  };
  src.start(t);
  src.stop(t + 0.12 + decay + 0.1);
}
