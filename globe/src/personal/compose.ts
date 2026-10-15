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
  /** the route this note belongs to for display (the lead of its bar): every hit shows in the music box in its route's colour */
  via: number;
}

/** the choices that make one person's piece differ from another's, beyond the notes themselves */
export interface PersonalStyle {
  /** lead / bass rhythm family 0..5 */
  groove: number;
  /** arpeggio figure 0..5 */
  arp: number;
  /** percussion figure 0..5 */
  perc: number;
  /** orchestration 0..3 (chamber, orchestra, winds, pizzicato) */
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

/** semitones above A2 (110 Hz) → Hz */
const hz = (m: number): number => 110 * 2 ** (m / 12);

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

interface Chord {
  /** root, semitones above A2 (in D) */
  root: number;
  third: 3 | 4;
}
/** four progressions per mood (roots as in D) */
const PROGS: Record<PersonalMode, Chord[][]> = {
  visited: [
    [{ root: 5, third: 3 }, { root: 1, third: 4 }, { root: 8, third: 4 }, { root: 3, third: 4 }], // i – VI – III – VII
    [{ root: 5, third: 3 }, { root: 10, third: 3 }, { root: 1, third: 4 }, { root: 0, third: 4 }], // i – iv – VI – V
    [{ root: 5, third: 3 }, { root: 3, third: 4 }, { root: 1, third: 4 }, { root: 3, third: 4 }], // i – VII – VI – VII
    [{ root: 5, third: 3 }, { root: 8, third: 4 }, { root: 3, third: 4 }, { root: 10, third: 3 }], // i – III – VII – iv
  ],
  wish: [
    [{ root: 5, third: 4 }, { root: 0, third: 4 }, { root: 2, third: 3 }, { root: 10, third: 4 }], // I – V – vi – IV
    [{ root: 5, third: 4 }, { root: 2, third: 3 }, { root: 10, third: 4 }, { root: 0, third: 4 }], // I – vi – IV – V
    [{ root: 5, third: 4 }, { root: 10, third: 4 }, { root: 0, third: 4 }, { root: 10, third: 4 }], // I – IV – V – IV
    [{ root: 2, third: 3 }, { root: 10, third: 4 }, { root: 5, third: 4 }, { root: 0, third: 4 }], // vi – IV – I – V
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

/** where the lead notes fall in a bar (beats), per rhythm family and section */
const LEAD_BEATS: Record<Section, number[]>[] = [
  { intro: [0], verse: [0, 2], build: [0, 1, 2, 3], chorus: [0, 1.5, 2, 3], break: [0, 2], outro: [0] }, // straight
  { intro: [0], verse: [0, 1.5, 3], build: [0, 0.75, 1.5, 2.5, 3], chorus: [0, 0.75, 1.5, 2.5, 3.25], break: [0, 2.5], outro: [0, 2] }, // syncopated
  { intro: [0], verse: [0, 4 / 3, 8 / 3], build: [0, 4 / 3, 8 / 3, 10 / 3], chorus: [0, 2 / 3, 4 / 3, 2, 8 / 3, 10 / 3], break: [0, 8 / 3], outro: [0, 4 / 3] }, // triplets
  { intro: [0], verse: [0], build: [0, 2], chorus: [0, 1, 2, 3], break: [0], outro: [0] }, // long and sparse
  { intro: [0, 2], verse: [0, 0.5, 1, 2, 3], build: [0, 0.5, 1, 1.5, 2, 3], chorus: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], break: [0, 1, 2], outro: [0, 1] }, // driving eighths
  { intro: [0], verse: [0, 0.75, 2, 2.75], build: [0, 0.75, 1.5, 2, 2.75, 3.5], chorus: [0, 0.75, 1.5, 2, 2.75, 3.5], break: [0, 2.75], outro: [0, 2] }, // dotted
];
/** bass hits per bar: light (intro / break / outro), full (verse / build) and chorus */
const BASS_BEATS: { light: number[]; full: number[]; chorus: number[] }[] = [
  { light: [0], full: [0, 2], chorus: [0, 1, 2, 3] },
  { light: [0], full: [0, 1.5, 2.5], chorus: [0, 1.5, 2, 3] },
  { light: [0], full: [0, 4 / 3, 8 / 3], chorus: [0, 2 / 3, 4 / 3, 2, 8 / 3] },
  { light: [0], full: [0], chorus: [0, 2] },
  { light: [0], full: [0, 1, 2, 3], chorus: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  { light: [0], full: [0, 1.75, 3], chorus: [0, 0.75, 1.75, 2.5, 3] },
];
/** arpeggio figures: [beat, chord tone 0..2, octave 0..1] */
const ARPS: [number, number, number][][] = [
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b, i) => [b, [0, 1, 2, 1, 0, 1, 2, 1][i], 0] as [number, number, number]),
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b, i) => [b, [0, 2, 1, 2, 0, 2, 1, 2][i], 0] as [number, number, number]),
  Array.from({ length: 12 }, (_, i) => [i / 3, [0, 1, 2, 2, 1, 0][i % 6], 0] as [number, number, number]),
  [0, 1, 2, 3].map((b, i) => [b, [0, 1, 2, 1][i], 1] as [number, number, number]),
  [0, 0.75, 1.5, 2, 2.75, 3.5].map((b, i) => [b, [0, 1, 2, 1, 2, 1][i], 0] as [number, number, number]),
  [0, 1, 2.5, 3].map((b, i) => [b, [0, 2, 1, 2][i], 1] as [number, number, number]),
];
/** percussion figures per section family: [beat, instrument, velocity] */
const PERC: Record<string, [number, Instrument, number][]>[] = [
  // 0 light touch
  { verse: [[0, "TRI", 0.3]], build: [[0, "TRI", 0.35], [2, "TAMB", 0.3]], chorus: [[0, "TRI", 0.4], [1, "TAMB", 0.3], [3, "TAMB", 0.3]] },
  // 1 timpani and cymbal
  { verse: [], build: [[0, "TIMP", 0.5], [2, "TIMP", 0.4]], chorus: [[0, "TIMP", 0.6], [2, "TIMP", 0.45], [3.5, "TIMP", 0.4]] },
  // 2 pulse
  { verse: [[0, "KICK", 0.5], [2, "KICK", 0.45]], build: [[0, "KICK", 0.6], [1, "SNARE", 0.35], [2, "KICK", 0.5], [3, "SNARE", 0.4]], chorus: [[0, "KICK", 0.7], [1, "SNARE", 0.5], [2, "KICK", 0.6], [3, "SNARE", 0.55], [1.5, "TAMB", 0.3], [3.5, "TAMB", 0.3]] },
  // 3 shaker texture
  { verse: [[0.5, "TAMB", 0.25], [1.5, "TAMB", 0.25], [2.5, "TAMB", 0.25], [3.5, "TAMB", 0.25]], build: [[0, "TRI", 0.3], [0.5, "TAMB", 0.3], [1.5, "TAMB", 0.3], [2.5, "TAMB", 0.3], [3.5, "TAMB", 0.3]], chorus: [[0, "TRI", 0.4], [0.5, "TAMB", 0.35], [1, "TAMB", 0.25], [1.5, "TAMB", 0.35], [2.5, "TAMB", 0.35], [3.5, "TAMB", 0.35]] },
  // 4 heartbeat
  { verse: [[0, "TIMP", 0.4]], build: [[0, "TIMP", 0.5], [0.75, "TIMP", 0.3], [2, "TIMP", 0.45]], chorus: [[0, "TIMP", 0.6], [0.75, "TIMP", 0.35], [2, "TIMP", 0.5], [2.75, "TIMP", 0.35]] },
  // 5 march
  { verse: [[0, "KICK", 0.4], [1, "KICK", 0.3], [2, "KICK", 0.4], [3, "KICK", 0.3]], build: [[0, "KICK", 0.5], [1, "SNARE", 0.4], [2, "KICK", 0.5], [3, "SNARE", 0.4], [3.5, "SNARE", 0.3]], chorus: [[0, "KICK", 0.6], [1, "SNARE", 0.5], [2, "KICK", 0.6], [3, "SNARE", 0.5], [3.5, "SNARE", 0.4], [0.5, "TAMB", 0.3], [2.5, "TAMB", 0.3]] },
];

