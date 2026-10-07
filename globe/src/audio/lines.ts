import { REGIONS } from "@web/data/palette";
import { scaleLadder, snapToTones, type Chord } from "./harmony";
import { euclid, isWestNorth, routeHash, type Instrument, type RegionName } from "./theory";

/**
 * Flight lines. v5 (spec §4g): one line per route — the newest flight of each route represents it and carries the
 * route's airborne count; every route plays its own four-note motif (`phrase`) on its continent's instrument menu.
 * The v3/v4 helpers (`continentInstrument`, `linePattern`, `lineNote`) stay while the engine still uses them.
 */
export interface SkyFlight {
  id: string;
  /** route key (`routeKey`): flights on the same route share it */
  key: string;
  /** index into `REGIONS` */
  regionIdx: number;
  /** altitude in hundreds of feet (flight level) */
  alt100: number;
  /** vertical speed (ft/min), null when unknown */
  vsFpm: number | null;
  /** far end of the route (the non-Istanbul airport), when known */
  farLat?: number;
  farLon?: number;
  /** v5: seconds since departure (the newest flight of a route represents it); absent = unknown, ranks last */
  ageSec?: number;
  /** v5: airborne flights on this route (set by `selectLines` on its output) */
  routeCount?: number;
}

export const MAX_LINES = 12;
export const REGION_CAP = 4;

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const age = (f: SkyFlight): number => f.ageSec ?? Infinity;
/** Newest first (smallest `ageSec`), ties by `routeHash(id)` then id. */
const newer = (a: SkyFlight, b: SkyFlight): number =>
  age(a) - age(b) || routeHash(a.id) - routeHash(b.id) || byId(a.id, b.id);

/**
 * One line per route (spec §4g). Flights are grouped by `key`; each route is represented by its newest flight (the
 * followed flight on its own route) carrying `routeCount` = the route's flights. The followed route comes first, then
 * by `routeCount` (descending), ties by `routeHash(key)` then key; at most 4 routes per region (the followed one
 * counts) and `max` in all. With `active` (v4 region layers) only routes of active regions are candidates — the
 * followed route always plays. Inputs are not mutated.
 */
export function selectLines(
  flights: SkyFlight[], followedId: string | null, max = MAX_LINES, active?: ReadonlySet<RegionName>,
): SkyFlight[] {
  const routes = new Map<string, SkyFlight[]>();
  for (const f of flights) {
    const r = routes.get(f.key);
    if (r) r.push(f);
    else routes.set(f.key, [f]);
  }
  const followed = followedId === null ? undefined : flights.find((f) => f.id === followedId);
  const reps: SkyFlight[] = [];
  for (const [key, fs] of routes) {
    const rep = followed && followed.key === key ? followed : [...fs].sort(newer)[0];
    reps.push({ ...rep, routeCount: fs.length });
  }
  const out: SkyFlight[] = [];
  const perRegion = new Map<number, number>();
  const take = (f: SkyFlight) => {
    out.push(f);
    perRegion.set(f.regionIdx, (perRegion.get(f.regionIdx) ?? 0) + 1);
  };
  const lead = followed && reps.find((f) => f.key === followed.key);
  if (lead && max > 0) take(lead);
  const rest = reps
    .filter((f) => f !== lead && (!active || active.has(REGIONS[f.regionIdx])))
    .sort((a, b) => b.routeCount! - a.routeCount! || routeHash(a.key) - routeHash(b.key) || byId(a.key, b.key));
  for (const f of rest) {
    if (out.length >= max) break;
    if ((perRegion.get(f.regionIdx) ?? 0) >= REGION_CAP) continue;
    take(f);
  }
  return out;
}

/** v3/v4 continent instrument (kept for the engine until it moves to `lineInstrument`): west/north Europe piano, the
 * rest of Europe vibraphone (EUR), DOM/UNK Rhodes (EP). */
export function continentInstrument(f: SkyFlight): Instrument {
  const region = REGIONS[f.regionIdx];
  switch (region) {
    case "EUR":
      return f.farLat !== undefined && f.farLon !== undefined && isWestNorth(f.farLat, f.farLon) ? "PNO" : "EUR";
    case "MEA":
    case "AFR":
    case "ASI":
    case "AME":
      return region;
    default:
      return "EP";
  }
}

