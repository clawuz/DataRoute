import type { Instrument, PlayInstrument } from "../audio/theory";
import { WORLD_RANGE } from "../audio/world-pack";
import { euclid, routeHash } from "../audio/theory";
import type { PersonalMode } from "./codec";
import type { PersonalRoute } from "./routes";
import { altitudeFt, cruiseFt, drawLength } from "./flight";
import { NO_PIANO_CARDS, cellOf, cellSeedOf, planCards, type GenreCard } from "./genres";
import { episodeAt, episodeCards } from "./episodes";
import { journeyCard, journeyOf } from "./journey";
import { WORLD_VOICES, droneVoice, resolveVoice, type Voice } from "./world-voices";
import { tuneFor, varyTune } from "./melodies";
import { idiomOf, phraseMotifs, type MelodySource } from "./idiom";
import { panOf, wetOf } from "./space";
import { liftAt, liftFor } from "./lift";
import { humanize, looseness, timeZonesSpanned } from "./humanize";
import { applyGestures } from "./gestures";
import { RUN_CLIMB_BELOW, RUN_FALL_ABOVE, RUN_VEL, cutoffOf, flightRun, heightOf, velScale, wetShift } from "./altitude-feel";
export { altitudeFt, cruiseFt };

/** one note of a personal piece; `t` is seconds from the start of the piece */
export interface PersonalNote {
  t: number;
  d: number;
  instrument: PlayInstrument;
  freq: number;
  vel: number;
  /** route key — what lights on the globe when the note sounds */
  key: string;
  /** index into the routes: every note belongs to exactly one route line of the globe */
  route: number;
  /** the same as `route` (kept so that display code can ask for "the route of a note" in one way) */
  via: number;
  /** false: the note sounds but is not drawn again */
  show?: boolean;
  /** how long the music box draws the note: never into the next note of the same route (the sound keeps `d`) */
  drawDur?: number;
  /** altitude (ft) of the flight at this point of its phrase: climb, cruise, descent — the pitch follows it */
  alt: number;
  /** stereo position −1…1 from where the route lies east or west of home (space.ts); absent: the middle */
  pan?: number;
  /** how much reverb the note gets 0…0.5, from the length of the route (space.ts); absent: the middle send */
  wet?: number;
  /** semitones below the target at which the note starts, rising to the target in about 0.08 s (a slide into the note); absent: no glide */
  glide?: number;
  /** a hidden gesture note of 0.2 s or less: the sampler lets it ring out for 0.25 s only (many of them sound together on a phone) */
  short?: boolean;
  /** the cutoff (Hz) of a low-pass on this note, from the altitude of the flight (altitude-feel.ts); absent: the instrument's own filter. Drawn melodic notes only */
  bright?: number;
}

/** the choices that make one person's piece differ from another's, beyond the notes themselves */
export interface PersonalStyle {
  /** the cards that get a block of the verse (episodes.ts), in the order they are told; absent when there are none */
  episodes?: string[];
  /** the cards of the trip told in order after the home sound: [Istanbul's (when the trip changes planes there), the destination's]; absent when the trip has one sound */
  journey?: string[];
  /** semitones the last bars of the chorus are lifted (lift.ts): 0 when the trip stays in one region */
  lift?: number;
  /** how busy the voices are: 0 sparse … 5 busy */
  groove: number;
  /** subdivision of the plucked voices: 0 sixteenths, 1 triplets, 2 eighths */
  arp: number;
  /** subdivision of the percussion voices: 0 sixteenths, 1 triplets, 2 eighths */
  perc: number;
  /** which of a region's instruments leads: 0..3 */
  ensemble: number;
  /** chord progression 0..3 */
  progression: number;
  /** key: semitones from D */
  shift: number;
  /** 0 straight, > 0 the off-eighths lean late (fraction of a beat) */
  swing: number;
  /** the family of sound: mostly symphonic; chamber, folk (regional instruments) and pulse (hand drums) now and then */
  genre: Genre;
  /** the genre cards of the piece (see genres.ts): the main one first */
  cards?: string[];
  /** a well-known public-domain melody played by the hook route (see melodies.ts) */
  tune?: string;
}

export type Genre = "symphonic" | "chamber" | "folk" | "pulse";

export interface PersonalPiece {
  notes: PersonalNote[];
  duration: number;
  /** where the chorus starts (s) — the best 15 s of the piece */
  hook: number;
  bpm: number;
  /** the form, in seconds: where each part starts and ends */
  sections: { name: string; start: number; end: number }[];
  /** how this piece was arranged (the same selection always gives the same arrangement) */
  style: PersonalStyle;
  /** 48 samples of how loud the piece is (0..1) — drawn as the curve under the ribbon */
  energy: number[];
}

/** the key is D by default (minor for a journey, major for a wish); semitones above A2 */
const KEY_ROOT = 5;
/**
 * The AI tracks sit mostly in A minor / C major (and D, G, E): journeys are minor, wishes major, around those keys.
 * Shifts are semitones from D.
 */
const KEY_SHIFTS: Record<PersonalMode, number[]> = { visited: [-5, -5, -5, 0, 2], wish: [-2, -2, 5, 0, -5] };
const hz = (m: number): number => 110 * 2 ** (m / 12);
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

interface Chord {
  root: number;
  third: 3 | 4;
}
const PROGS: Record<PersonalMode, Chord[][]> = {
  visited: [
    [{ root: 5, third: 3 }, { root: 1, third: 4 }, { root: 8, third: 4 }, { root: 3, third: 4 }],
    [{ root: 5, third: 3 }, { root: 10, third: 3 }, { root: 1, third: 4 }, { root: 0, third: 4 }],
    [{ root: 5, third: 3 }, { root: 3, third: 4 }, { root: 1, third: 4 }, { root: 3, third: 4 }],
    [{ root: 5, third: 3 }, { root: 1, third: 4 }, { root: 5, third: 3 }, { root: 1, third: 4 }], // i – VI – i – VI (Am F Am F)
  ],
  wish: [
    [{ root: 5, third: 4 }, { root: 0, third: 4 }, { root: 2, third: 3 }, { root: 10, third: 4 }],
    [{ root: 5, third: 4 }, { root: 2, third: 3 }, { root: 10, third: 4 }, { root: 0, third: 4 }],
    [{ root: 5, third: 4 }, { root: 10, third: 4 }, { root: 0, third: 4 }, { root: 10, third: 4 }],
    [{ root: 5, third: 4 }, { root: 10, third: 4 }, { root: 5, third: 4 }, { root: 10, third: 4 }], // I – IV – I – IV (G C G C)
  ],
};
/** tempo ranges (bpm) keep a piece between about 2:25 and 3:15 */
const BPM_RANGE: Record<PersonalMode, [number, number]> = { visited: [80, 88], wish: [96, 104] };

type Section = "intro" | "verse" | "build" | "chorus" | "break" | "outro";
/**
 * 64 bars: 8 intro, 16 verse, 8 build, 20 chorus, 4 break, 8 outro. The AI tracks start at a quarter to a half of their
 * loudest, rise to the top at about 70–80 % of their length and end still at 55–65 %: the same shape here.
 */
const FORM: [Section, number][] = [
  ["intro", 8],
  ["verse", 16],
  ["build", 8],
  ["chorus", 20],
  ["break", 4],
  ["outro", 8],
];
const BARS = FORM.reduce((s, [, n]) => s + n, 0);
const LEVEL: Record<Section, number> = { intro: 0.45, verse: 0.72, build: 0.88, chorus: 1, break: 0.85, outro: 0.78 };
/** how much busier a voice is in a section (added to its pulses) */

/** what a route plays: the long routes hold the chord, the middle ones sing, the short ones pluck or drum */
type Role = "held" | "melody" | "pluck" | "perc";

