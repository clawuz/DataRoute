import { REGIONS } from "@web/data/palette";
import { scaleLadder, snapToTones, type Chord } from "./harmony";
import { euclid, isWestNorth, routeHash, type Instrument, type RegionName } from "./theory";

/**
 * Music v3 flight lines (spec §4e): up to 12 airborne flights each play a line whose pitch is their altitude
 * on the current chord-scale ladder, in a rotated euclidean rhythm, with their continent's instrument.
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
}

export const MAX_LINES = 12;
export const REGION_CAP = 4;

/**
 * Followed flight first, then by route count (descending), ties by `routeHash(id)` then id; at most 4 per region.
 * With `active` (v4 region layers), only flights of active regions are candidates — the followed flight always plays.
 */
export function selectLines(
  flights: SkyFlight[], followedId: string | null, max = MAX_LINES, active?: ReadonlySet<RegionName>,
): SkyFlight[] {
  const count = new Map<string, number>();
  for (const f of flights) count.set(f.key, (count.get(f.key) ?? 0) + 1);
  const out: SkyFlight[] = [];
  const perRegion = new Map<number, number>();
  const take = (f: SkyFlight) => {
    out.push(f);
    perRegion.set(f.regionIdx, (perRegion.get(f.regionIdx) ?? 0) + 1);
  };
  const followed = followedId === null ? undefined : flights.find((f) => f.id === followedId);
  if (followed && max > 0) take(followed);
  const rest = flights
    .filter((f) => f !== followed && f.id !== followedId && (!active || active.has(REGIONS[f.regionIdx])))
    .sort((a, b) => count.get(b.key)! - count.get(a.key)! || routeHash(a.id) - routeHash(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const f of rest) {
    if (out.length >= max) break;
    if ((perRegion.get(f.regionIdx) ?? 0) >= REGION_CAP) continue;
    take(f);
  }
  return out;
}

/** Continent instrument of a line: west/north Europe piano, the rest of Europe vibraphone (EUR), DOM/UNK Rhodes (EP). */
export function lineInstrument(f: SkyFlight): Instrument {
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

/**
 * Pitch (absolute semitones above A2) of a line at a 16th step: altitude picks the rung of the chord-scale ladder
 * (octaves 3–5), climbing/descending leans one rung up/down, America sits 7 rungs lower, strong steps snap to a chord tone.
 */
export function lineNote(f: SkyFlight, chord: Chord, step: number): number {
  const ladder = scaleLadder(chord, 3, 5);
  const top = ladder.length - 1;
  let i = Math.round(clamp(f.alt100 / TOP_ALT100, 0, 1) * top);
  if (f.vsFpm !== null && f.vsFpm > CLIMB_FPM) i += 1;
  else if (f.vsFpm !== null && f.vsFpm < -CLIMB_FPM) i -= 1;
  i = clamp(i, 0, top);
  if (REGIONS[f.regionIdx] === "AME") i = Math.max(0, i - AME_DROP);
  const semis = ladder[i];
  return step % 4 === 0 ? snapToTones(semis, chord) : semis;
}

/** Per-line gain: 0.5 / √N for N lines (N ≥ 1). */
export const lineGain = (n: number): number => 0.5 / Math.sqrt(Math.max(1, n));
