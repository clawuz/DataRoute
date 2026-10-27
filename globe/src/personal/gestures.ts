import { routeHash } from "../audio/theory";
import type { PersonalNote } from "./compose";

/**
 * Gestures: an instrument is played the way it is played in its tradition (strum, tremolo, double stop, grace note, glide, walking bass,
 * tanpura cycle). Pure and deterministic. Added notes are hidden (`show: false`) and copy route/via/key/alt/pan/wet from the source note.
 * Every number is a hand-set judgement to tune by ear.
 */
export interface GestureContext {
  /** a bar, in seconds */
  bar: number;
  /** a beat, in seconds */
  beat: number;
  /** the card id of the note's route */
  cardOf(route: number): string;
  roleOf(n: PersonalNote): string;
  /** semitones above the key root; `bar` is the bar index (0-based) */
  chordAt(bar: number): { root: number; third: 3 | 4 };
  keyRoot: number;
  hz(semis: number): number;
  /** a bar in which the home drone is silent (the break, the lifted bars): the kemençe drone is not struck there; absent: none is silent */
  silentBar?(bar: number): boolean;
  /** called for every note a gesture made (an added note or a patched copy) with the note it came from, also when that note is dropped */
  origin?(made: PersonalNote, source: PersonalNote): void;
}

interface Env {
  ctx: GestureContext;
  /** notes that begin the bar (kemençe drone) */
  firstOfBar: Set<PersonalNote>;
  /** notes that begin a phrase in their route (ney) */
  phraseStart: Set<PersonalNote>;
  /** the position (0-based) of a bass note among the bass notes of its route in its bar, and the first of its bar */
  bassPos: Map<PersonalNote, { pos: number; first: PersonalNote }>;
  /** the first note of its route in its bar (harp, piano left hand), among the notes of the instruments that use it */
  firstInBar: Set<PersonalNote>;
  /** the first note of its route in its bar and beat (accordion oom-pah: one set per bar position) */
  firstAtBeat: Set<PersonalNote>;
  /** violin hook notes that follow a gap of 0.3 s or more (or start the route) */
  afterGap: Set<PersonalNote>;
  /** bagpipe notes whose pitch equals the previous note's pitch in the route */
  repeated: Set<PersonalNote>;
  /** the start of the next drawn note of the same route and instrument (a tremolo stops before it); absent: the last one */
  nextStart: Map<PersonalNote, number>;
  /** the previous drawn hook note of the same route and instrument (the bowed portamento slides from it); absent: the first one */
  prevHook: Map<PersonalNote, PersonalNote>;
}

/** what a gesture does to one note: patch it, drop it, and/or add notes */
interface Result {
  patch?: Partial<PersonalNote>;
  drop?: boolean;
  extra?: PersonalNote[];
}
type Gesture = (n: PersonalNote, e: Env) => Result | null;

const EPS = 0.02;
const semis = (f: number, x: number): number => f * 2 ** (x / 12);
const barOf = (t: number, bar: number): number => Math.max(0, Math.floor((t + EPS) / bar));
const onBeat = (t: number, beat: number): boolean => {
  const k = Math.round(t / beat);
  return k >= 0 && Math.abs(t - k * beat) <= EPS;
};
/** a strong beat of the bar (0 and 2): the strum and the roll of the plucked role sound there only */
const strong = (t: number, ctx: GestureContext): boolean => beatIn(t, ctx) % 2 === 0;
const isTune = (n: PersonalNote, e: Env): boolean => {
  const r = e.ctx.roleOf(n);
  return r === "hook" || r === "melody";
};
/** the beat (0-based) of a note inside its bar */
const beatIn = (t: number, ctx: GestureContext): number => {
  const per = Math.max(1, Math.round(ctx.bar / ctx.beat));
  return ((Math.round((t - barOf(t, ctx.bar) * ctx.bar) / ctx.beat) % per) + per) % per;
};
const semiOf = (n: PersonalNote, ctx: GestureContext): number => 12 * Math.log2(n.freq / ctx.hz(0));
/** the chord tones (semitones above the key root, ascending) of the bar of a note, in the octave at or below the note */
const toneBase = (n: PersonalNote, e: Env): { base: number; third: number } => {
  const { ctx } = e;
  const c = ctx.chordAt(barOf(n.t, ctx.bar));
  const s = semiOf(n, ctx);
  return {
    base: ctx.keyRoot + c.root + 12 * Math.floor((s - ctx.keyRoot - c.root) / 12),
    third: c.third,
  };
};
const hashOf = (n: PersonalNote): number => routeHash(`${n.key}|${n.t.toFixed(3)}|${String(n.instrument)}`);