interface Ensemble {
  pad: Instrument;
  bass: Instrument;
  arp: Instrument;
  counter: Instrument;
  /** a second colour that joins the build and the chorus */
  colour: Instrument;
}
const ENSEMBLES: Ensemble[] = [
  { pad: "STR", bass: "CELLO", arp: "HARP", counter: "OBOE", colour: "VIOLIN" },
  { pad: "STR", bass: "CELLO", arp: "HARP", counter: "CLA", colour: "HORN" },
  { pad: "STR", bass: "BSN", arp: "HARP", counter: "FLUTE", colour: "PICC" },
  { pad: "STR", bass: "BASS_PIZZ", arp: "MARIMBA", counter: "VIOLA", colour: "GLOCK" },
];

/** highest pitch (Hz) each pitched instrument is given; higher notes are folded down an octave */
const CEILING: Partial<Record<Instrument, number>> = {
  VIOLIN: 1320, VIOLA: 1000, STR: 1000, CELLO: 700, OBOE: 1175, CLA: 1175, FLUTE: 1400, PICC: 1568, HORN: 700,
  TPT: 1047, HARP: 1568, GLOCK: 1568, XYLO: 1319, MARIMBA: 1047, SAZ: 880, KANUN: 1175, PNO: 1568, BSN: 466, TUBA: 220,
};

