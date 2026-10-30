import type { PersonalRoute } from "./routes";
import type { PersonalMode } from "./codec";
import { destinationOf } from "./destinations";

const VOICE: Record<string, string> = { DOM: "Saz", EUR: "Violin", MEA: "Kanun", AFR: "Marimba", ASI: "Harp", AME: "Flute", UNK: "Piano" };
const REGION_NAME: Record<string, string> = { DOM: "Anatolia", EUR: "Europe", MEA: "the Middle East", AFR: "Africa", ASI: "Asia-Pacific", AME: "the Americas", UNK: "the world" };
const EARTH_KM = 40075;
/** how a voice is named on screen: the instrument of the music itself (the id of its recording), not of the region */
const VOICE_NAME: Record<string, string> = {
  KEMENCE_KARADENIZ: "Black Sea kemençe", KEMENCE_MAKAM: "Kemençe", KEMENCE_REAL: "Kemençe", TULUM: "Tulum", BAGLAMA_MAKAM: "Bağlama", BAGLAMA_EXTRA: "Bağlama",
  SAZ: "Saz", OUD: "Oud", KANUN: "Kanun", NEY_MAKAM: "Ney", NEY_REAL: "Ney", ZURNA: "Zurna", DUDUK: "Duduk", CLA: "Clarinet", TENORSAX: "Tenor sax", TPT: "Trumpet",
  VIOLIN: "Violin", VIOLA: "Viola", CELLO: "Cello", FLUTE: "Flute", OBOE: "Oboe", HORN: "Horn", BSN: "Bassoon", PNO: "Piano", HARP: "Harp", ACCORDION: "Accordion",
  BANSURI: "Bansuri", SARANGI: "Sarangi", SANTUR: "Santur", PSALTERY: "Psaltery", KOTO: "Koto", ERHU: "Erhu", MARIMBA: "Marimba", XYLO: "Xylophone", GLOCK: "Glockenspiel",
  VIBES: "Vibraphone", STEELDRUM: "Steel drum", NYLONGUITAR: "Nylon guitar", HARMONICA: "Harmonica", PANPIPE: "Pan flute", BAGPIPE: "Bagpipe", RHODES: "Electric piano",
  EKEYS: "Electric keys", GUITAR_AC: "Acoustic guitar", GUITAR_EL: "Electric guitar", KALIMBA: "Kalimba", UPRIGHTBASS: "Upright bass", BASS_EL: "Electric bass",
};
/** the display name of a voice id (numbered families such as NS_EKEYS_3 lose their prefix and number; an unknown id is written out) */
export function voiceName(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const base = id.replace(/^NS_/, "").replace(/_\d+$/, "");
  if (VOICE_NAME[base]) return VOICE_NAME[base];
  const words = base.toLowerCase().split("_").filter(Boolean);
  return words.length ? words.join(" ").replace(/^./, (c) => c.toUpperCase()) : undefined;
}

export interface PieceStats {
  countries: number;
  destinations: number;
  km: number;
  /** how many times the trip would go round the Earth */
  laps: number;
  regions: number;
  /** the voice that leads the piece: the instrument of its hook (the region's voice when it is not known) */
  signature: string;
  /** a name for the piece, built from where it goes most */
  title: string;
}

export function pieceStats(mode: PersonalMode, places: string[], home: string | undefined, routes: PersonalRoute[], lead?: string): PieceStats {
  const km = Math.round(routes.reduce((s, r) => s + r.distKm, 0));
  const count = new Map<string, number>();
  for (const r of routes) count.set(r.region, (count.get(r.region) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "UNK";
  const name = REGION_NAME[top] ?? "the world";
  const isos = new Set(places.map((d) => destinationOf(d)?.iso).filter(Boolean));
  const o = home ? destinationOf(home)?.iso : undefined;
  if (o) isos.delete(o);
  return {
    countries: isos.size,
    destinations: places.length,
    km,
    laps: Math.round((km / EARTH_KM) * 10) / 10,
    regions: count.size,
    signature: voiceName(lead) ?? VOICE[top] ?? "Piano",
    title: mode === "wish" ? `Dreaming of ${name}` : `Wandering through ${name}`,
  };
}

/** "1 country", "2 countries" — upper-case for the labels */
export const countLabel = (n: number, one: string, many: string): string => `${n} ${(n === 1 ? one : many).toUpperCase()}`;
