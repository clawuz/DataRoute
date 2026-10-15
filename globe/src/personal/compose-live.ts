import type { Instrument } from "../audio/theory";
import { routeHash } from "../audio/theory";
import { pcOfRoute, rankIn, W_DUR } from "../audio/route-fit";
import type { PersonalMode } from "./codec";
import type { PersonalNote, PersonalPiece, PersonalStyle } from "./compose";
import { altitudeFt } from "./flight";
import type { PersonalRoute } from "./routes";
import track from "./live-track.json";

/**
 * The base of the personal pieces is the live card's own music: the symphonic recording of the day (about three
 * minutes, 2125 notes). Its notes are not invented again: each one is handed to the route that fits it best — as the
 * live card does — and played by one of the orchestra's recorded instruments, so a piece has exactly as many voices as
 * the person has routes. What differs from person to person is which routes carry which notes, the key, the speed,
 * and the instruments each route takes.
 */
type Raw = [number, number, number, number]; // t (1/100 s), d (1/100 s), midi pitch, velocity (0..100)
const NOTES = track.notes as Raw[];
const SPAN = track.duration as number;

const pcDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
};
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const hzOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** transpositions that keep the track inside the instruments' ranges */
const SHIFTS = [0, 0, 2, -2, 3, -3, 5, -5];

/** instruments by register of the original note (a lane), and a few short-note colours; the first fits the region best */
const LANES: { max: number; long: Instrument[]; short: Instrument[] }[] = [
  { max: 50, long: ["CELLO", "BSN", "HORN", "CELLO"], short: ["CELLO_PIZZ", "BASS_PIZZ", "BSN", "TIMP"] },
  { max: 62, long: ["VIOLA", "CLA", "HORN", "VIOLA"], short: ["VIOLA_PIZZ", "CLA", "HARP", "HORN"] },
  { max: 74, long: ["VIOLIN", "OBOE", "TPT", "FLUTE"], short: ["VIOLIN_PIZZ", "OBOE", "HARP", "XYLO"] },
  { max: 128, long: ["FLUTE", "VIOLIN", "PICC", "OBOE"], short: ["GLOCK", "FLUTE", "HARP", "XYLO"] },
];
/** a region's own colour in the long notes of the middle lanes (the orchestra's ney) */
const COLOUR: Record<string, Instrument> = { DOM: "NEY", MEA: "NEY" };

