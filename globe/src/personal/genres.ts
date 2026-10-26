import { WORLD_VOICES, type Voice } from "./world-voices";
import { routeHash } from "../audio/theory";
import type { PersonalMode } from "./codec";
import { HUB, destinationOf } from "./destinations";
import type { PersonalRoute } from "./routes";

/**
 * Genre cards: what a tradition sounds like, as numbers the composer can use — tempo, the scale or makam, one rhythm
 * figure (the usul / clave / bell pattern), its accents, the progression and the instruments of the sample pack.
 * Only patterns are taken from the traditions; no recording and no melody. See docs/music-genre-cards.md.
 */
export type Family = "symphonic" | "chamber" | "folk" | "pulse";

export interface GenreCard {
  id: string;
  name: string;
  /** the family of sound used by the rest of the page */
  family: Family;
  /** the shortest routes tick in sixteenths (soundtrack, pop, electronic and baroque lines are about a third sixteenths in the PDMX corpus) */
  fast?: boolean;
  /** tempo range (bpm); clamped to 76–126 so every piece stays a full-length piece */
  bpm: [number, number];
  /** semitones above the tonic: 5 or 7 notes */
  scale: number[];
  /** the scale of a wish (defaults to `scale`) */
  scaleWish?: number[];
  /** the figure of one route: lengths in units (negative = a rest), e.g. aksak 9/8 = 2 2 2 3 */
  cell: number[];
  /** loudness of each place of the figure (defaults to 1) */
  accent?: number[];
  /** progression as [semitones above the tonic, third (3 or 4)]; two bars each. Omitted: the common minor/major ones */
  prog?: [number, 3 | 4][];
  /** instruments by role, for every region */
  held: Voice[];
  melody: Voice[];
  pluck: Voice[];
  perc: Voice;
  /** the voices of the bass route (the chord pad does not draw from it); omitted: the held voices */
  bass?: Voice[];
  /** how late the off-eighths lean (fraction of a beat); omitted: the piece's own swing */
  swing?: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
// the makams as the SymbTr corpus plays them (semitones above the karar; the intervals are in 53 commas, so not all are equal temperament)
const HICAZ = [0, 1.13, 3.85, 4.98, 7.02, 9.28, 9.96];
const USSAK = [0, 1.58, 2.94, 4.98, 7.02, 9.28, 9.96];
const NIHAVENT = [0, 2.04, 2.94, 4.98, 7.02, 7.92, 10.19];
const RAST = [0, 2.04, 3.85, 4.98, 7.02, 9.28, 11.09];
const SEGAH = [0, 1.13, 3.17, 4.98, 6.11, 8.15, 11.09];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const BHAIRAV = [0, 1, 4, 5, 7, 8, 11];
const MINOR_PENT = [0, 3, 5, 7, 10];
const MAJOR_PENT = [0, 2, 4, 7, 9];
const YO = [0, 2, 5, 7, 9];
const MIYAKO = [0, 1, 5, 7, 8];
const PELOG = [0, 1, 3, 7, 8];

const BASE_CARDS: GenreCard[] = [
  { id: "cinematic", fast: true, name: "Cinematic orchestra", family: "symphonic", bpm: [84, 108], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1, 1], accent: [1.12, 0.9, 0.95, 0.9], held: ["PNO", "CELLO", "VIOLA", "HORN"], melody: ["PNO", "VIOLIN", "HORN", "OBOE"], pluck: ["PNO", "HARP", "VIOLA_PIZZ"], perc: "TIMP" },
  { id: "romantic", name: "Romantic piano", family: "chamber", bpm: [76, 92], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1], accent: [1.15, 0.85, 0.85], held: ["CELLO", "VIOLA", "BSN"], melody: ["PNO", "VIOLIN", "FLUTE"], pluck: ["PNO", "HARP"], perc: "TRI" },
  { id: "baroque", fast: true, name: "Baroque strings", family: "chamber", bpm: [92, 120], scale: MINOR, scaleWish: MAJOR, cell: [1, 1], accent: [1.1, 0.9], held: ["CELLO", "VIOLA", "BSN"], melody: ["VIOLIN", "OBOE", "FLUTE", "PNO"], pluck: ["HARP", "VIOLIN_PIZZ", "PNO"], perc: "TRI" },
  { id: "anatolian", name: "Anatolian folk", family: "folk", bpm: [88, 112], scale: USSAK, scaleWish: HICAZ, cell: [2, 1, 1, 1, 1, 1, 1, 1], accent: [1.25, 0.85, 0.9, 0.85, 0.9, 0.85, 0.9, 0.85], prog: [[0, 3], [10, 4], [8, 4], [0, 3]], held: ["NEY", "CELLO", "VIOLA"], melody: ["SAZ", "NEY", "VIOLIN", "PNO"], pluck: ["SAZ", "OUD", "HARP"], perc: "DARBUKA" },
  { id: "karsilama", name: "Karşılama", family: "folk", bpm: [106, 124], scale: HICAZ, scaleWish: NIHAVENT, cell: [2, 2, 2, 3], accent: [1.25, 0.8, 0.85, 1.05], prog: [[0, 4], [1, 4], [0, 4], [10, 4]], held: ["CELLO", "VIOLA"], melody: ["CLA", "VIOLIN", "SAZ", "PNO"], pluck: ["SAZ", "HARP"], perc: "DARBUKA" },
  { id: "arabic", name: "Arabic maqsum", family: "folk", bpm: [84, 104], scale: HICAZ, scaleWish: RAST, cell: [1, 1, -1, 1, 1, -1, 1, -1], accent: [1.25, 0.9, 0, 0.95, 1.15, 0, 0.9, 0], prog: [[0, 4], [1, 4], [0, 4], [7, 4]], held: ["NEY", "CELLO", "VIOLA"], melody: ["OUD", "KANUN", "NEY", "PNO"], pluck: ["OUD", "KANUN", "HARP"], perc: "DARBUKA" },
  { id: "hindustani", name: "Indian rupak", family: "folk", bpm: [80, 108], scale: BHAIRAV, scaleWish: LYDIAN, cell: [3, 2, 2], accent: [1.25, 0.9, 0.95], prog: [[0, 4], [5, 4], [0, 4], [7, 4]], held: ["NEY", "VIOLA", "CELLO"], melody: ["KANUN", "FLUTE", "VIOLIN", "PNO"], pluck: ["KANUN", "HARP"], perc: "DARBUKA" },
  { id: "eastasia", name: "East Asian pentatonic", family: "chamber", bpm: [76, 96], scale: MIYAKO, scaleWish: YO, cell: [2, 1, -1, 2], accent: [1.15, 0.9, 0, 1], prog: [[0, 3], [5, 4], [0, 3], [7, 4]], held: ["CELLO", "VIOLA"], melody: ["FLUTE", "PNO", "HARP"], pluck: ["HARP", "GLOCK", "PNO"], perc: "GONG" },
  { id: "gamelan", name: "Gamelan cycle", family: "pulse", bpm: [88, 112], scale: PELOG, scaleWish: MAJOR_PENT, cell: [1, -1, 1, 1], accent: [1.2, 0, 0.9, 1], prog: [[0, 3], [5, 4], [0, 3], [7, 4]], held: ["GONG", "CELLO"], melody: ["GLOCK", "MARIMBA", "XYLO", "PNO"], pluck: ["GLOCK", "MARIMBA", "HARP"], perc: "GONG" },
  { id: "westafrica", name: "West African bell", family: "pulse", bpm: [100, 120], scale: MAJOR_PENT, cell: [2, 2, 1, 2, 2, 2, 1], accent: [1.2, 1, 0.9, 1.1, 1, 1, 0.9], prog: [[0, 4], [5, 4], [0, 4], [7, 4]], held: ["BSN", "CELLO"], melody: ["MARIMBA", "XYLO", "PNO"], pluck: ["MARIMBA", "XYLO"], perc: "CONGA" },
  { id: "eastafrica", name: "East & southern African", family: "pulse", bpm: [92, 116], scale: MAJOR_PENT, scaleWish: MAJOR, cell: [1, 1, 2, 1, 1, 2], accent: [1.15, 0.9, 1, 0.9, 0.9, 1], prog: [[0, 4], [5, 4], [7, 4], [0, 4]], held: ["HORN", "BSN"], melody: ["CLA", "MARIMBA", "PNO", "TPT"], pluck: ["MARIMBA", "XYLO", "HARP"], perc: "CONGA" },
  { id: "salsa", name: "Salsa clave", family: "pulse", bpm: [96, 112], scale: DORIAN, scaleWish: MIXO, cell: [3, 3, 4, 2, 4], accent: [1.2, 1, 1.1, 0.95, 1], prog: [[0, 3], [5, 4], [7, 4], [0, 3]], held: ["BSN", "CELLO"], melody: ["PNO", "TPT", "FLUTE"], pluck: ["PNO", "HARP"], perc: "CONGA" },
  { id: "bossa", name: "Bossa nova", family: "chamber", bpm: [84, 104], scale: MAJOR, scaleWish: LYDIAN, cell: [3, 3, 4, 3, 3], accent: [1.15, 0.95, 1, 0.95, 1], prog: [[0, 4], [2, 3], [7, 4], [0, 4]], held: ["CELLO", "VIOLA"], melody: ["PNO", "FLUTE", "CLA"], pluck: ["PNO", "HARP"], perc: "TAMB" },
  { id: "tango", name: "Tango", family: "chamber", bpm: [84, 108], scale: HARMONIC, scaleWish: MAJOR, cell: [3, 3, 2], accent: [1.3, 1, 1.1], prog: [[0, 3], [5, 4], [7, 4], [0, 3]], held: ["CELLO", "VIOLA"], melody: ["VIOLIN", "PNO", "CLA"], pluck: ["PNO", "VIOLIN_PIZZ"], perc: "TIMP" },
  { id: "flamenco", name: "Flamenco compás", family: "folk", bpm: [92, 124], scale: HICAZ, cell: [3, 3, 2, 2, 2], accent: [1.25, 1.15, 1, 1, 1.3], prog: [[0, 4], [10, 4], [8, 4], [7, 4]], held: ["CELLO", "VIOLA"], melody: ["VIOLIN", "OUD", "FLUTE", "PNO"], pluck: ["OUD", "HARP"], perc: "TAMB" },
  { id: "celtic", name: "Celtic jig", family: "folk", bpm: [100, 124], scale: DORIAN, scaleWish: MIXO, cell: [2, 1, 2, 1], accent: [1.15, 0.8, 1, 0.8], prog: [[0, 3], [10, 4], [5, 4], [10, 4]], held: ["CELLO", "VIOLA"], melody: ["VIOLIN", "FLUTE", "HARP", "PNO"], pluck: ["HARP", "VIOLIN_PIZZ"], perc: "TAMB" },
  { id: "nordic", name: "Nordic ambient", family: "chamber", bpm: [76, 88], scale: DORIAN, scaleWish: LYDIAN, cell: [3, -1, 4, 2], accent: [1.1, 0, 1, 0.9], held: ["CELLO", "VIOLA", "HORN"], melody: ["PNO", "FLUTE", "HARP"], pluck: ["HARP", "GLOCK", "PNO"], perc: "TRI" },
  { id: "slavic", name: "Slavic march & waltz", family: "symphonic", bpm: [92, 118], scale: HARMONIC, scaleWish: MAJOR, cell: [2, 1, 1, 2], accent: [1.2, 0.9, 0.9, 1], held: ["CELLO", "HORN", "BSN"], melody: ["VIOLIN", "CLA", "HORN", "PNO"], pluck: ["HARP", "VIOLA_PIZZ"], perc: "TIMP" },
  { id: "centralasia", name: "Central Asian gallop", family: "folk", bpm: [92, 116], scale: HICAZ, scaleWish: MIXO, cell: [2, 1, 1], accent: [1.2, 0.9, 0.9], prog: [[0, 4], [10, 4], [0, 4], [7, 4]], held: ["NEY", "CELLO"], melody: ["NEY", "KANUN", "SAZ"], pluck: ["SAZ", "KANUN"], perc: "DARBUKA" },
  { id: "dance", fast: true, name: "Lively percussion", family: "pulse", bpm: [108, 124], scale: MAJOR_PENT, scaleWish: MAJOR, cell: [1, 1, 2, 1, 1, 2], accent: [1.15, 0.85, 1, 0.85, 0.85, 1], prog: [[0, 4], [7, 4], [9, 3], [5, 4]], held: ["BSN", "CELLO", "HORN"], melody: ["MARIMBA", "XYLO", "PNO"], pluck: ["MARIMBA", "XYLO", "GLOCK"], perc: "CONGA" },
  { id: "epic", fast: true, name: "Epic action", family: "symphonic", bpm: [112, 126], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1, 1], accent: [1.2, 0.85, 0.95, 0.85], prog: [[0, 3], [8, 4], [3, 4], [10, 4]], held: ["CELLO", "VIOLA", "HORN"], melody: ["VIOLIN", "TPT", "HORN", "PNO"], pluck: ["VIOLA_PIZZ", "HARP", "PNO"], perc: "TIMP" },
  { id: "calm", name: "Calm ambient", family: "chamber", bpm: [76, 84], scale: LYDIAN, scaleWish: MAJOR, cell: [4, 2, 2], accent: [1.1, 0.9, 0.9], prog: [[0, 4], [7, 4], [9, 3], [5, 4]], held: ["CELLO", "VIOLA", "HORN"], melody: ["PNO", "FLUTE", "GLOCK"], pluck: ["HARP", "GLOCK", "PNO"], perc: "TRI" },
  { id: "mariachi", name: "Caribbean & Mexican", family: "folk", bpm: [100, 120], scale: MIXO, scaleWish: MAJOR, cell: [2, 1, 2, 1, 2, 1], accent: [1.2, 0.8, 1, 0.8, 1, 0.8], prog: [[0, 4], [5, 4], [7, 4], [0, 4]], held: ["CELLO", "BSN"], melody: ["TPT", "VIOLIN", "HARP"], pluck: ["HARP", "VIOLA_PIZZ"], perc: "TAMB" },
  { id: "persian", name: "Persian dastgah", family: "folk", bpm: [84, 106], scale: SEGAH, scaleWish: RAST, cell: [3, 2, 1, 1, 1, 1, 1], accent: [1.25, 1, 0.85, 0.9, 0.85, 0.9, 0.85], prog: [[0, 3], [1, 4], [0, 3], [10, 4]], held: ["NEY", "CELLO"], melody: ["KANUN", "NEY", "VIOLIN", "PNO"], pluck: ["KANUN", "OUD"], perc: "DARBUKA" },
  // from the PDMX bar figures: jazz leans on the off-beat quarters (x.x.x.x.), funk and soul on 3+3+1+1 (x..x..xx), electronic and pop on straight eighths
  { id: "jazz", name: "Jazz swing", family: "chamber", fast: true, bpm: [100, 126], scale: [0, 2, 3, 5, 7, 9, 10], scaleWish: [0, 2, 4, 5, 7, 9, 10], cell: [2, 1, 2, 1], accent: [1.1, 0.85, 1.05, 0.85], prog: [[0, 3], [5, 4], [7, 4], [0, 3]], held: ["CELLO", "BSN", "VIOLA"], melody: ["PNO", "TPT", "CLA", "FLUTE"], pluck: ["PNO", "VIOLA_PIZZ", "HARP"], perc: "TAMB", swing: 0.22 },
  { id: "funk", name: "Funk & soul", family: "pulse", bpm: [92, 112], scale: [0, 3, 5, 6, 7, 10], scaleWish: [0, 2, 4, 7, 9], cell: [3, 3, 1, 1], accent: [1.25, 1.05, 0.9, 1.1], prog: [[0, 3], [5, 3], [0, 3], [7, 4]], held: ["BSN", "CELLO"], melody: ["PNO", "TPT", "CLA"], pluck: ["PNO", "MARIMBA", "XYLO"], perc: "CONGA", swing: 0.12 },
  { id: "pop", name: "Electro pop", family: "pulse", fast: true, bpm: [104, 124], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1, 1, 1, 1, 1, 1], accent: [1.15, 0.8, 1, 0.8, 1.05, 0.8, 1, 0.8], prog: [[0, 3], [8, 4], [3, 4], [10, 4]], held: ["CELLO", "VIOLA", "HORN"], melody: ["PNO", "FLUTE", "XYLO", "VIOLIN"], pluck: ["PNO", "GLOCK", "MARIMBA"], perc: "TAMB" },
];

