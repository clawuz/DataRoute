import type { SkyFlight } from "./lines";
import type { PlannedNote } from "./score";
import { hzOfMidi, instrumentOf, notesBetween, type TrackNote } from "./day-track";

// art:track — after the recorded track (and in LIVE) the music goes on with the NOTES of that track: the note sequence
// loops, thinned by the traffic, and every note is handed to the live route that fits it best.

const ROUTE_RE = /^[A-Z]{3}-[A-Z]{3}$/;
/** the notes are 3 minutes long; the loop restarts here */
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

/** Traffic 0..1 → the quietest note velocity that still plays (1 = every note, 0 = only the strongest ones). */
export const velocityFloor = (intensity: number): number => (1 - Math.min(1, Math.max(0, intensity))) * 0.7;

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

export interface Continuation {
  /** notes sounding while the loop cursor moved from the last call to `cursorNow`, played by live routes; wall-clock `when` */
  step(wallNow: number, sky: SkyFlight[], intensity: number): PlannedNote[];
  reset(): void;
}

export function createContinuation(notes: TrackNote[], duration: number, lookahead = 0.25): Continuation {
  let cursor: number | null = null; // loop position (s) up to which notes were handed out
  let lastWall = 0;
  const recent = new Map<string, number>();
  return {
    reset() {
      cursor = null;
    },
    step(wallNow, sky, intensity) {
      if (duration <= 0 || notes.length === 0) return [];
      if (cursor === null || wallNow - lastWall > 1.5) cursor = (cursor ?? 0) % duration; // after a stall: resume, no burst
      const dt = Math.min(1.5, Math.max(0, wallNow - lastWall));
      lastWall = wallNow;
      const from = cursor;
      const to = from + dt + (cursor === null ? 0 : 0);
      cursor = (from + dt) % duration;
      const ranges: [number, number][] = to <= duration ? [[from, to]] : [[from, duration], [0, to - duration]];
      const floor = velocityFloor(intensity);
      const out: PlannedNote[] = [];
      for (const [a, b] of ranges) {
        for (const n of notesBetween(notes, a, b + lookahead * 0)) {
          if (n.v < floor) continue;
          const f = bestRoute(n, sky, recent, wallNow);
          if (!f) continue;
          recent.set(f.key, wallNow);
          const hz = hzOfMidi(n.p);
          out.push({
            when: wallNow + Math.max(0, n.t - b) + lookahead,
            instrument: instrumentOf(n.p),
            freq: hz,
            vel: Math.min(1, 0.3 + n.v * 0.7),
            kind: "line",
            key: f.key,
            lineId: f.key,
            durSec: n.d,
            alt: f.alt100 * 100,
          });
        }
      }
      return out;
    },
  };
}