/** a hidden note this short (s) is marked `short`: the sampler lets it ring out only briefly */
const SHORT = 0.2;

/** a hidden note made from a source note */
const added = (src: PersonalNote, t: number, d: number, freq: number, vel: number): PersonalNote => {
  const o: PersonalNote = {
    t: Math.max(0, t),
    d,
    instrument: src.instrument,
    freq,
    vel,
    key: src.key,
    route: src.route,
    via: src.via,
    show: false,
    alt: src.alt,
  };
  if (d <= SHORT) o.short = true;
  if (src.pan !== undefined) o.pan = src.pan;
  if (src.wet !== undefined) o.wet = src.wet;
  return o;
};

// --- kemençe

const doubleStop: Gesture = (n, e) => (isTune(n, e) && n.d >= 0.2 ? { extra: [added(n, n.t, n.d, semis(n.freq, -5), n.vel * 0.5)] } : null);
const graceIn: Gesture = (n, e) =>
  isTune(n, e) && n.d >= 0.2 && onBeat(n.t, e.ctx.beat) ? { extra: [added(n, n.t - 0.055, 0.05, semis(n.freq, 2), n.vel * 0.45)] } : null;
const drone: Gesture = (n, e) => {
  if (!e.firstOfBar.has(n) || e.ctx.silentBar?.(barOf(n.t, e.ctx.bar))) return null;
  const end = (barOf(n.t, e.ctx.bar) + 1) * e.ctx.bar;
  return end > n.t
    ? {
        extra: [added(n, n.t, end - n.t, e.ctx.hz(e.ctx.keyRoot - 12), n.vel * 0.3)],
      }
    : null;
};

// --- bowed strings: portamento, titreme (a trill) and mordent

/** a rest this long (s) or shorter between two bowed notes is bridged by a slide from the previous pitch */
const SLIDE_GAP = 0.35;
/** the widest slide (semitones) */
const SLIDE_MAX = 3;
/** a note shorter than this (s) does not slide: the 0.08 s ramp would be most of it */
const SLIDE_MIN_D = 0.15;
/** the cards in which the violin is played like the kemençe (it slides between notes) */
const SLIDING_VIOLIN = new Set(["karadeniz", "anatolian", "icanadolu", "dogu", "zeybek", "mevlevi"]);
const clampSlide = (x: number): number => Math.max(-SLIDE_MAX, Math.min(SLIDE_MAX, x));
/**
 * Portamento: a hook note that follows the previous note of its route within 0.35 s starts at that note's pitch and slides to its
 * own (glide = this - previous, in semitones, at most 3 either way: negative starts above); a repeated pitch takes a small scoop of 1
 * on a third of the notes (by the hash). After a longer rest, and on the first note, the scoop of 1 of a phrase start (the violin keeps
 * its own bow there). The violin slides only in the Turkish cards.
 */
const slide: Gesture = (n, e) => {
  if (e.ctx.roleOf(n) !== "hook" || n.d < SLIDE_MIN_D) return null;
  const violin = n.instrument === "VIOLIN";
  if (violin && !SLIDING_VIOLIN.has(e.ctx.cardOf(n.route))) return null;
  const prev = e.prevHook.get(n);
  if (!prev || n.t - (prev.t + prev.d) > SLIDE_GAP + 1e-9) return violin ? null : { patch: { glide: 1 } };
  const diff = Math.round(1200 * Math.log2(n.freq / prev.freq)) / 100;
  if (Math.abs(diff) >= 0.05) return { patch: { glide: clampSlide(diff) } };
  return hashOf(n) % 3 === 0 ? { patch: { glide: 1 } } : null;
};
/** the most trill notes on one note */
const TRILL_MAX = 6;
/** the trill and the mordent go to the tone above (the scale of the card is not known here: a whole tone) */
const TRILL_UP = 2;
/**
 * Titreme: over the second half of a hook note of 0.6 beat or more, a quick alternation (every 1/8 beat) of the tone above and the
 * note: hidden, short, vel x0.6, at most 6, ending 50 ms before the next drawn note of the route at the latest.
 */