/** the cards with the recordings of the world pack added to their voices (the original voices stay as the fallback) */
export const CARDS: GenreCard[] = BASE_CARDS.map((c) => {
  const w = WORLD_VOICES[c.id];
  if (!w) return c;
  return {
    ...c,
    held: [...c.held, ...(w.held ?? [])],
    melody: [...c.melody, ...(w.melody ?? [])],
    pluck: [...c.pluck, ...(w.pluck ?? [])],
    perc: w.perc ?? c.perc,
    ...(w.bass ? { bass: w.bass } : {}),
  };
});

const byId = (id: string): GenreCard => CARDS.find((c) => c.id === id) ?? CARDS[0];

/** cards of a country (ISO 3166-1 alpha-2) */
const BY_ISO: Record<string, string[]> = {
  TR: ["cinematic", "anatolian", "romantic", "karsilama"], GR: ["karsilama", "anatolian"], BG: ["karsilama", "slavic"], RS: ["karsilama", "slavic"], MK: ["karsilama"], AL: ["karsilama"], BA: ["karsilama", "slavic"], XK: ["karsilama"],
  EG: ["arabic"], SA: ["arabic"], AE: ["arabic"], QA: ["arabic"], KW: ["arabic"], BH: ["arabic"], OM: ["arabic"], JO: ["arabic"], LB: ["arabic"], SY: ["arabic"], IQ: ["arabic"], YE: ["arabic"], MA: ["arabic", "flamenco"], DZ: ["arabic"], TN: ["arabic"], LY: ["arabic"], SD: ["arabic"],
  IR: ["persian"], AF: ["persian", "centralasia"], KZ: ["centralasia"], UZ: ["centralasia"], KG: ["centralasia"], TM: ["centralasia"], TJ: ["centralasia"], AZ: ["centralasia", "anatolian"], GE: ["centralasia", "slavic"], AM: ["slavic", "anatolian"],
  IN: ["hindustani"], PK: ["hindustani"], BD: ["hindustani"], LK: ["hindustani"], NP: ["hindustani"], MV: ["hindustani"],
  JP: ["eastasia", "pop"], CN: ["eastasia"], KR: ["pop", "eastasia"], TW: ["eastasia"], HK: ["eastasia"], MN: ["eastasia", "centralasia"], VN: ["eastasia", "gamelan"],
  ID: ["gamelan"], TH: ["gamelan"], MY: ["gamelan"], SG: ["gamelan", "eastasia"], PH: ["gamelan", "mariachi"], KH: ["gamelan"], LA: ["gamelan"], MM: ["gamelan"],
  NG: ["westafrica"], GH: ["westafrica"], SN: ["westafrica"], CI: ["westafrica"], ML: ["westafrica"], GM: ["westafrica"], GN: ["westafrica"], SL: ["westafrica"], LR: ["westafrica"], BF: ["westafrica"], BJ: ["westafrica"], TG: ["westafrica"], CM: ["westafrica"], GA: ["westafrica"], CG: ["westafrica"], CD: ["westafrica", "eastafrica"],
  KE: ["eastafrica"], TZ: ["eastafrica"], UG: ["eastafrica"], RW: ["eastafrica"], ET: ["eastafrica"], ZA: ["eastafrica"], ZW: ["eastafrica"], ZM: ["eastafrica"], MZ: ["eastafrica"], AO: ["eastafrica", "bossa"], MG: ["eastafrica"], MU: ["eastafrica"], SO: ["eastafrica"], DJ: ["eastafrica"], NA: ["eastafrica"], BW: ["eastafrica"],
  CU: ["salsa", "mariachi"], CO: ["salsa"], PR: ["salsa"], DO: ["salsa"], VE: ["salsa"], PA: ["salsa"], CR: ["salsa"], EC: ["salsa"], PE: ["salsa", "mariachi"], JM: ["mariachi", "salsa"], TT: ["mariachi"], MX: ["mariachi"], GT: ["mariachi"], HN: ["mariachi"], SV: ["mariachi"], NI: ["mariachi"], CW: ["mariachi", "salsa"], AW: ["mariachi"], BS: ["mariachi"],
  BR: ["bossa", "funk"], PT: ["bossa", "romantic"], AR: ["tango"], UY: ["tango"], CL: ["tango", "bossa"], PY: ["tango"], BO: ["tango", "mariachi"],
  ES: ["flamenco"], IE: ["celtic"], GB: ["celtic", "pop", "romantic", "cinematic"], IS: ["nordic"], NO: ["nordic"], SE: ["nordic", "pop"], FI: ["nordic"], DK: ["nordic"], EE: ["nordic"], LV: ["nordic"], LT: ["nordic"],
  RU: ["slavic"], UA: ["slavic"], BY: ["slavic"], PL: ["slavic", "romantic"], CZ: ["baroque", "slavic"], SK: ["slavic"], HU: ["slavic", "romantic"], RO: ["slavic", "karsilama"], MD: ["slavic"], HR: ["slavic"], SI: ["baroque"], ME: ["slavic"],
  DE: ["baroque", "romantic", "pop"], AT: ["baroque", "romantic"], IT: ["baroque", "romantic"], FR: ["romantic", "jazz", "baroque"], CH: ["baroque"], NL: ["baroque", "pop"], BE: ["baroque", "romantic"], LU: ["romantic"], MT: ["baroque"], CY: ["anatolian", "karsilama"],
  US: ["cinematic", "jazz", "funk", "pop"], CA: ["cinematic", "nordic", "jazz"], AU: ["cinematic", "pop"], NZ: ["cinematic", "nordic"],
};
const BY_REGION: Record<string, string[]> = {
  DOM: ["anatolian", "karsilama"], EUR: ["romantic", "baroque", "cinematic"], MEA: ["arabic", "persian"], AFR: ["westafrica", "eastafrica"], ASI: ["eastasia", "gamelan", "hindustani", "centralasia"], AME: ["cinematic", "salsa", "bossa", "mariachi"], UNK: ["cinematic"],
};