export type MenuId = "EUR_W" | "EUR_E" | "MEA" | "AFR" | "ASI" | "AME" | "DOM" | "UNK";

/** v5 instrument menus per continent (spec §4g); the route key picks the entry. */
export const INSTRUMENT_MENU: Record<MenuId, Instrument[]> = {
  EUR_W: ["PNO", "HARP", "FLUTE"],
  EUR_E: ["EUR", "MARIMBA", "GUITAR"],
  MEA: ["MEA", "KANUN", "VIOLIN"],
  AFR: ["AFR", "MARIMBA", "GUITAR"],
  ASI: ["ASI", "FLUTE", "HARP"],
  AME: ["CELLO", "GUITAR", "ORGAN"],
  DOM: ["SAZ", "EP", "ORGAN"],
  UNK: ["EP"],
};

/** Menu of a flight: Europe splits west/north (`isWestNorth` of the far end) from east/south (also when unknown). */
export function menuOf(f: SkyFlight): MenuId {
  const region = REGIONS[f.regionIdx];
  switch (region) {
    case "EUR":
      return f.farLat !== undefined && f.farLon !== undefined && isWestNorth(f.farLat, f.farLon) ? "EUR_W" : "EUR_E";
    case "MEA":
    case "AFR":
    case "ASI":
    case "AME":
    case "DOM":
      return region;
    default:
      return "UNK";
  }
}

/** v5 line instrument: `menu[routeHash(key) % menu.length]` — the same route always plays the same instrument. */
export function lineInstrument(f: SkyFlight): Instrument {
  const menu = INSTRUMENT_MENU[menuOf(f)];
  return menu[routeHash(f.key) % menu.length];
}

export interface Motif {
  /** ladder-rung offsets from the phrase's base rung */
  offsets: number[];
  /** 16th steps of each note (sum 16 = one bar) */
  durs: number[];
}

const motif = (offsets: number[], durs: number[]): Motif => ({ offsets, durs });

/** The twelve route motifs (spec §4g table). */
export const MOTIFS: Motif[] = [
  motif([0, 2, 1, 0], [4, 4, 4, 4]),
  motif([0, 1, 2, 4], [2, 2, 4, 8]),
  motif([0, -1, 0, 2], [4, 2, 2, 8]),
  motif([0, 2, 4, 2], [2, 2, 2, 10]),
  motif([0, 1, 0, -1], [6, 2, 4, 4]),
  motif([0, 3, 2, 0], [4, 4, 2, 6]),
  motif([0, 0, 2, 1], [3, 1, 4, 8]),
  motif([2, 1, 0, 1], [4, 4, 4, 4]),
  motif([0, 2, 3, 2], [8, 2, 2, 4]),
  motif([0, 4, 3, 1], [2, 6, 4, 4]),
  motif([0, 1, 3, 2], [4, 2, 6, 4]),
  motif([1, 0, 2, 4], [2, 2, 4, 8]),
];

export interface RouteMotif {
  motif: Motif;
  /** 16th step of the bar the phrase starts on: 0, 2, 4 or 6 */
  startStep: number;
  /** a phrase every bar (busy route, ≥ 3 flights) or every second bar */
  everyBars: 1 | 2;
  /** with `everyBars` 2: phrases start on bars with `bar % 2 == barParity` */
  barParity: 0 | 1;
}

/** A route's motif and phrase timing, all from `h = routeHash(key)` (unsigned shifts, so the fields stay non-negative). */
export function motifFor(key: string, routeCount: number): RouteMotif {
  const h = routeHash(key);
  return {
    motif: MOTIFS[h % MOTIFS.length],
    startStep: ((h >>> 4) % 4) * 2,
    everyBars: routeCount >= 3 ? 1 : 2,
    barParity: ((h >>> 8) & 1) as 0 | 1,
  };
}

const mod = (x: number, m: number): number => ((x % m) + m) % m;

/** Does the route's phrase start on global 16th step `globalStep` (bar = 16 steps)? */
export function isPhraseStart(key: string, routeCount: number, globalStep: number): boolean {
  const m = motifFor(key, routeCount);
  const bar = Math.floor(globalStep / 16);
  return mod(globalStep, 16) === m.startStep && mod(bar, m.everyBars) === m.barParity % m.everyBars;
}

