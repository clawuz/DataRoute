import type { PlayInstrument } from "../audio/theory";
import { WORLD_FAMILIES, type WorldFamily } from "../audio/world-pack";

/** what a card may name: any instrument, or an NSynth family (the route hash picks the variant) */
export type Voice = PlayInstrument | WorldFamily;

export function resolveVoice(v: Voice, h: number): PlayInstrument {
  const fam = (WORLD_FAMILIES as Record<string, readonly PlayInstrument[]>)[v];
  return fam ? fam[Math.abs(h) % fam.length] : (v as PlayInstrument);
}

/**
 * The recordings of the world pack, by card: they are ADDED to the voices a card already has (those stay as the
 * fallback). `bass` is the list the bass route draws from (the chord pad never does). Cards that sit in a region
 * with no world recording are not listed. See docs/music-genre-cards.md.
 */
export const WORLD_VOICES: Record<string, { held?: Voice[]; melody?: Voice[]; pluck?: Voice[]; bass?: Voice[]; perc?: Voice }> = {
  anatolian: { melody: ["NEY_MAKAM", "KEMENCE_MAKAM", "BAGLAMA_MAKAM"], pluck: ["BAGLAMA_EXTRA", "BAGLAMA_MAKAM"] },
  karsilama: { melody: ["BAGPIPE", "KEMENCE_MAKAM"], pluck: ["BAGLAMA_EXTRA"] },
  arabic: { melody: ["NEY_MAKAM"], pluck: ["SANTUR"], perc: "DARBUKA_VCSL" },
  persian: { melody: ["SANTUR"], pluck: ["SANTUR"], perc: "DARBUKA_VCSL" },
  hindustani: { melody: ["NEY_MAKAM"], pluck: ["TANPURA"], perc: "TABLA" },
  eastasia: { melody: ["SHAKUHACHI", "ERHU", "KOTO"], pluck: ["KOTO", "KAYAGEUM", "DANTRANH"] },
  gamelan: { melody: ["STEELDRUM"], pluck: ["VIBES", "STEELDRUM"] },
  westafrica: { pluck: ["KALIMBA", "MBIRA"], perc: "DJEMBE" },
  eastafrica: { pluck: ["MBIRA", "KALIMBA"], perc: "DJEMBE" },
  salsa: { pluck: ["NYLONGUITAR"], bass: ["UPRIGHTBASS"] },
  mariachi: { pluck: ["NYLONGUITAR", "STEELDRUM"] },
  flamenco: { melody: ["NYLONGUITAR"], pluck: ["NYLONGUITAR"] },
  bossa: { pluck: ["NYLONGUITAR"], bass: ["UPRIGHTBASS"] },
  tango: { melody: ["ACCORDION"], held: ["ACCORDION"], bass: ["UPRIGHTBASS"] },
  celtic: { melody: ["TINWHISTLE", "BAGPIPE"], pluck: ["FOLKHARP"], perc: "FRAMEDRUM" },
  slavic: { melody: ["ACCORDION"], held: ["ACCORDION"], pluck: ["PSALTERY"] },
  centralasia: { pluck: ["PSALTERY"], perc: "BENDIR" },
  jazz: { melody: ["TENORSAX", "EKEYS"], pluck: ["EKEYS", "GUITAR_EL"], bass: ["UPRIGHTBASS"] },
  funk: { melody: ["EKEYS", "TENORSAX"], pluck: ["GUITAR_EL", "EKEYS"], bass: ["BASSGUITAR", "BASS_EL"] },
  pop: { melody: ["EKEYS", "GUITAR_EL"], pluck: ["GUITAR_EL"], bass: ["BASS_EL"] },
  romantic: { melody: ["STEINWAY"], pluck: ["STEINWAY", "KAWAI"] },
  baroque: { melody: ["HARPSICHORD"], pluck: ["HARPSICHORD"], held: ["RENORGAN"] },
};

/** the held low voice of home, by the card of the starting country; anything not listed is a cello */
export const DRONE_BY_CARD: Record<string, Voice> = {
  hindustani: "TANPURA",
  celtic: "BAGPIPE_DRONE",
  karsilama: "BAGPIPE_DRONE",
  baroque: "RENORGAN",
};
export const droneVoice = (cardId: string): Voice => DRONE_BY_CARD[cardId] ?? "CELLO";
