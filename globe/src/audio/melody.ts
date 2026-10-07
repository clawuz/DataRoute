import { initialBearing } from "@collector/geo";
import type { Section } from "./form";
import { ladderFreq, scaleLadder, type Chord } from "./harmony";

/**
 * The Istanbul ney and its wind ensemble (spec §4c, on v3 harmony §4e): data-born three-note cells walk the
 * chord-scale ladder of the chord current at the cell. All pitches are absolute semitones above A2 (110 Hz).
 */

const mod12 = (x: number): number => ((x % 12) + 12) % 12;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
/** Reflects `x` back into [lo, hi] at the bounds (one bounce, then clamped for safety). */
const reflect = (x: number, lo: number, hi: number): number => clamp(x > hi ? 2 * hi - x : x < lo ? 2 * lo - x : x, lo, hi);

/** Semitones the ney window spans above its home A (twelve rungs of a seven-note scale: A … E an octave and a fifth up). */
const NEY_SPAN = 19;

/** The ney's ladder: the chord scale inside [12·(neyOct − 2), +19] (the section's home A upwards). */
export function neyLadder(chord: Chord, sec: Section): number[] {
  const lo = 12 * (sec.neyOct - 2);
  return scaleLadder(chord, sec.neyOct, sec.neyOct + 1).filter((s) => s >= lo && s <= lo + NEY_SPAN);
}

/** Octaves of the winds' ladder (the clarinet's third, the sax's fifth and the trumpet's octave are counted on it). */
export const WIND_LADDER_OCTS: [number, number] = [2, 5];

/** Rung of `ladder` nearest to `semis` (ties → lower). */
function nearestRung(ladder: number[], semis: number): number {
  let best = 0;
  for (let i = 1; i < ladder.length; i++) if (Math.abs(ladder[i] - semis) < Math.abs(ladder[best] - semis)) best = i;
  return best;
}

/** The next chord-scale pitch above `semis` (the ney's grace note). */
export function graceAbove(semis: number, chord: Chord): number {
  for (let s = Math.floor(semis) + 1; ; s++) if (chord.scale.includes(mod12(s))) return s;
}

export interface NeyState {
  /** absolute semitone (above A2) of the last ney note; snapped onto the current chord's ladder on each call */
  last: number;
  /** cells played in the current phrase (0–3) */
  cell: number;
  /** the ney is silent while `beat < restUntilBeat` (cell in progress or the breath after a cadence) */
  restUntilBeat: number;
}

export const initNey = (sec: Section): NeyState => ({ last: 12 * (sec.neyOct - 2), cell: 0, restUntilBeat: 0 });

export const IST_LAT = 41.2613;
export const IST_LON = 28.742;
/** Initial great-circle bearing from Istanbul to the far end, degrees in [0, 360). */
export const bearingOf = (farLat: number, farLon: number): number => initialBearing(IST_LAT, IST_LON, farLat, farLon);

export type Contour = "up" | "down" | "arch";

/** Within 30° of due north or south → arch; eastward half → up; westward → down. */
export function contourFor(bearing: number): Contour {
  const b = ((bearing % 360) + 360) % 360;
  const off = (target: number) => {
    const d = Math.abs(b - target);
    return Math.min(d, 360 - d);
  };
  if (off(0) < 30 || off(180) < 30) return "arch";
  return b < 180 ? "up" : "down";
}

export const stepFor = (distKm: number): 1 | 2 | 3 => (distKm < 1500 ? 1 : distKm < 4000 ? 2 : 3);

export interface NeyNote {
  freq: number;
  /** absolute semitone above A2 */
  semis: number;
  /** offset in eighth notes from the cell's first note */
  slotOffset: number;
  /** v5: held for this many eighth-note slots (cell notes 1, 1, 3; the cadence 8) */
  durSlots: number;
  vel: number;
  grace: boolean;
  long: boolean;
}

export interface NeyEvent {
  distKm: number;
  farLat?: number;
  farLon?: number;
  kind: "dep" | "arr";
}

/** Rung in `ladder` with a pitch class in `pcs` nearest to rung `target` (ties → lower), skipping rung `avoid`. */
function nearestTone(ladder: number[], pcs: number[], target: number, avoid = -1): number {
  let best = -1;
  for (let i = 0; i < ladder.length; i++) {
    if (i === avoid || !pcs.includes(mod12(ladder[i]))) continue;
    if (best < 0 || Math.abs(i - target) < Math.abs(best - target)) best = i;
  }
  return best < 0 ? clamp(target, 0, ladder.length - 1) : best;
}

const note = (ladder: number[], i: number, slotOffset: number, durSlots: number, vel: number, grace = false, long = false): NeyNote => ({
  freq: ladderFreq(ladder[i]), semis: ladder[i], slotOffset, durSlots, vel, grace, long,
});

