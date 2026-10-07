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

/** The live route that fits a note best: its pitch class matches the route's colour, its register follows the flight level. */
export function bestRoute(n: TrackNote, sky: SkyFlight[], recent: Map<string, number>, at: number, rest = 1.2): SkyFlight | null {
  let best: { f: SkyFlight; score: number } | null = null;
  for (const f of sky) {
    if (!ROUTE_RE.test(f.key)) continue;
    if (at - (recent.get(f.key) ?? -1e9) < rest) continue;
    const regP = 48 + (Math.min(f.alt100 * 100, 41000) / 41000) * 36;
    const score = pcDist(pcOfRoute(f.key), n.p % 12) + (Math.abs(regP - n.p) / 12) * 0.6;
    if (!best || score < best.score) best = { f, score };
  }
  return best ? best.f : null;
}
