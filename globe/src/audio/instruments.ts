import { ladderFreq, ladderIndexOf, NEY_LADDER } from "./melody";
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
  /** vibrato drawn as detune automation (rate Hz, ±cents, starting `after` s) */
  wobble?: { rate: number; cents: number; after: number };
  /** destination instead of the note's panner */
  out?: AudioNode;
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
  if (v.wobble) {
    const { rate, cents, after } = v.wobble;
    const end = v.at + v.attack + v.decay;
    osc.detune.setValueAtTime(v.detune ?? 0, v.at + after);
    for (let i = 1, tt = v.at + after + 0.25 / rate; tt < end; i++, tt += 0.5 / rate)
      osc.detune.linearRampToValueAtTime((v.detune ?? 0) + (i % 2 ? cents : -cents), tt);
  }
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
  g.connect(v.out ?? out);
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
  const release = () => {
    if (--live === 0) pan.disconnect();
  };
  const v = (vc: Voice) => {
    live++;
    voice(ctx, pan, vc, release);
  };
  /** an LFO (sine at `rate` Hz) through a depth gain shaped by `shape`; it holds the panner open until it stops */
  const lfo = (rate: number, at: number, dur: number, shape: (gp: AudioParam) => void): GainNode => {
    const osc = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.frequency.setValueAtTime(rate, at);
    shape(depth.gain);
    osc.connect(depth);
    live++;
    osc.onended = () => {
      osc.disconnect();
      depth.disconnect();
      release();
    };
    osc.start(at);
    osc.stop(at + dur + 0.1);
    return depth;
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
      const decay = 1.4 * k * (n.long ? 2.5 : 1);
      const lp = { start: 2400 * o.cutoffScale, q: 0.8 };
      const vib = lfo(5, t, 0.12 + decay, (gp) => {
        gp.setValueAtTime(0, t);
        gp.setValueAtTime(0, t + 0.15);
        gp.linearRampToValueAtTime(12, t + 0.35);
      });
      v({ type: "sine", freq: f, from: 0.97 * f, glide: 0.08, peak, attack: 0.12, decay, at: t, lowpass: lp, vibrato: vib });
      v({ type: "triangle", freq: f, from: 0.97 * f, glide: 0.08, peak: peak * 0.5, attack: 0.12, decay, at: t, lowpass: lp, vibrato: vib });
      live++;
      breath(ctx, pan, f, t, 0.18 * peak, 0.12, decay, release);
      if (n.grace) {
        const up = ladderFreq(Math.min(NEY_LADDER.length - 1, ladderIndexOf(f) + 1));
        v({ type: "sine", freq: up, peak: 0.4 * peak, attack: 0.01, decay: 0.08, at: t - 0.06, lowpass: lp });
      }
      break;
    }
    case "CLA": {
      // three odd partials (the clarinet's hollow tone); a light vibrato as detune automation (no LFO node)
      const decay = 1.0 * k * (n.long ? 2.5 : 1);
      const lp = { start: 3000 * o.cutoffScale, q: 0.7 };
      for (const [mult, p] of [[1, 1], [3, 0.33], [5, 0.15]] as const)
        v({ type: "sine", freq: mult * f, peak: peak * p, attack: 0.06, decay, at: t, lowpass: lp, wobble: { rate: 5, cents: 8, after: 0.2 } });
      break;
    }
    case "SAX": {
      const decay = 1.6 * k * (n.long ? 2.5 : 1);
      const growl = ctx.createGain(); // amplitude "growl": ±0.15 of the peak at 3 Hz
      growl.gain.setValueAtTime(1, t);
      growl.connect(pan);
      const growlDepth = lfo(3, t, 0.05 + decay, (gp) => gp.setValueAtTime(0.15, t));
      growlDepth.connect(growl.gain);
      const vib = lfo(5.5, t, 0.05 + decay, (gp) => {
        gp.setValueAtTime(0, t);
        gp.setValueAtTime(0, t + 0.25);
        gp.linearRampToValueAtTime(20, t + 0.45);
      });
      v({ type: "sawtooth", freq: f, peak, attack: 0.05, decay, at: t, lowpass: { start: 1800 * o.cutoffScale, q: 0.7 }, vibrato: vib, out: growl });
      live++;
      breath(ctx, pan, f, t, 0.1 * peak, 0.05, decay, () => {
        growl.disconnect();
        release();
      });
      break;
    }
    case "TPT": {
      const decay = 0.9 * k * (n.long ? 2.0 : 1);
      const lp = { start: 800 * o.cutoffScale, end: 3500 * o.cutoffScale, over: 0.08, q: 0.9 };
      for (const d of [0, 6]) v({ type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 0.04, decay, at: t, lowpass: lp });
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

/** Breath (ney, saxophone): looped white noise through a bandpass at the pitch. */
function breath(ctx: AudioContext, out: AudioNode, f: number, t: number, peak: number, attack: number, decay: number, onEnd: () => void): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.setValueAtTime(2, t);
  bp.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
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
  src.stop(t + attack + decay + 0.1);
}
