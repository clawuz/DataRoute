import type { NoteEvent } from "./notes-bus";
import { freqOf, type Instrument } from "./theory";

/**
 * Colours of the ROUTES → MUSIC scope: the continent palette for the flight lines (and the Rhodes of domestic/unknown
 * lines), the THY-red ney and the warm wind ensemble, the groove voices of the rhythm strip, and the v4 layer
 * percussion in its continent's colour.
 */
export const INSTRUMENT_COLOR: Record<Instrument, string> = {
  EUR: "#3FC8F2", PNO: "#9fe3ff", MEA: "#F7C548", AFR: "#7BD389", ASI: "#F2508F", AME: "#A98BFF",
  DOM: "#F2F4F8", NEY: "#E30A17", CLA: "#ff9f43", SAX: "#e8b64a", TPT: "#fff1cf", UNK: "#6B7280",
  EP: "#c9a7ff", BASS: "#f2f4f8", KICK: "#f2f4f8", SNARE: "#d9dce3", HAT: "#b6bcc9", OHAT: "#b6bcc9",
  KEYS: "#c9a7ff", BRASS: "#fff1cf", SAXPAD: "#e8b64a",
  DARBUKA: "#F7C548", CONGA: "#7BD389", TAIKO: "#F2508F", TIMP: "#A98BFF", SHAKER: "#3FC8F2",
  TOM: "#d9dce3", CRASH: "#fff1cf", RISER: "#fff1cf",
};

/** Top-to-bottom lanes of the rhythm strip (the open hat shares the hat lane, see `laneOf`). */
export const LANE_ORDER: Instrument[] = ["KICK", "SNARE", "HAT", "BASS"];

/** Visual decay time constants (s) of the rhythm lanes, close to each voice's audible decay. */
export const DECAY_SEC: Partial<Record<Instrument, number>> = { KICK: 0.3, SNARE: 0.2, HAT: 0.08, BASS: 0.5 };

/** Pitch range of the ribbon: A2 … A6, logarithmic. */
export const PITCH_MIN = freqOf(2, 0);
export const PITCH_MAX = freqOf(5, 12);

/** Height of a pitch in the ribbon, 0 = lowest (A2), 1 = highest (A6), clamped. */
export const pitchY = (freq: number): number =>
  Math.min(1, Math.max(0, Math.log2(freq / PITCH_MIN) / Math.log2(PITCH_MAX / PITCH_MIN)));

/** One trace of the pitch ribbon: the note hits of a flight line (or of an Istanbul instrument), oldest first. */
export interface Trail {
  lineId: string;
  color: string;
  points: { t: number; y: number }[];
  /** `at` of the latest note */
  lastHit: number;
}

export const MAX_TRAILS = 12;
export const TRAIL_TTL_SEC = 6;

/** Trail of a note: its flight line, the instrument for Istanbul (ney, winds) notes, none for groove voices. */
export const trailIdOf = (n: NoteEvent): string | null =>
  n.lineId ?? (n.kind === "dep" || n.kind === "arr" ? n.instrument : null);

/** Appends the note to its trail (trimmed to `maxPoints`); a new trail beyond 12 drops the one hit longest ago. */
export function pushTrail(trails: Map<string, Trail>, n: NoteEvent, color: string, maxPoints = 90): void {
  const id = trailIdOf(n);
  if (id === null) return;
  let t = trails.get(id);
  if (!t) {
    while (trails.size >= MAX_TRAILS) {
      let oldest: string | null = null;
      let min = Infinity;
      for (const [k, v] of trails) if (v.lastHit < min) [oldest, min] = [k, v.lastHit];
      trails.delete(oldest!);
    }
    t = { lineId: id, color, points: [], lastHit: n.at };
    trails.set(id, t);
  }
  t.color = color;
  t.points.push({ t: n.at, y: pitchY(n.pitch) });
  if (t.points.length > maxPoints) t.points.splice(0, t.points.length - maxPoints);
  t.lastHit = Math.max(t.lastHit, n.at);
}

/** Drops the trails not hit for `ttl` seconds. */
export function pruneTrails(trails: Map<string, Trail>, now: number, ttl = TRAIL_TTL_SEC): void {
  for (const [k, v] of trails) if (now - v.lastHit > ttl) trails.delete(k);
}

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
