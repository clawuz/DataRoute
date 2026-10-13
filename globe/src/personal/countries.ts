import { countryToRegion } from "@collector/regions";
import type { Region } from "@collector/day-schema";

/** ISO2 → [lat, lon] of the capital (or the middle of the country). The order is the codec's bit order: append only. */
const RAW =
  "TR 41 28.98|GB 51.5 -0.1|FR 48.9 2.4|DE 52.5 13.4|IT 41.9 12.5|ES 40.4 -3.7|PT 38.7 -9.1|NL 52.4 4.9|BE 50.8 4.4|CH 46.9 7.4|AT 48.2 16.4|GR 38 23.7|CY 35.2 33.4|BG 42.7 23.3|RO 44.4 26.1|HU 47.5 19.1|CZ 50.1 14.4|PL 52.2 21|SK 48.1 17.1|HR 45.8 16|RS 44.8 20.5|BA 43.9 18.4|ME 42.4 19.3|AL 41.3 19.8|MK 42 21.4|XK 42.7 21.2|SI 46.1 14.5|MD 47 28.9|UA 50.5 30.5|BY 53.9 27.6|RU 55.8 37.6|LT 54.7 25.3|LV 56.9 24.1|EE 59.4 24.7|FI 60.2 24.9|SE 59.3 18.1|NO 59.9 10.8|DK 55.7 12.6|IS 64.1 -21.9|IE 53.3 -6.3|MT 35.9 14.5|LU 49.6 6.1|GE 41.7 44.8|AM 40.2 44.5|AZ 40.4 49.9|"
  + "IL 31.8 35.2|JO 31.9 35.9|LB 33.9 35.5|SY 33.5 36.3|IQ 33.3 44.4|IR 35.7 51.4|KW 29.4 47.98|SA 24.7 46.7|AE 25.3 55.3|QA 25.3 51.5|BH 26.2 50.6|OM 23.6 58.4|YE 15.4 44.2|"
  + "EG 30 31.2|MA 33.6 -7.6|DZ 36.8 3|TN 36.8 10.2|LY 32.9 13.2|SD 15.6 32.5|ET 9 38.7|KE -1.3 36.8|TZ -6.8 39.3|UG 0.3 32.6|RW -1.9 30.1|SO 2.0 45.3|DJ 11.6 43.1|NG 6.5 3.4|GH 5.6 -0.2|SN 14.7 -17.5|CI 5.3 -4|CM 3.9 11.5|CD -4.3 15.3|AO -8.8 13.2|ZA -26.2 28|ZW -17.8 31|MZ -25.97 32.6|MG -18.9 47.5|MU -20.2 57.5|SC -4.6 55.5|NA -22.6 17.1|BW -24.7 25.9|ZM -15.4 28.3|ML 12.6 -8|MR 18.1 -15.98|GM 13.5 -16.6|GN 9.5 -13.7|LR 6.3 -10.8|SL 8.5 -13.2|TG 6.1 1.2|BJ 6.4 2.4|NE 13.5 2.1|TD 12.1 15|GA 0.4 9.5|CG -4.3 15.3|SS 4.9 31.6|"
  + "CN 39.9 116.4|HK 22.3 114.2|TW 25 121.5|JP 35.7 139.7|KR 37.6 127|KP 39 125.8|MN 47.9 106.9|IN 28.6 77.2|PK 33.7 73.1|BD 23.8 90.4|LK 6.9 79.9|NP 27.7 85.3|MV 4.2 73.5|AF 34.5 69.2|UZ 41.3 69.3|KZ 51.2 71.4|KG 42.9 74.6|TJ 38.6 68.8|TM 37.9 58.4|TH 13.8 100.5|VN 21 105.8|KH 11.6 104.9|LA 18 102.6|MM 19.8 96.1|MY 3.1 101.7|SG 1.35 103.8|ID -6.2 106.8|PH 14.6 121|AU -33.9 151.2|NZ -41.3 174.8|FJ -18.1 178.4|"
  + "US 38.9 -77|CA 45.4 -75.7|MX 19.4 -99.1|GT 14.6 -90.5|CR 9.9 -84.1|PA 9 -79.5|CU 23.1 -82.4|DO 18.5 -69.9|JM 18 -76.8|BS 25 -77.4|CO 4.7 -74.1|VE 10.5 -66.9|EC -0.2 -78.5|PE -12 -77|BR -15.8 -47.9|BO -16.5 -68.1|CL -33.4 -70.7|AR -34.6 -58.4|UY -34.9 -56.2|PY -25.3 -57.6";

export interface Country {
  iso: string;
  lat: number;
  lon: number;
  region: Region;
}

export const COUNTRIES: Country[] = RAW.split("|")
  .filter(Boolean)
  .map((r) => {
    const [iso, lat, lon] = r.trim().split(" ");
    return { iso, lat: +lat, lon: +lon, region: countryToRegion(iso) };
  })
  // CG shares CD's capital coordinates in the table above; keep both but nudge so arcs have length
  .map((c) => (c.iso === "CG" ? { ...c, lat: -4.26, lon: 15.28 } : c));

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const countryOf = (iso: string): Country | undefined => BY_ISO.get(iso);
export const isCountry = (iso: string): boolean => BY_ISO.has(iso);

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
