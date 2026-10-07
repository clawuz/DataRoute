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
  /** arrivals ring longer (plucked continent instruments) */
  kind?: NoteKind;
  /** the level-0 bass rings longer (the winds use `durSec` since v5) */
  long?: boolean;
  /** ney: grace note pitch, sounded just before the note */
  graceFreq?: number;
  /** v5: the note's real length (s): sustained instruments hold it, plucked ones ring longer; absent → `DEFAULT_DUR_SEC` */
  durSec?: number;
}

/** What `playNote` returns: `cut(at)` ends the held part of a sustained note early (the monophonic ney). */
export interface NoteHandle {
  cut(at: number): void;
}

/** Length of a note without `durSec` (direct callers; the planners always set it). */
export const DEFAULT_DUR_SEC = 0.5;
/** Plucked/mallet notes never ring longer than this. */
export const MAX_RING_SEC = 2.5;
/** Fade of a held note cut by the next note of the same (monophonic) voice. */
export const CUT_SEC = 0.04;

/**
 * v5 (spec §4g): winds, bowed strings, the organ, the string swell and the AME pad hold the note for `durSec`
 * (attack → hold at the peak until `when + durSec` → release `releaseOf`).
 */
export const SUSTAINED: ReadonlySet<Instrument> = new Set<Instrument>([
  "NEY", "CLA", "SAX", "TPT", "CELLO", "VIOLIN", "FLUTE", "ORGAN", "STR", "AME",
]);
/** v5: plucked strings and mallets ring for `max(ownDecay, min(durSec, 2.5))` (partials stretched in proportion). */
export const PLUCKED: ReadonlySet<Instrument> = new Set<Instrument>([
  "PNO", "EUR", "MARIMBA", "HARP", "GUITAR", "SAZ", "KANUN", "MEA", "AFR", "ASI", "EP", "KEYS",
]);

/**
 * Release of a sustained note: `min(0.6, 0.5 · durSec)`; the organ releases fast (`min(0.1, 0.5 · durSec)`) and the
 * string swell slowly (0.9 s, spec §4g); never under 20 ms.
 */
export function releaseOf(instrument: Instrument, durSec: number): number {
  if (instrument === "STR") return 0.9;
  const r = instrument === "ORGAN" ? Math.min(0.1, 0.5 * durSec) : Math.min(0.6, 0.5 * durSec);
  return Math.max(0.02, r);
}

/** Decay stretch of a plucked note whose main partial decays in `own` s: `max(own, min(durSec, 2.5)) / own` (≥ 1). */
export const ringStretch = (durSec: number, own: number): number => Math.max(own, Math.min(durSec, MAX_RING_SEC)) / own;

export interface NoteOpts {
  gainScale: number;
  cutoffScale: number;
  pan: number;
}

const FLOOR = 0.0001;

/**
 * Attack to `peak`, then either an exponential decay (`hold` undefined) or a hold at the peak until `hold` (never before
 * the attack ends) followed by an exponential release of `decay` seconds. Returns the time the gain reaches the floor.
 */
function env(g: GainNode, t: number, peak: number, attack: number, decay: number, hold?: number): number {
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold === undefined) {
    g.gain.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
    return t + attack + decay;
  }
  const h = Math.max(t + attack, hold);
  g.gain.setValueAtTime(peak, h);
  g.gain.exponentialRampToValueAtTime(FLOOR, h + decay);
  return h + decay;
}

/** A held envelope (cuttable): its gain, peak, the end of its attack and the start of its release. */
interface Held {
  g: GainNode;
  peak: number;
  attackEnd: number;
  holdEnd: number;
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
  /** decay after the attack, or the release after `hold` */
  decay: number;
  /** v5 sustained: hold the peak until this time, then release over `decay` */
  hold?: number;
  lowpass?: { start: number; end?: number; over?: number; q: number };
  at: number;
  /** vibrato drawn as detune automation (rate Hz, ±cents, starting `after` s) */
  wobble?: { rate: number; cents: number; after: number };
  /** destination instead of the note's panner */
  out?: AudioNode;
}