/** the lead instrument of a region; some regions have two or three voices that take turns by route */
const LEAD: Record<string, Instrument[]> = {
  DOM: ["SAZ"],
  EUR: ["VIOLIN", "OBOE"],
  MEA: ["KANUN"],
  AFR: ["MARIMBA", "XYLO"],
  ASI: ["HARP", "GLOCK", "FLUTE"],
  AME: ["FLUTE", "HORN", "CLA"],
  UNK: ["VIOLA"],
};

const LEVEL: Record<Section, number> = { intro: 0.55, verse: 0.8, build: 0.9, chorus: 1, break: 0.6, outro: 0.5 };
const ARP_ON: Record<Section, boolean> = { intro: false, verse: true, build: true, chorus: true, break: false, outro: false };

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
    groove: Math.floor(r() * LEAD_BEATS.length),
    arp: Math.floor(r() * ARPS.length),
    perc: Math.floor(r() * PERC.length),
    ensemble: Math.floor(r() * ENSEMBLES.length),
    progression: Math.floor(r() * PROGS[mode].length),
    shift: KEY_SHIFTS[Math.floor(r() * KEY_SHIFTS.length)],
    swing: [0, 0, 0.12, 0.2][Math.floor(r() * 4)],
  };
}

/**
 * A full piece (about two and a half to three minutes) built from the routes. Deterministic.
 * The notes come from the routes: each route is a motif (its hash picks the scale degrees, its distance the interval
 * size and the note length, its region the voice). The arrangement comes from the whole selection: tempo, key,
 * progression, rhythm family, arpeggio, percussion and the orchestration are chosen from it, so two people's pieces
 * differ in feel and not only in pitches.
 */