type Palette = { held: Record<string, Instrument[]>; melody: Record<string, Instrument[]>; pluck: Record<string, Instrument[]>; perc: Record<string, Instrument> };
/** the sound of each genre: which instruments a route may take, by its region */
const PALETTES: Record<Genre, Palette> = {
  // the orchestra: strings, winds, horns and trumpets, harp and bells, timpani; the regional instruments are only colour
  symphonic: {
    held: { EUR: ["PNO", "CELLO", "VIOLA", "BSN"], AME: ["PNO", "HORN", "CELLO"], ASI: ["PNO", "VIOLA", "CELLO"], AFR: ["HORN", "PNO", "BSN"], MEA: ["PNO", "CELLO", "BSN"], DOM: ["PNO", "CELLO", "VIOLA"], UNK: ["PNO", "VIOLA"] },
    melody: { EUR: ["PNO", "VIOLIN", "OBOE", "CLA"], AME: ["PNO", "HORN", "TPT", "FLUTE"], ASI: ["PNO", "FLUTE", "VIOLIN", "OBOE"], AFR: ["CLA", "PNO", "OBOE", "TPT"], MEA: ["PNO", "OBOE", "VIOLIN"], DOM: ["PNO", "VIOLIN", "OBOE"], UNK: ["PNO", "VIOLIN"] },
    pluck: { EUR: ["PNO", "HARP", "VIOLIN_PIZZ"], AME: ["PNO", "HARP", "VIOLA_PIZZ"], ASI: ["PNO", "GLOCK", "HARP"], AFR: ["PNO", "XYLO", "HARP"], MEA: ["PNO", "HARP", "GLOCK"], DOM: ["PNO", "HARP", "VIOLA_PIZZ"], UNK: ["PNO", "HARP"] },
    perc: { EUR: "TIMP", AME: "TIMP", ASI: "TRI", AFR: "TAMB", MEA: "TIMP", DOM: "TIMP", UNK: "TAMB" },
  },
  // a smaller room: strings, a few winds, harp; no brass, no drums
  chamber: {
    held: { EUR: ["CELLO", "VIOLA"], AME: ["CELLO", "BSN"], ASI: ["VIOLA", "CELLO"], AFR: ["BSN", "CELLO"], MEA: ["CELLO", "BSN"], DOM: ["VIOLA", "CELLO"], UNK: ["VIOLA"] },
    melody: { EUR: ["PNO", "VIOLIN", "OBOE"], AME: ["PNO", "FLUTE", "CLA"], ASI: ["PNO", "FLUTE", "VIOLIN"], AFR: ["PNO", "CLA", "OBOE"], MEA: ["PNO", "OBOE", "VIOLIN"], DOM: ["PNO", "VIOLIN", "OBOE"], UNK: ["PNO", "VIOLIN"] },
    pluck: { EUR: ["PNO", "HARP", "VIOLIN_PIZZ"], AME: ["PNO", "HARP", "VIOLA_PIZZ"], ASI: ["PNO", "HARP", "GLOCK"], AFR: ["PNO", "HARP", "VIOLA_PIZZ"], MEA: ["PNO", "HARP", "VIOLIN_PIZZ"], DOM: ["PNO", "HARP", "VIOLA_PIZZ"], UNK: ["PNO", "HARP"] },
    perc: { EUR: "TRI", AME: "TRI", ASI: "TRI", AFR: "TRI", MEA: "TRI", DOM: "TRI", UNK: "TRI" },
  },
  // the regions' own instruments
  folk: {
    held: { DOM: ["VIOLA"], EUR: ["CELLO", "VIOLA", "BSN"], MEA: ["CELLO"], AFR: ["HORN", "BSN"], ASI: ["FLUTE", "VIOLA"], AME: ["HORN", "CELLO"], UNK: ["VIOLA"] },
    melody: { DOM: ["SAZ"], EUR: ["VIOLIN", "OBOE", "CLA"], MEA: ["KANUN", "OUD"], AFR: ["MARIMBA", "XYLO"], ASI: ["HARP", "FLUTE", "GLOCK"], AME: ["FLUTE", "HORN", "CLA"], UNK: ["VIOLA"] },
    pluck: { DOM: ["SAZ", "OUD"], EUR: ["HARP", "VIOLIN_PIZZ"], MEA: ["KANUN", "OUD"], AFR: ["MARIMBA", "XYLO"], ASI: ["GLOCK", "HARP"], AME: ["HARP", "VIOLA_PIZZ"], UNK: ["HARP"] },
    perc: { DOM: "DARBUKA", MEA: "DARBUKA", AFR: "CONGA", ASI: "TRI", EUR: "TIMP", AME: "TAMB", UNK: "TAMB" },
  },
  // hand drums and mallets in front
  pulse: {
    held: { DOM: ["CELLO"], EUR: ["CELLO", "BSN"], MEA: ["CELLO"], AFR: ["BSN", "HORN"], ASI: ["VIOLA", "FLUTE"], AME: ["HORN", "CELLO"], UNK: ["CELLO"] },
    melody: { DOM: ["MARIMBA", "SAZ"], EUR: ["XYLO", "MARIMBA"], MEA: ["MARIMBA", "KANUN"], AFR: ["MARIMBA", "XYLO"], ASI: ["XYLO", "GLOCK"], AME: ["MARIMBA", "XYLO"], UNK: ["MARIMBA"] },
    pluck: { DOM: ["SAZ", "XYLO"], EUR: ["XYLO", "VIOLIN_PIZZ"], MEA: ["KANUN", "XYLO"], AFR: ["MARIMBA", "XYLO"], ASI: ["GLOCK", "XYLO"], AME: ["MARIMBA", "VIOLA_PIZZ"], UNK: ["XYLO"] },
    perc: { DOM: "DARBUKA", MEA: "DARBUKA", AFR: "CONGA", ASI: "CONGA", EUR: "DARBUKA", AME: "CONGA", UNK: "DARBUKA" },
  },
};

/** highest pitch (Hz) each pitched instrument is given; higher notes are folded down an octave */
const CEILING: Partial<Record<Instrument, number>> = {
  VIOLIN: 1320, VIOLA: 1000, STR: 1000, CELLO: 700, OBOE: 1175, CLA: 1175, FLUTE: 1400, PICC: 1568, HORN: 700,
  TPT: 1047, HARP: 1568, GLOCK: 1568, XYLO: 1319, MARIMBA: 1047, SAZ: 880, KANUN: 1175, OUD: 880, NEY: 1175, PNO: 1568, BSN: 466, TUBA: 220,
};

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
/** the lowest pitch (Hz) of an instrument's recording: lower notes are moved up an octave rather than stretched */
const FLOOR: Partial<Record<Instrument, number>> = {
  FLUTE: 262, PICC: 520, OBOE: 233, CLA: 147, VIOLIN: 196, VIOLA: 131, TPT: 165, HORN: 87, SAZ: 82, NEY: 294, XYLO: 349, GLOCK: 520, MARIMBA: 65, KANUN: 130, OUD: 55,
};

/** the pitch limits of an instrument: the world pack's range around its recordings, else the tables above */
export const limitsOf = (inst: PlayInstrument): { cap?: number; floor?: number } => {
  const w = (WORLD_RANGE as Partial<Record<string, readonly [number, number]>>)[inst];
  return w ? { floor: w[0], cap: w[1] } : { cap: CEILING[inst as Instrument], floor: FLOOR[inst as Instrument] };
};

function sectionOf(bar: number): { section: Section; first: number; len: number } {
  let b = 0;
  for (const [s, n] of FORM) {
    if (bar < b + n) return { section: s, first: b, len: n };
    b += n;
  }
  const [s, n] = FORM[FORM.length - 1];
  return { section: s, first: BARS - n, len: n };
}

