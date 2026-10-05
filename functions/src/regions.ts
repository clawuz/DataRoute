import type { Airport, Region, RouteInfo } from "./day-schema.js";
import { initialBearing } from "./geo.js";

export const ISTANBUL = { lat: 41.275, lon: 28.752 };

const HUB = new Set(["IST", "SAW"]);
export const isIstanbul = (iata: string) => HUB.has(iata);

const TABLE: Record<Exclude<Region, "DOM" | "UNK">, string> = {
  EUR: "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA GE AM AZ",
  MEA: "AE BH IQ IR IL JO KW LB OM PS QA SA SY YE",
  AFR: "DZ AO BJ BW BF BI CV CM CF CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW",
  ASI: "AF BD BT BN KH CN HK MO IN ID JP KZ KG LA MY MV MN MM NP KP KR PK PH SG LK TW TJ TH TL TM UZ VN AU NZ FJ PG",
  AME: "US CA MX GT BZ SV HN NI CR PA CU DO HT JM BS BB TT AR BO BR CL CO EC GY PY PE SR UY VE PR",
};

const BY_COUNTRY = new Map<string, Region>();
for (const [region, list] of Object.entries(TABLE)) {
  for (const iso of list.split(" ")) BY_COUNTRY.set(iso, region as Region);
}

export function countryToRegion(iso2: string): Region {
  if (iso2 === "TR") return "DOM";
  return BY_COUNTRY.get(iso2) ?? "UNK";
}

/** The end of the route that is "out in the world" as seen from Istanbul. */
function pickOther({ origin, destination }: RouteInfo): Airport {
  if (isIstanbul(origin.iata)) return destination;
  if (isIstanbul(destination.iata)) return origin;
  if (destination.country === "TR" && origin.country !== "TR") return origin;
  return destination;
}

export function resolveEndpoint(route: RouteInfo): { other: Airport; region: Region; bearing: number } {
  const other = pickOther(route);
  const domestic = route.origin.country === "TR" && route.destination.country === "TR";
  return {
    other,
    region: domestic ? "DOM" : countryToRegion(other.country),
    bearing: initialBearing(ISTANBUL.lat, ISTANBUL.lon, other.lat, other.lon),
  };
}
