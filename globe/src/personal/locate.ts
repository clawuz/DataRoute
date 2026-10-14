import { isDestination } from "./destinations";

/**
 * A guess of the traveller's home airport from the browser's time zone — no permission, nothing leaves the page.
 * Only a suggestion: the picker shows it as the "From" field and the traveller can change it.
 */
const ZONE: Record<string, string> = {
  "America/New_York": "JFK", "America/Detroit": "DTW", "America/Chicago": "ORD", "America/Denver": "DEN", "America/Phoenix": "PHX",
  "America/Los_Angeles": "LAX", "America/Anchorage": "ANC", "America/Toronto": "YYZ", "America/Vancouver": "YVR", "America/Mexico_City": "MEX",
  "America/Sao_Paulo": "GRU", "America/Argentina/Buenos_Aires": "EZE", "America/Santiago": "SCL", "America/Bogota": "BOG", "America/Panama": "PTY",
  "Europe/London": "LHR", "Europe/Dublin": "DUB", "Europe/Paris": "CDG", "Europe/Berlin": "FRA", "Europe/Madrid": "MAD", "Europe/Rome": "FCO",
  "Europe/Amsterdam": "AMS", "Europe/Brussels": "BRU", "Europe/Zurich": "ZRH", "Europe/Vienna": "VIE", "Europe/Lisbon": "LIS", "Europe/Athens": "ATH",
  "Europe/Warsaw": "WAW", "Europe/Moscow": "SVO", "Europe/Stockholm": "ARN", "Europe/Copenhagen": "CPH", "Europe/Oslo": "OSL", "Europe/Helsinki": "HEL",
  "Europe/Istanbul": "IST", "Asia/Istanbul": "IST", "Asia/Dubai": "DXB", "Asia/Qatar": "DOH", "Asia/Riyadh": "RUH", "Africa/Cairo": "CAI",
  "Africa/Johannesburg": "JNB", "Africa/Lagos": "LOS", "Africa/Nairobi": "NBO", "Africa/Addis_Ababa": "ADD", "Africa/Casablanca": "CMN", "Africa/Algiers": "ALG",
  "Asia/Kolkata": "DEL", "Asia/Calcutta": "DEL", "Asia/Bangkok": "BKK", "Asia/Hong_Kong": "HKG", "Asia/Shanghai": "PEK", "Asia/Manila": "MNL",
  "Asia/Jakarta": "CGK", "Asia/Kuala_Lumpur": "KUL", "Asia/Singapore": "SIN", "Asia/Tokyo": "NRT", "Asia/Seoul": "ICN", "Australia/Sydney": "SYD",
  "Australia/Melbourne": "MEL",
};

/** the airport the time zone points at, or undefined when it is not one of the Turkish Airlines airports */
export function guessHome(zone?: string): string | undefined {
  let z = zone;
  if (z === undefined) {
    try {
      z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  }
  const code = z ? ZONE[z] : undefined;
  return code && isDestination(code) ? code : undefined;
}