export interface PhraseNote {
  /** 16th steps from the phrase start */
  stepOffset: number;
  durSteps: number;
  /** absolute semitones above A2 */
  semis: number;
  vel: number;
}

/** Rotate a pattern `r` steps later (wrapping): `out[i] = p[i − r]`. */
export function rotate(p: boolean[], r: number): boolean[] {
  const n = p.length;
  return p.map((_, i) => p[(((i - r) % n) + n) % n]);
}

/** A line's 16-step rhythm: E(3 + h % 4, 16) rotated by h % 16, h = routeHash(flight id). */
export function linePattern(id: string): boolean[] {
  const h = routeHash(id);
  return rotate(euclid(3 + (h % 4), 16), h % 16);
}

const CLIMB_FPM = 300;
const TOP_ALT100 = 410;
const AME_DROP = 7;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Base rung of a flight on a ladder of `n` rungs: altitude (0 … FL410) → rung, climbing +1, descending −1, clamped. */
function baseRung(f: SkyFlight, n: number): number {
  const top = n - 1;
  let i = Math.round(clamp(f.alt100 / TOP_ALT100, 0, 1) * top);
  if (f.vsFpm !== null && f.vsFpm > CLIMB_FPM) i += 1;
  else if (f.vsFpm !== null && f.vsFpm < -CLIMB_FPM) i -= 1;
  return clamp(i, 0, top);
}

const isAme = (f: SkyFlight): boolean => REGIONS[f.regionIdx] === "AME";

/**
 * Pitch (absolute semitones above A2) of a line at a 16th step: altitude picks the rung of the chord-scale ladder
 * (octaves 3–5), climbing/descending leans one rung up/down, America sits 7 rungs lower, strong steps snap to a chord tone.
 * (v3/v4; the engine uses it until it moves to `phrase`.)
 */
export function lineNote(f: SkyFlight, chord: Chord, step: number): number {
  const ladder = scaleLadder(chord, 3, 5);
  let i = baseRung(f, ladder.length);
  if (isAme(f)) i = Math.max(0, i - AME_DROP);
  const semis = ladder[i];
  return step % 4 === 0 ? snapToTones(semis, chord) : semis;
}

const FIRST_VEL = 0.5;
const NOTE_VEL = 0.42;

/**
 * The route's four-note phrase (spec §4g). Note k starts at the cumulative motif duration (`0, d0, d0 + d1, …`) and
 * lasts `durs[k]` steps. The base rung comes from altitude/vertical speed on the first note's chord-scale ladder
 * (octaves 3–5); each note keeps the same fractional position `base / (n − 1)` on the ladder of the chord sounding at
 * its own step (`chordAt(stepOffset)`; every chord scale has seven notes, so in practice the rung is the same), America
 * 7 rungs lower (floored at 0), then `+ offsets[k]`, clamped to the ladder. The first note and notes on
 * `stepOffset % 4 == 0` snap to the nearest chord tone. Velocity 0.5 first, 0.42 the others (gain is the engine's).
 */
export function phrase(f: SkyFlight, chordAt: (stepOffset: number) => Chord): PhraseNote[] {
  const { motif: m } = motifFor(f.key, f.routeCount ?? 1);
  const out: PhraseNote[] = [];
  let frac = 0;
  let stepOffset = 0;
  for (let k = 0; k < m.offsets.length; k++) {
    const chord = chordAt(stepOffset);
    const ladder = scaleLadder(chord, 3, 5);
    const top = ladder.length - 1;
    if (k === 0) frac = top > 0 ? baseRung(f, ladder.length) / top : 0;
    let base = Math.round(frac * top);
    if (isAme(f)) base = Math.max(0, base - AME_DROP);
    const raw = ladder[clamp(base + m.offsets[k], 0, top)];
    const semis = k === 0 || stepOffset % 4 === 0 ? snapToTones(raw, chord) : raw;
    out.push({ stepOffset, durSteps: m.durs[k], semis, vel: k === 0 ? FIRST_VEL : NOTE_VEL });
    stepOffset += m.durs[k];
  }
  return out;
}

/** Per-line gain: 0.5 / √N for N lines (N ≥ 1). */
export const lineGain = (n: number): number => 0.5 / Math.sqrt(Math.max(1, n));