/** the cards that belong to the place of an airport */
export function cardsOfAirport(iata: string, region: string): GenreCard[] {
  const iso = destinationOf(iata)?.iso ?? "";
  return (BY_ISO[iso] ?? BY_REGION[region] ?? BY_REGION.UNK).map(byId);
}

/** a calm piece for few routes, a lively one for many */
function generic(n: number): GenreCard[] {
  return (n <= 2 ? ["calm", "nordic", "romantic"] : n <= 5 ? ["cinematic", "romantic", "calm"] : n <= 9 ? ["cinematic", "baroque", "dance", "jazz"] : ["dance", "pop", "epic", "cinematic"]).map(byId);
}

export interface CardPlan {
  /** the card of the place the trip starts from: tempo, scale, progression */
  main: GenreCard;
  /** the card each route plays (its own figure and instruments): the main one, or the one of its destination */
  perRoute: GenreCard[];
}

/** the share of the routes (rounded) that play the card of their own destination; the rest play the main card */
export const COLOUR_SHARE = 0.6;

/**
 * Which routes play the card of their own destination. Each colour (card) present gets at least one route; the rest of the
 * budget is shared in proportion to how many routes go to each colour (the remainder goes to the larger colours first);
 * inside a colour the longest routes go first. Returns the indices, ascending.
 */
