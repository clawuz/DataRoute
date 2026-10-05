import type { Firestore } from "firebase-admin/firestore";
import type { Airport, RouteInfo } from "./day-schema.js";
import type { FetchFn } from "./adsb.js";

export const ADSBDB_URL = "https://api.adsbdb.com/v0/callsign/";
export const ROUTE_TTL = 7 * 86400;
export const NEG_TTL = 86400;

export interface RouteCacheEntry {
  route: RouteInfo | null;
  fetchedAt: number;
}

export interface RouteCache {
  get(cs: string): Promise<RouteCacheEntry | null>;
  set(cs: string, entry: RouteCacheEntry): Promise<void>;
}

interface AdsbdbAirport {
  iata_code: string;
  country_iso_name: string;
  latitude: number;
  longitude: number;
}

const toAirport = (a: AdsbdbAirport): Airport => ({
  iata: a.iata_code,
  country: a.country_iso_name,
  lat: a.latitude,
  lon: a.longitude,
});

export async function fetchRoute(f: FetchFn, cs: string): Promise<RouteInfo | null> {
  const res = await f(ADSBDB_URL + encodeURIComponent(cs));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`adsbdb ${res.status}`);
  const json = (await res.json()) as {
    response?: { flightroute?: { origin?: AdsbdbAirport; destination?: AdsbdbAirport } };
  };
  const fr = json.response?.flightroute;
  if (!fr?.origin || !fr.destination) return null;
  return { origin: toAirport(fr.origin), destination: toAirport(fr.destination) };
}

export async function lookupRoute(
  cs: string,
  cache: RouteCache,
  f: FetchFn,
  now: number,
): Promise<RouteInfo | null> {
  const hit = await cache.get(cs);
  if (hit && now - hit.fetchedAt < (hit.route ? ROUTE_TTL : NEG_TTL)) return hit.route;
  const route = await fetchRoute(f, cs);
  await cache.set(cs, { route, fetchedAt: now });
  return route;
}

export function firestoreRouteCache(db: Firestore): RouteCache {
  const col = db.collection("routes");
  return {
    async get(cs) {
      const snap = await col.doc(cs).get();
      return snap.exists ? (snap.data() as RouteCacheEntry) : null;
    },
    async set(cs, entry) {
      await col.doc(cs).set(entry);
    },
  };
}
