import { routeHash } from "../audio/theory";
import { destinationOf } from "./destinations";
import type { GenreCard } from "./genres";
import type { PersonalRoute } from "./routes";

/**
 * Well-known public-domain and traditional melodies (see docs/melody-bank-candidates.md). A hook route plays one of them,
 * from the place the trip starts from or one of its destinations. Notes are [semitones above the tonic, beats].
 * Written from the scores as remembered and not yet checked against an edition: listen before trusting one (`checked`).
 */
export interface Tune {
  id: string;
  name: string;
  /** countries (ISO 3166-1 alpha-2) the tune belongs to */
  iso: string[];
  mode: "major" | "minor";
  notes: [number, number][];
  /** bars (4/4) the tune takes before it comes round again */
  bars: number;
  /** whether the notes were checked against a printed edition */
  checked: boolean;
}

const q = (semis: number, beats = 1): [number, number] => [semis, beats];

export const TUNES: Tune[] = [
  {
    id: "ode-to-joy", name: "Ode to Joy (Beethoven, d. 1827)", iso: ["DE", "AT", "BE", "NL", "CH", "LU"], mode: "major", bars: 8, checked: false,
    notes: [q(4), q(4), q(5), q(7), q(7), q(5), q(4), q(2), q(0), q(0), q(2), q(4), q(4, 1.5), q(2, 0.5), q(2, 2),
      q(4), q(4), q(5), q(7), q(7), q(5), q(4), q(2), q(0), q(0), q(2), q(4), q(2, 1.5), q(0, 0.5), q(0, 2)],
  },
  {
    id: "fur-elise", name: "Für Elise (Beethoven, d. 1827)", iso: ["DE", "AT", "IT", "PL", "HU", "CZ"], mode: "minor", bars: 4, checked: false,
    notes: [q(7, 0.5), q(6, 0.5), q(7, 0.5), q(6, 0.5), q(7, 0.5), q(2, 0.5), q(5, 0.5), q(3, 0.5), q(0, 1.5), q(-9, 0.5), q(-5, 0.5), q(0, 0.5), q(2, 1.5), q(-5, 0.5), q(-1, 0.5), q(2, 0.5), q(3, 1.5)],
  },
  {
    id: "frere-jacques", name: "Frère Jacques (traditional, France)", iso: ["FR", "BE", "CA", "CH"], mode: "major", bars: 8, checked: false,
    notes: [q(0), q(2), q(4), q(0), q(0), q(2), q(4), q(0), q(4), q(5), q(7, 2), q(4), q(5), q(7, 2),
      q(7, 0.5), q(9, 0.5), q(7, 0.5), q(5, 0.5), q(4), q(0), q(7, 0.5), q(9, 0.5), q(7, 0.5), q(5, 0.5), q(4), q(0), q(0), q(-5), q(0, 2), q(0), q(-5), q(0, 2)],
  },
  {
    id: "beethoven-5", name: "Symphony No. 5 motif (Beethoven, d. 1827)", iso: ["DE", "AT", "CZ", "SK"], mode: "minor", bars: 4, checked: false,
    notes: [q(7, 0.5), q(7, 0.5), q(7, 0.5), q(3, 3), q(5, 0.5), q(5, 0.5), q(5, 0.5), q(2, 3)],
  },
  {
    id: "rondo-alla-turca", name: "Rondo alla turca (Mozart, d. 1791)", iso: ["TR", "AT", "GR", "BG", "RS"], mode: "minor", bars: 4, checked: false,
    notes: [q(2, 0.25), q(0, 0.25), q(-1, 0.25), q(0, 0.25), q(3, 1), q(5, 0.25), q(3, 0.25), q(2, 0.25), q(3, 0.25), q(7, 1)],
  },
  {
    id: "canon-in-d", name: "Canon in D, violin line (Pachelbel, d. 1706)", iso: ["DE", "AT", "CH"], mode: "major", bars: 4, checked: false,
    notes: [q(4, 2), q(2, 2), q(0, 2), q(-1, 2), q(-3, 2), q(-5, 2), q(-3, 2), q(-1, 2)],
  },
  {
    id: "twinkle", name: "Ah! vous dirai-je, maman (traditional, France)", iso: ["FR", "GB", "US", "CA", "AU"], mode: "major", bars: 8, checked: false,
    notes: [q(0), q(0), q(7), q(7), q(9), q(9), q(7, 2), q(5), q(5), q(4), q(4), q(2), q(2), q(0, 2),
      q(7), q(7), q(5), q(5), q(4), q(4), q(2, 2), q(7), q(7), q(5), q(5), q(4), q(4), q(2, 2),
      q(0), q(0), q(7), q(7), q(9), q(9), q(7, 2), q(5), q(5), q(4), q(4), q(2), q(2), q(0, 2)],
  },
  {
    id: "amazing-grace", name: "Amazing Grace (traditional)", iso: ["US", "GB", "IE", "CA", "AU", "NZ"], mode: "major", bars: 8, checked: false,
    notes: [q(-5), q(0, 2), q(4, 0.5), q(0, 0.5), q(4, 2), q(2), q(0, 2), q(-3), q(-5, 2), q(-5), q(0, 2), q(4, 0.5), q(0, 0.5), q(4, 2), q(2), q(7, 3)],
  },
  {
    id: "oh-susanna", name: "Oh! Susanna (Foster, d. 1864)", iso: ["US", "CA", "MX"], mode: "major", bars: 8, checked: false,
    notes: [q(0, 0.5), q(2, 0.5), q(4), q(7), q(7, 1.5), q(9, 0.5), q(7), q(4), q(0), q(2, 0.5), q(4, 0.5), q(4), q(2), q(0), q(2, 2),
      q(0, 0.5), q(2, 0.5), q(4), q(7), q(7, 1.5), q(9, 0.5), q(7), q(4), q(0), q(2, 0.5), q(4, 0.5), q(4), q(2), q(2), q(0, 2)],
  },
  {
    id: "la-cucaracha", name: "La Cucaracha (traditional, Mexico)", iso: ["MX", "ES", "CU", "CO", "AR", "PE", "CL"], mode: "major", bars: 4, checked: false,
    notes: [q(0, 0.5), q(0, 0.5), q(0, 0.5), q(5, 1), q(9, 1.5), q(0, 0.5), q(0, 0.5), q(0, 0.5), q(5, 1), q(9, 1.5),
      q(5, 0.5), q(5, 0.5), q(4, 0.5), q(4, 0.5), q(2, 0.5), q(2, 0.5), q(0, 2)],
  },
  {
    id: "auld-lang-syne", name: "Auld Lang Syne (traditional, Scotland)", iso: ["GB", "IE", "US", "CA", "AU", "NZ"], mode: "major", bars: 8, checked: false,
    notes: [q(-5), q(0, 1.5), q(0, 0.5), q(0), q(4), q(2, 1.5), q(0, 0.5), q(2), q(4), q(0, 1.5), q(0, 0.5), q(4), q(7), q(9, 3), q(9, 1.5), q(7, 0.5), q(4), q(4), q(0, 1.5), q(2, 0.5), q(4), q(0), q(0, 1.5), q(-3, 0.5), q(-5), q(-5), q(0, 3)],
  },
  {
    id: "sakura", name: "Sakura Sakura (traditional, Japan)", iso: ["JP"], mode: "minor", bars: 8, checked: false,
    notes: [q(0), q(0), q(2, 2), q(0), q(0), q(2, 2), q(0), q(2), q(3, 2), q(2), q(0), q(2, 2), q(0, 0.5), q(-4, 0.5), q(-5, 3)],
  },
];