/** a small seeded generator (mulberry32): the same selection always makes the same choices */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the arrangement chosen for a selection */
export function styleFor(mode: PersonalMode, routes: PersonalRoute[]): PersonalStyle & { bpm: number } {
  const r = rng(routeHash(`${mode}|${routes.map((x) => x.key).join(">")}`));
  // the card most routes go to (the sound of where the trip goes) sets the tempo, the family of sound and (in composePiece) the scale
  const card = planCards(mode, routes).main;
  const [lo, hi] = card.bpm;
  // a wish is a little brighter; a busy selection is a livelier piece: many routes lift the tempo (up to 16 bpm)
  const bpm = clamp(lo + Math.floor(r() * (hi - lo + 1)) + (mode === "wish" ? 6 : 0) + clamp((routes.length - 3) * 2, 0, 16), 76, 126);
  return {
    genre: card.family,
    bpm,
    groove: Math.floor(r() * 6),
    arp: Math.floor(r() * 3),
    perc: Math.floor(r() * 3),
    ensemble: Math.floor(r() * 4),
    progression: Math.floor(r() * PROGS[mode].length),
    shift: KEY_SHIFTS[mode][Math.floor(r() * KEY_SHIFTS[mode].length)],
    swing: [0, 0, 0.12, 0.2][Math.floor(r() * 4)],
  };
}

const rotate = <T,>(a: T[], k: number): T[] => (a.length === 0 ? a : a.map((_, i) => a[(i + k) % a.length]));

/**
 * A full piece (about two and a half to three minutes) made ONLY from the route lines of the globe. Deterministic.
 * Every route is one voice: its region picks the instrument family, its length the part it plays (long routes hold
 * the chord, middle ones sing, short ones pluck or drum), its hash the rhythm and the walk of the melody, its
 * direction whether the line climbs or falls. Routes enter one after another as they are "drawn" and the form
 * (intro, verse, build, chorus, break, outro) shapes how much of each voice is heard. Nothing is played that is not
 * a route: with one route there is one voice; with twenty there are twenty.
 */
/**
 * Where the shared clip starts (s): the last three bars of the build, so that the lift into the chorus is in it, and then
 * the first bars of the chorus — the best 15 s of the piece. Never before the build.
 */
export function clipStart(piece: PersonalPiece): number {
  const bar = 240 / piece.bpm;
  const build = piece.sections.find((x) => x.name === "build")?.start ?? 0;
  return Math.max(build, piece.hook - 3 * bar, 0);
}

/** how early humanize may move a note (s): a note this much before the clip's start still belongs to it */
const CLIP_SLACK = 0.03;

/** a hidden note that began before the clip is carried into it only while more than this much of it is left (s) */
const CLIP_CARRY_MIN = 0.2;

/**
 * The notes of the shared clip, moved so that the clip starts at 0: every note from `from` on (and the ones humanize
 * moved a few ms before it), plus the hidden notes still sounding at `from` (the home drone), trimmed to start with the clip.
 * A hidden note with 0.2 s or less left is not carried: the rest of a tremolo or of a strum would sound without its beginning.
 */
export function clipNotes(notes: PersonalNote[], from: number): PersonalNote[] {
  const out: PersonalNote[] = [];
  for (const n of notes) {
    if (n.t >= from - CLIP_SLACK) out.push({ ...n, t: Math.max(0, n.t - from) });
    else if (n.show === false && n.t + n.d - from > CLIP_CARRY_MIN) {
      const cut = from - n.t;
      out.push({ ...n, t: 0, d: n.d - cut, drawDur: n.drawDur === undefined ? undefined : Math.max(0, n.drawDur - cut) });
    }
  }
  return out;
}

/**
 * `opts.tunes` (off by default) brings back the relatives of public-domain tunes for the hook: a nearly-known tune makes the ear
 * search for the original, so by default every hook is an original melody walked in the idiom of its route's own card.
 */
