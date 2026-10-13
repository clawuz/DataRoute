import { haversineKm } from "@collector/geo";
import type { Region } from "@collector/day-schema";
import { countryOf } from "./countries";
import type { PersonalMode } from "./codec";

export interface PersonalRoute {
  /** stable route key, "TR-JP" style (ISO2 of both ends) */
  key: string;
  from: string;
  to: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distKm: number;
  /** region of the far end — picks the instrument and the arc colour */
  region: Region;
}

const HOME = "TR";

function leg(a: string, b: string): PersonalRoute | null {
  const A = countryOf(a);
  const B = countryOf(b);
  if (!A || !B || a === b) return null;
  return {
    key: `${a}-${b}`,
    from: a,
    to: b,
    fromLat: A.lat,
    fromLon: A.lon,
    toLat: B.lat,
    toLon: B.lon,
    distKm: haversineKm(A.lat, A.lon, B.lat, B.lon),
    region: B.region,
  };
}

/** greedy nearest-neighbour order from `start` — a believable journey rather than a zig-zag */
export function journeyOrder(start: string, isos: string[]): string[] {
  const left = [...new Set(isos)].filter((i) => i !== start && countryOf(i));
  const out: string[] = [];
  let cur = start;
  while (left.length) {
    const c = countryOf(cur)!;
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const o = countryOf(left[i])!;
      const d = haversineKm(c.lat, c.lon, o.lat, o.lon);
      if (d < bd || (d === bd && left[i] < left[bi])) {
        bd = d;
        bi = i;
      }
    }
    cur = left.splice(bi, 1)[0];
    out.push(cur);
  }
  return out;
}

/**
 * visited → the journey: home → nearest → nearest … (every leg is a note, the way back is implied)
 * wish    → the star: home → every dream, one spoke each
 */
export function buildRoutes(mode: PersonalMode, isos: string[]): PersonalRoute[] {
  const order = journeyOrder(HOME, isos);
  const out: PersonalRoute[] = [];
  if (mode === "wish") {
    for (const to of order) {
      const r = leg(HOME, to);
      if (r) out.push(r);
    }
  } else {
    let prev = HOME;
    for (const to of order) {
      const r = leg(prev, to);
      if (r) out.push(r);
      prev = to;
    }
  }
  return out;
}
