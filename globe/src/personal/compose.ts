import type { Instrument } from "../audio/theory";
import { routeHash } from "../audio/theory";
import type { PersonalMode } from "./codec";
import type { PersonalRoute } from "./routes";

/** one note of a personal piece; `t` is seconds from the start of the piece */
export interface PersonalNote {
  t: number;
  d: number;
  instrument: Instrument;
  freq: number;
  vel: number;
  /** route key — what lights on the globe when the note sounds ("" for accompaniment) */
  key: string;
  /** index into the routes; -1 for the accompaniment (pad, bass, arpeggio) */
  route: number;
}

export interface PersonalPiece {
  notes: PersonalNote[];
  duration: number;
  /** where the chorus starts (s) — the best 15 s of the piece */
  hook: number;
  bpm: number;
  /** the form, in seconds: where each part starts and ends */
  sections: { name: string; start: number; end: number }[];
  /** 48 samples of how loud the piece is (0..1) — drawn as the curve under the ribbon */
  energy: number[];
}

/** the key is D (minor for a journey, major for a wish); semitones above A2 */
const KEY_ROOT = 5;

/** semitones above A2 (110 Hz) → Hz */
const hz = (m: number): number => 110 * 2 ** (m / 12);

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

interface Chord {
  /** root, semitones above A2 */
  root: number;
  third: 3 | 4;
}
/** visited: i – VI – III – VII in D minor; wish: I – V – vi – IV in D major */
const PROG: Record<PersonalMode, Chord[]> = {
  visited: [{ root: 5, third: 3 }, { root: 1, third: 4 }, { root: 8, third: 4 }, { root: 3, third: 4 }],
  wish: [{ root: 5, third: 4 }, { root: 0, third: 4 }, { root: 2, third: 3 }, { root: 10, third: 4 }],
};
const BPM: Record<PersonalMode, number> = { visited: 84, wish: 100 };

const LEAD: Record<string, Instrument> = {
  DOM: "SAZ",
  EUR: "VIOLIN",
  MEA: "KANUN",
  AFR: "MARIMBA",
  ASI: "HARP",
  AME: "FLUTE",
  UNK: "PNO",
};

type Section = "intro" | "verse" | "build" | "chorus" | "break" | "outro";
/** 64 bars: 8 intro, 16 verse, 8 build, 16 chorus, 8 break, 8 outro — about 2:30–3:00 */
const FORM: [Section, number][] = [
  ["intro", 8],
  ["verse", 16],
  ["build", 8],
  ["chorus", 16],
  ["break", 8],
  ["outro", 8],
];
const BARS = FORM.reduce((s, [, n]) => s + n, 0);

const LEAD_BEATS: Record<Section, number[]> = {
  intro: [0],
  verse: [0, 2],
  build: [0, 1, 2, 3],
  chorus: [0, 1.5, 2, 3],
  break: [0, 2],
  outro: [0],
};
const LEVEL: Record<Section, number> = { intro: 0.55, verse: 0.8, build: 0.9, chorus: 1, break: 0.6, outro: 0.5 };
const ARP: Record<Section, boolean> = { intro: false, verse: true, build: true, chorus: true, break: false, outro: false };

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

/**
 * A full piece (a little under three minutes) built from the routes. Deterministic.
 * Each route is a motif: its hash picks the scale degrees, its distance the interval size and note length, its region the
 * instrument. The motifs go round the routes, so every place is heard again and again, over a chord progression that
 * changes under them. Pad, bass and a harp arpeggio carry the form; a chorus doubles the lead an octave up.
 */
