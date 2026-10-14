import type { PersonalRoute } from "./routes";
import type { PersonalMode } from "./codec";
import { destinationOf } from "./destinations";

const VOICE: Record<string, string> = { DOM: "Saz", EUR: "Violin", MEA: "Kanun", AFR: "Marimba", ASI: "Harp", AME: "Flute", UNK: "Piano" };
const REGION_NAME: Record<string, string> = { DOM: "Anatolia", EUR: "Europe", MEA: "the Middle East", AFR: "Africa", ASI: "Asia-Pacific", AME: "the Americas", UNK: "the world" };
const EARTH_KM = 40075;

export interface PieceStats {
  countries: number;
  destinations: number;
  km: number;
  /** how many times the trip would go round the Earth */
  laps: number;
  regions: number;
  /** the voice that plays the most legs */
  signature: string;
  /** a name for the piece, built from where it goes most */
  title: string;
}

export function pieceStats(mode: PersonalMode, origin: string, dests: string[], routes: PersonalRoute[]): PieceStats {
  const km = Math.round(routes.reduce((s, r) => s + r.distKm, 0));
  const count = new Map<string, number>();
  for (const r of routes) count.set(r.region, (count.get(r.region) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "UNK";
  const name = REGION_NAME[top] ?? "the world";
  const isos = new Set(dests.map((d) => destinationOf(d)?.iso).filter(Boolean));
  const o = destinationOf(origin)?.iso;
  if (o) isos.delete(o);
  return {
    countries: isos.size,
    destinations: dests.length,
    km,
    laps: Math.round((km / EARTH_KM) * 10) / 10,
    regions: count.size,
    signature: VOICE[top] ?? "Piano",
    title: mode === "wish" ? `Dreaming of ${name}` : `Wandering through ${name}`,
  };
}

/** "1 country", "2 countries" — upper-case for the labels */
export const countLabel = (n: number, one: string, many: string): string => `${n} ${(n === 1 ? one : many).toUpperCase()}`;