export function composePiece(mode: PersonalMode, routes: PersonalRoute[], opts: { tunes?: boolean; melody?: MelodySource } = {}): PersonalPiece {
  const st = styleFor(mode, routes);
  const bpm = st.bpm;
  const style: PersonalStyle = { groove: st.groove, arp: st.arp, perc: st.perc, ensemble: st.ensemble, progression: st.progression, shift: st.shift, swing: st.swing, genre: st.genre, cards: [...new Set([planCards(mode, routes).main.id, ...planCards(mode, routes).perRoute.map((c) => c.id)])] };
  if (routes.length === 0) return { notes: [], duration: 0, hook: 0, bpm, sections: [], energy: [], style };
  // one route: one instrument singing one melody that climbs and falls with the flight and comes home
  if (routes.length === 1) return composeSolo(mode, routes[0], st, style);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = routes.length;
  const plan = planCards(mode, routes);
  const scale = mode === "wish" ? plan.main.scaleWish ?? plan.main.scale : plan.main.scale;
  const prog: Chord[] = plan.main.prog ? plan.main.prog.map(([off, third]) => ({ root: KEY_ROOT + off, third })) : PROGS[mode][st.progression];
  const notes: PersonalNote[] = [];
  const roleOfNote = new Map<PersonalNote, string>();

  // ---- the arrangement of a popular song, made of the routes ----
  // The longest route holds the chords, the next one plays the bass, the middle ones carry the hook and the arpeggio,
  // the shortest ones are the drums: kick, backbeat, hat. A bar of the main genre card is the groove the bass and the hook
  // ride on, the progression is four chords of one bar each, the hook is a short phrase that comes back, and the form
  // brings the voices in and takes them out (intro, verse, build, chorus, break, outro).
  type PopRole = "pad" | "bass" | "hook" | "pluck" | "backbeat" | "kick" | "hat";
  const order = routes.map((r, i) => ({ i, d: r.distKm })).sort((x, y) => y.d - x.d || x.i - y.i); // longest first
  const rank = new Map<number, number>(); // 1 = the longest
  order.forEach((x, k) => rank.set(x.i, n < 2 ? 0.5 : 1 - k / (n - 1)));
  const BASE: PopRole[] = ["pad", "bass", "hook", "pluck", "kick", "backbeat", "hat"];
  const SMALL: Record<number, PopRole[]> = {
    2: ["bass", "hook"],
    3: ["bass", "hook", "pluck"],
    4: ["pad", "bass", "hook", "pluck"],
    5: ["pad", "bass", "hook", "pluck", "kick"],
    6: ["pad", "bass", "hook", "pluck", "kick", "backbeat"],
  };
  const seq: PopRole[] = n <= 6 ? SMALL[n] : order.map((_, k) => BASE[Math.floor((k * 7) / n)]);
  const role: PopRole[] = new Array(n);
  order.forEach((x, k) => (role[x.i] = seq[k]));
  // space from the map: where each route lies east or west of home, and how far it goes
  const homeLon = routes[0].fromLon;
  const panFor = routes.map((r, i) => panOf(r, homeLon, role[i]));
  const wetFor = routes.map((r, i) => wetOf(r, role[i]));
  // the second, third … route with the same role: a second voice that joins in the chorus and the build
  const occ: number[] = routes.map((_, i) => role.slice(0, i).filter((q) => q === role[i]).length);
  const phraseBars = routes.map((_, i) => clamp(Math.round(4 + 12 * (rank.get(i) ?? 0.5)), 4, 16));
  const phaseAt = (i: number, b: number, frac: number): number => ((((b % phraseBars[i]) + phraseBars[i]) % phraseBars[i]) + frac) / phraseBars[i];

  const fit = (f: number, inst: PlayInstrument): number => {
    const { cap, floor } = limitsOf(inst);
    let x = f;
    if (cap) while (x > cap) x /= 2;
    if (floor) while (x < floor) x *= 2;
    return x;
  };
  const push = (i: number, t: number, d: number, instrument: PlayInstrument, f: number, vel: number, p = 0.5): void => {
    const alt = altitudeFt(p, routes[i].distKm);
    const note: PersonalNote = { t, d, instrument, freq: fit(f, instrument), vel: clamp(vel, 0.05, 1), key: routes[i].key, route: i, via: i, alt, pan: panFor[i], wet: wetFor[i] };
    // the altitude of the flight: louder, brighter and roomier up high (small; the percussion keeps its level and its room)
    if (!["kick", "backbeat", "hat"].includes(role[i])) {
      const h = heightOf(alt, routes[i].distKm);
      note.vel = clamp(vel * velScale(h), 0.05, 1);
      note.wet = clamp(wetFor[i] + wetShift(h), 0, 0.5);
      note.bright = Math.round(cutoffOf(h));
    }
    notes.push(note);
    roleOfNote.set(note, role[i]);
  };

  // every route gets its own instrument where its card has enough of them
  const taken = new Set<string>();
  let pianos = 0;
  /**
   * A coloured route (one playing the card of its destination) first takes, by its hash, a recording of that card's world
   * voices that no other route has: the list of its role first, then the card's other melodic lists. The lists of the
   * roles are served before the borrowed ones (a pad does not take the santur a pluck route of the same card needs).
   */
  const coloured = routes.map((_, i) => plan.perRoute[i] !== plan.main);
  /** which list a coloured route's recording came from: 0 its role's own, 1+ a borrowed one, -1 none */
  const worldTier = routes.map(() => -1);
  const tiersOf = (i: number): (Voice[] | undefined)[] => {
    const w = WORLD_VOICES[plan.perRoute[i].id] ?? {};
    switch (role[i]) {
      // a coloured pad strikes the chord on its card's held recording, else a melodic or plucked one; the bass stays a bass
      case "pad": return [w.held, w.melody, w.pluck];
      case "bass": return [w.bass];
      case "hook": return [w.melody, w.pluck, w.held];
      case "pluck": return [w.pluck, w.melody];
      default: return [];
    }
  };
  const hashOf = routes.map((r, i) => routeHash(r.key + i));
  const fromWorld = (i: number, tier: number): PlayInstrument | undefined => {
    const ws = tiersOf(i)[tier] ?? [];
    for (let o = 0; o < ws.length; o++) {
      const c = ws[(hashOf[i] + o) % ws.length];
      if (!taken.has(c)) {
        taken.add(c);
        worldTier[i] = tier;
        return resolveVoice(c, hashOf[i]);
      }
    }
    return undefined;
  };
  const early: (PlayInstrument | undefined)[] = routes.map((_, i) => (coloured[i] ? fromWorld(i, 0) : undefined));
  const choose = (list0: Voice[], h: number, i: number, kind: "melody" | "pluck" | "other", turn = 0): PlayInstrument => {
    // folk and makam cards have no piano: it is filtered out of the list (an empty list falls back to the card's first non-piano voice)
    const noPiano = NO_PIANO_CARDS.has(plan.perRoute[i].id);
    let list = list0;
    if (noPiano && list0.includes("PNO")) {
      list = list0.filter((c) => c !== "PNO");
      if (!list.length) list = [plan.perRoute[i].held.find((c) => c !== "PNO") ?? plan.perRoute[i].held[0]];
    }
    if (coloured[i]) {
      const got = early[i] ?? [1, 2].map((t) => (worldTier[i] < 0 ? fromWorld(i, t) : undefined)).find((x) => x);
      if (got) return got;
    }
    // the piano is a prominent voice of the main card: a hook and an arpeggio may take it; the other instruments are not repeated
    if (!coloured[i] && list.includes("PNO") && pianos < 2 && kind !== "other" && (pianos === 0 || kind === "pluck")) {
      pianos++;
      return "PNO";
    }
    for (let o = 0; o < list.length; o++) {
      const c = list[(h + st.ensemble + i + turn + o) % list.length];
      if (c !== "PNO" && !taken.has(c)) {
        taken.add(c);
        return resolveVoice(c, h);
      }
    }
    if (noPiano) {
      const free = list.find((c) => !taken.has(c)) ?? list[(h + st.ensemble + i + turn) % list.length];
      return resolveVoice(free, h);
    }
    return resolveVoice(list[(h + st.ensemble + i + turn) % list.length], h);
  };
  const voiceOf: PlayInstrument[] = routes.map((_, i) => {
    const h = hashOf[i];
    const card = plan.perRoute[i];
    const folkish = card.family === "folk" || card.family === "pulse";
    switch (role[i]) {
      case "pad": return choose(card.held, h, i, "other");
      case "bass": return choose(card.bass?.length ? card.bass : card.held.filter((x) => x !== "PNO"), h, i, "other", 1);
      case "hook": return choose(card.melody, h, i, "melody");
      case "pluck": return choose(card.pluck, h, i, "pluck");
      case "backbeat": return resolveVoice(card.perc, h);
      case "kick": return folkish ? resolveVoice(card.perc, h) : "TIMP";
      default: return folkish && !card.perc.startsWith("DARBUKA") ? resolveVoice(card.perc, h) : "TRI";
    }
  });
  // with more than three routes the piano is always there, as a steady voice: on a route of the main card (the arpeggio
  // first, else the hook); else on a pluck or hook route without a recording of its destination, else one whose
  // recording was borrowed from another list of its card
  if (n > 3 && !voiceOf.includes("PNO")) {
    const pick = (ok0: (i: number) => boolean): number => {
      const ok = (i: number): boolean => !NO_PIANO_CARDS.has(plan.perRoute[i].id) && ok0(i);
      for (const rl of ["pluck", "hook"] as PopRole[]) {
        const at = role.findIndex((q, i) => q === rl && ok(i));
        if (at >= 0) return at;
      }
      return -1;
    };
    const at = [pick((i) => !coloured[i]), pick((i) => worldTier[i] < 0), pick((i) => worldTier[i] > 0), pick(() => true)].find((x) => x >= 0) ?? -1;
    if (at >= 0) voiceOf[at] = "PNO";
  }

  // the groove of one bar: the figure of a card, stretched to four beats (the main card's, or an episode card's in the verse)
  const cellSeed = cellSeedOf(plan.main, routes);
  const grooveOf = (card: GenreCard) => {
    const { cell: fig, accent } = cellOf(card, cellSeed);
    const figTotal = fig.reduce((x, y) => x + Math.abs(y), 0);
    const gs: { start: number; len: number; hit: boolean; accent: number }[] = [];
    let at = 0;
    fig.forEach((c, k) => {
      const len = (Math.abs(c) / figTotal) * 4;
      gs.push({ start: at, len, hit: c > 0, accent: accent?.[k] || 1 });
      at += len;
    });
    const gh = gs.filter((x) => x.hit);
    return { slots: gs, hits: gh, strong: gh.filter((x, k) => k === 0 || x.accent >= 1.1).slice(0, 4), swing: card.swing ?? st.swing };
  };
  const main = grooveOf(plan.main);
  const { slots, hits, strong } = main;
  const swingAmt = main.swing;
  // region episodes: the verse tells the regions of the trip, each with the groove of its own card
  const eps = episodeCards(plan);
  if (eps.length) style.episodes = eps.map((c) => c.id);
  const verseFirst = FORM.slice(0, FORM.findIndex(([name]) => name === "verse")).reduce((s, [, m]) => s + m, 0);
  // the trip told in order: the sound of where it leaves, of Istanbul, of where it arrives (journey.ts)
  const journey = journeyOf(routes, plan);
  if (journey) style.journey = [journey.home?.id, journey.transit?.id].filter((x): x is string => !!x);
  const grooves = new Map<string, ReturnType<typeof grooveOf>>([...eps, ...(journey?.home ? [journey.home] : []), ...(journey?.transit ? [journey.transit] : [])].map((c) => [c.id, grooveOf(c)]));
  // a bar's stage: the journey's card when it has one for the section, else the episode of the verse
  const stageAt = (bar: number, section: Section): ReturnType<typeof episodeAt> => {
    const e = episodeAt(bar, verseFirst, eps);
    const jc = journey ? journeyCard(section, journey) : undefined;
    return jc === undefined ? e : { card: jc, blockEnd: e.blockEnd, block: e.block };
  };
  const fills = eps.length > 0 || !!journey?.transit;
  const POP_PROGS: Record<PersonalMode, [number, 3 | 4][][]> = {
    visited: [[[0, 3], [8, 4], [3, 4], [10, 4]], [[0, 3], [10, 4], [8, 4], [10, 4]], [[0, 3], [5, 3], [8, 4], [7, 4]], [[0, 3], [8, 4], [3, 4], [7, 4]]],
    wish: [[[0, 4], [7, 4], [9, 3], [5, 4]], [[9, 3], [5, 4], [0, 4], [7, 4]], [[0, 4], [9, 3], [5, 4], [7, 4]], [[0, 4], [5, 4], [9, 3], [7, 4]]],
  };
  // a well-known melody for the hook (only when asked for, and when it suits the scale of the card): the chords then follow its mode
  const tune = opts.tunes ? tuneFor(plan.main, mode, routes) : null;
  if (tune) style.tune = tune.id;
  const popProg: Chord[] = (tune ? POP_PROGS[tune.mode === "major" ? "wish" : "visited"][st.progression % 4] : plan.main.prog ?? POP_PROGS[mode][st.progression % POP_PROGS[mode].length]).map(([off, third]) => ({ root: KEY_ROOT + off, third }));

  // the hook of each hook route: four bars of scale degrees (`phraseMotifs`), walked in the idiom of the route's card and pulled by its heading
  const L = scale.length;
  /** the melody scale of each route: its own card's (a coloured route sings in the scale of its destination) */
  const scaleOf = routes.map((_, i) => (mode === "wish" ? plan.perRoute[i].scaleWish ?? plan.perRoute[i].scale : plan.perRoute[i].scale));
  const motifs = routes.map((r, i) => {
    if (role[i] !== "hook") return null;
    const idiom = idiomOf(plan.perRoute[i]);
    const rnd = rng(routeHash(r.key + "hook" + i));
    const dir: 1 | -1 = r.toLon >= r.fromLon ? 1 : -1;
    // four bars: each a walk of the idiom of the route's own card, pulled by its direction, coming home on the idiom's cadence;
    // bar 3 repeats bar 1 only when the idiom's cadence gives them the same end degree (otherwise it is its own walk)
    return phraseMotifs(idiom, hits.length, dir, rnd, () => idiom.start[Math.floor(rnd() * idiom.start.length)] + (occ[i] % 2) * 2, { melody: opts.melody ?? "walk", card: plan.perRoute[i].id });
  });
  /** how many scale degrees the altitude of the flight lifts the hook of each route (the arc of its card's idiom) */
  const arcOf = routes.map((_, i) => idiomOf(plan.perRoute[i]).arc);
  // call and response: in the chorus the pluck route (if the piece has one) answers the hook in the second half of every second bar,
  // with the hook's own motif turned upside down; the hook rests there
  const answerer = role.indexOf("pluck");
  const callerIdx = role.findIndex((q, i) => q === "hook" && occ[i] === 0);
  const answering = (section: string, b: number): boolean => answerer >= 0 && callerIdx >= 0 && section === "chorus" && b % 2 === 1;

  const ACTIVE: Record<Section, PopRole[]> = {
    intro: ["pad", "bass", "pluck"], // no hat: a constant tick in the intro is not a groove yet
    verse: ["pad", "bass", "pluck", "backbeat", "kick", "hat", "hook"],
    build: ["pad", "bass", "hook", "pluck", "backbeat", "kick", "hat"],
    chorus: ["pad", "bass", "hook", "pluck", "backbeat", "kick", "hat"],
    break: ["pad", "hook", "hat"],
    outro: ["pad", "bass", "pluck"],
  };
  const hookStart = (() => {
    let at = 0;
    for (const [name, m] of FORM) {
      if (name === "chorus") return at * bar;
      at += m;
    }
    return 0;
  })();
  const hook = hookStart;
  const deg = routes.map(() => 0);
  const END_T = BARS * bar;
  // the key lift: a trip across regions sings the last bars of the chorus higher, in the same mood, then goes home
  const keyLift = liftFor(mode, routes.map((r) => r.region));
  style.lift = keyLift;
  const chorusFirst = FORM.slice(0, FORM.findIndex(([name]) => name === "chorus")).reduce((s, [, m]) => s + m, 0);
  const chorusLen = FORM.find(([name]) => name === "chorus")![1];
  // home: the tonic and its fifth hum under the trip, played by the first route (nothing is added that is not a route).
  // A plucked drone is struck every two bars, a held one every four; it is silent in the break and in the lifted bars.
  const droneInst = resolveVoice(droneVoice(plan.home.id), routeHash(routes[0].key));
  const droneEvery = droneInst === "TANPURA" ? 2 : 4;
  const silentBar = (b: number): boolean => sectionOf(b).section === "break" || liftAt(b, chorusFirst, chorusLen, keyLift) !== 0;

  for (let b = 0; b < BARS; b++) {
    const { section, first, len: slen } = sectionOf(b);
    const sh = st.shift + liftAt(b, chorusFirst, chorusLen, keyLift);
    const t0 = b * bar;
    const level = LEVEL[section];
    const fade = section === "outro" ? 1 - ((b - first) / slen) * 0.3 : 1;
    const v = (x: number): number => x * level * fade;
    const chord = popProg[b % popProg.length];
    const cr = chord.root + sh;
    const tones = [0, chord.third, 7].map((x) => cr + x);
    const full = section === "chorus" || section === "build";
    const ep = stageAt(b, section);
    const g = ep.card ? grooves.get(ep.card.id)! : main;
    for (let i = 0; i < n; i++) {
      const rl = role[i];
      if (!ACTIVE[section].includes(rl)) continue;
      // a second voice of a role only joins in the chorus and the build
      if (occ[i] > 0 && !full) continue;
      const r = routes[i];
      // the voices of the region whose turn it is come forward, the others step back
      const spot = ep.card && plan.perRoute.includes(ep.card) ? (plan.perRoute[i] === ep.card ? 1.15 : 0.85) : 1;
      const vs = (x: number): number => v(x) * spot;
      const inst = voiceOf[i];
      const rk = rank.get(i) ?? 0.5;
      const p0 = phaseAt(i, b, 0);
      if (rl === "pad") {
        // the chord, re-struck on beats one and three, one tone per pad route, rolled a little
        [0, 2].forEach((bt, k) => push(i, t0 + bt * beat + (occ[i] % 3) * 0.04, beat * 1.9 * (0.7 + 0.6 * rk), inst, hz(tones[(occ[i] + k) % 3] + 12 * ((occ[i] + k) % 2)), vs(0.4 + 0.1 * rk), phaseAt(i, b, bt / 4)));
      } else if (rl === "bass") {
        const roots = g.strong.length ? g.strong : [g.slots[0]];
        roots.forEach((sl, k) => {
          const next = roots[k + 1]?.start ?? 4;
          const tone = (b % 4 === 3 && k === roots.length - 1 ? tones[2] : tones[0]) - 12 + (occ[i] > 0 ? 12 : 0);
          push(i, t0 + sl.start * beat, Math.min(1.5, Math.max(0.5, next - sl.start)) * beat * 0.92 * (0.8 + 0.4 * rk), inst, hz(tone), vs(0.62 * sl.accent), phaseAt(i, b, sl.start / 4));
        });
      } else if (rl === "hook" && tune && occ[i] === 0) {
        // the melody plays through when its bars begin: once in a verse, every time in the build, chorus and break
        const startOk = section === "verse" ? Math.floor((b - first) / tune.bars) % 2 === 0 && (b - first) % tune.bars === 0 : b % tune.bars === 0;
        if (!startOk) continue;
        let off = 0;
        // a waltz bar of three beats is stretched to the four beats of a bar here
        const stretch = 4 / (tune.bpb ?? 4);
        // a relative of the tune, a different one on every turn: the same shape, a few passing notes moved
        const turn = varyTune(tune, routeHash(tune.id + routes.map((r) => r.key).join(">")) + Math.floor(b / tune.bars));
        for (const [semis, beats] of turn) {
          const when = t0 + off * stretch * beat;
          // an 8-bar tune runs into later bars: each note takes the key of the bar it sounds in (lifted or home)
          const nb = b + Math.floor((off * stretch) / 4);
          const shN = st.shift + liftAt(nb, chorusFirst, chorusLen, keyLift);
          // the spotlight of the bar the note sounds in (a tune that starts in a home block runs on into an episode block)
          const epN = episodeAt(nb, verseFirst, eps);
          const spotN = epN.card ? (plan.perRoute[i] === epN.card ? 1.15 : 0.85) : 1;
          if (when < END_T - 1e-6) push(i, when, beats * stretch * beat * 0.95, inst, hz(KEY_ROOT + shN + 12 + semis), v(0.78) * spotN, phaseAt(i, nb, ((off * stretch) % 4) / 4));
          off += beats;
        }
      } else if (rl === "hook") {
        // in the verse the hook only answers (two bars of four); in the chorus it is there all the time
        if (section === "verse" && b % 4 >= 2) continue;
        const m = motifs[i]![b % 4];
        const firstDegree = m.find((d): d is number => d !== null) ?? 0; // the answer turns the motif around its first note that sounds
        let hi = 0;
        let lastBase = Number.NaN; // the last degree of the bar's hook line, without the lift of the altitude
        const reply = answering(section, b) && occ[i] === 0 && i === callerIdx;
        g.slots.forEach((sl, k) => {
          if (!sl.hit) return;
          if (reply && sl.start >= 2) {
            // the answer: the motif upside down around its first note, in the answerer's voice, on the same figure
            const ai = answerer;
            const lift = Math.round((altitudeFt(phaseAt(ai, b, sl.start / 4), routes[ai].distKm) / 39000) * arcOf[i]);
            const sc = scaleOf[i];
            const src = m[hi % m.length];
            hi++;
            if (src === null) return; // a rest of the hook is a rest of the answer
            const total = 2 * (m[0] ?? firstDegree) - src + lift + sc.length;
            const semis = KEY_ROOT + sh + sc[((total % sc.length) + sc.length) % sc.length] + 12 * Math.floor(total / sc.length);
            push(ai, t0 + sl.start * beat, sl.len * beat * 0.9, voiceOf[ai], hz(semis), vs(0.55), phaseAt(ai, b, sl.start / 4));
            return;
          }
          const lift = Math.round((altitudeFt(phaseAt(i, b, sl.start / 4), r.distKm) / 39000) * arcOf[i]);
          const sc = scaleOf[i];
          const deg = m[hi % m.length];
          hi++; // a rest (null) has no note, but the index keeps stepping through the motif
          if (deg === null) return;
          const total = deg + lift + (section === "chorus" ? sc.length : 0) + (occ[i] > 0 ? 2 : 0);
          lastBase = total - lift;
          let semis = KEY_ROOT + sh + sc[((total % sc.length) + sc.length) % sc.length] + 12 * Math.floor(total / sc.length);
          // the strong places of the groove rest on a chord tone
          if (sl.accent >= 1.1 || hi === 1) {
            let best = semis;
            let bd = Infinity;
            for (const tn of tones) for (const o of [-12, 0, 12]) {
              const c2 = tn + o;
              const dd = Math.abs(c2 - semis);
              if (dd < bd) { bd = dd; best = c2; }
            }
            if (bd <= 1.5) semis = best;
          }
          const nextRest = g.slots[k + 1] && !g.slots[k + 1].hit ? g.slots[k + 1].len : 0;
          push(i, t0 + sl.start * beat + (k % 2 ? g.swing * beat * 0.33 * sl.len : 0), (sl.len + nextRest * 0.9) * beat * 0.95 * (0.8 + 0.4 * rk), inst, hz(semis), vs((0.6 + 0.3 * (1 - rk)) * sl.accent), phaseAt(i, b, sl.start / 4));
        });
        // the flight runs (nağme): the last beat of a bar in the climb rises, one in the descent falls, when nothing else sounds there
        const dir: 1 | -1 | 0 = phaseAt(i, b, 0) < RUN_CLIMB_BELOW ? 1 : phaseAt(i, b, 1) > RUN_FALL_ABOVE ? -1 : 0;
        if (dir !== 0 && Number.isFinite(lastBase) && !reply && !g.slots.some((sl) => sl.hit && sl.start >= 3)) {
          const sc = scaleOf[i];
          flightRun(dir, lastBase + Math.round((altitudeFt(phaseAt(i, b, 0.75), r.distKm) / 39000) * arcOf[i])).forEach((total, k) => {
            const semis = KEY_ROOT + sh + sc[((total % sc.length) + sc.length) % sc.length] + 12 * Math.floor(total / sc.length);
            push(i, t0 + (3 + k * 0.25) * beat, beat * 0.25 * 0.95, inst, hz(semis), vs((0.6 + 0.3 * (1 - rk)) * RUN_VEL), phaseAt(i, b, (3 + k * 0.25) / 4));
          });
        }
      } else if (rl === "pluck") {
        const seqTones = [0, 1, 2, 1].map((x) => (x + i) % 3);
        for (let e = 0; e < 8; e++) {
          if (i === answerer && answering(section, b) && e >= 4) continue; // it answers instead
          if (section === "intro" && (b - first < 4 || e % 4 !== 0)) continue; // the intro: the pluck waits four bars, then plays two soft notes a bar, not a run of eighths
          const p = phaseAt(i, b, e / 8);
          const tone = tones[seqTones[(e + (occ[i] ? 1 : 0)) % 4]] + (altitudeFt(p, r.distKm) / cruiseFt(r.distKm) > 0.55 ? 12 : 0);
          push(i, t0 + e * 0.5 * beat + (e % 2 ? g.swing * beat * 0.33 : 0), beat * 0.48, inst, hz(tone), vs(e % 4 === 0 ? 0.42 : 0.3), p);
        }
      } else if (rl === "backbeat") {
        [1, 3].forEach((bt) => push(i, t0 + bt * beat, beat * 0.35, inst, 200, vs(0.55), phaseAt(i, b, bt / 4)));
        if (section === "build") push(i, t0 + 3.5 * beat, beat * 0.25, inst, 200, vs(0.4), phaseAt(i, b, 0.9));
        if (ep.blockEnd && fills) push(i, t0 + 3.5 * beat, beat * 0.25, inst, 200, vs(0.4), phaseAt(i, b, 0.9));
      } else if (rl === "kick") {
        // inside an episode: beat 1 and the exact strong places of the episode card, where the bass plays them (every figure starts with a hit, at 0)
        const epBeats = ep.card ? [...new Set([0, ...g.strong.map((s) => s.start)])] : null;
        const beats = section === "build" ? [0, 1, 2, 3] : epBeats ?? [0, 2];
        if (ep.blockEnd && fills && !beats.includes(3)) beats.push(3);
        beats.forEach((bt) => push(i, t0 + bt * beat, beat * 0.4, inst, inst === "TIMP" ? hz(cr - 12) : 200, vs(bt === 0 ? 0.8 : 0.6), phaseAt(i, b, bt / 4)));
      } else {
        if (ep.card) {
          // inside an episode the hat plays the hit places of the episode figure instead of straight eighths,
          // swung on the odd slots of the figure exactly like the hook (a rest is a slot too)
          g.slots.forEach((sl, k) => {
            if (!sl.hit) return;
            push(i, t0 + sl.start * beat + (k % 2 ? g.swing * beat * 0.33 * sl.len : 0), beat * 0.2, inst, 200, vs(sl.accent >= 1.1 ? 0.3 : 0.2), phaseAt(i, b, sl.start / 4));
          });
        } else {
          for (let e = 0; e < 8; e++) push(i, t0 + e * 0.5 * beat + (e % 2 ? swingAmt * beat * 0.33 : 0), beat * 0.2, inst, 200, vs(e % 2 ? 0.3 : 0.2), phaseAt(i, b, e / 8));
        }
      }
    }

    if (b % droneEvery === 0 && !silentBar(b)) {
      let len = 1;
      while (len < droneEvery && b + len < BARS && !silentBar(b + len)) len++;
      [0, 7].forEach((semi, k) => {
        const note: PersonalNote = {
          t: t0, d: len * bar * 0.98, instrument: droneInst, freq: fit(hz(KEY_ROOT + st.shift - 12 + semi), droneInst), vel: clamp(v(k === 0 ? 0.22 : 0.15), 0.05, 1),
          key: routes[0].key, route: 0, via: 0, alt: altitudeFt(0.5, routes[0].distKm), show: false, pan: 0, wet: 0.3,
        };
        notes.push(note);
        roleOfNote.set(note, "drone");
      });
    }
  }
  // played, not printed: a few milliseconds and a few percent, looser the more time zones the trip crosses
  humanize(notes, {
    loose: looseness(timeZonesSpanned(routes)),
    tight: (x) => ["kick", "backbeat", "hat"].includes(roleOfNote.get(x) ?? ""),
    skip: (x) => roleOfNote.get(x) === "drone",
  });
  // each instrument is played with its own gestures (a strum, a tremolo, a double stop, a walking bass, a tanpura cycle, a glide):
  // after humanize, so the spacing of a strum is not disturbed. The notes it adds are hidden (show: false), like the drone.
  const sources = new Set(notes);
  const gestured = applyGestures(notes, {
    bar,
    beat,
    cardOf: (route) => plan.perRoute[route].id,
    roleOf: (x) => roleOfNote.get(x) ?? "",
    silentBar,
    origin: (made, src) => void roleOfNote.set(made, roleOfNote.get(src) ?? ""),
    // the chord of a bar, as semitones above the key root (the key's lift in the chorus included)
    chordAt: (b) => {
      const c = popProg[b % popProg.length];
      return { root: c.root - KEY_ROOT + liftAt(b, chorusFirst, chorusLen, keyLift), third: c.third };
    },
    keyRoot: KEY_ROOT + st.shift,
    hz,
  });
  // the notes it made (an added note, a patched copy of a drawn note) have the role of the note they were made from, whether that
  // note was kept or dropped (`origin`); each is moved back into its instrument's range by octaves
  for (const x of gestured) {
    if (!sources.has(x)) x.freq = fitPitch(x.freq, x.instrument);
  }
  // an octave fold can turn an added note into a unison with a drawn note of its route and instrument (a double stop, a roll, a
  // tremolo octave folded back): such a note adds nothing but a phasing click, so it is dropped
  const dupOf = new Map<string, PersonalNote[]>();
  for (const x of gestured) {
    if (x.show === false) continue;
    const k = `${x.route}|${String(x.instrument)}`;
    const l = dupOf.get(k);
    if (l) l.push(x);
    else dupOf.set(k, [x]);
  }
  const unison = (x: PersonalNote): boolean =>
    (dupOf.get(`${x.route}|${String(x.instrument)}`) ?? []).some((d) => d !== x && Math.abs(d.t - x.t) < 0.05 && Math.abs(12 * Math.log2(d.freq / x.freq)) < 0.5);
  const kept = gestured.filter((x) => sources.has(x) || x.show !== false || !unison(x));
  notes.splice(0, notes.length, ...kept.filter((x) => x.show !== false || sources.has(x) || x.t < END_T + 1.5));
  notes.sort((a, b) => a.t - b.t);
  // the box draws a route's notes one after another: a note is drawn only until the next one of its route begins (hidden notes are not drawn)
  const byRoute = new Map<number, PersonalNote[]>();
  for (const x of notes) if (roleOfNote.get(x) !== "drone" && x.show !== false) byRoute.set(x.route, [...(byRoute.get(x.route) ?? []), x]);
  for (const x of notes) if (roleOfNote.get(x) === "drone" || x.show === false) x.drawDur = x.d;
  for (const list of byRoute.values()) {
    list.sort((a, b) => a.t - b.t);
    list.forEach((x, k) => {
      const next = list.slice(k + 1).find((y) => y.t > x.t + 1e-6);
      x.drawDur = drawLength(x.d, next ? next.t - x.t : null);
    });
  }
  const end = Math.max(...notes.map((x) => x.t + x.d));
  let atBar = 0;
  const sections = FORM.map(([name, m]) => {
    const sec = { name, start: atBar * bar, end: (atBar + m) * bar };
    atBar += m;
    return sec;
  });
  const energy = Array.from({ length: 48 }, (_, i) => {
    const b = Math.min(BARS - 1, Math.floor(((i + 0.5) / 48) * BARS));
    return LEVEL[sectionOf(b).section];
  });
  return { notes, duration: Math.max(end, BARS * bar) + 1.5, hook, bpm, sections, energy, style };
}