export function composePiece(mode: PersonalMode, routes: PersonalRoute[]): PersonalPiece {
  const bpm = BPM[mode];
  if (routes.length === 0) return { notes: [], duration: 0, hook: 0, bpm, sections: [], energy: [] };
  const beat = 60 / bpm;
  const bar = beat * 4;
  const scale = mode === "wish" ? MAJOR : MINOR;
  const prog = PROG[mode];
  const dists = routes.map((r) => r.distKm).sort((a, b) => a - b);
  const rank = (d: number): number => (dists.length < 2 ? 0.5 : dists.indexOf(d) / (dists.length - 1));
  const notes: PersonalNote[] = [];
  const push = (n: Omit<PersonalNote, "key" | "route"> & { key?: string; route?: number }) =>
    notes.push({ key: "", route: -1, ...n });

  let hook = 0;
  let lead = 0; // round-robin over the routes, one step per lead note
  for (let b = 0; b < BARS; b++) {
    const { section, first, len } = sectionOf(b);
    if (section === "chorus" && b === first) hook = b * bar;
    const t0 = b * bar;
    const chord = prog[Math.floor(b / 2) % prog.length];
    const level = LEVEL[section];
    // a fade over the outro
    const fade = section === "outro" ? 1 - ((b - first) / len) * 0.7 : 1;
    const v = (x: number): number => clamp(x * level * fade, 0.05, 1);
    const tones = [0, chord.third, 7].map((i) => chord.root + i);

    // pad: the chord, held for two bars, re-struck on every second bar
    if (b % 2 === 0) for (const m of tones) push({ t: t0, d: bar * 2 * 0.98, instrument: "STR", freq: hz(m + 12), vel: v(0.34) });
    // bass: root on beats 1 and 3 (chorus: eighths on the root and fifth)
    const bassBeats = section === "chorus" ? [0, 1, 2, 3] : section === "intro" || section === "outro" ? [0] : [0, 2];
    bassBeats.forEach((k, i) => push({ t: t0 + k * beat, d: beat * 0.9, instrument: "CELLO", freq: hz(chord.root - 12 + (section === "chorus" && i % 2 === 1 ? 7 : 0)), vel: v(0.5) }));
    // arpeggio: eighth notes up and down the chord
    if (ARP[section]) {
      const order = [0, 1, 2, 1, 0, 1, 2, 1];
      order.forEach((ti, k) => push({ t: t0 + k * beat * 0.5, d: beat * 0.7, instrument: "HARP", freq: hz(tones[ti] + 24), vel: v(0.28 + (k % 2 === 0 ? 0.06 : 0)) }));
    }

    // lead: the route motifs
    for (const slot of LEAD_BEATS[section]) {
      const i = lead % routes.length;
      const r = routes[i];
      const h = routeHash(r.key + i);
      const rk = rank(r.distKm);
      const step = r.distKm < 1500 ? 1 : r.distKm < 4000 ? 2 : 3;
      const degree = (h + lead * step) % scale.length;
      let semis = KEY_ROOT + 12 + scale[degree] + (rk > 0.66 ? -12 : rk < 0.33 ? 12 : 0);
      // strong beats rest on the nearest chord tone, so the motif always agrees with the chord under it
      if (slot === 0) {
        let best = semis;
        let bd = Infinity;
        for (const tone of tones) {
          for (const o of [-12, 0, 12, 24]) {
            const cand = tone + o;
            const dd = Math.abs(cand - semis);
            if (dd < bd) {
              bd = dd;
              best = cand;
            }
          }
        }
        semis = best;
      }
      const d = beat * (slot === 0 ? 1.4 + rk * 2.2 : 0.7 + rk * 0.9);
      const inst = LEAD[r.region] ?? "PNO";
      push({ t: t0 + slot * beat, d, instrument: inst, freq: hz(semis), vel: v(0.62 + 0.3 * (1 - rk)), key: r.key, route: i });
      if (section === "chorus") push({ t: t0 + slot * beat, d, instrument: inst, freq: hz(semis + 12), vel: v(0.34) });
      lead++;
    }
  }
  // the last chord rings out
  const last = prog[Math.floor((BARS - 1) / 2) % prog.length];
  for (const i of [0, last.third, 7]) push({ t: BARS * bar, d: bar * 1.6, instrument: "STR", freq: hz(last.root + 12 + i), vel: 0.2 });
  const end = Math.max(...notes.map((n) => n.t + n.d));
  let at = 0;
  const sections = FORM.map(([name, n]) => {
    const sec = { name, start: at * bar, end: (at + n) * bar };
    at += n;
    return sec;
  });
  const energy = Array.from({ length: 48 }, (_, i) => {
    const b = Math.min(BARS - 1, Math.floor(((i + 0.5) / 48) * BARS));
    const { section } = sectionOf(b);
    return LEVEL[section];
  });
  return { notes, duration: end + 1.5, hook, bpm, sections, energy };
}