function voice(ctx: AudioContext, out: AudioNode, v: Voice, onEnd?: () => void): Held | null {
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
    const end = (v.hold === undefined ? v.at + v.attack : Math.max(v.at + v.attack, v.hold)) + v.decay;
    osc.detune.setValueAtTime(v.detune ?? 0, v.at + after);
    for (let i = 1, tt = v.at + after + 0.25 / rate; tt < end; i++, tt += 0.5 / rate)
      osc.detune.linearRampToValueAtTime((v.detune ?? 0) + (i % 2 ? cents : -cents), tt);
  }
  v.vibrato?.connect(osc.detune);
  const g = ctx.createGain();
  const silentAt = env(g, v.at, v.peak, v.attack, v.decay, v.hold);
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
  osc.onended = () => {
    osc.disconnect();
    filt?.disconnect();
    g.disconnect();
    onEnd?.();
  };
  osc.start(v.at);
  osc.stop(silentAt + 0.1);
  return v.hold === undefined ? null : { g, peak: v.peak, attackEnd: v.at + v.attack, holdEnd: Math.max(v.at + v.attack, v.hold) };
}

/**
 * Schedules one note. v5 (spec §4g): sustained instruments (`SUSTAINED`) hold the note for `durSec` and release over
 * `releaseOf`; plucked/mallet instruments (`PLUCKED`) stretch their decays by `ringStretch`; drums, bass and brass
 * stabs are unchanged. Returns a handle whose `cut(at)` ends the held part early (used for the monophonic ney).
 */
