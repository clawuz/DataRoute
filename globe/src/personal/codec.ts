import { COUNTRIES } from "./countries";

export type PersonalMode = "visited" | "wish";

export interface PersonalSelection {
  mode: PersonalMode;
  isos: string[];
}

export const MAX_COUNTRIES = 40;
export const MIN_COUNTRIES = 2;

const KEY: Record<PersonalMode, string> = { visited: "v", wish: "w" };
const INDEX = new Map(COUNTRIES.map((c, i) => [c.iso, i]));

/** the list as a bitmask over `COUNTRIES` order, base36 — order of picking is not kept (a set is the identity of a piece) */
export function encodeSet(isos: string[]): string {
  let n = 0n;
  for (const iso of isos) {
    const i = INDEX.get(iso);
    if (i !== undefined) n |= 1n << BigInt(i);
  }
  return n.toString(36);
}

export function decodeSet(s: string): string[] {
  if (!/^[0-9a-z]+$/.test(s)) return [];
  let n = 0n;
  for (const ch of s) n = n * 36n + BigInt(parseInt(ch, 36));
  const out: string[] = [];
  for (let i = 0; i < COUNTRIES.length; i++) if ((n >> BigInt(i)) & 1n) out.push(COUNTRIES[i].iso);
  return out;
}

/** `?v=<set>` / `?w=<set>` → a selection, or null when the URL carries none that is usable */
export function selectionFromSearch(search: string): PersonalSelection | null {
  const p = new URLSearchParams(search);
  for (const mode of ["visited", "wish"] as const) {
    const raw = p.get(KEY[mode]);
    if (raw === null) continue;
    const isos = decodeSet(raw.toLowerCase()).slice(0, MAX_COUNTRIES);
    if (isos.length >= MIN_COUNTRIES) return { mode, isos };
  }
  return null;
}

export const searchFromSelection = (s: PersonalSelection): string => `?${KEY[s.mode]}=${encodeSet(s.isos)}`;

/** stable identity of a piece (mode + set) — the key of the AI cache */
export const pieceHash = (s: PersonalSelection): string => `${KEY[s.mode]}-${encodeSet(s.isos)}`;
