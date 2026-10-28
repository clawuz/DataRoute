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
  /** the first melody voice always leads the hook (not rotated by the route hash): the kemençe of the Black Sea */
  lead?: boolean;
  /** modal over one drone chord (root and fifth, no western triads under the makam): the harmony of the folk and makam cards of Turkey */
  drone?: boolean;
  /** the shape of a piece of this card (compose.ts `formAt`): the horon and the halay thicken from slow to fast, the long air
   * (uzun hava) starts and ends in free time; omitted: the common form */
  form?: "horon" | "halay" | "uzunhava";
  /** metre variants: a piece takes one of these figures instead of `cell` (`cellOf`); the card's own figure is one of them. Omitted: `cell` */
  cells?: { cell: number[]; accent?: number[] }[];
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
  { id: "anatolian", drone: true, name: "Anatolian folk", family: "folk", bpm: [88, 112], scale: USSAK, scaleWish: HICAZ, cell: [2, 1, 1, 1, 1, 1, 1, 1], accent: [1.25, 0.85, 0.9, 0.85, 0.9, 0.85, 0.9, 0.85], prog: [[0, 3], [10, 4], [8, 4], [0, 3]], held: ["NEY_MAKAM"], melody: ["SAZ", "NEY_MAKAM", "VIOLIN", "PNO"], pluck: ["SAZ", "OUD", "HARP"], perc: "DARBUKA" },
  { id: "karsilama", drone: true, name: "Karşılama", family: "folk", bpm: [106, 124], scale: HICAZ, scaleWish: NIHAVENT, cell: [2, 2, 2, 3], accent: [1.25, 0.8, 0.85, 1.05], prog: [[0, 4], [1, 4], [0, 4], [10, 4]], held: ["VIOLIN"], melody: ["CLA", "VIOLIN", "SAZ", "PNO"], pluck: ["SAZ", "HARP"], perc: "DARBUKA" },
  { id: "arabic", name: "Arabic maqsum", family: "folk", bpm: [84, 104], scale: HICAZ, scaleWish: RAST, cell: [1, 1, -1, 1, 1, -1, 1, -1], accent: [1.25, 0.9, 0, 0.95, 1.15, 0, 0.9, 0], prog: [[0, 4], [1, 4], [0, 4], [7, 4]], held: ["NEY_MAKAM", "CELLO", "VIOLA"], melody: ["OUD", "KANUN", "NEY_MAKAM", "PNO"], pluck: ["OUD", "KANUN", "HARP"], perc: "DARBUKA" },
  { id: "hindustani", name: "Indian rupak", family: "folk", bpm: [80, 108], scale: BHAIRAV, scaleWish: LYDIAN, cell: [3, 2, 2], accent: [1.25, 0.9, 0.95], prog: [[0, 4], [5, 4], [0, 4], [7, 4]], held: ["ACCORDION", "CELLO"], melody: ["BANSURI", "SARANGI", "FLUTE"], pluck: ["SANTUR", "HARP"], perc: "DARBUKA" },
  { id: "eastasia", name: "East Asian pentatonic", family: "chamber", bpm: [76, 96], scale: MIYAKO, scaleWish: YO, cell: [2, 1, -1, 2], accent: [1.15, 0.9, 0, 1], prog: [[0, 3], [5, 4], [0, 3], [7, 4]], held: ["CELLO", "VIOLA"], melody: ["FLUTE", "PNO", "HARP"], pluck: ["HARP", "GLOCK", "PNO"], perc: "GONG" },
  { id: "gamelan", name: "Gamelan cycle", family: "pulse", bpm: [88, 112], scale: PELOG, scaleWish: MAJOR_PENT, cell: [1, -1, 1, 1], accent: [1.2, 0, 0.9, 1], prog: [[0, 3], [5, 4], [0, 3], [7, 4]], held: ["GONG", "CELLO"], melody: ["GLOCK", "MARIMBA", "XYLO", "PNO"], pluck: ["GLOCK", "MARIMBA", "HARP"], perc: "GONG" },
  { id: "westafrica", name: "West African bell", family: "pulse", bpm: [100, 120], scale: MAJOR_PENT, cell: [2, 2, 1, 2, 2, 2, 1], accent: [1.2, 1, 0.9, 1.1, 1, 1, 0.9], prog: [[0, 4], [5, 4], [0, 4], [7, 4]], held: ["BSN", "CELLO"], melody: ["MARIMBA", "XYLO", "CLA"], pluck: ["MARIMBA", "XYLO"], perc: "CONGA" },
  { id: "eastafrica", name: "East & southern African", family: "pulse", bpm: [92, 116], scale: MAJOR_PENT, scaleWish: MAJOR, cell: [1, 1, 2, 1, 1, 2], accent: [1.15, 0.9, 1, 0.9, 0.9, 1], prog: [[0, 4], [5, 4], [7, 4], [0, 4]], held: ["HORN", "BSN"], melody: ["CLA", "MARIMBA", "TPT"], pluck: ["MARIMBA", "XYLO", "HARP"], perc: "CONGA" },
  { id: "salsa", name: "Salsa clave", family: "pulse", bpm: [96, 112], scale: DORIAN, scaleWish: MIXO, cell: [3, 3, 4, 2, 4], accent: [1.2, 1, 1.1, 0.95, 1], prog: [[0, 3], [5, 4], [7, 4], [0, 3]], held: ["BSN", "CELLO"], melody: ["TPT", "FLUTE", "MARIMBA"], pluck: ["HARP", "MARIMBA"], perc: "CONGA" },
  { id: "bossa", name: "Bossa nova", family: "chamber", bpm: [84, 104], scale: MAJOR, scaleWish: LYDIAN, cell: [3, 3, 4, 3, 3], accent: [1.15, 0.95, 1, 0.95, 1], prog: [[0, 4], [2, 3], [7, 4], [0, 4]], held: ["CELLO", "VIOLA"], melody: ["PNO", "FLUTE", "CLA"], pluck: ["PNO", "HARP"], perc: "TAMB" },
  { id: "tango", name: "Tango", family: "chamber", bpm: [84, 108], scale: HARMONIC, scaleWish: MAJOR, cell: [3, 3, 2], accent: [1.3, 1, 1.1], prog: [[0, 3], [5, 4], [7, 4], [0, 3]], held: ["CELLO", "VIOLA"], melody: ["VIOLIN", "CLA", "ACCORDION"], pluck: ["VIOLIN_PIZZ", "HARP"], perc: "TIMP" },
  { id: "flamenco", name: "Flamenco compás", family: "folk", bpm: [92, 124], scale: HICAZ, cell: [3, 3, 2, 2, 2], accent: [1.25, 1.15, 1, 1, 1.3], prog: [[0, 4], [10, 4], [8, 4], [7, 4]], held: ["CELLO", "VIOLA"], melody: ["VIOLIN", "OUD", "FLUTE"], pluck: ["OUD", "HARP"], perc: "TAMB" },
  { id: "celtic", name: "Celtic jig", family: "folk", bpm: [100, 124], scale: DORIAN, scaleWish: MIXO, cell: [2, 1, 2, 1], accent: [1.15, 0.8, 1, 0.8], prog: [[0, 3], [10, 4], [5, 4], [10, 4]], held: ["CELLO", "VIOLA"], melody: ["VIOLIN", "FLUTE", "HARP", "PNO"], pluck: ["HARP", "VIOLIN_PIZZ"], perc: "TAMB" },
  { id: "nordic", name: "Nordic ambient", family: "chamber", bpm: [76, 88], scale: DORIAN, scaleWish: LYDIAN, cell: [3, -1, 4, 2], accent: [1.1, 0, 1, 0.9], held: ["CELLO", "VIOLA", "HORN"], melody: ["PNO", "FLUTE", "HARP"], pluck: ["HARP", "GLOCK", "PNO"], perc: "TRI" },
  { id: "slavic", name: "Slavic march & waltz", family: "symphonic", bpm: [92, 118], scale: HARMONIC, scaleWish: MAJOR, cell: [2, 1, 1, 2], accent: [1.2, 0.9, 0.9, 1], held: ["CELLO", "HORN", "BSN"], melody: ["VIOLIN", "CLA", "HORN", "ACCORDION"], pluck: ["HARP", "VIOLA_PIZZ"], perc: "TIMP" },
  { id: "centralasia", name: "Central Asian gallop", family: "folk", bpm: [92, 116], scale: HICAZ, scaleWish: MIXO, cell: [2, 1, 1], accent: [1.2, 0.9, 0.9], prog: [[0, 4], [10, 4], [0, 4], [7, 4]], held: ["NEY_MAKAM", "CELLO"], melody: ["NEY_MAKAM", "KANUN", "SAZ"], pluck: ["SAZ", "KANUN"], perc: "DARBUKA" },
  { id: "dance", fast: true, name: "Lively percussion", family: "pulse", bpm: [108, 124], scale: MAJOR_PENT, scaleWish: MAJOR, cell: [1, 1, 2, 1, 1, 2], accent: [1.15, 0.85, 1, 0.85, 0.85, 1], prog: [[0, 4], [7, 4], [9, 3], [5, 4]], held: ["BSN", "CELLO", "HORN"], melody: ["MARIMBA", "XYLO", "PNO"], pluck: ["MARIMBA", "XYLO", "GLOCK"], perc: "CONGA" },
  { id: "epic", fast: true, name: "Epic action", family: "symphonic", bpm: [112, 126], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1, 1], accent: [1.2, 0.85, 0.95, 0.85], prog: [[0, 3], [8, 4], [3, 4], [10, 4]], held: ["CELLO", "VIOLA", "HORN"], melody: ["VIOLIN", "TPT", "HORN", "PNO"], pluck: ["VIOLA_PIZZ", "HARP", "PNO"], perc: "TIMP" },
  { id: "calm", name: "Calm ambient", family: "chamber", bpm: [76, 84], scale: LYDIAN, scaleWish: MAJOR, cell: [4, 2, 2], accent: [1.1, 0.9, 0.9], prog: [[0, 4], [7, 4], [9, 3], [5, 4]], held: ["CELLO", "VIOLA", "HORN"], melody: ["PNO", "FLUTE", "GLOCK"], pluck: ["HARP", "GLOCK", "PNO"], perc: "TRI" },
  { id: "mariachi", name: "Caribbean & Mexican", family: "folk", bpm: [100, 120], scale: MIXO, scaleWish: MAJOR, cell: [2, 1, 2, 1, 2, 1], accent: [1.2, 0.8, 1, 0.8, 1, 0.8], prog: [[0, 4], [5, 4], [7, 4], [0, 4]], held: ["CELLO", "BSN"], melody: ["TPT", "VIOLIN", "HARP"], pluck: ["HARP", "VIOLA_PIZZ"], perc: "TAMB" },
  { id: "persian", name: "Persian dastgah", family: "folk", bpm: [84, 106], scale: SEGAH, scaleWish: RAST, cell: [3, 2, 1, 1, 1, 1, 1], accent: [1.25, 1, 0.85, 0.9, 0.85, 0.9, 0.85], prog: [[0, 3], [1, 4], [0, 3], [10, 4]], held: ["NEY_MAKAM", "CELLO"], melody: ["KANUN", "NEY_MAKAM", "VIOLIN", "PNO"], pluck: ["KANUN", "OUD"], perc: "DARBUKA" },
  // from the PDMX bar figures: jazz leans on the off-beat quarters (x.x.x.x.), funk and soul on 3+3+1+1 (x..x..xx), electronic and pop on straight eighths
  { id: "jazz", name: "Jazz swing", family: "chamber", fast: true, bpm: [100, 126], scale: [0, 2, 3, 5, 7, 9, 10], scaleWish: [0, 2, 4, 5, 7, 9, 10], cell: [2, 1, 2, 1], accent: [1.1, 0.85, 1.05, 0.85], prog: [[0, 3], [5, 4], [7, 4], [0, 3]], held: ["CELLO", "BSN", "VIOLA"], melody: ["TENORSAX", "CLA", "TPT", "FLUTE"], pluck: ["PNO", "VIOLA_PIZZ", "HARP"], perc: "TAMB", swing: 0.22 },
  { id: "funk", name: "Funk & soul", family: "pulse", bpm: [92, 112], scale: [0, 3, 5, 6, 7, 10], scaleWish: [0, 2, 4, 7, 9], cell: [3, 3, 1, 1], accent: [1.25, 1.05, 0.9, 1.1], prog: [[0, 3], [5, 3], [0, 3], [7, 4]], held: ["BSN", "CELLO"], melody: ["PNO", "TPT", "CLA"], pluck: ["PNO", "MARIMBA", "XYLO"], perc: "CONGA", swing: 0.12 },
  { id: "pop", name: "Electro pop", family: "pulse", fast: true, bpm: [104, 124], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1, 1, 1, 1, 1, 1], accent: [1.15, 0.8, 1, 0.8, 1.05, 0.8, 1, 0.8], prog: [[0, 3], [8, 4], [3, 4], [10, 4]], held: ["CELLO", "VIOLA", "HORN"], melody: ["PNO", "FLUTE", "XYLO", "VIOLIN"], pluck: ["PNO", "GLOCK", "MARIMBA"], perc: "TAMB" },
  // the destination cards: Turkish regions, Greece, Italy, Vienna, R&B, country, Spanish guitar. Hand-set judgements (tune by ear); the instruments
  // that the pack lacks are approximated (the zurna is a real recording now, ZURNA, backed by DUDUK / NEY_MAKAM; the Black Sea kemençe and the tulum are the
  // Turkish Music Portal recordings KEMENCE_KARADENIZ and TULUM, RESTRICTED terms, see docs/music-missing-instruments.md, backed by BAGPIPE): ud = NYLONGUITAR / KANUN, tambur = SAZ, davul = FRAMEDRUM, mandolin = HARP / PSALTERY
  { id: "karadeniz", lead: true, form: "horon", fast: true, name: "Black Sea horon", family: "folk", bpm: [112, 126], scale: USSAK, scaleWish: HICAZ, cell: [2, 2, 3], accent: [1.3, 0.9, 1.1], cells: [{ cell: [2, 2, 3], accent: [1.3, 0.9, 1.1] }, { cell: [2, 2, 2, 3], accent: [1.3, 0.9, 0.95, 1.1] }, { cell: [1, 1, 1, 1], accent: [1.3, 0.85, 1.1, 0.85] }, { cell: [3, 2, 2], accent: [1.3, 0.9, 1.1] }], held: ["BAGPIPE_DRONE"], melody: ["KEMENCE_KARADENIZ", "TULUM", "BAGPIPE"], pluck: ["KEMENCE_KARADENIZ"], perc: "FRAMEDRUM" },
  { id: "icanadolu", drone: true, form: "uzunhava", name: "Central Anatolian bağlama", family: "folk", bpm: [88, 108], scale: USSAK, scaleWish: HICAZ, cell: [2, 1, 1, 2, 2], accent: [1.25, 0.85, 0.85, 1.1, 0.9], held: ["NEY_MAKAM"], melody: ["SAZ", "BAGLAMA_MAKAM", "NEY_MAKAM"], pluck: ["BAGLAMA_EXTRA", "SAZ"], perc: "BENDIR" },
  { id: "mevlevi", drone: true, form: "uzunhava", name: "Mevlevi (ney and kudüm)", family: "folk", bpm: [76, 88], scale: RAST, scaleWish: SEGAH, cell: [3, 3], accent: [1.3, 0.9], prog: [[0, 4], [0, 4], [0, 4], [0, 4]], held: ["NEY_MAKAM"], melody: ["NEY_REAL", "NEY_MAKAM", "KEMENCE_MAKAM"], pluck: ["KANUN", "SANTUR"], perc: "FRAMEDRUM" },
  { id: "akdeniz", form: "uzunhava", drone: true, name: "Turkish Mediterranean (ud, tambur, kanun)", family: "folk", bpm: [96, 114], scale: HICAZ, scaleWish: NIHAVENT, cell: [3, 2, 2, 3], accent: [1.25, 0.9, 0.9, 1.1], held: ["NEY_MAKAM"], melody: ["OUD", "VIOLIN", "KANUN"], pluck: ["NYLONGUITAR", "OUD"], perc: "DARBUKA" },
  { id: "dogu", form: "halay", fast: true, name: "East Anatolian davul-zurna halay", family: "folk", bpm: [104, 124], scale: HICAZ, scaleWish: SEGAH, cell: [1, 1, 1, 1], accent: [1.35, 0.8, 1.1, 0.8], cells: [{ cell: [1, 1, 1, 1], accent: [1.35, 0.8, 1.1, 0.8] }, { cell: [1, 1], accent: [1.35, 1.1] }, { cell: [2, 2, 2, 3], accent: [1.35, 0.85, 0.9, 1.15] }, { cell: [2, 2, 1], accent: [1.35, 0.9, 1.1] }], held: ["DUDUK", "CELLO"], melody: ["ZURNA", "DUDUK", "NEY_MAKAM"], pluck: ["SAZ", "BAGLAMA_EXTRA"], perc: "FRAMEDRUM" },
  { id: "zeybek", drone: true, name: "Aegean zeybek", family: "folk", bpm: [78, 96], scale: RAST, scaleWish: SEGAH, cell: [3, 2, 2, 2], accent: [1.3, 0.9, 0.9, 0.9], cells: [{ cell: [3, 2, 2, 2], accent: [1.3, 0.9, 0.9, 0.9] }, { cell: [2, 2, 2, 3], accent: [1.3, 0.9, 0.9, 1.1] }, { cell: [2, 2, 3, 2], accent: [1.3, 0.9, 1.1, 0.9] }], held: ["VIOLIN"], melody: ["CLA", "VIOLIN", "SAZ"], pluck: ["SAZ", "NYLONGUITAR"], perc: "DARBUKA" },
  { id: "greek", name: "Greek syrtos & kalamatianos", family: "folk", bpm: [100, 120], scale: HICAZ, scaleWish: DORIAN, cell: [3, 2, 2], accent: [1.3, 0.9, 1], held: ["ACCORDION", "CELLO"], melody: ["SAZ", "CLA", "NYLONGUITAR"], pluck: ["NYLONGUITAR", "SAZ"], perc: "BENDIR" },
  { id: "italian", name: "Italian symphonic & tarantella", family: "symphonic", bpm: [84, 110], scale: MINOR, scaleWish: MAJOR, cell: [3, 3], accent: [1.2, 0.9], prog: [[0, 3], [8, 4], [3, 4], [7, 4]], held: ["CELLO", "VIOLA", "VIOLIN", "HORN"], melody: ["VIOLIN", "FLUTE", "OBOE", "CLA"], pluck: ["HARP", "VIOLA_PIZZ", "PSALTERY"], perc: "TIMP" },
  { id: "classical", name: "Classical (Vienna)", family: "chamber", bpm: [92, 116], scale: MAJOR, scaleWish: LYDIAN, cell: [1, 1, 1, 1], accent: [1.15, 0.85, 1, 0.85], prog: [[0, 4], [5, 4], [7, 4], [0, 4]], held: ["CELLO", "VIOLA", "BSN"], melody: ["VIOLIN", "FLUTE", "OBOE", "PNO"], pluck: ["PNO", "HARP"], perc: "TRI" },
  { id: "rnb", name: "R&B / neo-soul", family: "pulse", bpm: [76, 96], scale: DORIAN, scaleWish: MIXO, cell: [3, 3, 2], accent: [1.2, 1, 1.1], prog: [[0, 3], [5, 3], [10, 4], [3, 4]], held: ["RHODES", "CELLO"], melody: ["RHODES", "EKEYS", "TENORSAX"], pluck: ["GUITAR_EL", "EKEYS"], bass: ["BASS_EL", "UPRIGHTBASS"], perc: "CONGA", swing: 0.2 },
  { id: "country", name: "Country & Americana", family: "folk", bpm: [92, 116], scale: MAJOR, scaleWish: MIXO, cell: [1, 1, 1, 1], accent: [1.2, 0.85, 1, 0.85], prog: [[0, 4], [5, 4], [7, 4], [0, 4]], held: ["HARMONICA", "CELLO"], melody: ["VIOLIN", "HARMONICA", "GUITAR_AC"], pluck: ["GUITAR_AC", "FOLKHARP"], bass: ["UPRIGHTBASS"], perc: "TAMB", swing: 0.12 },
  { id: "spguitar", name: "Spanish classical guitar", family: "chamber", bpm: [76, 96], scale: MINOR, scaleWish: MAJOR, cell: [3, 1, 2, 2], accent: [1.25, 0.9, 1.05, 0.95], prog: [[0, 3], [10, 4], [8, 4], [7, 4]], held: ["CELLO", "VIOLA"], melody: ["NYLONGUITAR", "FLUTE"], pluck: ["NYLONGUITAR"], perc: "FRAMEDRUM" },
  // the cards of the other countries and big cities (spec 2026-10-26-all-airports); hand-set judgements, to be tuned by ear
  // (balalaika, guitarra, cavaquinho = PSALTERY, charango = NYLONGUITAR, bombo = FRAMEDRUM)
  { id: "samba", name: "Brazilian samba", family: "pulse", bpm: [96, 112], scale: MAJOR, scaleWish: MIXO, cell: [3, 3, 2, 3, 3, 2], accent: [1.2, 0.9, 1, 1.1, 0.9, 1], prog: [[0, 4], [5, 4], [7, 4], [0, 4]], held: ["ACCORDION", "CELLO"], melody: ["NYLONGUITAR", "FLUTE", "ACCORDION"], pluck: ["NYLONGUITAR", "PSALTERY"], bass: ["UPRIGHTBASS"], perc: "TAMB" },
  { id: "afrobeat", name: "Afrobeat & highlife", family: "pulse", bpm: [100, 118], scale: DORIAN, scaleWish: MIXO, cell: [3, 1, 2, 3, 1, 2], accent: [1.25, 0.9, 1, 1.15, 0.9, 1], prog: [[0, 3], [5, 4], [0, 3], [7, 4]], held: ["EKEYS", "BSN"], melody: ["TENORSAX", "GUITAR_EL", "EKEYS"], pluck: ["GUITAR_EL", "KALIMBA"], bass: ["BASS_EL"], perc: "CONGA" },
  { id: "bollywood", name: "Bollywood film song", family: "pulse", bpm: [96, 116], scale: HARMONIC, scaleWish: MAJOR, cell: [2, 1, 1, 1, 1, 2], accent: [1.2, 0.85, 0.9, 0.85, 0.9, 1.05], prog: [[0, 3], [8, 4], [3, 4], [10, 4]], held: ["VIOLA", "CELLO", "ACCORDION"], melody: ["VIOLIN", "SARANGI", "BANSURI", "SANTUR", "FLUTE"], pluck: ["SANTUR", "GUITAR_AC"], perc: "TABLA" },
  { id: "khaleeji", name: "Gulf khaleeji", family: "folk", bpm: [92, 108], scale: HICAZ, scaleWish: RAST, cell: [2, 2, 1, 1, 2], accent: [1.25, 0.9, 0.85, 0.9, 1.1], prog: [[0, 4], [1, 4], [0, 4], [7, 4]], held: ["CELLO", "VIOLA"], melody: ["NEY_MAKAM", "KANUN", "DUDUK"], pluck: ["KANUN", "SANTUR"], perc: "DARBUKA" },
  { id: "maghrebi", name: "Maghreb chaabi & raï", family: "folk", bpm: [100, 118], scale: HICAZ, scaleWish: DORIAN, cell: [3, 2, 3], accent: [1.25, 0.9, 1.1], prog: [[0, 3], [10, 4], [0, 3], [7, 4]], held: ["CELLO", "ACCORDION"], melody: ["NEY_MAKAM", "ACCORDION", "VIOLIN"], pluck: ["NYLONGUITAR", "SANTUR"], perc: "DARBUKA" },
  { id: "russian", name: "Russian romance & waltz", family: "symphonic", bpm: [84, 108], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1], accent: [1.2, 0.9, 0.9], prog: [[0, 3], [8, 4], [3, 4], [7, 4]], held: ["CELLO", "HORN", "BSN"], melody: ["VIOLIN", "ACCORDION", "CLA"], pluck: ["PSALTERY", "HARP"], perc: "TIMP" },
  { id: "thai", name: "Thai ranat", family: "chamber", bpm: [88, 108], scale: LYDIAN, scaleWish: MAJOR_PENT, cell: [2, 2, 1, 1, 2], accent: [1.2, 0.9, 0.85, 0.9, 1.05], prog: [[0, 4], [5, 4], [0, 4], [7, 4]], held: ["GONG", "CELLO"], melody: ["VIBES", "STEELDRUM", "FLUTE"], pluck: ["VIBES", "KALIMBA"], perc: "TRI" },
  { id: "chinese", name: "Chinese pentatonic", family: "chamber", bpm: [76, 96], scale: MAJOR_PENT, scaleWish: MAJOR_PENT, cell: [2, 1, 1, 2], accent: [1.2, 0.9, 0.9, 1], prog: [[0, 4], [7, 4], [9, 3], [5, 4]], held: ["CELLO", "VIOLA"], melody: ["ERHU", "KOTO", "FLUTE"], pluck: ["KOTO", "KAYAGEUM", "DANTRANH"], perc: "GONG" },
  { id: "cumbia", name: "Cumbia", family: "pulse", bpm: [92, 108], scale: MINOR_PENT, scaleWish: MAJOR_PENT, cell: [3, 1, 2, 2], accent: [1.25, 0.85, 1.05, 1], prog: [[0, 3], [5, 4], [7, 4], [0, 3]], held: ["ACCORDION", "CELLO"], melody: ["ACCORDION", "FLUTE", "GUITAR_AC"], pluck: ["NYLONGUITAR", "KALIMBA"], bass: ["UPRIGHTBASS"], perc: "CONGA" },
  { id: "andean", name: "Andean", family: "folk", bpm: [84, 104], scale: MINOR_PENT, scaleWish: MAJOR_PENT, cell: [1, 1, 2], accent: [1.2, 0.9, 1], prog: [[0, 3], [8, 4], [3, 4], [10, 4]], held: ["PANPIPE", "CELLO"], melody: ["PANPIPE", "FLUTE", "NYLONGUITAR"], pluck: ["NYLONGUITAR", "KALIMBA"], perc: "FRAMEDRUM" },
  { id: "caucasus", name: "Caucasus (duduk)", family: "folk", bpm: [88, 108], scale: HARMONIC, scaleWish: MIXO, cell: [2, 1, 2, 1, 2], accent: [1.25, 0.85, 1, 0.85, 1.05], prog: [[0, 3], [10, 4], [8, 4], [7, 4]], held: ["DUDUK", "BAGPIPE_DRONE"], melody: ["DUDUK", "BAGPIPE", "ACCORDION"], pluck: ["PSALTERY", "SAZ"], perc: "BENDIR" },
  { id: "fado", name: "Fado", family: "chamber", bpm: [76, 92], scale: MINOR, scaleWish: MAJOR, cell: [1, 1, 1, 1], accent: [1.15, 0.9, 1, 0.9], prog: [[0, 3], [10, 4], [8, 4], [7, 4]], held: ["CELLO", "VIOLA"], melody: ["NYLONGUITAR", "PSALTERY", "ACCORDION"], pluck: ["PSALTERY", "NYLONGUITAR"], perc: "TRI" },
  { id: "turkpop", name: "Turkish 80s pop (Ajda, Sezen)", family: "pulse", fast: true, bpm: [100, 118], scale: HICAZ, scaleWish: RAST, cell: [2, 1, 1, 1, 1, 2], accent: [1.25, 0.85, 0.9, 0.9, 1.1, 0.9], prog: [[0, 3], [5, 3], [10, 4], [0, 3]], held: ["CELLO", "VIOLA"], bass: ["BASS_EL"], melody: ["VIOLIN", "TENORSAX", "OUD", "CLA"], pluck: ["RHODES", "OUD", "KANUN"], perc: "DARBUKA" },
  { id: "akdenizpop", name: "Mediterranean pop (oud, darbuka, strings)", family: "pulse", fast: true, bpm: [104, 120], scale: HICAZ, scaleWish: NIHAVENT, cell: [3, 3, 2], accent: [1.25, 1, 0.9], prog: [[0, 4], [1, 4], [0, 4], [10, 4]], held: ["VIOLA", "CELLO"], bass: ["BASS_EL"], melody: ["OUD", "VIOLIN", "CLA"], pluck: ["NYLONGUITAR", "OUD"], perc: "DARBUKA" },
  { id: "chanson", name: "French chanson & musette", family: "chamber", bpm: [92, 112], scale: MAJOR, scaleWish: LYDIAN, cell: [1, 1, 1], accent: [1.2, 0.9, 0.9], prog: [[0, 4], [9, 3], [5, 4], [7, 4]], held: ["ACCORDION", "CELLO"], melody: ["ACCORDION", "VIOLIN", "CLA"], pluck: ["GUITAR_AC", "HARP"], bass: ["UPRIGHTBASS"], perc: "TAMB" },
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