const titreme: Gesture = (n, e) => {
  const { beat } = e.ctx;
  if (e.ctx.roleOf(n) !== "hook" || n.d < 0.6 * beat - 1e-9) return null;
  const step = beat / 8;
  const next = e.nextStart.get(n);
  const end = Math.min(n.t + n.d, next === undefined ? Infinity : next - 0.05);
  const extra: PersonalNote[] = [];
  for (let k = 0; k < TRILL_MAX; k++) {
    const s = n.t + n.d / 2 + k * step;
    if (s + step > end + 1e-9) break;
    const x = added(n, s, step, semis(n.freq, k % 2 === 0 ? TRILL_UP : 0), n.vel * 0.6);
    x.short = true;
    extra.push(x);
  }
  return extra.length ? { extra } : null;
};
/** Mordent: on a third of the hook notes of 0.3 to 0.6 beat that start on a beat, one quick hidden note a tone above, 40 ms in, 40 ms long */
const mordent: Gesture = (n, e) => {
  const { beat } = e.ctx;
  if (e.ctx.roleOf(n) !== "hook" || n.d < 0.3 * beat - 1e-9 || n.d >= 0.6 * beat - 1e-9 || !onBeat(n.t, beat)) return null;
  if (routeHash(`mordent|${n.key}|${n.t.toFixed(3)}|${String(n.instrument)}`) % 3 !== 0) return null;
  const x = added(n, n.t + 0.04, 0.04, semis(n.freq, TRILL_UP), n.vel * 0.6);
  x.short = true;
  return { extra: [x] };
};

// --- saz family

const sazStrum: Gesture = (n, e) =>
  (e.ctx.roleOf(n) === "pluck" ? onBeat(n.t, e.ctx.beat) && strong(n.t, e.ctx) : n.vel >= 0.5 && onBeat(n.t, e.ctx.beat))
    ? {
        extra: [added(n, n.t + 0.012, 0.14, semis(n.freq, -7), n.vel * 0.4), added(n, n.t + 0.024, 0.14, semis(n.freq, -12), n.vel * 0.4)],
      }
    : null;
const glideNote =
  (mod: number): Gesture =>
  (n, e) =>
    e.ctx.roleOf(n) === "hook" && n.d >= 0.3 && hashOf(n) % mod === 0 ? { patch: { glide: 1 } } : null;

// --- kanun / santur

const TREM = 0.075;
const tremoloFrom =
  (minD: number): Gesture =>
  (n, e) => {
    if (!isTune(n, e) || n.d < minD) return null;
    // the tremolo never runs over the next note of its route and instrument (it stops 10 ms before it)
    const next = e.nextStart.get(n);
    const room = next === undefined ? Infinity : next - n.t - 0.01;
    const len = Math.min(n.d, room);
    if (len <= TREM) return null;
    const extra: PersonalNote[] = [added(n, n.t, len, n.freq * 2, n.vel * 0.4)];
    for (let k = 1; k <= 13 && TREM * k < len; k++) extra.push(added(n, n.t + TREM * k, Math.min(TREM, room - TREM * k), n.freq, n.vel * 0.55));
    return { extra };
  };
const tremolo = tremoloFrom(0.45);

/** kanun, santur: a roll of two quick hidden notes (octave, then twelfth) on beats 0 and 2 of the pluck role */
const roll: Gesture = (n, e) =>
  e.ctx.roleOf(n) === "pluck" && onBeat(n.t, e.ctx.beat) && strong(n.t, e.ctx)
    ? {
        extra: [added(n, n.t + 0.035, 0.15, semis(n.freq, 12), n.vel * 0.4), added(n, n.t + 0.07, 0.15, semis(n.freq, 19), n.vel * 0.4)],
      }
    : null;

// --- nylon guitar

