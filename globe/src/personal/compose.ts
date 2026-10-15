import type { Instrument } from "../audio/theory";
import { euclid, routeHash } from "../audio/theory";
import type { PersonalMode } from "./codec";
import type { PersonalRoute } from "./routes";

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
}

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
const KEY_SHIFTS = [0, 0, -2, 2, -3, 3];
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
    [{ root: 5, third: 3 }, { root: 8, third: 4 }, { root: 3, third: 4 }, { root: 10, third: 3 }],
  ],
  wish: [
    [{ root: 5, third: 4 }, { root: 0, third: 4 }, { root: 2, third: 3 }, { root: 10, third: 4 }],
    [{ root: 5, third: 4 }, { root: 2, third: 3 }, { root: 10, third: 4 }, { root: 0, third: 4 }],
    [{ root: 5, third: 4 }, { root: 10, third: 4 }, { root: 0, third: 4 }, { root: 10, third: 4 }],
    [{ root: 2, third: 3 }, { root: 10, third: 4 }, { root: 5, third: 4 }, { root: 0, third: 4 }],
  ],
};
/** tempo ranges (bpm) keep a piece between about 2:25 and 3:15 */
const BPM_RANGE: Record<PersonalMode, [number, number]> = { visited: [82, 96], wish: [92, 106] };

type Section = "intro" | "verse" | "build" | "chorus" | "break" | "outro";
/** 64 bars: 8 intro, 16 verse, 8 build, 16 chorus, 8 break, 8 outro */
const FORM: [Section, number][] = [
  ["intro", 8],
  ["verse", 16],
  ["build", 8],
  ["chorus", 16],
  ["break", 8],
  ["outro", 8],
];
const BARS = FORM.reduce((s, [, n]) => s + n, 0);
const LEVEL: Record<Section, number> = { intro: 0.55, verse: 0.8, build: 0.9, chorus: 1, break: 0.6, outro: 0.5 };
/** how much busier a voice is in a section (added to its pulses) */
const BUSY: Record<Section, number> = { intro: -1, verse: 0, build: 1, chorus: 1, break: -1, outro: -1 };

/** what a route plays: the long routes hold the chord, the middle ones sing, the short ones pluck or drum */
type Role = "held" | "melody" | "pluck" | "perc";

const HELD: Record<string, Instrument[]> = {
  DOM: ["NEY", "VIOLA"], EUR: ["CELLO", "VIOLA", "BSN"], MEA: ["NEY", "CELLO"], AFR: ["HORN", "BSN"], ASI: ["FLUTE", "VIOLA"], AME: ["HORN", "CELLO"], UNK: ["VIOLA"],
};
const MELODY: Record<string, Instrument[]> = {
  DOM: ["SAZ", "NEY"], EUR: ["VIOLIN", "OBOE", "CLA"], MEA: ["KANUN", "OUD", "NEY"], AFR: ["MARIMBA", "XYLO"], ASI: ["HARP", "FLUTE", "GLOCK"], AME: ["FLUTE", "HORN", "CLA"], UNK: ["VIOLA"],
};
const PLUCK: Record<string, Instrument[]> = {
  DOM: ["SAZ", "OUD"], EUR: ["HARP", "VIOLIN_PIZZ"], MEA: ["KANUN", "OUD"], AFR: ["MARIMBA", "XYLO"], ASI: ["GLOCK", "HARP"], AME: ["HARP", "VIOLA_PIZZ"], UNK: ["HARP"],
};
const PERC: Record<string, Instrument> = { DOM: "DARBUKA", MEA: "DARBUKA", AFR: "CONGA", ASI: "TRI", EUR: "TIMP", AME: "TAMB", UNK: "TAMB" };

