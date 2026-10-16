import type { Instrument } from "../audio/theory";
import { euclid, routeHash } from "../audio/theory";
import type { PersonalMode } from "./codec";
import type { PersonalRoute } from "./routes";
import { altitudeFt, cruiseFt, drawLength } from "./flight";
import { planCards } from "./genres";
import { tuneFor, varyTune } from "./melodies";
export { altitudeFt, cruiseFt };

/** one note of a personal piece; `t` is seconds from the start of the piece */
export interface PersonalNote {
  t: number;
  d: number;
  instrument: Instrument;
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
}

/** the choices that make one person's piece differ from another's, beyond the notes themselves */
export interface PersonalStyle {
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
    melody: { EUR: ["PNO", "VIOLIN", "OBOE", "CLA"], AME: ["PNO", "HORN", "TPT", "FLUTE"], ASI: ["PNO", "FLUTE", "VIOLIN", "OBOE"], AFR: ["CLA", "PNO", "OBOE", "TPT"], MEA: ["PNO", "OBOE", "NEY", "VIOLIN"], DOM: ["PNO", "VIOLIN", "NEY", "OBOE"], UNK: ["PNO", "VIOLIN"] },
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
    held: { DOM: ["NEY", "VIOLA"], EUR: ["CELLO", "VIOLA", "BSN"], MEA: ["NEY", "CELLO"], AFR: ["HORN", "BSN"], ASI: ["FLUTE", "VIOLA"], AME: ["HORN", "CELLO"], UNK: ["VIOLA"] },
    melody: { DOM: ["SAZ", "NEY"], EUR: ["VIOLIN", "OBOE", "CLA"], MEA: ["KANUN", "OUD", "NEY"], AFR: ["MARIMBA", "XYLO"], ASI: ["HARP", "FLUTE", "GLOCK"], AME: ["FLUTE", "HORN", "CLA"], UNK: ["VIOLA"] },
    pluck: { DOM: ["SAZ", "OUD"], EUR: ["HARP", "VIOLIN_PIZZ"], MEA: ["KANUN", "OUD"], AFR: ["MARIMBA", "XYLO"], ASI: ["GLOCK", "HARP"], AME: ["HARP", "VIOLA_PIZZ"], UNK: ["HARP"] },
    perc: { DOM: "DARBUKA", MEA: "DARBUKA", AFR: "CONGA", ASI: "TRI", EUR: "TIMP", AME: "TAMB", UNK: "TAMB" },
  },
  // hand drums and mallets in front
  pulse: {
    held: { DOM: ["CELLO", "NEY"], EUR: ["CELLO", "BSN"], MEA: ["CELLO", "NEY"], AFR: ["BSN", "HORN"], ASI: ["VIOLA", "FLUTE"], AME: ["HORN", "CELLO"], UNK: ["CELLO"] },
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
  // the music of the place the trip starts from sets the tempo, the family of sound and (in composePiece) the scale
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
export function composePiece(mode: PersonalMode, routes: PersonalRoute[]): PersonalPiece {
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
  // the second, third … route with the same role: a second voice that joins in the chorus and the build
  const occ: number[] = routes.map((_, i) => role.slice(0, i).filter((q) => q === role[i]).length);
  const phraseBars = routes.map((_, i) => clamp(Math.round(4 + 12 * (rank.get(i) ?? 0.5)), 4, 16));
  const phaseAt = (i: number, b: number, frac: number): number => ((((b % phraseBars[i]) + phraseBars[i]) % phraseBars[i]) + frac) / phraseBars[i];

  const fit = (f: number, inst: Instrument): number => {
    const cap = CEILING[inst];
    const floor = FLOOR[inst];
    let x = f;
    if (cap) while (x > cap) x /= 2;
    if (floor) while (x < floor) x *= 2;
    return x;
  };
  const push = (i: number, t: number, d: number, instrument: Instrument, f: number, vel: number, p = 0.5): void => {
    notes.push({ t, d, instrument, freq: fit(f, instrument), vel: clamp(vel, 0.05, 1), key: routes[i].key, route: i, via: i, alt: altitudeFt(p, routes[i].distKm) });
  };

  // every route gets its own instrument where its card has enough of them
  const taken = new Set<string>();
  let pianos = 0;
  const choose = (list: Instrument[], h: number, i: number, kind: "melody" | "pluck" | "other"): Instrument => {
    // the piano is a prominent voice: a hook and an arpeggio may take it; the other instruments are not repeated
    if (list.includes("PNO") && pianos < 2 && kind !== "other" && (pianos === 0 || kind === "pluck")) {
      pianos++;
      return "PNO";
    }
    for (let o = 0; o < list.length; o++) {
      const c = list[(h + st.ensemble + i + o) % list.length];
      if (c !== "PNO" && !taken.has(c)) {
        taken.add(c);
        return c;
      }
    }
    return list[(h + st.ensemble + i) % list.length];
  };
  const voiceOf: Instrument[] = routes.map((r, i) => {
    const h = routeHash(r.key + i);
    const card = plan.perRoute[i];
    const folkish = card.family === "folk" || card.family === "pulse";
    switch (role[i]) {
      case "pad": return choose(card.held, h, i, "other");
      case "bass": return choose(card.held.filter((x) => x !== "PNO"), h, i + 1, "other");
      case "hook": return choose(card.melody, h, i, "melody");
      case "pluck": return choose(card.pluck, h, i, "pluck");
      case "backbeat": return card.perc;
      case "kick": return folkish ? card.perc : "TIMP";
      default: return folkish && card.perc !== "DARBUKA" ? card.perc : "TRI";
    }
  });
  // with more than three routes the piano is always there, as a steady voice (the arpeggio first, else the hook)
  if (n > 3 && !voiceOf.includes("PNO")) {
    const at = role.indexOf("pluck") >= 0 ? role.indexOf("pluck") : role.indexOf("hook");
    if (at >= 0) voiceOf[at] = "PNO";
  }

  // the groove of one bar: the figure of the main card, stretched to four beats
  const fig = plan.main.cell;
  const figTotal = fig.reduce((x, y) => x + Math.abs(y), 0);
  const slots: { start: number; len: number; hit: boolean; accent: number }[] = [];
  {
    let at = 0;
    fig.forEach((c, k) => {
      const len = (Math.abs(c) / figTotal) * 4;
      slots.push({ start: at, len, hit: c > 0, accent: plan.main.accent?.[k] || 1 });
      at += len;
    });
  }
  const hits = slots.filter((x) => x.hit);
  const strong = hits.filter((x, k) => k === 0 || x.accent >= 1.1).slice(0, 4);
  const swingAmt = plan.main.swing ?? st.swing;
  const POP_PROGS: Record<PersonalMode, [number, 3 | 4][][]> = {
    visited: [[[0, 3], [8, 4], [3, 4], [10, 4]], [[0, 3], [10, 4], [8, 4], [10, 4]], [[0, 3], [5, 3], [8, 4], [7, 4]], [[0, 3], [8, 4], [3, 4], [7, 4]]],
    wish: [[[0, 4], [7, 4], [9, 3], [5, 4]], [[9, 3], [5, 4], [0, 4], [7, 4]], [[0, 4], [9, 3], [5, 4], [7, 4]], [[0, 4], [5, 4], [9, 3], [7, 4]]],
  };
  // a well-known melody for the hook (only when it suits the scale of the card): the chords then follow its mode
  const tune = tuneFor(plan.main, mode, routes);
  if (tune) style.tune = tune.id;
  const popProg: Chord[] = (tune ? POP_PROGS[tune.mode === "major" ? "wish" : "visited"][st.progression % 4] : plan.main.prog ?? POP_PROGS[mode][st.progression % POP_PROGS[mode].length]).map(([off, third]) => ({ root: KEY_ROOT + off, third }));

  // the hook of each hook route: two bars of scale degrees (an arch that comes back to a chord tone), built from the route
  const L = scale.length;
  const motifs = routes.map((r, i) => {
    if (role[i] !== "hook") return null;
    const hh = routeHash(r.key + "hook" + i);
    const rnd = rng(hh);
    const dir = r.toLon >= r.fromLon ? 1 : -1;
    const make = (end: number): number[] => {
      const out: number[] = [];
      let d = [0, 2, 4][Math.floor(rnd() * 3)] + (occ[i] % 2) * 2;
      for (let k = 0; k < hits.length; k++) {
        out.push(d);
        const step = rnd() < 0.7 ? dir : -dir;
        d += rnd() < 0.18 ? step * 2 : step * (rnd() < 0.8 ? 1 : 0);
        if (d > 7) d -= 2;
        if (d < -2) d += 2;
      }
      out[out.length - 1] = end;
      return out;
    };
    return [make(2), make(0), make(2), make(4)] as number[][]; // four bars: A B A B′
  });

  const ACTIVE: Record<Section, PopRole[]> = {
    intro: ["pad", "bass", "pluck", "hat"],
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

  for (let b = 0; b < BARS; b++) {
    const { section, first, len: slen } = sectionOf(b);
    const t0 = b * bar;
    const level = LEVEL[section];
    const fade = section === "outro" ? 1 - ((b - first) / slen) * 0.3 : 1;
    const v = (x: number): number => x * level * fade;
    const chord = popProg[b % popProg.length];
    const cr = chord.root + st.shift;
    const tones = [0, chord.third, 7].map((x) => cr + x);
    const full = section === "chorus" || section === "build";
    for (let i = 0; i < n; i++) {
      const rl = role[i];
      if (!ACTIVE[section].includes(rl)) continue;
      // a second voice of a role only joins in the chorus and the build
      if (occ[i] > 0 && !full) continue;
      const r = routes[i];
      const inst = voiceOf[i];
      const rk = rank.get(i) ?? 0.5;
      const p0 = phaseAt(i, b, 0);
      if (rl === "pad") {
        // the chord, re-struck on beats one and three, one tone per pad route, rolled a little
        [0, 2].forEach((bt, k) => push(i, t0 + bt * beat + (occ[i] % 3) * 0.04, beat * 1.9, inst, hz(tones[(occ[i] + k) % 3] + 12 * ((occ[i] + k) % 2)), v(0.4 + 0.1 * rk), phaseAt(i, b, bt / 4)));
      } else if (rl === "bass") {
        const roots = strong.length ? strong : [slots[0]];
        roots.forEach((sl, k) => {
          const next = roots[k + 1]?.start ?? 4;
          const tone = (b % 4 === 3 && k === roots.length - 1 ? tones[2] : tones[0]) - 12 + (occ[i] > 0 ? 12 : 0);
          push(i, t0 + sl.start * beat, Math.min(1.5, Math.max(0.5, next - sl.start)) * beat * 0.92, inst, hz(tone), v(0.62 * sl.accent), phaseAt(i, b, sl.start / 4));
        });
      } else if (rl === "hook" && tune && occ[i] === 0) {
        // the melody plays through when its bars begin: once in a verse, every time in the build, chorus and break
        const startOk = section === "verse" ? Math.floor((b - first) / tune.bars) % 2 === 0 && (b - first) % tune.bars === 0 : b % tune.bars === 0;
        if (!startOk) continue;
        let off = 0;
        // a relative of the tune, a different one on every turn: the same shape, a few passing notes moved
        const turn = varyTune(tune, routeHash(tune.id + routes.map((r) => r.key).join(">")) + Math.floor(b / tune.bars));
        for (const [semis, beats] of turn) {
          const when = t0 + off * beat;
          if (when < END_T - 1e-6) push(i, when, beats * beat * 0.95, inst, hz(KEY_ROOT + st.shift + 12 + semis), v(0.78), phaseAt(i, b + Math.floor(off / 4), (off % 4) / 4));
          off += beats;
        }
      } else if (rl === "hook") {
        // in the verse the hook only answers (two bars of four); in the chorus it is there all the time
        if (section === "verse" && b % 4 >= 2) continue;
        const m = motifs[i]![b % 4];
        let hi = 0;
        slots.forEach((sl, k) => {
          if (!sl.hit) return;
          const lift = Math.round((altitudeFt(phaseAt(i, b, sl.start / 4), r.distKm) / 39000) * 3);
          const total = m[hi] + lift + (section === "chorus" ? L : 0) + (occ[i] > 0 ? 2 : 0);
          hi++;
          let semis = KEY_ROOT + st.shift + scale[((total % L) + L) % L] + 12 * Math.floor(total / L);
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
          const nextRest = slots[k + 1] && !slots[k + 1].hit ? slots[k + 1].len : 0;
          push(i, t0 + sl.start * beat + (k % 2 ? swingAmt * beat * 0.33 * sl.len : 0), (sl.len + nextRest * 0.9) * beat * 0.95, inst, hz(semis), v((0.6 + 0.3 * (1 - rk)) * sl.accent), phaseAt(i, b, sl.start / 4));
        });
      } else if (rl === "pluck") {
        const seqTones = [0, 1, 2, 1].map((x) => (x + i) % 3);
        for (let e = 0; e < 8; e++) {
          const p = phaseAt(i, b, e / 8);
          const tone = tones[seqTones[(e + (occ[i] ? 1 : 0)) % 4]] + (altitudeFt(p, r.distKm) / cruiseFt(r.distKm) > 0.55 ? 12 : 0);
          push(i, t0 + e * 0.5 * beat + (e % 2 ? swingAmt * beat * 0.33 : 0), beat * 0.48, inst, hz(tone), v(e % 4 === 0 ? 0.42 : 0.3), p);
        }
      } else if (rl === "backbeat") {
        [1, 3].forEach((bt) => push(i, t0 + bt * beat, beat * 0.35, inst, 200, v(0.55), phaseAt(i, b, bt / 4)));
        if (section === "build") push(i, t0 + 3.5 * beat, beat * 0.25, inst, 200, v(0.4), phaseAt(i, b, 0.9));
      } else if (rl === "kick") {
        const beats = section === "build" ? [0, 1, 2, 3] : [0, 2];
        beats.forEach((bt) => push(i, t0 + bt * beat, beat * 0.4, inst, inst === "TIMP" ? hz(cr - 12) : 200, v(bt === 0 ? 0.8 : 0.6), phaseAt(i, b, bt / 4)));
      } else {
        for (let e = 0; e < 8; e++) push(i, t0 + e * 0.5 * beat + (e % 2 ? swingAmt * beat * 0.33 : 0), beat * 0.2, inst, 200, v(e % 2 ? 0.3 : 0.2), phaseAt(i, b, e / 8));
      }
    }
  }
  // the box draws a route's notes one after another: a note is drawn only until the next one of its route begins
  const byRoute = new Map<number, PersonalNote[]>();
  for (const x of notes) byRoute.set(x.route, [...(byRoute.get(x.route) ?? []), x]);
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
  const pool = (pal[route.region] ?? pal.UNK).slice(0, 3);
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
function fitPitch(f: number, inst: Instrument): number {
  const cap = CEILING[inst];
  const floor = FLOOR[inst];
  let x = f;
  if (cap) while (x > cap) x /= 2;
  if (floor) while (x < floor) x *= 2;
  return x;
}