const spreadOf = (card: string): number => (card === "flamenco" ? 0.055 : card === "spguitar" || card === "bossa" || card === "samba" ? 0.018 : 0.025);
const strumWith =
  (opts: { boomChick: boolean }): Gesture =>
  (n, e) => {
    const { ctx } = e;
    if (ctx.roleOf(n) !== "pluck" || !onBeat(n.t, ctx.beat)) return null;
    const card = ctx.cardOf(n.route);
    const isStrong = strong(n.t, ctx);
    if (card === "country" && opts.boomChick) {
      if (isStrong) {
        const root = ctx.chordAt(barOf(n.t, ctx.bar)).root;
        return {
          extra: [added(n, n.t, ctx.beat * 0.8, ctx.hz(ctx.keyRoot + root - 12), n.vel * 0.5)],
        };
      }
    }
    // country keeps its off-beat chick (beats 1 and 3); every other card strums on beats 0 and 2 only
    if (!(card === "country" && opts.boomChick) && !isStrong) return null;
    const count = card === "flamenco" ? 4 : 2;
    const c = ctx.chordAt(barOf(n.t, ctx.bar));
    const tones = [c.root, c.root + c.third, c.root + 7];
    const s = 12 * Math.log2(n.freq / ctx.hz(0));
    const above: number[] = [];
    for (let oct = Math.floor((s - ctx.keyRoot) / 12) - 1; above.length < count && oct < 12; oct++) {
      for (const x of tones) {
        const v = ctx.keyRoot + x + oct * 12;
        if (v > s + 0.5 && above.length < count) above.push(v);
      }
    }
    above.sort((a, b) => a - b);
    const spread = spreadOf(card);
    const down = Math.round(n.t / ctx.beat) % 2 === 0;
    const m = above.length;
    const extra = above.map((v, j) => added(n, n.t + (down ? j + 1 : m - j) * spread, 0.3, ctx.hz(v), n.vel * 0.6));
    return { extra };
  };
const guitarStrum = strumWith({ boomChick: false });
const folkGuitar = strumWith({ boomChick: true });

// --- upright bass

const WALK = new Set(["jazz"]);
const ALT = new Set(["country", "bossa", "samba", "salsa", "tango"]);
const bassWalk: Gesture = (n, e) => {
  const { ctx } = e;
  const b = e.bassPos.get(n);
  if (!b || !WALK.has(ctx.cardOf(n.route))) return null;
  if (b.pos > 0) return { drop: true };
  const idx = barOf(n.t, ctx.bar);
  const start = idx * ctx.bar;
  const c = ctx.chordAt(idx);
  const next = ctx.chordAt(idx + 1);
  let appr = next.root - c.root - 1;
  appr = ((((appr + 6) % 12) + 12) % 12) - 6;
  const offs = [7, c.third, appr];
  const extra: PersonalNote[] = [];
  offs.forEach((x, i) => {
    const t = start + (i + 1) * ctx.beat;
    if (t > n.t + EPS) extra.push(added(n, t, ctx.beat * 0.9, semis(n.freq, x), n.vel * 0.8));
  });
  // the first note ends where the walk goes on: one beat at most, and before the first walked note
  const room = extra.length > 0 ? extra[0].t - n.t : ctx.beat;
  const d = Math.min(n.d, ctx.beat, Math.max(0.05, room));
  return d < n.d ? { patch: { d }, extra } : { extra };
};
const bassAlternate: Gesture = (n, e) => {
  const b = e.bassPos.get(n);
  return b && b.pos === 1 && ALT.has(e.ctx.cardOf(n.route)) ? { patch: { freq: semis(n.freq, -5) } } : null;
};

// --- tanpura

const CYCLE = [7, 12, 12, 0];
const tanpura: Gesture = (n, e) => {
  if (e.ctx.roleOf(n) !== "drone") return null;
  // the cycle (Pa Sa Sa Sa) already holds the fifth: the drone's own fifth is dropped, the cycle runs on the tonic
  const pc = ((Math.round(semiOf(n, e.ctx) - e.ctx.keyRoot) % 12) + 12) % 12;
  if (pc === 7) return { drop: true };
  const { beat } = e.ctx;
  const extra: PersonalNote[] = [];
  for (let k = 0; k * beat < n.d; k++) extra.push(added(n, n.t + k * beat, 1.6 * beat, semis(n.freq, CYCLE[k % 4]), n.vel * 0.7));
  return { drop: true, extra };
};

// --- ney

const neyGlide: Gesture = (n, e) => {
  if (!isTune(n, e) || n.d < 0.35) return null;
  if (e.phraseStart.has(n)) return { patch: { glide: 2 } };
  return hashOf(n) % 2 === 0 ? { patch: { glide: 1 } } : null;
};