const CEILING: Partial<Record<Instrument, number>> = {
  VIOLIN: 1320, VIOLA: 1000, CELLO: 700, OBOE: 1175, CLA: 1175, FLUTE: 1400, PICC: 1568, HORN: 700, TPT: 1047, HARP: 1568,
  GLOCK: 1568, XYLO: 1319, NEY: 1175, BSN: 466, VIOLIN_PIZZ: 1320, VIOLA_PIZZ: 1000, CELLO_PIZZ: 700,
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LiveStyle {
  bpm: number;
  shift: number;
  /** playback speed of the recording (1 = as recorded) */
  speed: number;
}

/** speed, key and the palette offset from the selection (the same selection always gives the same piece) */
export function liveStyleFor(mode: PersonalMode, routes: PersonalRoute[]): LiveStyle & { palette: number } {
  const r = rng(routeHash(`live|${mode}|${routes.map((x) => x.key).join(">")}`));
  // a wish is a little quicker and brighter; both keep the piece between about 2:25 and 3:15
  const speed = mode === "wish" ? 1.02 + r() * 0.2 : 0.94 + r() * 0.14;
  return { bpm: Math.round(98 * speed), shift: SHIFTS[Math.floor(r() * SHIFTS.length)], speed, palette: Math.floor(r() * 4) };
}

export function composeFromTrack(mode: PersonalMode, routes: PersonalRoute[], style: PersonalStyle): PersonalPiece {
  const ls = liveStyleFor(mode, routes);
  const n = routes.length;
  const dur = SPAN / ls.speed;
  const empty: PersonalPiece = { notes: [], duration: 0, hook: 0, bpm: ls.bpm, sections: [], energy: [], style };
  if (n === 0) return empty;

  // length ranks: a long note goes to a long route
  const noteDurs = NOTES.map((x) => x[1]).sort((a, b) => a - b);
  const durRank = rankIn(noteDurs);
  const kms = routes.map((r) => r.distKm).sort((a, b) => a - b);
  const lenRank = rankIn(kms);
  const pcs = routes.map((r, i) => pcOfRoute(r.key + i));
  // each route plays one note at a time and rests a moment between notes
  const busy = new Array<number>(n).fill(-1e9);
  const REST = 0.3;
  // a route's flight phrase (take-off … landing) over the piece: its register follows the altitude
  const phrase = routes.map((r) => clamp(Math.round(10 + 40 * lenRank(r.distKm)), 12, 48)); // seconds

  const notes: PersonalNote[] = [];
  for (const [t100, d100, p0, v100] of NOTES) {
    const t = t100 / 100 / ls.speed;
    const d = d100 / 100 / ls.speed;
    const p = p0 + ls.shift;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      if (t - busy[i] < REST) continue;
      const alt = altitudeFt((t % phrase[i]) / phrase[i], routes[i].distKm);
      const regP = 48 + (clamp(alt, 0, 41000) / 41000) * 36;
      const score = pcDist(pcs[i], p % 12) + (Math.abs(regP - p0) / 12) * 0.6 + W_DUR * Math.abs(lenRank(routes[i].distKm) - durRank(d100));
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) continue; // every route is busy: the note is not played (the density follows the routes)
    busy[best] = t + d;
    const r = routes[best];
    const lane = LANES.find((l) => p0 < l.max)!;
    const short = d100 < 28;
    const list = short ? lane.short : lane.long;
    const h = routeHash(r.key + best);
    let inst = list[(h + ls.palette) % list.length];
    if (!short && COLOUR[r.region] && lane.max > 50 && lane.max <= 74 && (h + ls.palette) % 3 === 0) inst = COLOUR[r.region];
    let f = hzOf(p);
    const cap = CEILING[inst];
    if (cap) while (f > cap) f /= 2;
    const alt = altitudeFt((t % phrase[best]) / phrase[best], r.distKm);
    notes.push({ t, d: Math.max(0.08, d * 0.97), instrument: inst, freq: f, vel: clamp(v100 / 100, 0.1, 1), key: r.key, route: best, via: best, alt });
  }

  // how the music box draws a route's notes: only until the next note of the same route
  const byRoute = new Map<number, PersonalNote[]>();
  for (const x of notes) byRoute.set(x.route, [...(byRoute.get(x.route) ?? []), x]);
  for (const list of byRoute.values()) {
    list.sort((a, b) => a.t - b.t);
    list.forEach((x, k) => {
      const next = list[k + 1];
      x.drawDur = next ? Math.max(0.05, Math.min(x.d, (next.t - x.t) * 0.92)) : x.d;
    });
  }

  // loudness curve and the best 15 s (the busiest, loudest stretch) from what is actually played
  const BINS = 48;
  const load = new Array<number>(BINS).fill(0);
  for (const x of notes) load[Math.min(BINS - 1, Math.floor((x.t / dur) * BINS))] += x.vel * Math.min(1.5, x.d);
  const peak = Math.max(...load, 1e-6);
  const energy = load.map((x) => clamp(0.3 + 0.7 * (x / peak), 0, 1));
  const win = Math.max(1, Math.round((15 / dur) * BINS));
  let hookBin = Math.round(BINS * 0.4);
  let hookSum = -1;
  // not in the intro or the last stretch: the best 15 s of the middle of the piece
  for (let b = Math.round(BINS * 0.25); b + win <= Math.round(BINS * 0.85); b++) {
    const s = load.slice(b, b + win).reduce((a, c) => a + c, 0);
    if (s > hookSum) {
      hookSum = s;
      hookBin = b;
    }
  }
  const FORM: [string, number][] = [["intro", 8], ["verse", 16], ["build", 8], ["chorus", 16], ["break", 8], ["outro", 8]];
  let at = 0;
  const sections = FORM.map(([name, m]) => {
    const start = (at / 64) * dur;
    at += m;
    return { name, start, end: (at / 64) * dur };
  });
  return { notes, duration: dur + 1.5, hook: (hookBin / BINS) * dur, bpm: ls.bpm, sections, energy, style };
}
