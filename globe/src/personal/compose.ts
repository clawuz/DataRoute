import type { Instrument } from "../audio/theory";
import { routeHash, freqOf } from "../audio/theory";
import type { PersonalMode } from "./codec";
import type { PersonalRoute } from "./routes";

/** one note of a personal piece; `t` is seconds from the start of the piece */
export interface PersonalNote {
  t: number;
  d: number;
  instrument: Instrument;
  freq: number;
  vel: number;
  /** route key — what lights on the globe when the note sounds */
  key: string;
  /** index into the routes */
  route: number;
}

export interface PersonalPiece {
  notes: PersonalNote[];
  duration: number;
}

const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR_PENT = [0, 2, 4, 7, 9];
/** root D (5 semitones above the A of `freqOf`) */
const ROOT = 5;

const LEAD: Record<string, Instrument> = {
  DOM: "SAZ",
  EUR: "VIOLIN",
  MEA: "KANUN",
  AFR: "MARIMBA",
  ASI: "HARP",
  AME: "FLUTE",
  UNK: "PNO",
};

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/**
 * Deterministic: the same routes in the same order always give the same piece.
 * Pitch = the route's hash on a pentatonic scale, length = the route's distance rank, instrument = its region.
 * Every fourth leg a cello holds the root; the last leg resolves on the root an octave up.
 */
export function composePiece(mode: PersonalMode, routes: PersonalRoute[]): PersonalPiece {
  if (routes.length === 0) return { notes: [], duration: 0 };
  const scale = mode === "wish" ? MAJOR_PENT : MINOR_PENT;
  const dists = routes.map((r) => r.distKm).sort((a, b) => a - b);
  const rank = (d: number): number => (dists.length < 2 ? 0.5 : dists.indexOf(d) / (dists.length - 1));
  // wish is lighter and quicker, visited is slower and warmer
  const gap = clamp((mode === "wish" ? 34 : 44) / routes.length, 0.55, mode === "wish" ? 1.6 : 2.0);
  const notes: PersonalNote[] = [];
  let t = 0.4;
  routes.forEach((r, i) => {
    const h = routeHash(r.key);
    const rk = rank(r.distKm);
    const degree = h % scale.length;
    const oct = (mode === "wish" ? 3 : 2) + (h >> 8) % 2 + (rk > 0.66 ? 0 : 1);
    const last = i === routes.length - 1;
    const semis = last ? ROOT + 12 : ROOT + scale[degree];
    const d = 0.5 + rk * 2.2;
    notes.push({
      t,
      d,
      instrument: LEAD[r.region] ?? "PNO",
      freq: freqOf(oct + (last ? 1 : 0), semis % 12),
      vel: 0.55 + 0.35 * (1 - rk),
      key: r.key,
      route: i,
    });
    if (i % 4 === 0 || last) {
      notes.push({ t, d: gap * 4, instrument: "CELLO", freq: freqOf(1, ROOT + (i % 8 === 4 ? 7 : 0)), vel: 0.5, key: r.key, route: i });
    }
    t += gap;
  });
  const end = Math.max(...notes.map((n) => n.t + n.d));
  return { notes, duration: end + 1.2 };
}