// --- harp: a rising hidden glissando on the first plucked note of a bar

const harpGliss: Gesture = (n, e) => {
  if (e.ctx.roleOf(n) !== "pluck" || !e.firstInBar.has(n)) return null;
  const { base, third } = toneBase(n, e);
  return {
    extra: [0, third, 7, 12].map((x, j) => added(n, n.t + 0.045 * (j + 1), 0.4, e.ctx.hz(base + x), n.vel * 0.5)),
  };
};

// --- piano family: an octave under the tune, a left-hand bass under the plucked figure

const pianoHand: Gesture = (n, e) => {
  const { ctx } = e;
  const role = ctx.roleOf(n);
  if (role === "hook") return onBeat(n.t, ctx.beat) ? { extra: [added(n, n.t, n.d, semis(n.freq, -12), n.vel * 0.35)] } : null;
  if (role === "pluck" && e.firstInBar.has(n)) {
    const root = ctx.chordAt(barOf(n.t, ctx.bar)).root;
    return {
      extra: [added(n, n.t, ctx.beat * 1.5, ctx.hz(ctx.keyRoot + root - 12), n.vel * 0.4)],
    };
  }
  return null;
};

// --- accordion: oom-pah

const oomPah: Gesture = (n, e) => {
  const { ctx } = e;
  const role = ctx.roleOf(n);
  if ((role !== "pluck" && role !== "hook") || !onBeat(n.t, ctx.beat) || !e.firstAtBeat.has(n)) return null;
  const k = beatIn(n.t, ctx);
  const root = ctx.chordAt(barOf(n.t, ctx.bar)).root;
  if (k % 2 === 0)
    return {
      extra: [added(n, n.t, ctx.beat * 0.4, ctx.hz(ctx.keyRoot + root - 12), n.vel * 0.35)],
    };
  const { base, third } = toneBase(n, e);
  return {
    extra: [third, 7].map((x) => added(n, n.t, ctx.beat * 0.3, ctx.hz(base + x), n.vel * 0.3)),
  };
};

// --- violin

const violinBow: Gesture = (n, e) => {
  if (e.ctx.roleOf(n) !== "hook") return null;
  const r: Result = {};
  if (e.afterGap.has(n)) r.patch = { glide: 1 };
  if (n.d >= 0.5) r.extra = [added(n, n.t, n.d, semis(n.freq, -7), n.vel * 0.4)];
  return r.patch || r.extra ? r : null;
};

// --- koto family: a repeated pluck

const repeatPluck: Gesture = (n, e) => (e.ctx.roleOf(n) === "pluck" ? { extra: [added(n, n.t + 0.06, Math.min(n.d, 0.3), n.freq, n.vel * 0.5)] } : null);

// --- bagpipe: a grace note before a repeated pitch

const pipeGrace: Gesture = (n, e) => (e.repeated.has(n) ? { extra: [added(n, n.t - 0.04, 0.04, semis(n.freq, 2), n.vel * 0.4)] } : null);

/** the bagpipes: a repeated pitch takes a grace note (`pipeGrace`) */
const PIPES = new Set(["BAGPIPE", "TULUM"]);

/** the winds whose phrases open with the ney's long glide (`phraseStart`) */
const NEY_LIKE = new Set(["NEY_MAKAM", "NEY_REAL", "BANSURI", "ZURNA"]);

