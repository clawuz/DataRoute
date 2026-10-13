import { isDestination } from "./destinations";

export type PersonalMode = "visited" | "wish";

export interface PersonalSelection {
  mode: PersonalMode;
  /** the airport the traveller starts from (a Turkish Airlines airport; IST = home hub) */
  origin: string;
  /** destination IATA codes in the order picked */
  dests: string[];
}

export const MAX_DESTINATIONS = 30;
export const MIN_DESTINATIONS = 1;
export const DEFAULT_ORIGIN = "IST";

const KEY: Record<PersonalMode, string> = { visited: "v", wish: "w" };
const CODE = /^[A-Z]{3}$/;

const uniqueKnown = (codes: string[], not: string): string[] =>
  [...new Set(codes.map((c) => c.toUpperCase()))].filter((c) => CODE.test(c) && isDestination(c) && c !== not);

/** `?o=LHR&v=DPS,JFK` (visited) or `?o=LHR&w=...` (wish); null when nothing usable is in the URL */
export function selectionFromSearch(search: string): PersonalSelection | null {
  const p = new URLSearchParams(search);
  const o = (p.get("o") ?? DEFAULT_ORIGIN).toUpperCase();
  const origin = CODE.test(o) && isDestination(o) ? o : DEFAULT_ORIGIN;
  for (const mode of ["visited", "wish"] as const) {
    const raw = p.get(KEY[mode]);
    if (raw === null) continue;
    const dests = uniqueKnown(raw.split(","), origin).slice(0, MAX_DESTINATIONS);
    if (dests.length >= MIN_DESTINATIONS) return { mode, origin, dests };
  }
  return null;
}

export function searchFromSelection(s: PersonalSelection): string {
  const o = s.origin !== DEFAULT_ORIGIN ? `o=${s.origin}&` : "";
  return `?${o}${KEY[s.mode]}=${s.dests.join(",")}`;
}

/** stable identity of a piece (mode + origin + set) — the key of the AI cache */
export const pieceHash = (s: PersonalSelection): string => `${KEY[s.mode]}-${s.origin}-${[...s.dests].sort().join("")}`;
