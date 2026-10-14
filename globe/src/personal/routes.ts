import { haversineKm } from "@collector/geo";
import type { Region } from "@collector/day-schema";
import direct from "./direct.json";
import { HUB, destinationOf, isHub } from "./destinations";

export interface PersonalRoute {
  /** "LHR-IST" style (IATA of both ends, direction kept) */
  key: string;
  from: string;
  to: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distKm: number;
  /** region of the far end from the hub — picks the instrument and the arc colour */
  region: Region;
  /** which destination (index in the selection) this leg belongs to */
  trip: number;
  /** 0 = first leg, 1 = connecting leg */
  leg: 0 | 1;
}

/**
 * Turkish Airlines flights that do NOT touch Istanbul, seen in the live 24 h feed (Anatolian spokes such as
 * Ankara–Vienna or Antalya–Moscow, and the tag flights KUL–SYD, MEL–SIN, GRU–SCL, BOM–HAN).
 * Everything else is hub-and-spoke: the trip goes through IST. See scripts/personal/.
 */
const DIRECT = new Set((direct as [string, string][]).map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
export const hasDirectFlight = (a: string, b: string): boolean => isHub(a) || isHub(b) || DIRECT.has(a < b ? `${a}-${b}` : `${b}-${a}`);

function leg(a: string, b: string, trip: number, legNo: 0 | 1): PersonalRoute | null {
  const A = destinationOf(a);
  const B = destinationOf(b);
  if (!A || !B || a === b) return null;
  // the colour and voice of a leg are those of the airport that is not the hub
  const far = isHub(a) ? B : A;
  return {
    key: `${a}-${b}`,
    from: a,
    to: b,
    fromLat: A.lat,
    fromLon: A.lon,
    toLat: B.lat,
    toLon: B.lon,
    distKm: haversineKm(A.lat, A.lon, B.lat, B.lon),
    region: far.region,
    trip,
    leg: legNo,
  };
}

/** The airports of one trip, in order: [origin, dest] when a flight exists, else [origin, IST, dest]. */
export function tripPath(origin: string, dest: string): string[] {
  if (origin === dest || !destinationOf(origin) || !destinationOf(dest)) return [];
  return hasDirectFlight(origin, dest) ? [origin, dest] : [origin, HUB, dest];
}

/**
 * Real Turkish Airlines routing, from the places a traveller picked (no fixed start):
 *  - without `home`, the places are a journey: each neighbouring pair is one leg (direct if TK flies it, else via IST)
 *  - with `home`, every place fans out from it (separate trips from one city)
 * A leg shared by several trips is returned once.
 */
export function buildRoutes(places: string[], home?: string): PersonalRoute[] {
  const out: PersonalRoute[] = [];
  const seen = new Set<string>();
  const pairs: [string, string][] = home ? places.map((p) => [home, p]) : places.slice(1).map((p, i) => [places[i], p]);
  pairs.forEach(([a, b], trip) => {
    const path = tripPath(a, b);
    for (let i = 0; i < path.length - 1; i++) {
      const r = leg(path[i], path[i + 1], trip, i === 0 ? 0 : 1);
      if (r && !seen.has(r.key)) {
        seen.add(r.key);
        out.push(r);
      }
    }
  });
  return out;
}

/** Number of legs that change planes at Istanbul. */
export const stopovers = (places: string[], home?: string): number => {
  const pairs: [string, string][] = home ? places.map((p) => [home, p]) : places.slice(1).map((p, i) => [places[i], p]);
  return pairs.filter(([a, b]) => tripPath(a, b).length === 3).length;
};
