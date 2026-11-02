import type { SkyFlight } from "./lines";
import type { TrackNote } from "./day-track";

// art:track — in LIVE the recording goes round and each of its notes is handed to the live route that fits it best.

const ROUTE_RE = /^[A-Z]{3}-[A-Z]{3}$/;
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
};
export const pcOfRoute = (route: string): number => hash(route) % 12;
const pcDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
};

const IST = { lat: 41.2613, lon: 28.742 };
const rad = (x: number): number => (x * Math.PI) / 180;
/** great-circle km from Istanbul to the far end of a live route; null when the far end is unknown */
export function routeKm(f: SkyFlight): number | null {
  if (f.farLat === undefined || f.farLon === undefined) return null;
  const c = Math.sin(rad(IST.lat)) * Math.sin(rad(f.farLat)) + Math.cos(rad(IST.lat)) * Math.cos(rad(f.farLat)) * Math.cos(rad(f.farLon - IST.lon));
  return 6371 * Math.acos(Math.min(1, Math.max(-1, c)));
}
/** value → 0..1 position in a sorted sample */
export const rankIn = (sorted: number[]) => (v: number): number => {
  if (sorted.length < 2) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo / (sorted.length - 1);
};
/** weight of |route length rank − note duration rank| (4 = a full mismatch costs a major third in pitch class) */
export const W_DUR = 4;

export interface Ranks {
  /** 0..1 position of a note length among the track's notes */
  dur: (d: number) => number;
  /** 0..1 position of a route length (km) among the day's routes */
  len: (km: number) => number;
}
/** The rank functions of a loaded track (`lenQ` = the 21 length quantiles of the day it was composed for). */
export function ranksOf(notes: TrackNote[], lenQ: number[] | undefined): Ranks {
  return { dur: rankIn(notes.map((x) => x.d).sort((a, b) => a - b)), len: rankIn(lenQ && lenQ.length > 1 ? lenQ : [0, 1]) };
}

/**
 * The live route that fits a note best: its pitch class matches the route's colour, its register follows the flight level
 * and (with `ranks`) a long note goes to a long route, a short one to a short route.
 */
export function bestRoute(n: TrackNote, sky: SkyFlight[], recent: Map<string, number>, at: number, rest = 1.2, ranks?: Ranks): SkyFlight | null {
  let best: { f: SkyFlight; score: number } | null = null;
  for (const f of sky) {
    if (!ROUTE_RE.test(f.key)) continue;
    if (at - (recent.get(f.key) ?? -1e9) < rest) continue;
    const regP = 48 + (Math.min(f.alt100 * 100, 41000) / 41000) * 36;
    let score = pcDist(pcOfRoute(f.key), n.p % 12) + (Math.abs(regP - n.p) / 12) * 0.6;
    if (ranks) {
      const km = routeKm(f);
      score += W_DUR * (km === null ? 0.25 : Math.abs(ranks.len(km) - ranks.dur(n.d)));
    }
    if (!best || score < best.score) best = { f, score };
  }
  return best ? best.f : null;
}