/**
 * The figure a piece plays for a card: one of its metre variants (`cells`) chosen by `seed`, else its own figure. One piece passes one
 * seed (`cellSeedOf`), so every bar of a piece plays the same choice for a card.
 */
export function cellOf(card: GenreCard, seed: number): { cell: number[]; accent?: number[] } {
  if (!card.cells?.length) return { cell: card.cell, accent: card.accent };
  return card.cells[(seed >>> 0) % card.cells.length];
}

/** the seed of a piece's metre variants: the hash of its main card and its first route */
export function cellSeedOf(main: GenreCard, routes: PersonalRoute[]): number {
  return routeHash(main.id + (routes[0]?.key ?? ""));
}

const byId = (id: string): GenreCard => CARDS.find((c) => c.id === id) ?? CARDS[0];

/** cards of a country (ISO 3166-1 alpha-2) */
const BY_ISO: Record<string, string[]> = {
  TR: ["turkpop", "anatolian", "karsilama", "cinematic", "jazz"], GR: ["greek"], BG: ["karsilama", "slavic"], RS: ["karsilama", "slavic"], MK: ["karsilama"], AL: ["karsilama"], BA: ["karsilama", "slavic"], XK: ["karsilama"],
  EG: ["arabic"], SA: ["khaleeji", "arabic"], AE: ["khaleeji", "arabic"], QA: ["khaleeji", "arabic"], KW: ["khaleeji", "arabic"], BH: ["khaleeji", "arabic"], OM: ["khaleeji", "arabic"], JO: ["arabic"], LB: ["arabic"], SY: ["arabic"], IQ: ["arabic"], YE: ["arabic"], MA: ["maghrebi", "arabic", "flamenco"], DZ: ["maghrebi", "arabic"], TN: ["maghrebi", "arabic"], LY: ["maghrebi", "arabic"], SD: ["arabic"],
  IR: ["persian"], AF: ["persian", "centralasia"], KZ: ["centralasia"], UZ: ["centralasia"], KG: ["centralasia"], TM: ["centralasia"], TJ: ["centralasia"], AZ: ["caucasus", "centralasia", "anatolian"], GE: ["caucasus", "slavic"], AM: ["caucasus", "anatolian"],
  IN: ["bollywood", "hindustani"], PK: ["hindustani", "bollywood"], BD: ["hindustani"], LK: ["hindustani"], NP: ["hindustani"], MV: ["hindustani"],
  JP: ["eastasia", "pop"], CN: ["chinese", "eastasia"], KR: ["pop", "eastasia"], TW: ["chinese", "pop"], HK: ["chinese", "pop"], MN: ["eastasia", "centralasia"], VN: ["eastasia", "gamelan"],
  MO: ["chinese", "pop"], ID: ["gamelan"], TH: ["thai", "gamelan"], MY: ["gamelan"], SG: ["chinese", "gamelan", "pop"], PH: ["gamelan", "mariachi"], KH: ["gamelan"], LA: ["gamelan"], MM: ["gamelan"],
  NG: ["westafrica", "afrobeat"], GH: ["westafrica", "afrobeat"], SN: ["westafrica"], CI: ["westafrica"], ML: ["westafrica"], GM: ["westafrica"], GN: ["westafrica"], SL: ["westafrica"], LR: ["westafrica"], BF: ["westafrica"], BJ: ["westafrica"], TG: ["westafrica"], CM: ["westafrica"], GA: ["westafrica"], CG: ["westafrica"], CD: ["westafrica", "eastafrica"],
  KE: ["eastafrica"], TZ: ["eastafrica"], UG: ["eastafrica"], RW: ["eastafrica"], ET: ["eastafrica"], ZA: ["eastafrica"], ZW: ["eastafrica"], ZM: ["eastafrica"], MZ: ["eastafrica"], AO: ["eastafrica", "bossa"], MG: ["eastafrica"], MU: ["eastafrica"], SO: ["eastafrica"], DJ: ["eastafrica"], NA: ["eastafrica"], BW: ["eastafrica"],
  CU: ["salsa", "mariachi"], CO: ["cumbia", "salsa", "dance"], PR: ["salsa"], DO: ["salsa"], VE: ["salsa", "cumbia"], PA: ["salsa", "cumbia"], CR: ["salsa"], EC: ["andean", "cumbia"], PE: ["salsa", "mariachi"], JM: ["mariachi", "salsa"], TT: ["mariachi"], MX: ["mariachi"], GT: ["mariachi"], HN: ["mariachi"], SV: ["mariachi"], NI: ["mariachi"], CW: ["mariachi", "salsa"], AW: ["mariachi"], BS: ["mariachi"],
  BR: ["samba", "bossa", "funk"], PT: ["fado", "bossa"], AR: ["tango"], UY: ["tango"], CL: ["andean", "tango"], PY: ["tango"], BO: ["tango", "mariachi"],
  ES: ["spguitar", "flamenco"], IE: ["celtic"], GB: ["pop", "classical", "celtic"], IS: ["nordic"], NO: ["nordic"], SE: ["nordic", "pop", "calm"], FI: ["nordic"], DK: ["nordic"], EE: ["nordic"], LV: ["nordic"], LT: ["nordic"],
  RU: ["russian", "slavic"], UA: ["slavic", "russian"], BY: ["slavic", "russian"], PL: ["slavic", "romantic"], CZ: ["baroque", "slavic"], SK: ["slavic"], HU: ["slavic", "romantic"], RO: ["slavic", "karsilama"], MD: ["slavic"], HR: ["slavic"], SI: ["baroque"], ME: ["slavic"],
  DE: ["classical", "baroque", "pop"], AT: ["classical", "baroque"], IT: ["italian", "romantic"], FR: ["chanson", "romantic", "jazz"], CH: ["classical", "baroque"], NL: ["baroque", "pop"], BE: ["baroque", "romantic"], LU: ["romantic"], MT: ["baroque"], CY: ["greek", "anatolian"],
  US: ["pop", "jazz", "country", "rnb"], CA: ["cinematic", "nordic", "jazz", "epic"], AU: ["country", "pop"], NZ: ["cinematic", "nordic"],
};
/** cards of one airport, before its country: the regions of Turkey and the big cities of the United States, the United Kingdom, Spain */
const BY_AIRPORT: Record<string, string[]> = {};
function group(airports: string, cards: string[]): void {
  for (const a of airports.split(" ")) BY_AIRPORT[a] = cards;
}
group("TZX RZV OGU SZF NOP KFS ONQ MZH TJK", ["karadeniz"]);
group("ESB ASR NAV VAS AOE ISE KZR", ["icanadolu"]);
group("KYA", ["mevlevi"]); // Konya is the Mevlevi city: always the ney and the kudüm
group("AYT GZP DLM ADA COV HTY KCM", ["akdeniz", "akdenizpop", "turkpop"]);
group("ADB BJV DNZ USQ EDO CKZ", ["zeybek"]);
group("VAN ERZ ERC KSY AJI IGD MSR BGG EZS MLX DIY BAL MQM SXZ NKT YKO GNY GZT ADF", ["dogu"]);
group("IST SAW KCO TEQ YEI", ["turkpop", "anatolian", "karsilama", "cinematic", "jazz"]);
group("SVQ AGP", ["flamenco"]);
group("MAD BCN BIO VLC ZAZ", ["spguitar", "flamenco"]);
group("JFK EWR BOS IAD", ["jazz", "classical", "pop"]);
group("MIA", ["salsa", "pop"]);
group("LAX SFO OAK SEA", ["pop", "rnb", "cinematic"]);
group("ATL DTW ORD", ["rnb", "funk", "jazz"]);
group("DFW IAH DEN", ["country", "rnb"]);
group("LHR LGW STN MAN BHX", ["pop", "classical", "celtic"]);
group("EDI", ["celtic"]);
group("GRU VCP", ["samba", "bossa", "funk"]);
group("LOS PHC", ["afrobeat", "westafrica"]);
group("ABV KAN", ["westafrica", "afrobeat"]);
group("BOM NMI BLR HYD MAA", ["bollywood", "hindustani"]);
group("DEL", ["hindustani", "bollywood"]);
group("URC", ["chinese", "centralasia"]);
group("MRS NCE", ["jazz", "chanson", "romantic"]);
const BY_REGION: Record<string, string[]> = {
  DOM: ["anatolian", "karsilama"], EUR: ["romantic", "baroque", "cinematic"], MEA: ["arabic", "persian"], AFR: ["westafrica", "eastafrica"], ASI: ["eastasia", "gamelan", "hindustani", "centralasia"], AME: ["cinematic", "salsa", "bossa", "mariachi"], UNK: ["cinematic"],
};