/** the gestures of each instrument, applied in this order */
export const GESTURES: Record<string, Gesture[]> = {
  KEMENCE_MAKAM: [doubleStop, graceIn, drone, slide, titreme, mordent],
  // the real kemençe and the sarangi are bowed like the makam kemençe: a double stop, a grace note and the slide between notes (the drone
  // stays the makam kemençe's; the titreme and the mordent are the kemençe's)
  KEMENCE_REAL: [doubleStop, graceIn, slide, titreme, mordent],
  SARANGI: [doubleStop, graceIn, slide],
  // the Black Sea kemençe (the Turkish Music Portal recording) slides, trills and takes the mordent like the makam kemençe, but has no
  // added double stop: the recording already sounds its parallel fourths
  KEMENCE_KARADENIZ: [graceIn, slide, titreme, mordent],
  SAZ: [sazStrum, glideNote(3)],
  BAGLAMA_MAKAM: [sazStrum, glideNote(3)],
  BAGLAMA_EXTRA: [sazStrum, glideNote(3)],
  KANUN: [roll, tremoloFrom(0.3)],
  SANTUR: [roll, tremoloFrom(0.3)],
  HARP: [harpGliss],
  FOLKHARP: [harpGliss],
  PNO: [pianoHand],
  STEINWAY: [pianoHand],
  KAWAI: [pianoHand],
  KNIGHTPNO: [pianoHand],
  UPRIGHTPNO: [pianoHand],
  RHODES: [pianoHand],
  ACCORDION: [oomPah],
  // in the Turkish cards the violin also slides between notes like the kemençe (the slide wins over the scoop of its bow)
  VIOLIN: [violinBow, slide],
  KOTO: [repeatPluck, tremoloFrom(0.35)],
  KAYAGEUM: [repeatPluck, tremoloFrom(0.35)],
  DANTRANH: [repeatPluck, tremoloFrom(0.35)],
  PSALTERY: [repeatPluck, tremoloFrom(0.35)],
  TENORSAX: [glideNote(3)],
  CLA: [glideNote(3)],
  FLUTE: [glideNote(3)],
  OBOE: [glideNote(3)],
  DUDUK: [glideNote(3)],
  SHAKUHACHI: [glideNote(3)],
  ERHU: [glideNote(3)],
  BAGPIPE: [pipeGrace],
  // the tulum is a bagpipe: a grace note before a repeated pitch
  TULUM: [pipeGrace],
  NYLONGUITAR: [guitarStrum],
  OUD: [guitarStrum],
  UPRIGHTBASS: [bassWalk, bassAlternate],
  TANPURA: [tanpura],
  NEY_MAKAM: [neyGlide],
  // the real ney, the bansuri and the zurna slide into the notes like the makam ney
  NEY_REAL: [neyGlide],
  BANSURI: [neyGlide],
  ZURNA: [neyGlide],
};

/**
 * Families of numbered instrument names are matched by prefix: a note carries the resolved name of its voice (NS_EKEYS_069, never the
 * family name EKEYS, see WORLD_FAMILIES), so these are the only entries those families can have.
 */
const PREFIXED: [string, Gesture[]][] = [
  ["NS_EKEYS_", [pianoHand]],
  ["NS_KEYS_AC_", [pianoHand]],
  ["NS_GUITAR_AC_", [folkGuitar]],
  ["NS_GUITAR_EL_", [folkGuitar]],
];
export const gesturesOf = (instrument: string): Gesture[] | undefined => GESTURES[instrument] ?? PREFIXED.find(([p]) => instrument.startsWith(p))?.[1];