/** the lengths of a bar's notes in eighths (each sums to 8), by how busy the part is */
const MOTIFS: Record<"sparse" | "mid" | "dense", number[][]> = {
  sparse: [[2, 2, 4], [4, 2, 2], [6, 2], [3, 3, 2], [4, 4]],
  mid: [[2, 2, 2, 2], [3, 1, 2, 2], [1, 1, 2, 2, 2], [2, 1, 1, 2, 2], [2, 2, 1, 1, 2]],
  dense: [[1, 1, 2, 1, 1, 2], [2, 1, 1, 1, 1, 2], [1, 1, 1, 1, 2, 2], [1, 1, 2, 2, 1, 1], [2, 1, 1, 2, 1, 1]],
};
const MOTIF_OF: Record<Section, "sparse" | "mid" | "dense"> = { intro: "sparse", verse: "mid", build: "dense", chorus: "dense", break: "sparse", outro: "sparse" };
/** the colour of a makam for Anatolian and Middle-Eastern routes: hicaz (a flat second, a raised third) and nihavend */
const HICAZ = [0, 1, 4, 5, 7, 8, 10];
const NIHAVEND = [0, 2, 3, 5, 7, 8, 11];
/** a tune moves by steps with now and then a leap: the moves (in scale degrees) a theme is made of */
const MOVES = [1, 1, -1, 0, 2, -2, 1, -1, 1, -1, 3, -3];
const TICKS = 12; // a beat is 12 ticks: an eighth is 6, a sixteenth 3, a triplet eighth 4
type RhythmFamily = "straight" | "syncopated" | "triplet" | "dotted";
const FAMILIES: RhythmFamily[] = ["straight", "syncopated", "triplet", "dotted", "straight", "syncopated"];