export function allocateColour(ids: string[], eligible: boolean[], dist: number[], keys: string[], budget: number): number[] {
  const groups = new Map<string, number[]>();
  ids.forEach((id, i) => {
    if (eligible[i]) groups.set(id, [...(groups.get(id) ?? []), i]);
  });
  const total = [...groups.values()].reduce((s, g) => s + g.length, 0);
  if (total === 0 || budget <= 0) return [];
  const cap = Math.min(budget, total);
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || routeHash(a[0]) - routeHash(b[0]));
  const alloc = new Map<string, number>(ordered.map(([id, g]) => [id, Math.min(g.length, Math.max(1, Math.floor((g.length / total) * cap)))]));
  let left = cap - [...alloc.values()].reduce((s, x) => s + x, 0);
  while (left > 0) {
    let grew = false;
    for (const [id, g] of ordered) {
      if (left > 0 && (alloc.get(id) ?? 0) < g.length) {
        alloc.set(id, (alloc.get(id) ?? 0) + 1);
        left--;
        grew = true;
      }
    }
    if (!grew) break;
  }
  const out: number[] = [];
  for (const [id, g] of ordered) {
    const byLength = [...g].sort((a, b) => dist[b] - dist[a] || routeHash(keys[a]) - routeHash(keys[b]));
    out.push(...byLength.slice(0, alloc.get(id) ?? 0));
  }
  return out.sort((a, b) => a - b);
}

