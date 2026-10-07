import type { SectionId } from "./form";
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
  KEYS: "#c9a7ff", BRASS: "#fff1cf",
  DARBUKA: "#F7C548", CONGA: "#7BD389", TAIKO: "#F2508F", TIMP: "#A98BFF", SHAKER: "#3FC8F2",
  TOM: "#d9dce3", CRASH: "#fff1cf", RISER: "#fff1cf",
  HARP: "#9fe3ff", GUITAR: "#e8b64a", SAZ: "#F2508F", KANUN: "#F7C548", MARIMBA: "#7BD389", CELLO: "#A98BFF",
  VIOLIN: "#c9a7ff", FLUTE: "#3FC8F2", ORGAN: "#d9dce3", STR: "#A98BFF",
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

/** A note of a trail: its start `t` (wall s), pitch height `y` (`pitchY`) and v5 length `dur` (s). */
export interface TrailPoint {
  t: number;
  y: number;
  dur: number;
  /** note velocity 0..1 (art:track: strong notes get a route label on the ribbon) */
  v: number;
}

/** One trace of the pitch ribbon: the notes of a flight line (or of an Istanbul instrument), oldest first. */
export interface Trail {
  lineId: string;
  color: string;
  points: TrailPoint[];
  /** `at` of the latest note */
  lastHit: number;
}

export const MAX_TRAILS = 12;
export const TRAIL_TTL_SEC = 6;
/** art:track — the recorded track fills the ribbon with many routes: a long window, many trails (a flowing field of colour). */
export const TRACK_RIBBON_SEC = 26;
export const TRACK_MAX_TRAILS = 120;
export const TRACK_MAX_POINTS = 60;

/** Trail of a note: its flight line, the instrument for Istanbul (ney, winds) notes, none for groove voices. */
export const trailIdOf = (n: NoteEvent): string | null =>
  n.lineId ?? (n.kind === "dep" || n.kind === "arr" ? n.instrument : null);

/** Appends the note to its trail (trimmed to `maxPoints`); a new trail beyond 12 drops the one hit longest ago. */
export function pushTrail(trails: Map<string, Trail>, n: NoteEvent, color: string, maxPoints = 90, maxTrails = MAX_TRAILS): void {
  const id = trailIdOf(n);
  if (id === null) return;
  let t = trails.get(id);
  if (!t) {
    while (trails.size >= maxTrails) {
      let oldest: string | null = null;
      let min = Infinity;
      for (const [k, v] of trails) if (v.lastHit < min) [oldest, min] = [k, v.lastHit];
      trails.delete(oldest!);
    }
    t = { lineId: id, color, points: [], lastHit: n.at };
    trails.set(id, t);
  }
  t.color = color;
  t.points.push({ t: n.at, y: pitchY(n.pitch), dur: Math.max(0, n.durSec ?? 0), v: n.vel });
  if (t.points.length > maxPoints) t.points.splice(0, t.points.length - maxPoints);
  t.lastHit = Math.max(t.lastHit, n.at);
}

/** Minimum length (px, × DPR) and height (× DPR) of a note bar on the pitch ribbon. */
export const NOTE_BAR_MIN_PX = 3;
export const NOTE_BAR_H_PX = 3;

/** v5 note bar: `[x, width]` of a note starting at `x` lasting `dur` s at `pxPerSec`, at least `NOTE_BAR_MIN_PX · dpr` wide. */
export const noteBar = (x: number, dur: number, pxPerSec: number, dpr: number): [number, number] => [
  x, Math.max(NOTE_BAR_MIN_PX * dpr, dur * pxPerSec),
];

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

// ---------------------------------------------------------------- v4 (spec §4f): level bar, layer dots, label

/** Segments of the level bar (rhythm levels 0 … 4). */
export const LEVEL_SEGMENTS = 5;

/** The lit segments of the level bar: 0 … level (level 0 lights the first one), clamped to the bar. */
export const levelSegments = (level: number): boolean[] =>
  Array.from({ length: LEVEL_SEGMENTS }, (_, i) => i <= Math.min(LEVEL_SEGMENTS - 1, Math.max(0, level)));

/** Colour of the level bar per section: night blue, morning amber, day sky, evening orange. */
export const SECTION_COLOR: Record<SectionId, string> = { NIGHT: "#7f8cff", MORNING: "#ffd27a", DAY: "#3FC8F2", EVENING: "#ff9f43" };

/** The instrument a region layer adds: its percussion, or the Rhodes of the domestic/unknown lines. */
export function layerInstrument(region: string): Instrument {
  switch (region) {
    case "EUR":
      return "SHAKER";
    case "MEA":
      return "DARBUKA";
    case "AFR":
      return "CONGA";
    case "ASI":
      return "TAIKO";
    case "AME":
      return "TIMP";
    default:
      return "EP";
  }
}

export const layerColor = (region: string): string => INSTRUMENT_COLOR[layerInstrument(region)];

/** The scope label in three parts (the chord is set apart so it keeps its case): `ROUTES → MUSIC · <SECTION> · <CHORD> · <BPM> BPM · L<level>`. */
export const scopeLabel = (m: { section: string; chord: string; bpm: number; level: number }): [string, string, string] => [
  `ROUTES → MUSIC · ${m.section} · `, m.chord, ` · ${m.bpm} BPM · L${m.level}`,
];

// ---- art:track — which routes play right now (the "NOW PLAYING" list) -------------------------------------------------

/** "IST-JFK" (direction kept) for the notes of the recorded track; null for generative flight-line ids. */
export const routeOfNote = (n: NoteEvent): string | null => (n.lineId && /^[A-Z]{3}-[A-Z]{3}$/.test(n.lineId) ? n.lineId : null);

/** Stable route colour: the same hue wherever the route shows (ribbon, list). */
export function routeColor(route: string): string {
  let h = 0;
  for (let i = 0; i < route.length; i++) h = (h * 31 + route.charCodeAt(i)) % 360;
  return `hsl(${h}, 80%, 62%)`;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** Scientific pitch name of a frequency: 440 → "A4". */
export function noteName(freq: number): string {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export interface Playing {
  route: string;
  note: string;
  alt?: number;
  until: number;
}

/** Adds a sounding route note; one entry per route (the latest note wins), kept for the note's length (≥ `minHold` s). */
export function playingPush(list: Playing[], n: NoteEvent, now: number, minHold = 0.7): Playing[] {
  const route = routeOfNote(n);
  if (!route) return list;
  const next = list.filter((p) => p.route !== route);
  next.unshift({ route, note: noteName(n.freq), alt: n.alt, until: now + Math.max(minHold, n.durSec) });
  return next;
}

/** Entries still sounding at `now`, newest first, at most `max`. */
export const playingNow = (list: Playing[], now: number, max = 8): Playing[] => list.filter((p) => p.until > now).slice(0, max);

/** art:track — label while the recorded track drives the music: `ROUTES → MUSIC · 18:00 İST · 158 AIRBORNE`. */
export const dayLabel = (d: { hour: number; airborne: number }): string =>
  `ROUTES → MUSIC · ${String(Math.floor(d.hour)).padStart(2, "0")}:00 İST · ${d.airborne} AIRBORNE`;

/** The music window (0 … windows−1) a position 0..1 of the day lies in. */
export const windowAt = (pos: number, windows: number): number => Math.min(windows - 1, Math.max(0, Math.floor(pos * windows)));