/**
 * A single route is a single voice, and it is given a tune. Every sixteen bars the voice plays one form:
 *   A (a theme of four bars) · A′ (the theme again, ending half-way home on the fifth) · B (the theme turned upside
 *   down and lifted, ending on the third) · A″ (the theme back, home on the root, held).
 * The whole shape also follows the flight (climbing at the start, high through the cruise, down for the landing). The
 * rhythm of the route is one of four families (straight, syncopated, triplets, dotted) and a makam colour in Anatolian
 * and Middle-Eastern routes. Nothing else is added: one instrument, one note at a time.
 */
function composeSolo(mode: PersonalMode, route: PersonalRoute, st: PersonalStyle & { bpm: number }, style: PersonalStyle): PersonalPiece {
  const beat = 60 / st.bpm;
  const bar = beat * 4;
  const tick = beat / TICKS;
  const h = routeHash(route.key);
  const makam = route.region === "DOM" || route.region === "MEA";
  const scale = makam ? (mode === "wish" ? NIHAVEND : HICAZ) : mode === "wish" ? MAJOR : MINOR;
  const prog = PROGS[mode][st.progression];
  const pal = PALETTES.symphonic.melody;
  // a route of a card without a piano (folk, makam, Latin, Iberian, Slavic...) never sings on it
  const pool = (pal[route.region] ?? pal.UNK).filter((c) => c !== "PNO" || !NO_PIANO_CARDS.has(style.cards?.[0] ?? "")).slice(0, 3);
  const inst: Instrument = pool[(h + st.ensemble) % pool.length];
  const family = FAMILIES[(h >> 3) % FAMILIES.length];
  const bright = inst === "NEY" || inst === "FLUTE" || inst === "OBOE" || inst === "CLA" || inst === "VIOLIN";
  const baseSemis = KEY_ROOT + st.shift + (bright ? 7 : 5);
  const pitchOf = (d: number): number => baseSemis + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const nearTone = (d: number, pcs: number[]): number => {
    const target = pitchOf(d);
    let best = d;
    let bd = Infinity;
    for (let k = d - 5; k <= d + 5; k++) {
      const p = pitchOf(k);
      if (pcs.some((t) => (((p - t) % 12) + 12) % 12 === 0) && Math.abs(p - target) < bd) {
        bd = Math.abs(p - target);
        best = k;
      }
    }
    return best;
  };

  // the theme: four bars of (rhythm, moves), fixed by the route
  const r = rng(h ^ 0x9e3779b9);
  const themeRhythm: number[][] = [0, 1, 2].map((k) => MOTIFS.mid[Math.floor(r() * MOTIFS.mid.length)]);
  themeRhythm[1] = themeRhythm[0].length === themeRhythm[1].length && r() < 0.5 ? themeRhythm[0] : themeRhythm[1]; // a tune repeats itself
  themeRhythm.push([2, 2, 4]);
  const themeMoves: number[][] = themeRhythm.map((rh) => rh.map(() => MOVES[Math.floor(r() * MOVES.length)]));
  themeMoves[0][0] = 0;
  // the contour must not wander: two steps in a row of the same direction at most three
  for (const mv of themeMoves) for (let i = 2; i < mv.length; i++) if (Math.abs(mv[i] + mv[i - 1] + mv[i - 2]) > 4) mv[i] = -Math.sign(mv[i]);

  const notes: PersonalNote[] = [];
  let deg = 0;
  const push = (tt: number, dt: number, d: number, vel: number, alt: number): void => {
    notes.push({ t: tt * tick, d: Math.max(0.06, dt * tick * 0.96), instrument: inst, freq: fitPitch(hz(pitchOf(d)), inst), vel: clamp(vel, 0.1, 1), key: route.key, route: 0, via: 0, alt });
  };

  for (let b = 0; b < BARS; b++) {
    const { section } = sectionOf(b);
    const within = b % 16;
    const partIdx = Math.floor(within / 4); // 0 A, 1 A', 2 B, 3 A''
    const inPart = within % 4;
    const chord = prog[Math.floor(b / 2) % prog.length];
    const cr = chord.root + st.shift;
    const chordPcs = [0, chord.third, 7].map((x) => cr + x);
    // the flight over sixteen bars
    const pFlight = (within + 0.5) / 16;
    const height = altitudeFt(pFlight, route.distKm) / cruiseFt(route.distKm);
    const lift = Math.round(height * 6) + (partIdx === 2 ? 2 : 0) + (section === "chorus" || section === "build" ? 1 : 0);
    // the bar's rhythm: the theme's, thinned in a sparse part, split into more notes in a busy one
    let rhythm = themeRhythm[inPart].slice();
    const busy = MOTIF_OF[section];
    if (inPart !== 3) {
      if (busy === "sparse" && rhythm.length > 3) rhythm = MOTIFS.sparse[(h + b) % MOTIFS.sparse.length].slice();
      if (busy === "dense") rhythm = rhythm.flatMap((len) => (len >= 2 && (len + b) % 2 === 0 ? [1, len - 1] : [len]));
    }
    // ticks of each note
    let ticks = rhythm.map((e) => e * 6);
    const odd = b % 2 === 1;
    if (family === "syncopated" && ticks.length >= 3 && inPart !== 3) {
      ticks = [ticks[0] - 3, ticks[1] + 3, ...ticks.slice(2)]; // the second note arrives a sixteenth early
    } else if (family === "triplet" && odd && inPart !== 3) {
      ticks = [8, 8, 8, 8, 8, 8].map((x) => x * 1).map((x) => x * 1).concat([]).map((x) => x); // six quarter-triplets: 48 ticks
    } else if (family === "dotted" && ticks.length >= 2 && inPart !== 3) {
      const [x, y] = [ticks[0], ticks[1]];
      if (x === y) ticks = [x * 1.5, y * 0.5, ...ticks.slice(2)];
    }
    // moves: the theme; B turns it upside down
    const sign = partIdx === 2 ? -1 : 1;
    const moves = themeMoves[inPart];
    let at = 0;
    ticks.forEach((len, k) => {
      const lastNote = k === ticks.length - 1;
      const cadence = inPart === 3 && lastNote;
      // each bar starts back near the middle, so that the climb of the flight (the lift) is what raises the tune
      if (k === 0) deg = nearTone(Math.trunc(deg / 2) + (inPart === 0 ? 0 : sign * (moves[0] ?? 0)), chordPcs);
      else deg += sign * (moves[Math.min(k, moves.length - 1)] ?? 0);
      if (cadence) {
        const end = partIdx === 1 ? cr + 7 : partIdx === 2 ? cr + chord.third : within === 15 && b === BARS - 1 ? KEY_ROOT + st.shift : cr;
        deg = nearTone(deg, [end]);
      }
      deg = clamp(deg, -4, 6);
      const hold = cadence && b === BARS - 1 ? 60 : 0;
      const tt = b * TICKS * 4 + at + (st.swing > 0 && Math.round(at / 6) % 2 === 1 && (at % 6 === 0) ? Math.round(st.swing * 6) : 0);
      const vel = LEVEL[section] * (0.58 + 0.3 * height) * (cadence ? 0.9 : 1);
      push(tt, len + hold, deg + (cadence ? 0 : lift), vel, altitudeFt(pFlight, route.distKm));
      at += len;
    });
  }
  // grace notes: a step above the important note, borrowed from the end of the one before it (the makam's ornament)
  if (makam || inst === "NEY" || inst === "VIOLIN") {
    for (let i = 1; i < notes.length; i++) {
      const n = notes[i];
      if (n.d > beat * 1.6 && notes[i - 1].d > tick * 6) {
        const prev = notes[i - 1];
        const g = { ...n, t: n.t - tick * 2, d: tick * 2, freq: fitPitch(n.freq * 2 ** (2 / 12), inst), vel: n.vel * 0.55 };
        prev.d = Math.min(prev.d, g.t - prev.t - 0.01);
        if (prev.d > 0.05) notes.splice(i, 0, g), i++;
      }
    }
  }
  notes.sort((x, y) => x.t - y.t);
  notes.forEach((x, k) => {
    const next = notes[k + 1];
    x.drawDur = next ? Math.max(0.05, Math.min(x.d, (next.t - x.t) * 0.92)) : x.d;
  });
  const end = Math.max(...notes.map((x) => x.t + x.d));
  let atBar = 0;
  const sections = FORM.map(([name, m]) => {
    const sec = { name, start: atBar * bar, end: (atBar + m) * bar };
    atBar += m;
    return sec;
  });
  const energy = Array.from({ length: 48 }, (_, i) => LEVEL[sectionOf(Math.min(BARS - 1, Math.floor(((i + 0.5) / 48) * BARS))).section]);
  const chorusStart = FORM.slice(0, 3).reduce((a, [, m]) => a + m, 0) * bar;
  return { notes, duration: Math.max(end, BARS * bar) + 1.5, hook: chorusStart, bpm: st.bpm, sections, energy, style };
}

/** an instrument's own range: above its ceiling or below its floor a note is moved by octaves */
function fitPitch(f: number, inst: PlayInstrument): number {
  const { cap, floor } = limitsOf(inst);
  let x = f;
  if (cap) while (x > cap) x /= 2;
  if (floor) while (x < floor) x *= 2;
  return x;
}
