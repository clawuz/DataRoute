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
/** Turkish Airlines' own claim, kept next to the numbers it belongs to */
export const NETWORK_CLAIM = "The airline that flies to more countries than any other in the world";

export const COUNTRY_COUNT = new Set(DESTINATIONS.map((d) => d.iso)).size;

const names = new Map<string, Intl.DisplayNames>();
/** localised country name; falls back to the ISO code */
export function countryName(iso: string, locale = "en"): string {
  if (iso === "TR") return "Türkiye"; // the country's own name, in every language
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

/** The six areas the airline groups its destinations in. */
export type AreaId = "TR" | "EU" | "AM" | "AF" | "AS" | "OC";
export const AREAS: { id: AreaId; label: string; upper: string }[] = [
  { id: "TR", label: "Türkiye", upper: "TÜRKİYE" },
  { id: "EU", label: "Europe", upper: "EUROPE" },
  { id: "AM", label: "Americas", upper: "AMERICAS" },
  { id: "AF", label: "Africa", upper: "AFRICA" },
  { id: "AS", label: "Asia", upper: "ASIA" },
  { id: "OC", label: "Australia", upper: "AUSTRALIA" },
];

const OCEANIA = new Set(["AU", "NZ", "FJ", "PF", "NC", "PG", "GU", "WS", "TO", "VU", "SB", "PW", "FM", "MH", "KI", "NR", "TV", "CK", "NU", "WF", "AS", "MP"]);
const AMERICAS = new Set("US CA MX GT BZ SV HN NI CR PA CU DO HT JM BS BB TT AG AW BM CW GD KY LC MQ PR SX TC VG VI GP DM KN VC AI MS BQ BL MF AR BO BR CL CO EC GY PY PE SR UY VE FK GF".split(" "));
const AFRICA = new Set("DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW RE YT SH EH".split(" "));
// Europe keeps Russia, Cyprus and the Balkans; the Caucasus, Central Asia and the Middle East count as Asia.
const EUROPE = new Set("AL AD AT BY BE BA BG HR CY CZ DK EE FO FI FR DE GI GR HU IS IE IM IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA JE GG AX SJ".split(" "));

export function areaOf(iso: string): AreaId {
  if (iso === "TR") return "TR";
  if (OCEANIA.has(iso)) return "OC";
  if (AMERICAS.has(iso)) return "AM";
  if (AFRICA.has(iso)) return "AF";
  if (EUROPE.has(iso)) return "EU";
  return "AS";
}