export function composePiece(mode: PersonalMode, routes: PersonalRoute[]): PersonalPiece {
  const st = styleFor(mode, routes);
  const bpm = st.bpm;
  const style: PersonalStyle = { groove: st.groove, arp: st.arp, perc: st.perc, ensemble: st.ensemble, progression: st.progression, shift: st.shift, swing: st.swing };
  if (routes.length === 0) return { notes: [], duration: 0, hook: 0, bpm, sections: [], energy: [], style };
  const beat = 60 / bpm;
  const bar = beat * 4;
  const scale = mode === "wish" ? MAJOR : MINOR;
  const prog = PROGS[mode][st.progression];
  const ens = ENSEMBLES[st.ensemble];
  const leadBeats = LEAD_BEATS[st.groove];
  const bassBeats = BASS_BEATS[st.groove];
  const arpFig = ARPS[st.arp];
  const percFig = PERC[st.perc];
  const dists = routes.map((r) => r.distKm).sort((a, b) => a - b);
  const rank = (d: number): number => (dists.length < 2 ? 0.5 : dists.indexOf(d) / (dists.length - 1));
  const notes: PersonalNote[] = [];
  let via = 0; // the route of the bar being written (the lead that starts it)
  /** nothing is written above what its instrument can carry: a very high single hit means nothing */
  const fit = (f: number, inst: Instrument): number => {
    const cap = CEILING[inst];
    if (!cap) return f;
    let x = f;
    while (x > cap) x /= 2;
    return x;
  };
  const push = (n: Omit<PersonalNote, "key" | "route" | "via"> & { key?: string; route?: number; via?: number }) =>
    notes.push({ key: "", route: -1, via, ...n, freq: fit(n.freq, n.instrument) });
  /** an off-eighth leans late by `swing` of a beat */
  const at = (t0: number, slot: number): number => t0 + (slot * beat) + (Math.abs((slot * 2) % 2 - 1) < 1e-6 ? st.swing * beat * 0.33 : 0);
  const root = (m: number): number => m + st.shift;

  let hook = 0;
  let lead = 0; // round-robin over the routes, one step per lead note
  for (let b = 0; b < BARS; b++) {
    const { section, first, len } = sectionOf(b);
    if (section === "chorus" && b === first) hook = b * bar;
    const t0 = b * bar;
    const chord = prog[Math.floor(b / 2) % prog.length];
    const level = LEVEL[section];
    const fade = section === "outro" ? 1 - ((b - first) / len) * 0.7 : 1;
    const v = (x: number): number => clamp(x * level * fade, 0.05, 1);
    const cr = root(chord.root);
    const tones = [0, chord.third, 7].map((i) => cr + i);
    const onSecondBar = b % 2 === 0;
    via = lead % routes.length; // every hit of this bar is shown with the route that leads it

    // pad: the chord, held for two bars, re-struck on every second bar
    if (onSecondBar) for (const m of tones) push({ t: t0, d: bar * 2 * 0.98, instrument: ens.pad, freq: hz(m + 12), vel: v(0.34) });
    // a second colour joins the build and the chorus: a held fifth-less chord in the orchestra, a doubling elsewhere
    if (section === "build" || section === "chorus") {
      if (ens.colour === "GLOCK") {
        // a bell is a single ping: it sparkles on the beat instead of holding a chord
        for (const [k, ti] of [[0, 0], [1.5, 2], [3, 1]] as [number, number][]) push({ t: at(t0, k), d: beat * 0.8, instrument: "GLOCK", freq: hz(tones[ti] + 24), vel: v(0.26) });
      } else if (onSecondBar) {
        const m = st.ensemble === 1 ? tones.slice(0, 2) : [tones[0]];
        for (const x of m) push({ t: t0, d: bar * 2 * 0.95, instrument: ens.colour, freq: hz(x + (st.ensemble === 1 ? 12 : 24)), vel: v(0.24) });
      }
    }
    // bass
    const bb = section === "chorus" ? bassBeats.chorus : section === "intro" || section === "outro" || section === "break" ? bassBeats.light : bassBeats.full;
    bb.forEach((k, i) => push({ t: at(t0, k), d: beat * (ens.bass === "BASS_PIZZ" ? 0.5 : 0.9), instrument: ens.bass, freq: hz(cr - 12 + (section === "chorus" && i % 2 === 1 ? 7 : 0)), vel: v(0.5) }));
    // arpeggio
    if (ARP_ON[section]) {
      for (const [k, ti, oct] of arpFig) push({ t: at(t0, k), d: beat * 0.7, instrument: ens.arp, freq: hz(tones[ti] + 24 + 12 * oct), vel: v(0.28 + (Math.round(k * 2) % 2 === 0 ? 0.06 : 0)) });
    }
    // percussion
    const pf = section === "verse" || section === "intro" || section === "break" || section === "outro" ? percFig.verse : section === "build" ? percFig.build : percFig.chorus;
    if (section !== "intro" && section !== "outro") {
      for (const [k, inst, pv] of pf) push({ t: at(t0, k), d: beat * 0.5, instrument: inst, freq: inst === "TIMP" ? hz(cr - 12) : 200, vel: v(pv) });
    }
    // a cymbal or gong opens each big section
    if (b === first && (section === "build" || section === "chorus") && st.perc !== 3) push({ t: t0, d: bar, instrument: section === "chorus" ? "CRASH" : "GONG", freq: 300, vel: v(section === "chorus" ? 0.5 : 0.35) });

    // the lead: the route motifs, with a breath at the end of a phrase
    const phraseEnd = section === "verse" && (b - first) % 8 === 7;
    for (const slot of leadBeats[section]) {
      if (phraseEnd && slot > 0) continue;
      const i = lead % routes.length;
      const r = routes[i];
      const h = routeHash(r.key + i);
      const rk = rank(r.distKm);
      const step = r.distKm < 1500 ? 1 : r.distKm < 4000 ? 2 : 3;
      const degree = (h + lead * step) % scale.length;
      let semis = KEY_ROOT + st.shift + 12 + scale[degree] + (rk > 0.66 ? -12 : rk < 0.33 ? 12 : 0);
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
      const gap = leadBeats[section].length > 1 ? 4 / leadBeats[section].length : 4;
      const d = Math.min(beat * gap * 0.95, beat * (slot === 0 ? 1.4 + rk * 2.2 : 0.7 + rk * 0.9));
      const voices = LEAD[r.region] ?? LEAD.UNK;
      const inst = voices[(h + st.ensemble) % voices.length];
      push({ t: at(t0, slot), d, instrument: inst, freq: hz(semis), vel: v(0.62 + 0.3 * (1 - rk)), key: r.key, route: i });
      if (section === "chorus") push({ t: at(t0, slot), d, instrument: inst, freq: hz(semis + 12), vel: v(0.34) });
      // the counter-melody answers on the off beats from the verse on: a third above the line
      if (section !== "intro" && section !== "outro" && slot === leadBeats[section][leadBeats[section].length - 1] && !phraseEnd) {
        const cs = semis + (scale[(degree + 2) % scale.length] - scale[degree] + 12) % 12 + (section === "break" ? 0 : 0);
        push({ t: at(t0, Math.min(3.5, slot + 1)), d: beat * 1.2, instrument: ens.counter, freq: hz(cs), vel: v(0.4) });
      }
      lead++;
    }
  }
  // the last chord rings out
  const last = prog[Math.floor((BARS - 1) / 2) % prog.length];
  for (const i of [0, last.third, 7]) push({ t: BARS * bar, d: bar * 1.6, instrument: ens.pad, freq: hz(root(last.root) + 12 + i), vel: 0.2 });
  const end = Math.max(...notes.map((n) => n.t + n.d));
  let atBar = 0;
  const sections = FORM.map(([name, n]) => {
    const sec = { name, start: atBar * bar, end: (atBar + n) * bar };
    atBar += n;
    return sec;
  });
  const energy = Array.from({ length: 48 }, (_, i) => {
    const b = Math.min(BARS - 1, Math.floor(((i + 0.5) / 48) * BARS));
    const { section } = sectionOf(b);
    return LEVEL[section];
  });
  return { notes, duration: end + 1.5, hook, bpm, sections, energy, style };
}
