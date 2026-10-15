import { pcOfRoute, rankIn, W_DUR } from "../audio/route-fit";
import { routeHash } from "../audio/theory";
import type { Instrument } from "../audio/theory";
import type { PersonalNote } from "./compose";
import { altitudeFt } from "./flight";
import type { Onset } from "./analyze";
import type { PersonalRoute } from "./routes";

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const pcDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
};
const hzOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** the voice shown for a heard note, by its register (the ribbon colours come from the route) */
const laneOf = (midi: number, voiced: boolean): Instrument => (!voiced ? "TIMP" : midi < 50 ? "CELLO" : midi < 62 ? "VIOLA" : midi < 74 ? "VIOLIN" : "FLUTE");

/**
 * Hands each heard note to the route that fits it best, as the live card does (pitch class ↔ the route's colour,
 * register ↔ the flight's altitude, a long note ↔ a long route). A route shows one note at a time, so the voices
 * of the music box are exactly the person's routes. The notes are not played again — they only drive the lights.
 */
export function assignToRoutes(onsets: Onset[], routes: PersonalRoute[]): PersonalNote[] {
  const n = routes.length;
  if (n === 0) return [];
  const durRank = rankIn(onsets.map((o) => o.d).sort((a, b) => a - b));
  const lenRank = rankIn(routes.map((r) => r.distKm).sort((a, b) => a - b));
  const pcs = routes.map((r, i) => pcOfRoute(r.key + i));
  const phrase = routes.map((r) => clamp(Math.round(10 + 40 * lenRank(r.distKm)), 12, 48));
  const busy = new Array<number>(n).fill(-1e9);
  const out: PersonalNote[] = [];
  for (const o of onsets) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++) {
      if (o.t < busy[i] + 0.08) continue;
      const alt = altitudeFt((o.t % phrase[i]) / phrase[i], routes[i].distKm);
      const regP = 48 + (clamp(alt, 0, 41000) / 41000) * 36;
      let score = pcDist(pcs[i], Math.round(o.midi) % 12) + (Math.abs(regP - o.midi) / 12) * 0.6 + W_DUR * Math.abs(lenRank(routes[i].distKm) - durRank(o.d));
      // a hit without pitch belongs to the shorter routes
      if (!o.voiced) score += 3 * lenRank(routes[i].distKm);
      score += (routeHash(routes[i].key + i + Math.round(o.t * 10)) % 100) / 1000; // a stable tie-break
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) continue;
    busy[best] = o.t + o.d;
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
      x.drawDur = next ? Math.max(0.05, Math.min(x.d, (next.t - x.t) * 0.92)) : x.d;
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
