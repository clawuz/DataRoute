import type { NoteKind } from "./notes-bus";
import type { Instrument } from "./theory";

/** What a recipe needs of a planned note (`PlannedNote` is one). */
export interface SynthNote {
  /** audio-clock time */
  when: number;
  instrument: Instrument;
  freq: number;
  /** chord voicing (KEYS: one Rhodes per tone; BRASS: trumpets on the two lower tones, sax on the third) */
  freqs?: number[];
  vel: number;
  /** arrivals ring longer */
  kind?: NoteKind;
  long?: boolean;
  /** ney: grace note pitch, sounded just before the note */
  graceFreq?: number;
}

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

export function playNote(ctx: AudioContext, dest: AudioNode, n: SynthNote, o: NoteOpts): void {
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan;
  pan.connect(dest);
  let live = 0; // disconnect the panner once its last source has ended
  const release = () => {
    if (--live === 0) pan.disconnect();
  };
  const v = (vc: Voice, onEnd?: () => void) => {
    live++;
    voice(ctx, pan, vc, () => {
      onEnd?.();
      release();
    });
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
  /** white noise through a filter (breath, snare, hats, shaker, crash, riser) */
  const noise = (filter: NoiseFilter, t: number, peak: number, attack: number, decay: number, onEnd?: () => void) => {
    live++;
    noiseBurst(ctx, pan, filter, t, peak, attack, decay, () => {
      onEnd?.();
      release();
    });
  };
  /** Rhodes: sine f, a bell 2f, a very short 7f tine; slow tremolo (5 Hz, ±0.12) as gain automation (no LFO node) */
  const ep = (f: number, t: number, peak: number) => {
    const decay = 0.9;
    const trem = ctx.createGain();
    trem.gain.setValueAtTime(1, t);
    for (let i = 0, tt = t + 0.05; tt < t + decay; i++, tt += 0.1) trem.gain.linearRampToValueAtTime(i % 2 ? 1.12 : 0.88, tt);
    trem.connect(pan);
    v({ type: "sine", freq: f, peak, attack: 0.005, decay, at: t, out: trem }, () => trem.disconnect());
    v({ type: "sine", freq: 2 * f, peak: peak * 0.35, attack: 0.005, decay: 0.35, at: t, out: trem });
    v({ type: "sine", freq: 7 * f, peak: peak * 0.12, attack: 0.005, decay: 0.08, at: t, out: trem });
  };
  /** trumpet: two slightly detuned saws, bright attack (lowpass 800 → 3500 Hz in 80 ms) */
  const tpt = (f: number, t: number, peak: number, decay: number) => {
    const lp = { start: 800 * o.cutoffScale, end: 3500 * o.cutoffScale, over: 0.08, q: 0.9 };
    for (const d of [0, 6]) v({ type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 0.04, decay, at: t, lowpass: lp });
  };
  /** saxophone: lowpassed saw with a slow amplitude growl, a delayed vibrato and breath noise */
  const sax = (f: number, t: number, peak: number, decay: number) => {
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
    noise({ type: "bandpass", freq: f, q: 2 }, t, 0.1 * peak, 0.05, decay, () => growl.disconnect());
  };
  const t = n.when;
  const f = n.freq;
  const land = n.kind === "arr";
  const k = land ? 2 : 1;
  const peak = 0.22 * n.vel * o.gainScale;
  const r: Instrument = n.instrument;
  switch (r) {
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
      noise({ type: "bandpass", freq: f, q: 2 }, t, 0.18 * peak, 0.12, decay);
      if (n.graceFreq !== undefined) v({ type: "sine", freq: n.graceFreq, peak: 0.4 * peak, attack: 0.01, decay: 0.08, at: t - 0.06, lowpass: lp });
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
    case "SAX":
      sax(f, t, peak, 1.6 * k * (n.long ? 2.5 : 1));
      break;
    case "TPT":
      tpt(f, t, peak, 0.9 * k * (n.long ? 2.0 : 1));
      break;
    // v3 groove voices (spec §4e)
    case "EP":
      ep(f, t, peak);
      break;
    case "KEYS":
      for (const x of n.freqs ?? [f]) ep(x, t, 0.8 * peak);
      break;
    case "BASS":
      v({ type: "sine", freq: f, peak, attack: 0.01, decay: n.long ? 1.2 : 0.28, at: t });
      v({
        type: "sawtooth", freq: f, peak: peak * 0.35, attack: 0.01, decay: n.long ? 1.2 : 0.28, at: t,
        lowpass: { start: 600 * (0.6 + n.vel) * o.cutoffScale, q: 0.7 },
      });
      break;
    case "KICK":
      v({ type: "sine", freq: 45, from: 130, glide: 0.08, peak, attack: 0.002, decay: 0.3, at: t });
      break;
    case "SNARE":
      noise({ type: "highpass", freq: 1200, q: 0.7 }, t, peak, 0.002, 0.18);
      v({ type: "sine", freq: 180, peak: peak * 0.5, attack: 0.002, decay: 0.1, at: t });
      break;
    case "HAT":
    case "OHAT":
      noise({ type: "highpass", freq: 7000, q: 0.7 }, t, peak, 0.002, r === "HAT" ? 0.045 : 0.22);
      break;
    case "BRASS": {
      // a short stab: trumpets on the two lower voicing tones (0.7×), the sax on the third
      const fs = n.freqs ?? [f];
      for (const x of fs.slice(0, 2)) tpt(x, t, 0.7 * peak, 0.3);
      if (fs[2] !== undefined) sax(fs[2], t, peak, 0.3);
      break;
    }
    // v4 fill/build voices and region-layer percussion (spec §4f); unpitched: `f` is ignored
    case "DARBUKA":
      v({ type: "sine", freq: 120, from: 190, glide: 0.04, peak, attack: 0.002, decay: 0.18, at: t });
      noise(CLICK, t, 0.5 * peak, 0.001, 0.006);
      break;
    case "CONGA":
      v({ type: "sine", freq: 250, from: 330, glide: 0.03, peak, attack: 0.002, decay: 0.22, at: t });
      noise(CLICK, t, 0.5 * peak, 0.001, 0.006);
      break;
    case "TAIKO":
      v({ type: "sine", freq: 55, from: 110, glide: 0.12, peak, attack: 0.002, decay: 0.55, at: t });
      break;
    case "TIMP":
      v({ type: "sine", freq: 82, from: 98, glide: 0.12, peak, attack: 0.002, decay: 0.9, at: t });
      v({ type: "sine", freq: 196, peak: 0.3 * peak, attack: 0.002, decay: 0.9, at: t });
      break;
    case "TOM":
      v({ type: "sine", freq: 90, from: 160, glide: 0.09, peak, attack: 0.002, decay: 0.3, at: t });
      break;
    case "SHAKER":
      noise({ type: "bandpass", freq: 9000, q: 1.2 }, t, peak, 0.002, 0.04);
      break;
    case "CRASH":
      noise({ type: "highpass", freq: 5000, q: 0.7 }, t, peak, 0.002, 1.4);
      break;
    case "RISER":
      // a 3.5 s swell: the bandpass sweeps up while the gain rises linearly to half the standard peak, then a release
      noise({ type: "bandpass", freq: 400, q: 1.5, sweepTo: 6000, sweepOver: RISER_SEC }, t, 0.5 * peak, RISER_SEC, 0.3);
      break;
    default:
      break;
  }
}

/** A filter for a noise burst; `sweepTo` ramps its frequency exponentially over `sweepOver` seconds (the riser). */
interface NoiseFilter {
  type: BiquadFilterType;
  freq: number;
  q: number;
  sweepTo?: number;
  sweepOver?: number;
}

/** The darbuka/conga click: 6 ms of noise around 2.5 kHz. */
const CLICK: NoiseFilter = { type: "bandpass", freq: 2500, q: 1 };
export const RISER_SEC = 3.5;

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

/** Looped white noise (the context's one cached buffer) through a filter (breath, shaker: bandpass; snare, hats, crash: highpass). */
function noiseBurst(
  ctx: AudioContext, out: AudioNode, filter: NoiseFilter,
  t: number, peak: number, attack: number, decay: number, onEnd: () => void,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = filter.type;
  bp.frequency.setValueAtTime(filter.freq, t);
  if (filter.sweepTo !== undefined && filter.sweepOver) bp.frequency.exponentialRampToValueAtTime(filter.sweepTo, t + filter.sweepOver);
  bp.Q.setValueAtTime(filter.q, t);
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
