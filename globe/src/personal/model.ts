import type { DayAirport } from "@collector/day-schema";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";
import { REGIONS } from "@web/data/palette";
import { countryOf } from "./countries";
import type { PersonalRoute } from "./routes";

const span = 86400;
const E = new Float32Array(0);

/**
 * A synthetic model the globe engine can draw: one planned great circle per route, no flown track.
 * Airports are keyed by ISO2 (the "airport" of a country is its capital).
 */
export function buildPersonalModel(routes: PersonalRoute[]): GlobeModel {
  const airports: Record<string, DayAirport> = {};
  const traffic = new Map<string, number>();
  const flights = routes.map((r, i): GlobeFlight => {
    for (const iso of [r.from, r.to]) {
      const c = countryOf(iso);
      if (c) {
        airports[iso] = { lat: c.lat, lon: c.lon, country: iso, name: iso };
        traffic.set(iso, (traffic.get(iso) ?? 0) + 1);
      }
    }
    const regionIdx = REGIONS.indexOf(r.region);
    return {
      id: `p${i}`,
      tk: r.key,
      from: r.from,
      to: r.to,
      other: r.to,
      region: r.region,
      regionIdx: regionIdx < 0 ? REGIONS.length - 1 : regionIdx,
      bearing: 0,
      dep: 0,
      end: span,
      airborne: false,
      t: E,
      alt: E,
      lat: E,
      lon: E,
      status: "LAST_CONTACT",
      gaps: [],
      lastT: 0,
      planned: { fromLat: r.fromLat, fromLon: r.fromLon, toLat: r.toLat, toLon: r.toLon, distKm: r.distKm },
    };
  });
  return {
    from: 0,
    span,
    replayStart: 0,
    generatedAt: span,
    collectingSince: 0,
    status: { state: "ok", lastSuccessAt: span },
    source: { name: "personal", url: "" },
    stats: { airborne: 0, flights24h: routes.length, destinations: new Set(routes.map((r) => r.to)).size, countries: new Set(routes.map((r) => r.to)).size, km24h: Math.round(routes.reduce((s, r) => s + r.distKm, 0)) },
    flights,
    segments: 0,
    airports,
    traffic,
  };
}
