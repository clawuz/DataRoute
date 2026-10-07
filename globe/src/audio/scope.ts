import type { Instrument } from "./theory";

/** Lane colours of the music scope: the continent palette, the THY-red ney and the warm wind ensemble. */
export const INSTRUMENT_COLOR: Record<Instrument, string> = {
  EUR: "#3FC8F2", PNO: "#9fe3ff", MEA: "#F7C548", AFR: "#7BD389", ASI: "#F2508F", AME: "#A98BFF",
  DOM: "#F2F4F8", NEY: "#E30A17", CLA: "#ff9f43", SAX: "#e8b64a", TPT: "#fff1cf", UNK: "#6B7280",
};

/** Top-to-bottom lane order (melody and winds first, then piano, the continents, the domestic pulse). */
export const LANE_ORDER: Instrument[] = ["NEY", "CLA", "SAX", "TPT", "PNO", "EUR", "MEA", "AFR", "ASI", "AME", "DOM"];

/** Visual decay time constants (s), close to each instrument's audible decay (pads slow, plucks fast). */
export const DECAY_SEC: Partial<Record<Instrument, number>> = {
  DOM: 0.45, EUR: 1.2, PNO: 1.6, MEA: 0.8, AFR: 0.45, ASI: 0.6, AME: 2.2, NEY: 1.1, CLA: 0.9, SAX: 1.4, TPT: 0.8,
};

export interface Lane {
  amp: number;
  phase: number;
  hz: number;
}

const TAU = 2 * Math.PI;

/** Drawn wave frequency of a note: logarithmic in pitch (A2 → 2 Hz, +2 Hz per octave), clamped to [1, 14]. */
export const visualHz = (freq: number): number => Math.min(14, Math.max(1, 2 + 2 * Math.log2(freq / 110)));

/** One oscilloscope step: exponential decay, an optional hit (amplitude ≥ velocity, pitch → frequency), continuous phase. */
export function stepLane(l: Lane, dt: number, decaySec: number, hit?: { freq: number; vel: number }): Lane {
  let amp = l.amp * Math.exp(-dt / decaySec);
  let hz = l.hz;
  if (hit) {
    amp = Math.max(amp, hit.vel);
    hz = visualHz(hit.freq);
  }
  let phase = (l.phase + TAU * hz * dt) % TAU;
  if (phase < 0) phase += TAU;
  return { amp, phase, hz };
}

export const laneSample = (l: Lane): number => l.amp * Math.sin(l.phase);
