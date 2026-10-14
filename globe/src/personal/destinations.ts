import { countryToRegion } from "@collector/regions";
import type { Region } from "@collector/day-schema";
import raw from "./destinations.json";

/**
 * Turkish Airlines' network as the airline counts it (133 countries): scheduled and seasonal passenger service, services
 * that are suspended for now, and cargo-only points, from the published destination list plus the airports seen in the
 * live 24 h feed. Each trip is routed through the Istanbul hub.
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
  /** active = scheduled passenger service; the others are part of the network but not flown as scheduled passenger service today */
  status: ServiceStatus;
}

export type ServiceStatus = "active" | "seasonal" | "future" | "suspended" | "cargo";

interface Row { i: string; c: string; n: string; k: string; a: number; o: number; s?: ServiceStatus }

export const HUB = "IST";

export const DESTINATIONS: Destination[] = (raw as Row[]).map((r) => ({
  iata: r.i,
  city: r.c,
  name: r.n,
  iso: r.k,
  lat: r.a,
  lon: r.o,
  region: countryToRegion(r.k),
  status: r.s ?? "active",
}));

const BY_IATA = new Map(DESTINATIONS.map((d) => [d.iata, d]));
export const destinationOf = (iata: string): Destination | undefined => BY_IATA.get(iata);
export const isDestination = (iata: string): boolean => BY_IATA.has(iata);
/** Istanbul is the hub: a trip starting or ending there has no stopover. */
export const isHub = (iata: string): boolean => iata === HUB;

export const STATUS_LABEL: Record<ServiceStatus, string> = { active: "", seasonal: "SEASONAL", future: "NEW", suspended: "SUSPENDED", cargo: "CARGO ONLY" };
/** true when a passenger could fly there on a scheduled flight at the moment */
export const hasPassengerService = (d: Destination): boolean => d.status === "active" || d.status === "seasonal" || d.status === "future";

/** the network as Turkish Airlines states it — what every piece of copy says */
export const NETWORK_DESTINATIONS = 355;
export const NETWORK_COUNTRIES = 133;

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
