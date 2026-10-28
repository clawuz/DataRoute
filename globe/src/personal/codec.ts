import { isDestination } from "./destinations";

export type PersonalMode = "visited" | "wish";

export interface PersonalSelection {
  mode: PersonalMode;
  /** the places picked, in order (Turkish Airlines airports) — consecutive places are the legs of the journey */
  places: string[];
  /** optional: every place is a separate trip from here instead of a chain */
  home?: string;
}

export const MAX_DESTINATIONS = 30;
/** a journey needs two places; with a home, one place is enough */
export const MIN_PLACES = 2;
export const minPlaces = (home?: string): number => (home ? 1 : MIN_PLACES);
/** a new piece needs four places (four voices: pad, bass, hook, pluck); old links with fewer still play (selectionFromSearch uses minPlaces) */
export const NEW_MIN_PLACES = 4;

const KEY: Record<PersonalMode, string> = { visited: "v", wish: "w" };
const CODE = /^[A-Z]{3}$/;
const LEGACY_HUB = "IST";

const uniqueKnown = (codes: string[], not?: string): string[] =>
  [...new Set(codes.map((c) => c.toUpperCase()))].filter((c) => CODE.test(c) && isDestination(c) && c !== not);

/**
 * `?v=JFK,NRT,DPS` (a journey, in order) or `?w=...` (wish); `&h=LHR` makes every place a trip from LHR.
 * Old links (`?o=LHR&v=DPS`, `?v=JFK`) were fans from an origin (default IST): they keep that meaning.
 */
export function selectionFromSearch(search: string): PersonalSelection | null {
  const p = new URLSearchParams(search);
  const known = (c: string | null): string | undefined => {
    const u = (c ?? "").toUpperCase();
    return CODE.test(u) && isDestination(u) ? u : undefined;
  };
  for (const mode of ["visited", "wish"] as const) {
    const raw = p.get(KEY[mode]);
    if (raw === null) continue;
    let home = known(p.get("h")) ?? known(p.get("o"));
    let places = uniqueKnown(raw.split(","), home).slice(0, MAX_DESTINATIONS);
    if (!home && !p.has("h") && (p.has("o") || places.length === 1)) {
      home = LEGACY_HUB;
      places = places.filter((c) => c !== home);
    }
    if (places.length >= minPlaces(home)) return home ? { mode, places, home } : { mode, places };
  }
  return null;
}

export function searchFromSelection(s: PersonalSelection): string {
  return `?${KEY[s.mode]}=${s.places.join(",")}${s.home ? `&h=${s.home}` : ""}`;
}

/** stable identity of a piece (mode + home + places) — the key of the AI cache; order matters for a journey */
export const pieceHash = (s: PersonalSelection): string =>
  `${KEY[s.mode]}-${s.home ?? "j"}-${(s.home ? [...s.places].sort() : s.places).join("")}`;
