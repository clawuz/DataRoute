import { routeHash } from "../audio/theory";
import type { PersonalNote } from "./compose";

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** how many time zones (hours of longitude) the end points of the routes span, going the short way round the Earth */
export function timeZonesSpanned(routes: { fromLon: number; toLon: number }[]): number {
  const lons = routes.flatMap((r) => [r.fromLon, r.toLon]).map((x) => ((x % 360) + 360) % 360).sort((a, b) => a - b);
  if (lons.length < 2) return 0;
  let biggestGap = lons[0] + 360 - lons[lons.length - 1];
  for (let i = 1; i < lons.length; i++) biggestGap = Math.max(biggestGap, lons[i] - lons[i - 1]);
  return (360 - biggestGap) / 15;
}

/** 0 (everyone on the beat) … 1 (a trip that crosses ten time zones or more: jet lag) */
export const looseness = (zones: number): number => clamp(zones / 10, 0, 1);

export interface HumanizeOptions {
  /** 0…1, see `looseness` */
  loose: number;
  /** notes that stay tight (kick, backbeat, hat): 30% of the drift */
  tight?: (n: PersonalNote) => boolean;
  /** notes that are not touched (the drone) */
  skip?: (n: PersonalNote) => boolean;
}

const unit = (key: string): number => ((routeHash(key) % 2001) - 1000) / 1000; // −1…1, the same for the same key

/**
 * A few milliseconds of difference in time and a few percent in loudness, so that the music is played and not
 * printed. Deterministic (from the route and the moment). Notes of one route that sound at the same moment move
 * together; an offset never passes 20% of the gap to the neighbouring notes of the same route, so a route's notes
 * keep their order.
 */
export function humanize(notes: PersonalNote[], o: HumanizeOptions): void {
  const amount = (5 + 13 * clamp(o.loose, 0, 1)) / 1000;
  const byRoute = new Map<number, PersonalNote[]>();
  for (const n of notes) if (!o.skip?.(n)) byRoute.set(n.route, [...(byRoute.get(n.route) ?? []), n]);
  for (const [route, list] of byRoute) {
    const times = [...new Set(list.map((n) => n.t))].sort((a, b) => a - b);
    const offset = new Map<number, number>();
    times.forEach((t, k) => {
      const gapBefore = k > 0 ? t - times[k - 1] : Infinity;
      const gapAfter = k + 1 < times.length ? times[k + 1] - t : Infinity;
      const tightNote = list.filter((n) => n.t === t).every((n) => o.tight?.(n));
      const raw = unit(`${route}|${t.toFixed(4)}`) * amount * (tightNote ? 0.3 : 1);
      const limit = 0.2 * Math.min(gapBefore, gapAfter);
      offset.set(t, clamp(Math.max(raw, -t), -limit, limit));
    });
    for (const n of list) {
      const t0 = n.t;
      n.vel = clamp(n.vel * (1 + 0.06 * unit(`${route}|${t0.toFixed(4)}|${n.instrument}|${n.freq.toFixed(1)}`)), 0.05, 1);
      n.t = t0 + (offset.get(t0) ?? 0);
    }
  }
}