const isoOf = (iata: string): string => destinationOf(iata)?.iso ?? "";

/**
 * The tune of a piece: from the country the trip starts from, else one of the destinations' countries. Only a tune whose
 * mode suits the scale of the piece (a major tune needs a major third, a minor one a minor third, and a scale of whole
 * semitones) is used, so the harmony stays in tune with the card. null: no tune; the hook is made from the route.
 */
export function tuneFor(main: GenreCard, mode: "visited" | "wish", routes: PersonalRoute[]): Tune | null {
  if (routes.length < 2) return null;
  const scale = mode === "wish" ? main.scaleWish ?? main.scale : main.scale;
  if (scale.length !== 7 || scale.some((x) => Math.abs(x - Math.round(x)) > 0.01)) return null;
  const major = scale[2] >= 3.5;
  const from = isoOf(routes[0].from);
  // the destinations' countries (the hub is on every trip, so its own tunes do not count)
  const dest = routes.map((r) => (r.to === "IST" ? r.from : r.to)).filter((c) => c !== "IST").map(isoOf);
  const pick = (iso: string[]): Tune[] => TUNES.filter((t) => (major ? t.mode === "major" : t.mode === "minor") && t.iso.some((c) => iso.includes(c)));
  const seed = routeHash(routes.map((r) => r.key).join(">"));
  const homeList = pick([from]);
  const list = homeList.length ? homeList : pick(dest);
  if (!list.length) return null;
  return list[(seed >>> 6) % list.length];
}

const SCALE_OF: Record<Tune["mode"], number[]> = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

/** a small seeded generator (mulberry32) */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A relative of the tune, not the tune: the same length, the same rhythm skeleton, the same contour and the same first
 * and last notes, but about a third of the passing notes move a step or two inside the scale and some beats are split in
 * two. Each turn of the tune (a different `seed`) is a different relative, so it is never played the same way twice.
 */
export function varyTune(tune: Tune, seed: number): [number, number][] {
  const rnd = mulberry(seed);
  const scale = SCALE_OF[tune.mode];
  const idxOf = (semis: number): number => scale.indexOf((((semis % 12) + 12) % 12));
  const shifted = (semis: number, delta: number): number => {
    const i = idxOf(semis);
    if (i < 0) return semis;
    const oct = Math.floor(semis / 12);
    const j = i + delta;
    return scale[((j % 7) + 7) % 7] + 12 * (oct + Math.floor(j / 7));
  };
  const out: [number, number][] = [];
  const n = tune.notes.length;
  tune.notes.forEach(([semis, beats], k) => {
    const edge = k === 0 || k >= n - 2 || beats >= 1.5;
    let s2 = semis;
    if (!edge && rnd() < 0.3) s2 = shifted(semis, (rnd() < 0.7 ? 1 : 2) * (rnd() < 0.5 ? 1 : -1));
    if (!edge && beats === 1 && rnd() < 0.12) {
      // one beat becomes two halves: the second a step away
      out.push([s2, 0.5], [shifted(s2, rnd() < 0.5 ? 1 : -1), 0.5]);
    } else out.push([s2, beats]);
  });
  return out;
}