/**
 * Chooses the cards of a piece. The main card is the music of where the trip starts from (most of the time; with many
 * routes a lively generic card takes a share); the routes that take the card of their own destination are chosen by the share of each destination colour (see `allocateColour`),
 * so the music changes colour as the trip crosses regions. The choice is a function of the routes only.
 */
/** the card of the far end of a route (the place it goes to, or where it comes from when it lands at the hub): the colour it may play */
export function colourCardOf(r: PersonalRoute, i: number): GenreCard {
  const list = cardsOfAirport(r.to === HUB ? r.from : r.to, r.region);
  return list[(routeHash(r.key + i) >>> 3) % list.length];
}

export function planCards(mode: PersonalMode, routes: PersonalRoute[]): CardPlan {
  const n = routes.length;
  if (n === 0) return { main: CARDS[0], perRoute: [] };
  const first = routes[0];
  const home = destinationOf(first.from);
  const seed = routeHash(`${mode}|${routes.map((r) => r.key).join(">")}`);
  const homeCards = cardsOfAirport(first.from, home?.region ?? "UNK");
  const pool = generic(n);
  // the further from a calm start, the more a lively generic card is in play for the main voice
  const takeGeneric = n >= 10 ? seed % 10 < 4 : n >= 6 ? seed % 10 < 2 : seed % 10 < 1;
  const main = takeGeneric ? pool[(seed >>> 4) % pool.length] : homeCards[(seed >>> 4) % homeCards.length];
  const colourOf = routes.map((r, i) => colourCardOf(r, i));
  const budget = n >= 2 ? Math.max(1, Math.round(COLOUR_SHARE * n)) : 0;
  const chosen = new Set(
    allocateColour(colourOf.map((c) => c.id), colourOf.map((c) => c.id !== main.id), routes.map((r) => r.distKm), routes.map((r) => r.key), budget),
  );
  const perRoute = routes.map((_, i) => (chosen.has(i) ? colourOf[i] : main));
  return { main, perRoute };
}