/** highest pitch (Hz) each pitched instrument is given; higher notes are folded down an octave */
const CEILING: Partial<Record<Instrument, number>> = {
  VIOLIN: 1320, VIOLA: 1000, STR: 1000, CELLO: 700, OBOE: 1175, CLA: 1175, FLUTE: 1400, PICC: 1568, HORN: 700,
  TPT: 1047, HARP: 1568, GLOCK: 1568, XYLO: 1319, MARIMBA: 1047, SAZ: 880, KANUN: 1175, OUD: 880, NEY: 1175, PNO: 1568, BSN: 466, TUBA: 220,
};

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

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
  return {
    bpm: lo + Math.floor(r() * (hi - lo + 1)),
    groove: Math.floor(r() * 6),
    arp: Math.floor(r() * 3),
    perc: Math.floor(r() * 3),
    ensemble: Math.floor(r() * 4),
    progression: Math.floor(r() * PROGS[mode].length),
    shift: KEY_SHIFTS[Math.floor(r() * KEY_SHIFTS.length)],
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
  const style: PersonalStyle = { groove: st.groove, arp: st.arp, perc: st.perc, ensemble: st.ensemble, progression: st.progression, shift: st.shift, swing: st.swing };
  if (routes.length === 0) return { notes: [], duration: 0, hook: 0, bpm, sections: [], energy: [], style };
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
  // the longest route and the first drawn one are the ones that keep playing through the break
  const keep = new Set<number>([0, sorted[n - 1].i]);
  // routes enter one after another over the first 28 bars, and leave in the same order through the outro
  const entry = routes.map((_, i) => Math.floor((i * 28) / n));
  const exit = routes.map((_, i) => BARS - 8 + 1 + Math.floor((i * 7) / n));

  const swingAt = (t0: number, step: number, stepsPerBeat: number): number => {
    const k = step / stepsPerBeat; // beats
    const off = Math.abs((k * 2) % 2 - 1) < 1e-6;
    return t0 + k * beat + (off ? st.swing * beat * 0.33 : 0);
  };
  const fit = (f: number, inst: Instrument): number => {
    const cap = CEILING[inst];
    let x = f;
    if (cap) while (x > cap) x /= 2;
    return x;
  };
  const push = (i: number, t: number, d: number, instrument: Instrument, f: number, vel: number): void => {
    notes.push({ t, d, instrument, freq: fit(f, instrument), vel: clamp(vel, 0.05, 1), key: routes[i].key, route: i, via: i });
  };

  // every route gets its own instrument where its region has enough of them
  const taken = new Set<string>();
  const choose = (list: Instrument[], h: number, i: number, role: string): Instrument => {
    for (let o = 0; o < list.length; o++) {
      const c = list[(h + st.ensemble + i + o) % list.length];
      if (!taken.has(c)) {
        taken.add(c);
        return c;
      }
    }
    return list[(h + st.ensemble + i) % list.length];
  };
  const voiceOf = routes.map((r, i) => {
    const h = routeHash(r.key + i);
    const role = roles[i];
    if (role === "held") return choose(HELD[r.region] ?? HELD.UNK, h, i, role);
    if (role === "melody") return choose(MELODY[r.region] ?? MELODY.UNK, h, i, role);
    if (role === "pluck") return choose(PLUCK[r.region] ?? PLUCK.UNK, h, i, role);
    return PERC[r.region] ?? "TAMB";
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
    const fade = section === "outro" ? 1 - ((b - first) / len) * 0.7 : 1;
    const v = (x: number): number => x * level * fade;
    const cr = chord.root + st.shift;
    const tones = [0, chord.third, 7].map((x) => cr + x);

    for (let i = 0; i < n; i++) {
      if (b < entry[i] || b >= exit[i]) continue;
      if (section === "break" && !keep.has(i)) continue;
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
        push(i, t0 + lag, bar - lag - beat * 0.05, inst, hz(tone), v(0.4 + 0.12 * rk));
      } else if (role === "melody") {
        const k = clamp(dens(h) + BUSY[section] - sparse, 1, 6);
        const pat = rotate(euclid(k, 8), (h >> 6) % 8);
        const inst = voiceOf[i];
        const onsets = pat.map((on, s) => (on ? s : -1)).filter((s) => s >= 0);
        onsets.forEach((s, oi) => {
          deg[i] += dir * stepSize * ((oi + b) % 3 === 0 ? 1 : 0) + (oi % 2 === 0 ? 0 : dir);
          const d = ((deg[i] % 7) + 7) % 7;
          const oct = Math.floor(deg[i] / 7);
          let semis = KEY_ROOT + st.shift + 12 + scale[d] + 12 * clamp(oct, -1, 1);
          if (s === onsets[0]) {
            // the first note of a bar rests on the nearest chord tone
            let best = semis;
            let bd = Infinity;
            for (const tn of tones) for (const o of [-12, 0, 12, 24]) {
              const c = tn + o;
              const dd = Math.abs(c - semis);
              if (dd < bd) { bd = dd; best = c; }
            }
            semis = best;
          }
          const nextStep = onsets[oi + 1] ?? 8;
          const dur = Math.max(0.4, (nextStep - s) * 0.5) * beat * 0.95;
          push(i, swingAt(t0, s, 2), dur, inst, hz(semis + (rk < 0.5 ? 12 : 0)), v(0.62 + 0.28 * (1 - rk)));
        });
      } else if (role === "pluck") {
        const steps = st.arp === 1 ? 12 : st.arp === 0 ? 16 : 8;
        const spb = steps / 4;
        const k = clamp(3 + ((h >> 4) % 3) + BUSY[section] - sparse, 2, steps - 2);
        const pat = rotate(euclid(k, steps), (h >> 8) % steps);
        const inst = voiceOf[i];
        const order = dir > 0 ? [0, 1, 2, 1] : [2, 1, 0, 1];
        let a = 0;
        pat.forEach((on, s) => {
          if (!on) return;
          const tone = tones[order[a++ % order.length]] + 24;
          push(i, swingAt(t0, s, spb), beat * 0.7, inst, hz(tone), v(0.34 + 0.12 * (s === 0 ? 1 : 0)));
        });
      } else {
        const steps = st.perc === 1 ? 12 : st.perc === 0 ? 16 : 8;
        const spb = steps / 4;
        const k = clamp(3 + (h % 4) + BUSY[section] - sparse, 2, steps - 2);
        const pat = rotate(euclid(k, steps), 0);
        const inst = voiceOf[i];
        pat.forEach((on, s) => {
          if (!on) return;
          const strong = s === 0 || s % spb === 0;
          // the darbuka's dum / tek / ka come from how hard the stroke is
          const vel = inst === "DARBUKA" ? (s === 0 ? 0.88 : strong ? 0.6 : 0.3) : strong ? 0.55 : 0.32;
          push(i, swingAt(t0, s, spb), beat * 0.5, inst, inst === "TIMP" ? hz(cr - 12) : 200, v(vel));
        });
      }
    }
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
