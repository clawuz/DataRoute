import type { SkyFlight } from "./lines";
import type { TrackNote } from "./day-track";
import { bestRoute, rankIn, routeKm, type Ranks } from "./route-fit";

/** Spearman rank correlation of two samples (ties get their average rank). */
export function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]): number[] => {
    const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const a = rank(xs);
  const b = rank(ys);
  const n = xs.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa === 0 || sbb === 0 ? 0 : sab / Math.sqrt(saa * sbb);
}

export interface AssignOptions {
  /** 0..1 draw: it varies the rest of every route, so that a visit does not repeat the last one */
  jitter?: () => number;
  /** seconds (of the recording) a route rests after a note */
  rest?: number;
  /** weight of the length match against the pitch match (route-fit.ts W_DUR is 4; here the lengths lead) */
  lengthWeight?: number;
}

/**
 * The whole recording against the flights of the day, at once: the note at second `t` of a recording of `duration` seconds sounds at the
 * replay fraction t / duration, so it is handed to a flight that is in the air THEN: a long note to a long route and a short one to a
 * short route (the ranks of the day's own route lengths), the pitch class and the register of the flight as before (route-fit.ts), a route
 * resting after it has had a note, and when all of them rest the best fit lights anyway. A note with no flight in the air gets none.
 */
export function assignDay(notes: TrackNote[], duration: number, skyAt: (frac: number) => SkyFlight[], opts: AssignOptions = {}): Map<TrackNote, SkyFlight> {
  const jitter = opts.jitter ?? Math.random;
  const baseRest = opts.rest ?? 0.6;
  const wDur = opts.lengthWeight ?? 14;
  const out = new Map<TrackNote, SkyFlight>();
  if (!notes.length || duration <= 0) return out;
  // the day's own length ranks: the lengths of the routes seen in the air over the day
  const kms: number[] = [];
  const seen = new Set<string>();
  for (let s = 0; s < 24; s++) {
    for (const f of skyAt((s + 0.5) / 24)) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      const km = routeKm(f);
      if (km !== null) kms.push(km);
    }
  }
  kms.sort((a, b) => a - b);
  const ranks: Ranks = {
    dur: rankIn(notes.map((x) => x.d).sort((a, b) => a - b)),
    len: rankIn(kms.length > 1 ? kms : [0, 1]),
  };
  const recent = new Map<string, number>();
  let lastFrac = -1;
  let sky: SkyFlight[] = [];
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    // the sky is read in steps of 1/240 of the day (six minutes): the flights in the air hardly change between two steps
    const frac = Math.floor(Math.min(1, Math.max(0, n.t / duration)) * 240) / 240;
    if (frac !== lastFrac) { sky = skyAt(frac); lastFrac = frac; }
    if (!sky.length) continue;
    const rest = baseRest * (0.5 + jitter() * 2);
    const f = bestRoute(n, sky, recent, n.t, rest, ranks, wDur) ?? bestRoute(n, sky, recent, n.t, 0, ranks, wDur);
    if (!f) continue;
    recent.set(f.key, n.t);
    out.set(n, f);
  }
  return out;
}
