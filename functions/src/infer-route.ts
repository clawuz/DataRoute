import type { Airport, RouteInfo, TrackedFlight } from "./day-schema.js";
import { AIRPORT_TABLE } from "./airport-table.js";
import { haversineKm } from "./geo.js";

/** a track sample is "on the ground end" of a flight when it lies this close to an airport and this low */
export const NEAR_AIRPORT_KM = 25;
/** samples carry the altitude in hundreds of feet: 40 = 4,000 ft */
export const LOW_ALT_100FT = 40;

const AIRPORTS: Airport[] = AIRPORT_TABLE.map(([iata, country, lat, lon, name]) => ({ iata, country, lat, lon, name }));

/** the airport a position belongs to (within `NEAR_AIRPORT_KM`), the nearest one; null when none */
export function airportAt(lat: number, lon: number): Airport | null {
  let best: Airport | null = null;
  let bestKm = NEAR_AIRPORT_KM;
  for (const a of AIRPORTS) {
    if (Math.abs(a.lat - lat) > 0.5 || Math.abs(a.lon - lon) > 1) continue; // a cheap box before the great-circle distance
    const km = haversineKm(lat, lon, a.lat, a.lon);
    if (km <= bestKm) { best = a; bestKm = km; }
  }
  return best;
}

/**
 * A route from the track itself, for a flight whose route the route service did not give: the origin is the airport the first sample
 * of a flight that took off while it was watched lies at (low and close), the destination the airport the last sample of a flight that
 * landed lies at. A flight that was already in the air when the watching began (no low first sample) or that was lost before it landed has
 * no such end: nothing is guessed, null is returned. Both ends must be found, and they must differ.
 */
export function inferRoute(f: Pick<TrackedFlight, "samples" | "arr">): RouteInfo | null {
  const s = f.samples;
  if (s.length < 2 || f.arr === null) return null;
  const first = s[0];
  const last = s[s.length - 1];
  if (first[1] > LOW_ALT_100FT || last[1] > LOW_ALT_100FT) return null;
  const origin = airportAt(first[2], first[3]);
  const destination = airportAt(last[2], last[3]);
  if (!origin || !destination || origin.iata === destination.iata) return null;
  return { origin, destination };
}