/** v5 durations (eighth-note slots): the cell's third note is held; the cadence lasts a bar of eighths. */
export const CELL_DUR_SLOTS = [1, 1, 3] as const;
export const CADENCE_DUR_SLOTS = 8;

/**
 * One Istanbul-end event → a three-note ney cell shaped by the route (bearing → contour, distance → step in ladder rungs),
 * or, as the fourth cell of a phrase, a single long cadence note on the chord root/fifth followed by a breath.
 * Pure: the same event stream gives the same melody. `beat` counts quarter notes from the section epoch.
 */
export function neyCell(e: NeyEvent, st: NeyState, chord: Chord, beat: number, sec: Section): { notes: NeyNote[]; state: NeyState } {
  if (beat < st.restUntilBeat) return { notes: [], state: st };
  const L = neyLadder(chord, sec);
  const hi = L.length - 1;
  const last = nearestRung(L, st.last);
  if (st.cell === 3) {
    const i = nearestTone(L, [chord.tones[0], chord.tones[2]], last);
    return { notes: [note(L, i, 0, CADENCE_DUR_SLOTS, 1.0, false, true)], state: { last: L[i], cell: 0, restUntilBeat: beat + 2 } };
  }
  const arr = e.kind === "arr";
  const target = arr ? Math.max(0, last - 7) : last; // seven rungs = an octave
  const n0 = nearestTone(L, chord.tones, target, L[last] === st.last ? last : -1); // never the same note again
  const bearing = Number.isFinite(e.farLat) && Number.isFinite(e.farLon) ? bearingOf(e.farLat!, e.farLon!) : 90;
  const step = stepFor(e.distKm);
  const dir = arr ? -1 : 1; // arrivals reverse the contour
  const contour = contourFor(bearing);
  let n1: number;
  let n2: number;
  if (contour === "arch") {
    n1 = reflect(n0 + dir * step, 0, hi);
    n2 = reflect(n0 - dir, 0, hi);
  } else {
    const s = (contour === "up" ? 1 : -1) * dir;
    n1 = reflect(n0 + s * step, 0, hi);
    n2 = reflect(n1 + (step >= 2 ? -s : s), 0, hi); // after a leap, one degree back
  }
  const [d0, d1, d2] = CELL_DUR_SLOTS;
  const notes = [note(L, n0, 0, d0, 0.8, beat % 4 === 0), note(L, n1, 1, d1, 0.9), note(L, n2, 2, d2, 0.7)];
  // the cell spans three eighth notes (1.5 beats); the ney is monophonic, so the next cell waits two beats
  return { notes, state: { last: L[n2], cell: st.cell + 1, restUntilBeat: beat + 2 } };
}

export type Wind = "CLA" | "SAX" | "TPT";
export interface WindPart {
  instrument: Wind;
  freq: number;
  semis: number;
  slotOffset: number;
  /** v5: eighth-note slots held (clarinet = its note, saxophone twice its note, trumpet = the cadence) */
  durSlots: number;
  vel: number;
  long: boolean;
}

/**
 * The wind ensemble derived from one ney cell or cadence, counted in rungs of the chord-scale ladder (octaves 2–5):
 * clarinet a third (two rungs) below each cell note, saxophone a fifth (four rungs) below the cell's first note and the
 * cadence, trumpet an octave (seven rungs) above the cadence; each only when the section's ensemble includes it.
 * Phrase rests (empty cells) give no winds.
 */
export function windParts(cell: NeyNote[], chord: Chord, sec: Section): WindPart[] {
  if (cell.length === 0) return [];
  const W = scaleLadder(chord, WIND_LADDER_OCTS[0], WIND_LADDER_OCTS[1]);
  const at = (instrument: Wind, n: NeyNote, rungs: number, vel: number, long: boolean): WindPart => {
    const s = W[reflect(nearestRung(W, n.semis) + rungs, 0, W.length - 1)];
    const durSlots = instrument === "SAX" ? 2 * n.durSlots : n.durSlots;
    return { instrument, freq: ladderFreq(s), semis: s, slotOffset: n.slotOffset, durSlots, vel, long };
  };
  const cadence = cell.length === 1 && cell[0].long;
  const has = (w: Wind) => sec.instruments.has(w);
  const out: WindPart[] = [];
  if (!cadence && has("CLA")) for (const n of cell) out.push(at("CLA", n, -2, 0.7 * n.vel, false));
  if (has("SAX")) out.push(at("SAX", cell[0], -4, 0.6 * cell[0].vel, true));
  if (cadence && has("TPT")) out.push(at("TPT", cell[0], 7, 0.9 * cell[0].vel, true));
  return out;
}