export function playNote(ctx: AudioContext, dest: AudioNode, n: SynthNote, o: NoteOpts): NoteHandle {
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan;
  pan.connect(dest);
  let live = 0; // disconnect the panner once its last source has ended
  const held: Held[] = [];
  const release = () => {
    if (--live === 0) pan.disconnect();
  };
  const v = (vc: Voice, onEnd?: () => void) => {
    live++;
    const h = voice(ctx, pan, vc, () => {
      onEnd?.();
      release();
    });
    if (h) held.push(h);
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
  /** white noise through a filter (breath, snare, hats, shaker, crash, riser); `hold` as for `Voice` */
  const noise = (filter: NoiseFilter, t: number, peak: number, attack: number, decay: number, onEnd?: () => void, hold?: number) => {
    live++;
    const h = noiseBurst(ctx, pan, filter, t, peak, attack, decay, () => {
      onEnd?.();
      release();
    }, hold);
    if (h) held.push(h);
  };
  /** Rhodes: sine f, a bell 2f, a very short 7f tine (decays × `s`); slow tremolo (5 Hz, ±0.12) as gain automation */
  const ep = (f: number, t: number, peak: number, s: number) => {
    const decay = 0.9 * s;
    const trem = ctx.createGain();
    trem.gain.setValueAtTime(1, t);
    for (let i = 0, tt = t + 0.05; tt < t + decay; i++, tt += 0.1) trem.gain.linearRampToValueAtTime(i % 2 ? 1.12 : 0.88, tt);
    trem.connect(pan);
    v({ type: "sine", freq: f, peak, attack: 0.005, decay, at: t, out: trem }, () => trem.disconnect());
    v({ type: "sine", freq: 2 * f, peak: peak * 0.35, attack: 0.005, decay: 0.35 * s, at: t, out: trem });
    v({ type: "sine", freq: 7 * f, peak: peak * 0.12, attack: 0.005, decay: 0.08 * s, at: t, out: trem });
  };
  /** trumpet: two slightly detuned saws, bright attack (lowpass 800 → 3500 Hz in 80 ms); `hold` sustains it */
  const tpt = (f: number, t: number, peak: number, decay: number, hold?: number) => {
    const lp = { start: 800 * o.cutoffScale, end: 3500 * o.cutoffScale, over: 0.08, q: 0.9 };
    for (const d of [0, 6]) v({ type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 0.04, decay, hold, at: t, lowpass: lp });
  };
  /** saxophone: lowpassed saw with a slow amplitude growl, a delayed vibrato and breath noise; `hold` sustains it */
  const sax = (f: number, t: number, peak: number, decay: number, hold?: number) => {
    const attack = 0.05;
    const span = (hold === undefined ? attack : Math.max(attack, hold - t)) + decay; // until the gain reaches the floor
    const growl = ctx.createGain(); // amplitude "growl": ±0.15 of the peak at 3 Hz
    growl.gain.setValueAtTime(1, t);
    growl.connect(pan);
    const growlDepth = lfo(3, t, span, (gp) => gp.setValueAtTime(0.15, t));
    growlDepth.connect(growl.gain);
    const vib = lfo(5.5, t, span, (gp) => {
      gp.setValueAtTime(0, t);
      gp.setValueAtTime(0, t + 0.25);
      gp.linearRampToValueAtTime(20, t + 0.45);
    });
    v({ type: "sawtooth", freq: f, peak, attack, decay, hold, at: t, lowpass: { start: 1800 * o.cutoffScale, q: 0.7 }, vibrato: vib, out: growl });
    noise({ type: "bandpass", freq: f, q: 2 }, t, 0.1 * peak, attack, decay, () => growl.disconnect(), hold);
  };
  const t = n.when;
  const f = n.freq;
  const land = n.kind === "arr";
  const k = land ? 2 : 1;
  const peak = 0.22 * n.vel * o.gainScale;
  const r: Instrument = n.instrument;
  const dur = n.durSec ?? DEFAULT_DUR_SEC;
  // sustained: hold until `t + dur`, then release; plucked: decays × `ring(main decay)`
  const hold = t + dur;
  const rel = releaseOf(r, dur);
  const ring = (own: number) => ringStretch(dur, own);
  switch (r) {
    case "EUR": {
      const s = ring(1.4 * k);
      v({ type: "sine", freq: f, peak, attack: 0.004, decay: 1.4 * k * s, at: t });
      v({ type: "sine", freq: 4 * f, peak: peak * 0.25, attack: 0.004, decay: 0.35 * k * s, at: t });
      break;
    }
    case "MEA": {
      const s = ring(0.9 * k);
      const oud = (freq: number, at: number, p: number) =>
        v({
          type: "sawtooth", freq, peak: p, attack: 0.005, decay: 0.9 * k * s, at,
          lowpass: { start: 3200 * o.cutoffScale, end: 600 * o.cutoffScale, over: 0.25, q: 0.8 },
        });
      if (!land) oud(f / 2 ** (2 / 12), t - 0.07, peak * 0.35);
      oud(f, t, peak);
      break;
    }
    case "AFR": {
      const s = ring(0.6 * k);
      v({ type: "sine", freq: f, peak, attack: 0.004, decay: 0.6 * k * s, at: t });
      v({ type: "sine", freq: 2.76 * f, peak: peak * 0.35, attack: 0.004, decay: 0.18 * k * s, at: t });
      break;
    }
    case "ASI":
      v({
        type: "triangle", freq: f, from: 1.02 * f, glide: 0.03, peak, attack: 0.004, decay: 0.75 * k * ring(0.75 * k), at: t,
        lowpass: { start: 4200 * o.cutoffScale, q: 0.8 },
      });
      break;
    case "AME":
      // the pad: slow attack, held for the note, then released
      for (const d of [-5, 5])
        v({
          type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 1.2, decay: rel, hold, at: t,
          lowpass: { start: 900 * o.cutoffScale, q: 0.8 },
        });
      break;
    case "PNO": {
      const s = ring(2.0 * k);
      const lp = { start: 5000 * o.cutoffScale, q: 0.7 };
      v({ type: "triangle", freq: f, peak, attack: 0.003, decay: 2.0 * k * s, at: t, lowpass: lp });
      v({ type: "sine", freq: 2 * f, peak: peak * 0.4, attack: 0.003, decay: 1.2 * k * s, at: t, lowpass: lp });
      v({ type: "sine", freq: 3 * f, peak: peak * 0.15, attack: 0.003, decay: 0.7 * k * s, at: t, lowpass: lp });
      break;
    }
    case "NEY": {
      const lp = { start: 2400 * o.cutoffScale, q: 0.8 };
      const vib = lfo(5, t, Math.max(0.12, dur) + rel, (gp) => {
        gp.setValueAtTime(0, t);
        gp.setValueAtTime(0, t + 0.15);
        gp.linearRampToValueAtTime(12, t + 0.35);
      });
      v({ type: "sine", freq: f, from: 0.97 * f, glide: 0.08, peak, attack: 0.12, decay: rel, hold, at: t, lowpass: lp, vibrato: vib });
      v({ type: "triangle", freq: f, from: 0.97 * f, glide: 0.08, peak: peak * 0.5, attack: 0.12, decay: rel, hold, at: t, lowpass: lp, vibrato: vib });
      noise({ type: "bandpass", freq: f, q: 2 }, t, 0.18 * peak, 0.12, rel, undefined, hold);
      if (n.graceFreq !== undefined) v({ type: "sine", freq: n.graceFreq, peak: 0.4 * peak, attack: 0.01, decay: 0.08, at: t - 0.06, lowpass: lp });
      break;
    }
    case "CLA": {
      // three odd partials (the clarinet's hollow tone); a light vibrato as detune automation (no LFO node)
      const lp = { start: 3000 * o.cutoffScale, q: 0.7 };
      for (const [mult, p] of [[1, 1], [3, 0.33], [5, 0.15]] as const)
        v({ type: "sine", freq: mult * f, peak: peak * p, attack: 0.06, decay: rel, hold, at: t, lowpass: lp, wobble: { rate: 5, cents: 8, after: 0.2 } });
      break;
    }
    case "SAX":
      sax(f, t, peak, rel, hold);
      break;
    case "TPT":
      tpt(f, t, peak, rel, hold);
      break;
    // v5 route-menu instruments (spec §4g)
    case "HARP": {
      // triangle + a sine octave, fast attack, a long string decay
      const s = ring(1.8);
      v({ type: "triangle", freq: f, peak, attack: 0.003, decay: 1.8 * s, at: t });
      v({ type: "sine", freq: 2 * f, peak: peak * 0.3, attack: 0.003, decay: 0.9 * s, at: t });
      break;
    }
    case "GUITAR": {
      // nylon: a saw through a closing lowpass and a short pluck noise
      const s = ring(1.1);
      v({
        type: "sawtooth", freq: f, peak: peak * 0.8, attack: 0.003, decay: 1.1 * s, at: t,
        lowpass: { start: 2600 * o.cutoffScale, end: 900 * o.cutoffScale, over: 0.4, q: 0.8 },
      });
      noise({ type: "bandpass", freq: 3000, q: 1 }, t, 0.25 * peak, 0.001, 0.015);
      break;
    }
    case "SAZ": {
      // bağlama: a bright saw with a slight pitch drop and a 3× sine, a short string
      const s = ring(0.7);
      v({
        type: "sawtooth", freq: f, from: 1.015 * f, glide: 0.05, peak: peak * 0.8, attack: 0.003, decay: 0.7 * s, at: t,
        lowpass: { start: 5000 * o.cutoffScale, q: 0.7 },
      });
      v({ type: "sine", freq: 3 * f, peak: peak * 0.3, attack: 0.003, decay: 0.25 * s, at: t });
      break;
    }
    case "KANUN": {
      // a bright triangle and a 4× sine, a very short attack
      const s = ring(0.9);
      v({ type: "triangle", freq: f, peak, attack: 0.002, decay: 0.9 * s, at: t });
      v({ type: "sine", freq: 4 * f, peak: peak * 0.25, attack: 0.002, decay: 0.2 * s, at: t });
      break;
    }
    case "MARIMBA": {
      // a warm sine and a short 4× sine
      const s = ring(0.5);
      v({ type: "sine", freq: f, peak, attack: 0.003, decay: 0.5 * s, at: t });
      v({ type: "sine", freq: 4 * f, peak: peak * 0.2, attack: 0.002, decay: 0.06 * s, at: t });
      break;
    }
    case "CELLO":
      // two saws through a 900 Hz lowpass, slow attack, 5 Hz ±10 cent vibrato
      for (const d of [-4, 4])
        v({
          type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 0.12, decay: rel, hold, at: t,
          lowpass: { start: 900 * o.cutoffScale, q: 0.7 }, wobble: { rate: 5, cents: 10, after: 0.15 },
        });
      break;
    case "VIOLIN":
      // two saws through a 3200 Hz lowpass, 6 Hz ±14 cent vibrato
      for (const d of [-3, 3])
        v({
          type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 0.08, decay: rel, hold, at: t,
          lowpass: { start: 3200 * o.cutoffScale, q: 0.7 }, wobble: { rate: 6, cents: 14, after: 0.15 },
        });
      break;
    case "FLUTE":
      // a sine with a light vibrato and breath noise
      v({ type: "sine", freq: f, peak, attack: 0.07, decay: rel, hold, at: t, wobble: { rate: 5, cents: 8, after: 0.2 } });
      noise({ type: "bandpass", freq: 2 * f, q: 1.5 }, t, 0.12 * peak, 0.07, rel, undefined, hold);
      break;
    case "ORGAN":
      // drawbars 1×, 2×, 3×: fast attack and release
      for (const [mult, p] of [[1, 0.6], [2, 0.3], [3, 0.2]] as const)
        v({ type: "sine", freq: mult * f, peak: peak * p, attack: 0.01, decay: rel, hold, at: t });
      break;
    case "STR":
      // the string swell: two detuned saws per voicing tone, slow attack (0.5 s), long release (0.9 s)
      for (const x of n.freqs ?? [f])
        for (const d of [-7, 7])
          v({
            type: "sawtooth", freq: x, detune: d, peak: peak * 0.3, attack: 0.5, decay: rel, hold, at: t,
            lowpass: { start: 1800 * o.cutoffScale, q: 0.6 },
          });
      break;
    // v3 groove voices (spec §4e)
    case "EP":
      ep(f, t, peak, ring(0.9));
      break;
    case "KEYS": {
      const s = ring(0.9);
      for (const x of n.freqs ?? [f]) ep(x, t, 0.8 * peak, s);
      break;
    }
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
  return {
    cut(at: number) {
      for (const h of held) {
        if (at >= h.holdEnd) continue; // already releasing
        const c = Math.max(at, h.attackEnd);
        h.g.gain.cancelScheduledValues(c);
        h.g.gain.setValueAtTime(h.peak, c);
        h.g.gain.exponentialRampToValueAtTime(FLOOR, c + CUT_SEC);
      }
    },
  };
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
  t: number, peak: number, attack: number, decay: number, onEnd: () => void, hold?: number,
): Held | null {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = filter.type;
  bp.frequency.setValueAtTime(filter.freq, t);
  if (filter.sweepTo !== undefined && filter.sweepOver) bp.frequency.exponentialRampToValueAtTime(filter.sweepTo, t + filter.sweepOver);
  bp.Q.setValueAtTime(filter.q, t);
  const g = ctx.createGain();
  const silentAt = env(g, t, peak, attack, decay, hold);
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
  src.stop(silentAt + 0.1);
  return hold === undefined ? null : { g, peak, attackEnd: t + attack, holdEnd: Math.max(t + attack, hold) };
}
