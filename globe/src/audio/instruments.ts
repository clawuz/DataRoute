import type { PlannedNote } from "./score";
import type { RegionName } from "./theory";

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
  peak: number;
  attack: number;
  decay: number;
  lowpass?: { start: number; end?: number; over?: number; q: number };
  at: number;
}

function voice(ctx: AudioContext, out: AudioNode, v: Voice): void {
  const osc = ctx.createOscillator();
  osc.type = v.type;
  if (v.from !== undefined && v.glide) {
    osc.frequency.setValueAtTime(v.from, v.at);
    osc.frequency.exponentialRampToValueAtTime(v.freq, v.at + v.glide);
  } else {
    osc.frequency.setValueAtTime(v.freq, v.at);
  }
  if (v.detune) osc.detune.setValueAtTime(v.detune, v.at);
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
  };
  osc.start(v.at);
  osc.stop(stopAt);
}

export function playNote(ctx: AudioContext, dest: AudioNode, n: PlannedNote, o: NoteOpts): void {
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan;
  pan.connect(dest);
  const t = n.when;
  const f = n.freq;
  const land = n.kind === "arr";
  const k = land ? 2 : 1;
  const peak = 0.22 * n.vel * o.gainScale;
  const r: RegionName = n.region;
  switch (r) {
    case "DOM":
      voice(ctx, pan, { type: "sine", freq: f, from: 2 * f, glide: 0.06, peak, attack: 0.005, decay: 0.45 * k, at: t });
      break;
    case "EUR":
      voice(ctx, pan, { type: "sine", freq: f, peak, attack: 0.004, decay: 1.4 * k, at: t });
      voice(ctx, pan, { type: "sine", freq: 4 * f, peak: peak * 0.25, attack: 0.004, decay: 0.35 * k, at: t });
      break;
    case "MEA": {
      const oud = (freq: number, at: number, p: number) =>
        voice(ctx, pan, {
          type: "sawtooth", freq, peak: p, attack: 0.005, decay: 0.9 * k, at,
          lowpass: { start: 3200 * o.cutoffScale, end: 600 * o.cutoffScale, over: 0.25, q: 0.8 },
        });
      if (!land) oud(f / 2 ** (2 / 12), t - 0.07, peak * 0.35);
      oud(f, t, peak);
      break;
    }
    case "AFR":
      voice(ctx, pan, { type: "sine", freq: f, peak, attack: 0.004, decay: 0.6 * k, at: t });
      voice(ctx, pan, { type: "sine", freq: 2.76 * f, peak: peak * 0.35, attack: 0.004, decay: 0.18 * k, at: t });
      break;
    case "ASI":
      voice(ctx, pan, {
        type: "triangle", freq: f, from: 1.02 * f, glide: 0.03, peak, attack: 0.004, decay: 0.75 * k, at: t,
        lowpass: { start: 4200 * o.cutoffScale, q: 0.8 },
      });
      break;
    case "AME":
      for (const d of [-5, 5])
        voice(ctx, pan, {
          type: "sawtooth", freq: f, detune: d, peak: peak * 0.5, attack: 1.2, decay: 2.6 * k, at: t,
          lowpass: { start: 900 * o.cutoffScale, q: 0.8 },
        });
      break;
    default:
      break;
  }
}