/** the cards that belong to the place of an airport */
export function cardsOfAirport(iata: string, region: string): GenreCard[] {
  const iso = destinationOf(iata)?.iso ?? "";
  return (BY_AIRPORT[iata] ?? BY_ISO[iso] ?? BY_REGION[region] ?? BY_REGION.UNK).map(byId);
}

/** a calm piece for few routes, a lively one for many */
function generic(n: number): GenreCard[] {
  return (n <= 2 ? ["calm", "nordic", "romantic"] : n <= 5 ? ["cinematic", "romantic", "calm"] : n <= 9 ? ["cinematic", "baroque", "dance", "jazz"] : ["dance", "pop", "epic", "cinematic"]).map(byId);
}

export interface CardPlan {
  /** the card of the place the trip is heading to (the one most routes go to): tempo, scale, progression, groove */
  main: GenreCard;
  /** the card of the place the trip starts from: the intro, the outro and the drone */
  home: GenreCard;
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
 * Chooses the cards of a piece. The main card is the card most routes go to (the sound of where the trip goes); `home` is the music of where
 * the trip starts from (most of the time; with many routes a lively generic card takes a share). The routes that take the card of their own destination are chosen by the share of each destination colour (see `allocateColour`),
 * so the music changes colour as the trip crosses regions. The choice is a function of the routes only.
 */
/** the card of the far end of a route (the place it goes to, or where it comes from when it lands at the hub): the colour it may play */
export function colourCardOf(r: PersonalRoute, i: number): GenreCard {
  const list = cardsOfAirport(r.to === HUB ? r.from : r.to, r.region);
  return list[(routeHash(r.key + i) >>> 3) % list.length];
}

/**
 * Cards of folk and makam traditions, the Latin, Iberian, Slavic, Italian, Greek, French and Bollywood ones (and the gamelan, Thai, Chinese, East Asian and African ones) whose music has no piano: for a route
 * of such a card the composer neither takes the piano shortcut nor picks "PNO" from a voice list, and the "piano is always there" rule
 * skips it. The piano may still play on routes of other cards in the same piece.
 */
export const NO_PIANO_CARDS: ReadonlySet<string> = new Set([
  "anatolian", "icanadolu", "karadeniz", "akdeniz", "dogu", "zeybek", "karsilama", "mevlevi",
  "arabic", "khaleeji", "maghrebi", "persian", "hindustani", "caucasus", "centralasia",
  "gamelan", "thai", "chinese", "eastasia", "westafrica", "eastafrica",
  "flamenco", "spguitar", "tango", "samba", "cumbia", "salsa", "mariachi", "andean", "afrobeat", "fado", "russian", "slavic",
  "bollywood", "greek", "italian", "chanson",
]);

/** the region cluster of every card (spec 2026-10-26-many-destinations): the dominant cluster of the destinations leads the piece */
export const CLUSTER_OF: Record<string, string> = Object.fromEntries(
  Object.entries({
    turkish: ["anatolian", "turkpop", "akdenizpop", "karsilama", "karadeniz", "icanadolu", "mevlevi", "akdeniz", "dogu", "zeybek"],
    arab: ["arabic", "khaleeji", "maghrebi"],
    "persian-central": ["persian", "centralasia", "caucasus"],
    "south-asia": ["hindustani", "bollywood"],
    "east-asia": ["eastasia", "chinese"],
    "south-east-asia": ["gamelan", "thai"],
    africa: ["westafrica", "eastafrica", "afrobeat"],
    latin: ["salsa", "mariachi", "bossa", "samba", "tango", "cumbia", "andean"],
    "south-europe": ["greek", "italian", "flamenco", "spguitar", "fado"],
    slavic: ["slavic", "russian"],
    "west-europe": ["baroque", "romantic", "classical", "chanson"],
    north: ["nordic", "celtic", "calm"],
    anglo: ["pop", "jazz", "funk", "country", "rnb", "cinematic", "epic", "dance"],
  }).flatMap(([cluster, ids]) => ids.map((id) => [id, cluster])),
);

export function clusterOf(card: GenreCard): string {
  return CLUSTER_OF[card.id] ?? card.id;
}

export function planCards(mode: PersonalMode, routes: PersonalRoute[]): CardPlan {
  const n = routes.length;
  if (n === 0) return { main: CARDS[0], home: CARDS[0], perRoute: [] };
  const first = routes[0];
  const home = destinationOf(first.from);
  const seed = routeHash(`${mode}|${routes.map((r) => r.key).join(">")}`);
  const homeCards = cardsOfAirport(first.from, home?.region ?? "UNK");
  const pool = generic(n);
  // the further from a calm start, the more a lively generic card is in play for the home voice
  const takeGeneric = n >= 10 ? seed % 10 < 4 : n >= 6 ? seed % 10 < 2 : seed % 10 < 1;
  const homeCard = takeGeneric ? pool[(seed >>> 4) % pool.length] : homeCards[(seed >>> 4) % homeCards.length];
  const colourOf = routes.map((r, i) => colourCardOf(r, i));
  // the main card: the dominant region first (the cluster with the most routes; ties: the larger total distance, then the smaller hash of
  // the cluster id), inside it the card with the most routes (ties: the larger total distance, then the smaller hash of the card id)
  const tally = new Map<string, { card: GenreCard; n: number; km: number }>();
  const regions = new Map<string, { n: number; km: number }>();
  colourOf.forEach((c, i) => {
    const t = tally.get(c.id) ?? { card: c, n: 0, km: 0 };
    t.n++;
    t.km += routes[i].distKm;
    tally.set(c.id, t);
    const g = regions.get(clusterOf(c)) ?? { n: 0, km: 0 };
    g.n++;
    g.km += routes[i].distKm;
    regions.set(clusterOf(c), g);
  });
  const lead = [...regions.entries()].sort((a, b) => b[1].n - a[1].n || b[1].km - a[1].km || routeHash(a[0]) - routeHash(b[0]))[0][0];
  const main = [...tally.values()]
    .filter((t) => clusterOf(t.card) === lead)
    .sort((a, b) => b.n - a.n || b.km - a.km || routeHash(a.card.id) - routeHash(b.card.id))[0].card;
  const budget = n >= 2 ? Math.max(1, Math.round(COLOUR_SHARE * n)) : 0;
  const chosen = new Set(
    allocateColour(colourOf.map((c) => c.id), colourOf.map((c) => c.id !== main.id), routes.map((r) => r.distKm), routes.map((r) => r.key), budget),
  );
  const perRoute = routes.map((_, i) => (chosen.has(i) ? colourOf[i] : main));
  return { main, home: homeCard, perRoute };
}
