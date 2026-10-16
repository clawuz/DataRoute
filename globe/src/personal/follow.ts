import { rankIn } from "../audio/route-fit";
import { routeHash } from "../audio/theory";
import type { Instrument } from "../audio/theory";
import type { PersonalNote } from "./compose";
import { altitudeFt, drawLength } from "./flight";
import type { Onset } from "./analyze";
import type { PersonalRoute } from "./routes";

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const hzOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** the voice shown for a heard note, by its register (the ribbon colours come from the route) */
const laneOf = (midi: number, voiced: boolean): Instrument => (!voiced ? "TIMP" : midi < 50 ? "CELLO" : midi < 62 ? "VIOLA" : midi < 74 ? "VIOLIN" : "FLUTE");

/**
 * Hands each heard note to a route so that every route is a line of music: long routes take the low voices, short ones
 * the high voices (the register band of a route follows its length), and a route keeps the notes that continue its
 * own line (the nearest to the one it just played). A route shows one note at a time, so the voices of the music box
 * are exactly the person's routes. The notes are not played again — they only drive the lights.
 */
export function assignToRoutes(onsets: Onset[], routes: PersonalRoute[]): PersonalNote[] {
  const n = routes.length;
  if (n === 0) return [];
  const durRank = rankIn(onsets.map((o) => o.d).sort((a, b) => a - b));
  const lenRank = rankIn(routes.map((r) => r.distKm).sort((a, b) => a - b));
  const phrase = routes.map((r) => clamp(Math.round(10 + 40 * lenRank(r.distKm)), 12, 48));
  // the register band of each route: the long routes the low quantiles of the heard pitches, the short ones the high ones
  const voiced = onsets.filter((o) => o.voiced).map((o) => o.midi).sort((a, b) => a - b);
  const q = (p: number): number => (voiced.length ? voiced[Math.min(voiced.length - 1, Math.floor(p * voiced.length))] : 60);
  const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((a, b) => b.d - a.d || a.i - b.i); // longest first = lowest
  const centre = new Array<number>(n).fill(60);
  order.forEach((x, k) => {
    centre[x.i] = q((k + 0.5) / n);
  });
  const busy = new Array<number>(n).fill(-1e9);
  const lastMidi = new Array<number>(n).fill(NaN);
  const lastAt = new Array<number>(n).fill(-1e9);
  const out: PersonalNote[] = [];
  for (const o of onsets) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      if (o.t < busy[i] + 0.05) continue;
      let score = Math.abs(o.midi - centre[i]) * 0.5;
      // continuing the line: a note near the one the route just played, soon after
      if (!Number.isNaN(lastMidi[i]) && o.t - lastAt[i] < 2.5) score += Math.abs(o.midi - lastMidi[i]) * 0.8;
      else score += 3; // a route that has been silent takes a note a little less willingly
      score += Math.abs(lenRank(routes[i].distKm) - durRank(o.d)) * 1.5; // a long note to a long route
      if (!o.voiced) score += 6 * lenRank(routes[i].distKm); // hits without pitch go to the lower voices
      score += (routeHash(routes[i].key + i + Math.round(o.t * 10)) % 100) / 2000; // a stable tie-break
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) continue;
    busy[best] = o.t + o.d;
    lastMidi[best] = o.midi;
    lastAt[best] = o.t;
    const r = routes[best];
    out.push({
      t: o.t,
      d: o.d,
      instrument: laneOf(o.midi, o.voiced),
      freq: hzOf(o.midi),
      vel: o.vel,
      key: r.key,
      route: best,
      via: best,
      alt: altitudeFt((o.t % phrase[best]) / phrase[best], r.distKm),
    });
  }
  // the music box draws a route's notes one after another
  const by = new Map<number, PersonalNote[]>();
  for (const x of out) by.set(x.route, [...(by.get(x.route) ?? []), x]);
  for (const list of by.values()) {
    list.forEach((x, k) => {
      const next = list[k + 1];
      x.drawDur = drawLength(x.d, next ? next.t - x.t : null);
    });
  }
  return out;
}

/** drives the lights from the playing audio element: plans notes `ahead` s early and fires them as they sound */
export interface Follower {
  stop(): void;
}
export function followAudio(
  el: HTMLAudioElement,
  notes: PersonalNote[],
  onPlan: (n: PersonalNote, wallAt: number) => void,
  onNote: (n: PersonalNote) => void,
  ahead = 3,
): Follower {
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  let planned = 0;
  let fired = 0;
  let last = el.currentTime;
  let raf = 0;
  const seek = (t: number): void => {
    // first note not yet sounded; the ones before are skipped without a burst of lights
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m].t < t) lo = m + 1;
      else hi = m;
    }
    planned = lo;
    fired = lo;
  };
  seek(last);
  const tick = (): void => {
    const t = el.currentTime;
    if (Math.abs(t - last) > 1 || t < last - 0.05) seek(t); // a loop, a jump to the chorus, a restart
    last = t;
    const wall = performance.now() / 1000;
    while (planned < sorted.length && sorted[planned].t <= t + ahead) {
      const n = sorted[planned++];
      onPlan(n, wall + (n.t - t));
    }
    while (fired < sorted.length && sorted[fired].t <= t) onNote(sorted[fired++]);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return { stop: () => cancelAnimationFrame(raf) };
}
