import type { DayAirport } from "@collector/day-schema";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";
import { REGIONS } from "@web/data/palette";
import { plannedArc } from "../geo3d/great";
import { PLANNED_CRUISE100 } from "../scene/arcs";
import { destinationOf } from "./destinations";
import type { PersonalRoute } from "./routes";

const SAMPLES = 48;
/** the tracks are drawn, not flown: 0.35 s of track time per km keeps every sample closer than the arc code's coverage-gap limit */
const SEC_PER_KM = 0.35;

/**
 * A synthetic model the globe engine can draw: one planned great circle per route, no flown track.
 * Airports are keyed by IATA, like the live model.
 */
export function buildPersonalModel(routes: PersonalRoute[]): GlobeModel {
  const airports: Record<string, DayAirport> = {};
  const traffic = new Map<string, number>();
  // every route is drawn as a flown track (coloured by region, like the live flights), all ending at the same instant
  const durs = routes.map((r) => Math.max(300, r.distKm * SEC_PER_KM));
  const span = Math.max(600, ...durs) + 60;
  const flights = routes.map((r, i): GlobeFlight => {
    const dur = durs[i];
    const dep = span - 60 - dur;
    const { points } = plannedArc({ lat: r.fromLat, lon: r.fromLon }, { lat: r.toLat, lon: r.toLon }, SAMPLES);
    const t = new Float32Array(points.length);
    const alt = new Float32Array(points.length);
    const lat = new Float32Array(points.length);
    const lon = new Float32Array(points.length);
    points.forEach((p, k) => {
      t[k] = dep + p.u * dur;
      alt[k] = PLANNED_CRUISE100 * Math.pow(Math.sin(Math.PI * p.u), 0.6);
      lat[k] = p.lat;
      lon[k] = p.lon;
    });
    for (const code of [r.from, r.to]) {
      const d = destinationOf(code);
      if (d) {
        airports[code] = { lat: d.lat, lon: d.lon, country: d.iso, name: d.name };
        traffic.set(code, (traffic.get(code) ?? 0) + 1);
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
      colorIdx: 7 + i, // every route has its own colour (see colors.ts)
      bearing: 0,
      dep,
      end: dep + dur,
      airborne: false,
      t,
      alt,
      lat,
      lon,
      status: "LANDED",
      gaps: [],
      lastT: dep + dur,
      planned: { fromLat: r.fromLat, fromLon: r.fromLon, toLat: r.toLat, toLon: r.toLon, distKm: r.distKm },
    };
  });
  const countries = new Set(Object.values(airports).map((a) => a.country));
  return {
    from: 0,
    span,
    replayStart: 0,
    generatedAt: span,
    collectingSince: 0,
    status: { state: "ok", lastSuccessAt: span },
    source: { name: "personal", url: "" },
    stats: { airborne: 0, flights24h: routes.length, destinations: Object.keys(airports).length, countries: countries.size, km24h: Math.round(routes.reduce((s, r) => s + r.distKm, 0)) },
    flights,
    segments: 0,
    airports,
    traffic,
  };
}
