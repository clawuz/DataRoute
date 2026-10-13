import { countryToRegion } from "@collector/regions";
import type { Region } from "@collector/day-schema";
import raw from "./destinations.json";

/**
 * Turkish Airlines' passenger network: every airport TK serves (scheduled or seasonal), from the airline's published
 * destination list plus the airports seen in the live 24 h feed. Each trip is routed through the Istanbul hub.
 */
export interface Destination {
  iata: string;
  city: string;
  name: string;
  /** ISO 3166-1 alpha-2 */
  iso: string;
  lat: number;
  lon: number;
  region: Region;
  seasonal: boolean;
}

interface Row { i: string; c: string; n: string; k: string; a: number; o: number; s?: number }

export const HUB = "IST";

export const DESTINATIONS: Destination[] = (raw as Row[]).map((r) => ({
  iata: r.i,
  city: r.c,
  name: r.n,
  iso: r.k,
  lat: r.a,
  lon: r.o,
  region: countryToRegion(r.k),
  seasonal: !!r.s,
}));

const BY_IATA = new Map(DESTINATIONS.map((d) => [d.iata, d]));
export const destinationOf = (iata: string): Destination | undefined => BY_IATA.get(iata);
export const isDestination = (iata: string): boolean => BY_IATA.has(iata);
/** Istanbul is the hub: a trip starting or ending there has no stopover. */
export const isHub = (iata: string): boolean => iata === HUB;

export const COUNTRY_COUNT = new Set(DESTINATIONS.map((d) => d.iso)).size;

const names = new Map<string, Intl.DisplayNames>();
/** localised country name; falls back to the ISO code */
export function countryName(iso: string, locale = "en"): string {
  try {
    let dn = names.get(locale);
    if (!dn) names.set(locale, (dn = new Intl.DisplayNames([locale], { type: "region" })));
    return dn.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

/** regional-indicator flag emoji */
export const flagOf = (iso: string): string =>
  iso.length === 2 ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "";

/** "Istanbul" for IST, "Istanbul (SAW)" for the second airport of a city, otherwise the city */
export function labelOf(d: Destination): string {
  const sameCity = DESTINATIONS.filter((x) => x.city === d.city && x.iso === d.iso);
  return sameCity.length > 1 ? `${d.city} · ${d.iata}` : d.city;
}
