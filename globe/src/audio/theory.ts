import { REGIONS } from "@web/data/palette";

export type RegionName = (typeof REGIONS)[number];
/**
 * Every voice of the route music: the continent line instruments (EUR vibraphone, PNO piano, MEA oud, AFR kalimba,
 * ASI koto, AME pad, EP Rhodes), the Istanbul ney and its winds, the v3 groove voices and the v4 fill/build voices
 * and region-layer percussion.
 */
export type Instrument =
  | RegionName | "PNO" | "NEY" | "CLA" | "SAX" | "TPT"
  | "EP" | "BASS" | "KICK" | "SNARE" | "HAT" | "OHAT" | "KEYS" | "BRASS" | "SAXPAD"
  | "TOM" | "CRASH" | "SHAKER" | "RISER" | "DARBUKA" | "CONGA" | "TAIKO" | "TIMP";

/** Bjorklund: `k` onsets spread as evenly as possible over `n` steps, starting on an onset. */
export function euclid(k: number, n: number): boolean[] {
  if (n <= 0) return [];
  if (k <= 0) return Array(n).fill(false);
  if (k >= n) return Array(n).fill(true);
  let a: boolean[][] = Array.from({ length: k }, () => [true]);
  let b: boolean[][] = Array.from({ length: n - k }, () => [false]);
  while (b.length > 1) {
    const m = Math.min(a.length, b.length);
    const paired = a.slice(0, m).map((x, i) => [...x, ...b[i]]);
    const rest = a.length > m ? a.slice(m) : b.slice(m);
    a = paired;
    b = rest;
  }
  return [...a, ...b].flat();
}

/** West and north Europe (piano): west of 20°E or north of 52°N. */
export const isWestNorth = (lat: number, lon: number): boolean => lon < 20 || lat > 52;

export function routeKey(from: string | undefined, to: string | undefined, id: string): string {
  return from && to ? (from < to ? `${from}-${to}` : `${to}-${from}`) : id;
}

/** FNV-1a, 32-bit. */
export function routeHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const freqOf = (oct: number, semis: number): number => 110 * 2 ** (oct - 2) * 2 ** (semis / 12);
