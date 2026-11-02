import type { TrackNote } from "./day-track";
import { rankIn } from "./route-fit";

/** One flight of the day as the plan sees it: its route, the length of the route, and when it flew (fractions 0..1 of the replay; a flight that started before the window has a negative `dep`). */
export interface DayFlight {
  id: string;
  /** route key (`routeKey`), `AAA-BBB` */
  key: string;
  /** replay fraction of take-off (can be < 0) */
  dep: number;
  /** replay fraction of landing (or of the last contact; can be > 1) */
  end: number;
  /** length of the flight's own route (km) */
  km: number;
}

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
  /** how many notes' time a flight may be moved from its take-off to find its note (default 4 spacings of the flights over the recording) */
  windowSpacings?: number;
  /** weight of the length match against the time distance (default 6) */
  lengthWeight?: number;
}

/**
 * The recording against the whole last 24 hours: every flight of the day gets a note of its own.
 *
 * The note at second `t` of a recording of `duration` seconds sounds at the replay fraction t / duration. In the first pass each flight, in
 * the order it took off, takes the free note near its take-off whose length fits the length of its route best (a long route a long note, a
 * short route a short note: the ranks of the day's own route lengths against the ranks of the note lengths). The notes that are left
 * (a recording has more notes than the day has flights) are handed in a second pass to the flights that are in the air at that moment, again
 * by length, and to the route that has had the fewest notes so far. The notes of a plan are never moved: it is a pure function of the
 * recording and the day.
 */
export function assignDay(notes: TrackNote[], duration: number, flights: DayFlight[], opts: AssignOptions = {}): Map<TrackNote, DayFlight> {
  const out = new Map<TrackNote, DayFlight>();
  const usable = flights.filter((f) => /^[A-Z]{3}-[A-Z]{3}$/.test(f.key) && f.km > 0);
  if (!notes.length || duration <= 0 || !usable.length) return out;
  const byT = [...notes].sort((a, b) => a.t - b.t);
  const durRank = rankIn(notes.map((n) => n.d).sort((a, b) => a - b));
  const lenRank = rankIn(usable.map((f) => f.km).sort((a, b) => a - b));
  const wLen = opts.lengthWeight ?? 6;
  const spacing = duration / usable.length;
  const win = Math.max(0.4, (opts.windowSpacings ?? 4) * spacing);

  // first pass: every flight takes the note that fits it near its take-off
  const taken = new Set<TrackNote>();
  const used = new Map<string, number>();
  const firstAt = (t: number): number => {
    let lo = 0, hi = byT.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (byT[m].t < t) lo = m + 1; else hi = m; }
    return lo;
  };
  const inWindow = [...usable].filter((f) => f.dep >= 0 && f.dep <= 1).sort((a, b) => a.dep - b.dep || (a.id < b.id ? -1 : 1));
  for (const f of inWindow) {
    const t0 = f.dep * duration;
    const want = lenRank(f.km);
    let best: TrackNote | null = null;
    let bestScore = Infinity;
    for (let i = firstAt(t0 - win); i < byT.length && byT[i].t <= t0 + win; i++) {
      const n = byT[i];
      if (taken.has(n)) continue;
      const score = wLen * Math.abs(durRank(n.d) - want) + Math.abs(n.t - t0) / win;
      if (score < bestScore) { best = n; bestScore = score; }
    }
    if (!best) continue;
    taken.add(best);
    out.set(best, f);
    used.set(f.key, (used.get(f.key) ?? 0) + 1);
  }

  // second pass: the notes that are left go to flights in the air at that moment (the sky is read in steps of 1/240 of the day)
  const STEP = 240;
  const skyCache = new Map<number, DayFlight[]>();
  const skyAt = (frac: number): DayFlight[] => {
    const b = Math.floor(Math.min(1, Math.max(0, frac)) * STEP);
    let s = skyCache.get(b);
    if (!s) { const f0 = b / STEP; s = usable.filter((f) => f.dep <= f0 + 1 / STEP && f.end >= f0); skyCache.set(b, s); }
    return s;
  };
  for (const n of byT) {
    if (taken.has(n)) continue;
    const sky = skyAt(n.t / duration);
    if (!sky.length) continue;
    const d = durRank(n.d);
    let best: DayFlight | null = null;
    let bestScore = Infinity;
    for (const f of sky) {
      const score = wLen * Math.abs(lenRank(f.km) - d) + 0.35 * (used.get(f.key) ?? 0);
      if (score < bestScore) { best = f; bestScore = score; }
    }
    if (!best) continue;
    out.set(n, best);
    used.set(best.key, (used.get(best.key) ?? 0) + 1);
  }
  return out;
}