export function applyGestures(notes: PersonalNote[], ctx: GestureContext): PersonalNote[] {
  const firstOfBar = new Set<PersonalNote>();
  const phraseStart = new Set<PersonalNote>();
  const bassPos = new Map<PersonalNote, { pos: number; first: PersonalNote }>();
  const firstInBar = new Set<PersonalNote>();
  const firstAtBeat = new Set<PersonalNote>();
  const afterGap = new Set<PersonalNote>();
  const repeated = new Set<PersonalNote>();
  const env: Env = {
    ctx,
    firstOfBar,
    phraseStart,
    bassPos,
    firstInBar,
    firstAtBeat,
    afterGap,
    repeated,
    nextStart: new Map(),
    prevHook: new Map(),
  };

  const byTime = (a: PersonalNote, b: PersonalNote): number => a.t - b.t;
  const kem = notes.filter((n) => n.instrument === "KEMENCE_MAKAM" && isTune(n, env) && n.d >= 0.2).sort(byTime);
  const seenBar = new Set<number>();
  for (const n of kem) {
    const b = barOf(n.t, ctx.bar);
    if (!seenBar.has(b)) {
      seenBar.add(b);
      firstOfBar.add(n);
    }
  }
  // the next drawn note of the same route and instrument (the cap of a tremolo)
  const lanes = new Map<string, PersonalNote[]>();
  for (const n of notes) {
    if (n.show === false || gesturesOf(String(n.instrument)) === undefined) continue;
    const k = `${n.route}|${String(n.instrument)}`;
    const l = lanes.get(k);
    if (l) l.push(n);
    else lanes.set(k, [n]);
  }
  for (const l of lanes.values()) {
    l.sort(byTime);
    let j = 0;
    l.forEach((n, i) => {
      j = Math.max(j, i + 1);
      while (j < l.length && l[j].t <= n.t + 1e-6) j++;
      if (j < l.length) env.nextStart.set(n, l[j].t);
    });
    // the previous hook note (an earlier start) of the lane: the bowed portamento slides from it
    let last: PersonalNote | undefined;
    let pending: PersonalNote[] = [];
    let at = -Infinity;
    for (const n of l) {
      if (ctx.roleOf(n) !== "hook") continue;
      if (n.t > at + 1e-6) {
        if (pending.length) last = pending[pending.length - 1];
        pending = [];
        at = n.t;
      }
      if (last) env.prevHook.set(n, last);
      pending.push(n);
    }
  }
  const ney = notes.filter((n) => NEY_LIKE.has(String(n.instrument))).sort(byTime);
  const lastEnd = new Map<number, number>();
  for (const n of ney) {
    const prev = lastEnd.get(n.route);
    if (prev === undefined || n.t - prev >= 0.4) phraseStart.add(n);
    lastEnd.set(n.route, Math.max(prev ?? -Infinity, n.t + n.d));
  }
  const groups = new Map<string, PersonalNote[]>();
  for (const n of notes) {
    if (n.instrument !== "UPRIGHTBASS" || ctx.roleOf(n) !== "bass") continue;
    const k = `${n.route}|${barOf(n.t, ctx.bar)}`;
    const g = groups.get(k);
    if (g) g.push(n);
    else groups.set(k, [n]);
  }
  for (const g of groups.values()) {
    g.sort(byTime);
    g.forEach((n, pos) => bassPos.set(n, { pos, first: g[0] }));
  }

  // dedupe by position: the first note of a route in a bar (harp glissando, piano left hand), in a bar and beat (accordion)
  const seenBarKey = new Set<string>();
  const seenBeatKey = new Set<string>();
  const lastEndV = new Map<number, number>();
  const lastPipe = new Map<string, number>();
  for (const n of [...notes].sort(byTime)) {
    const name = String(n.instrument);
    const role = ctx.roleOf(n);
    const list = gesturesOf(name);
    if (list === undefined) continue;
    if (list.includes(harpGliss) || list.includes(pianoHand)) {
      const k = `${n.route}|${name}|${barOf(n.t, ctx.bar)}`;
      if (role === "pluck" && !seenBarKey.has(k)) {
        seenBarKey.add(k);
        firstInBar.add(n);
      }
    }
    if (list.includes(oomPah) && (role === "pluck" || role === "hook") && onBeat(n.t, ctx.beat)) {
      const k = `${n.route}|${barOf(n.t, ctx.bar)}|${beatIn(n.t, ctx)}`;
      if (!seenBeatKey.has(k)) {
        seenBeatKey.add(k);
        firstAtBeat.add(n);
      }
    }
    if (name === "VIOLIN" && role === "hook") {
      const prev = lastEndV.get(n.route);
      if (prev === undefined || n.t - prev >= 0.3) afterGap.add(n);
      lastEndV.set(n.route, Math.max(prev ?? -Infinity, n.t + n.d));
    }
    if (PIPES.has(name) && role !== "drone") {
      const k = `${n.route}|${name}`;
      const prev = lastPipe.get(k);
      if (prev !== undefined && Math.abs(prev - n.freq) <= 1e-9 * n.freq) repeated.add(n);
      lastPipe.set(k, n.freq);
    }
  }

  const out: PersonalNote[] = [];
  for (const n of notes) {
    const list = gesturesOf(String(n.instrument));
    if (!list) {
      out.push(n);
      continue;
    }
    let patch: Partial<PersonalNote> | undefined;
    let drop = false;
    const extra: PersonalNote[] = [];
    for (const g of list) {
      const r = g(n, env);
      if (!r) continue;
      if (r.patch) patch = { ...patch, ...r.patch };
      if (r.drop) drop = true;
      if (r.extra) extra.push(...r.extra);
    }
    if (!drop) {
      const kept = patch ? { ...n, ...patch } : n;
      if (patch) ctx.origin?.(kept, n);
      out.push(kept);
    }
    for (const x of extra) ctx.origin?.(x, n);
    out.push(...extra);
  }
  return out;
}
