import type { PersonalMode } from "./codec";
import entries from "./library.json";

/**
 * Finished pieces made in the studio (AI-composed once, kept as plain files): they come to a person whose picks are
 * like one of them, and they carry the pieces of people who chose very little. No request is made anywhere: the
 * files are on the site.
 */
export interface LibraryTrack {
  file: string;
  mode: PersonalMode;
  regions: string[];
  seconds: number;
  label: string;
}
export const LIBRARY = entries as LibraryTrack[];

export interface Match {
  track: LibraryTrack;
  score: number;
}

/** how many of the person's top regions the track is about (the first counts most), less a little for regions they did not pick */
const W = [1, 0.6, 0.4];
export const MATCH_AT = 1.3;

export function pickTrack(library: LibraryTrack[], mode: PersonalMode, regions: string[], places: number): Match | null {
  let best: Match | null = null;
  for (const t of library) {
    let score = t.mode === mode ? 1 : 0;
    regions.slice(0, 3).forEach((r, k) => {
      if (t.regions.includes(r)) score += W[k];
    });
    score -= 0.3 * t.regions.filter((r) => !regions.slice(0, 3).includes(r)).length;
    // many places: a longer piece suits; few: the short one
    if (places >= 9 && t.seconds > 120) score += 0.15;
    if (places < 9 && t.seconds > 120) score -= 0.05;
    if (!best || score > best.score) best = { track: t, score };
  }
  return best && best.score >= MATCH_AT ? best : null;
}
