import { interpolateGreatCircle } from "@collector/geo";
import type { GlobeModel } from "../model/globe-model";
import { routeKey } from "./theory";

export interface RouteMidpoint {
  key: string;
  lat: number;
  lon: number;
  count: number;
}

/** Busiest routes (both directions merged) with the great-circle midpoint of each, for stereo placement. */
export function routeMidpoints(m: GlobeModel, limit = 40): RouteMidpoint[] {
  const map = new Map<string, { count: number; fromLat: number; fromLon: number; toLat: number; toLon: number }>();
  for (const f of m.flights) {
    const pl = f.planned;
    if (!pl || !f.from || !f.to) continue;
    const key = routeKey(f.from, f.to, f.id);
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { count: 1, fromLat: pl.fromLat, fromLon: pl.fromLon, toLat: pl.toLat, toLon: pl.toLon });
  }
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, r]) => {
      const [lat, lon] = interpolateGreatCircle(r.fromLat, r.fromLon, r.toLat, r.toLon, 0.5);
      return { key, lat, lon, count: r.count };
    });
}
