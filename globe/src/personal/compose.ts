import type { Instrument } from "../audio/theory";
import { euclid, routeHash } from "../audio/theory";
import type { PersonalMode } from "./codec";
import type { PersonalRoute } from "./routes";
import { altitudeFt, cruiseFt, drawLength } from "./flight";
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
const BUSY: Record<Section, number> = { intro: -1, verse: 0, build: 1, chorus: 1, break: -1, outro: -1 };

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
  const [lo, hi] = BPM_RANGE[mode];
  // mostly symphonic; a mostly Turkish / Middle-Eastern selection leans to the folk sound
  const anatolian = routes.length === 0 ? 0 : routes.filter((x) => x.region === "DOM" || x.region === "MEA").length / routes.length;
  const g = r();
  // mostly the symphonic sound built from the routes' own voices; chamber, folk and pulse families come now and then
  const genre: Genre = anatolian >= 0.5 && g < 0.4 ? "folk" : g < 0.72 ? "symphonic" : g < 0.86 ? "chamber" : g < 0.94 ? "folk" : "pulse";
  return {
    genre,
    bpm: lo + Math.floor(r() * (hi - lo + 1)),
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
  const style: PersonalStyle = { groove: st.groove, arp: st.arp, perc: st.perc, ensemble: st.ensemble, progression: st.progression, shift: st.shift, swing: st.swing, genre: st.genre };
  if (routes.length === 0) return { notes: [], duration: 0, hook: 0, bpm, sections: [], energy: [], style };
  // one route: one instrument singing one melody that climbs and falls with the flight and comes home
  if (routes.length === 1) return composeSolo(mode, routes[0], st, style);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const n = routes.length;
  const scale = mode === "wish" ? MAJOR : MINOR;
  const prog = PROGS[mode][st.progression];
  const notes: PersonalNote[] = [];

  // roles by the length of the route
  const sorted = routes.map((r, i) => ({ i, d: r.distKm })).sort((a, b) => a.d - b.d || a.i - b.i);
  const rank = new Map<number, number>();
  sorted.forEach((x, k) => rank.set(x.i, n < 2 ? 0.5 : k / (n - 1)));
  const roles: Role[] = routes.map((_, i) => {
    const rk = rank.get(i) ?? 0.5;
    if (n === 1) return "melody";
    if (n === 2) return rk < 0.5 ? "pluck" : "melody";
    if (rk >= 0.67) return "held";
    if (rk < 0.25 && n >= 4) return "perc";
    return rk < 0.5 ? "pluck" : "melody";
  });
  let heldIdx = 0;
  const heldSlot = roles.map((r) => (r === "held" ? heldIdx++ : -1));
  // routes come in one after another over the first 12 bars (the AI pieces start already at a quarter to a half of their
  // loudest) and play to the end, which stays at about 60 %
  const entry = routes.map((_, i) => Math.floor((i * 12) / n));
  const exit = routes.map(() => BARS + 1);
  // a route's phrase is one flight: take-off, climb, cruise, descent, landing — longer for a longer route
  const phraseBars = routes.map((_, i) => clamp(Math.round(4 + 12 * (rank.get(i) ?? 0.5)), 4, 16));
  const phaseAt = (i: number, b: number, frac: number): number => ((((b - entry[i]) % phraseBars[i]) + phraseBars[i]) % phraseBars[i] + frac) / phraseBars[i];

  const swingAt = (t0: number, step: number, stepsPerBeat: number): number => {
    const k = step / stepsPerBeat; // beats
    const off = Math.abs((k * 2) % 2 - 1) < 1e-6;
    return t0 + k * beat + (off ? st.swing * beat * 0.33 : 0);
  };
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

  // every route gets its own instrument where its region has enough of them
  const taken = new Set<string>();
  let pianos = 0;
  const choose = (list: Instrument[], h: number, i: number, role: string): Instrument => {
    // the piano is a prominent voice: two routes may take it (a singing one and a plucking one); the other instruments
    // are not repeated
    if (list.includes("PNO") && pianos < 2 && (role === "melody" || role === "pluck") && (pianos === 0 || role === "pluck")) {
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
  const voiceOf = routes.map((r, i) => {
    const h = routeHash(r.key + i);
    const role = roles[i];
    const pal = PALETTES[st.genre];
    if (role === "held") return choose(pal.held[r.region] ?? pal.held.UNK, h, i, role);
    if (role === "melody") return choose(pal.melody[r.region] ?? pal.melody.UNK, h, i, role);
    if (role === "pluck") return choose(pal.pluck[r.region] ?? pal.pluck.UNK, h, i, role);
    return pal.perc[r.region] ?? "TAMB";
  });

  let hook = 0;
  // per-voice walk state
  const deg = routes.map((r, i) => routeHash(r.key + i) % scale.length);
  // pulses a bar for a singing voice; with only a few routes each voice carries more of the piece
  const lone = n <= 2 ? 2 : n <= 4 ? 1 : 0;
  const dens = (h: number): number => 2 + (h % 3) + (st.groove >= 3 ? 1 : 0) - (st.groove === 0 ? 1 : 0) + lone;

  for (let b = 0; b < BARS; b++) {
    const { section, first, len } = sectionOf(b);
    if (section === "chorus" && b === first) hook = b * bar;
    const t0 = b * bar;
    const chord = prog[Math.floor(b / 2) % prog.length];
    const level = LEVEL[section];
    const fade = section === "outro" ? 1 - ((b - first) / len) * 0.25 : 1;
    const v = (x: number): number => x * level * fade;
    const cr = chord.root + st.shift;
    const tones = [0, chord.third, 7].map((x) => cr + x);

    for (let i = 0; i < n; i++) {
      if (b < entry[i] || b >= exit[i]) continue;
      const r = routes[i];
      const h = routeHash(r.key + i);
      const role = roles[i];
      const rk = rank.get(i) ?? 0.5;
      const dir = r.toLon >= r.fromLon ? 1 : -1;
      const stepSize = r.distKm < 1500 ? 1 : r.distKm < 4000 ? 2 : 3;
      // many routes: each is a little sparser, so twenty voices do not become noise
      const sparse = Math.floor(n / 8);

      if (role === "held") {
        // the chord, one tone per long route, rolled: each long route enters a little after the one before it and holds
        // to the end of the bar, so the music box shows a staircase and not three bars on top of each other
        const slot = heldSlot[i];
        const tone = tones[slot % 3] + (slot >= 3 ? 12 : 0);
        const inst = voiceOf[i];
        const lag = (slot % 4) * beat * 0.5;
        push(i, t0 + lag, bar - lag - beat * 0.05, inst, hz(tone), v(0.4 + 0.12 * rk), phaseAt(i, b, 0));
      } else if (role === "melody") {
        const k = clamp(dens(h) + BUSY[section] - sparse, 1, 6);
        const pat = rotate(euclid(k, 8), (h >> 6) % 8);
        const inst = voiceOf[i];
        const onsets = pat.map((on, s) => (on ? s : -1)).filter((s) => s >= 0);
        onsets.forEach((s, oi) => {
          deg[i] += dir * stepSize * ((oi + b) % 3 === 0 ? 1 : 0) + (oi % 2 === 0 ? 0 : dir);
          // the line climbs with the aircraft: the altitude of this moment of the flight lifts the walk up to an octave
          const p = phaseAt(i, b, s / 8);
          const lift = Math.round((altitudeFt(p, r.distKm) / 39000) * 5);
          const w = ((deg[i] % 7) + 7) % 7;
          // two flights at the same altitude are not the same note: each route sits at its own degree of the scale
          const total = w + lift + ((i * 2) % 5);
          let semis = KEY_ROOT + st.shift - 12 + scale[total % 7] + 12 * Math.floor(total / 7);
          if (s === onsets[0]) {
            // the first note of a bar rests on the nearest chord tone
            let best = semis;
            let bd = Infinity;
            // ... and on its own chord tone (root, third, fifth by route), so the voices do not land on one pitch
            for (const tn of [tones[i % 3]]) for (const o of [-12, 0, 12, 24]) {
              const c = tn + o;
              const dd = Math.abs(c - semis);
              if (dd < bd) { bd = dd; best = c; }
            }
            semis = best;
          }
          const nextStep = onsets[oi + 1] ?? 8;
          const dur = Math.max(0.4, (nextStep - s) * 0.5) * beat * 0.95;
          push(i, swingAt(t0, s, 2), dur, inst, hz(semis), v(0.62 + 0.28 * (1 - rk)), p);
        });
      } else if (role === "pluck") {
        const steps = st.arp === 1 ? 12 : st.arp === 0 ? 16 : 8;
        const spb = steps / 4;
        const k = clamp(3 + ((h >> 4) % 3) + BUSY[section] - sparse, 2, steps - 2);
        const pat = rotate(euclid(k, steps), (h >> 8) % steps);
        const inst = voiceOf[i];
        const order = (dir > 0 ? [0, 1, 2, 1] : [2, 1, 0, 1]).map((x) => (x + i) % 3);
        let a = 0;
        pat.forEach((on, s) => {
          if (!on) return;
          const p = phaseAt(i, b, s / steps);
          const tone = tones[order[a++ % order.length]] + (altitudeFt(p, r.distKm) / cruiseFt(r.distKm) > 0.55 ? 12 : 0);
          push(i, swingAt(t0, s, spb), beat * 0.7, inst, hz(tone), v(0.34 + 0.12 * (s === 0 ? 1 : 0)), p);
        });
      } else {
        // an orchestra's percussion is sparing: timpani, triangle and tambourine land on the beats, a few times a bar
        const orchestral = st.genre === "symphonic" || st.genre === "chamber";
        const steps = orchestral ? 8 : st.perc === 1 ? 12 : st.perc === 0 ? 16 : 8;
        const spb = steps / 4;
        const k = orchestral ? clamp(1 + (h % 2) + (BUSY[section] > 0 ? 1 : 0) - (sparse > 0 ? 1 : 0), 1, 3) : clamp(3 + (h % 4) + BUSY[section] - sparse, 2, steps - 2);
        const pat = rotate(euclid(k, steps), orchestral ? 0 : 0);
        const inst = voiceOf[i];
        pat.forEach((on, s) => {
          if (!on) return;
          const strong = s === 0 || s % spb === 0;
          // the darbuka's dum / tek / ka come from how hard the stroke is
          const vel = inst === "DARBUKA" ? (s === 0 ? 0.88 : strong ? 0.6 : 0.3) : strong ? 0.55 : 0.32;
          push(i, swingAt(t0, s, spb), beat * 0.5, inst, inst === "TIMP" ? hz(cr - 12) : 200, v(vel), phaseAt(i, b, s / steps));
        });
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
      x.drawDur = drawLength(rank.get(x.route) ?? 0.5, x.d, next ? next.t - x.t : null);
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
