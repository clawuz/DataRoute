import type { BuildPhase, Level } from "./arrangement";
import type { Section, SectionId } from "./form";
import { ladderFreq, type Chord } from "./harmony";
import { rotate } from "./lines";
import { euclid, freqOf, type RegionName } from "./theory";

/**
 * Music v3 rhythm section (spec §4e): pure 16-step patterns per section, Farandole in spirit
 * (driving bass ostinato, syncopated Rhodes comping, brass stabs, kick/snare/hats).
 */
export type Voice =
  | "KICK" | "SNARE" | "HAT" | "OHAT" | "BASS" | "KEYS" | "BRASS" | "SAXPAD"
  | "TOM" | "CRASH" | "SHAKER" | "RISER" | "DARBUKA" | "CONGA" | "TAIKO" | "TIMP";

export interface GrooveHit {
  voice: Voice;
  vel: number;
  /** single pitch (bass, keys arpeggio, sax pad) */
  freq?: number;
  /** chord voicing (keys comping, brass stab) */
  freqs?: number[];
  /** sustained note (night bass, evening sax pad) */
  long?: boolean;
  /** v4: play this many steps after the step (0.5 = the second 32nd of a level-4 hat double); absent = on the step */
  offsetSteps?: number;
}

interface Pattern {
  kick: number[];
  snare: number[];
  /** closed hat steps (the open-hat step is never also a closed hat) */
  hat: number[];
  ohat: number[];
  bass: number[];
  keys: number[];
  /** keys play the voicing one tone at a time instead of a chord */
  arpeggio?: boolean;
  brass: number[];
  /** sustained bass notes */
  longBass?: boolean;
  /** long sax pad on step 0 */
  saxPad?: boolean;
  /** velocity scale of the section */
  scale: number;
}

const ALL16 = Array.from({ length: 16 }, (_, i) => i);
const EIGHTHS = ALL16.filter((s) => s % 2 === 0);

const PATTERNS: Record<SectionId, Pattern> = {
  DAY: {
    kick: [0, 6, 10], snare: [4, 12], hat: ALL16.filter((s) => s !== 14), ohat: [14],
    bass: [0, 3, 6, 8, 11, 14], keys: [2, 7, 10], brass: [3, 11], scale: 1,
  },
  MORNING: { kick: [0, 10], snare: [4, 12], hat: EIGHTHS, ohat: [], bass: [0, 6, 8, 14], keys: [2, 10], brass: [], scale: 0.8 },
  NIGHT: { kick: [0, 8], snare: [], hat: [4, 12], ohat: [], bass: [0], longBass: true, keys: [0, 6, 10], arpeggio: true, brass: [], scale: 0.45 },
  EVENING: { kick: [0, 8], snare: [12], hat: EIGHTHS, ohat: [], bass: [0, 8, 11], keys: [2, 8], brass: [], saxPad: true, scale: 0.7 },
};

const VEL = { KICK: 1, SNARE: 0.9, HAT: 0.55, GHOST: 0.3, OHAT: 0.5, BASS: 0.8, KEYS: 0.6, BRASS: 0.8, SAXPAD: 0.6 };

const mod = (x: number, m: number): number => ((x % m) + m) % m;
const interval = (c: Chord, tone: number): number => mod(tone - c.root, 12);

/** Bass degree of each ostinato step (DAY's full pattern; the other sections use subsets of these steps). */
type Degree = "root" | "fifth" | "rootOct" | "seventhOrApproach";
const BASS_DEGREE: Record<number, Degree> = { 0: "root", 3: "root", 6: "fifth", 8: "rootOct", 11: "seventhOrApproach", 14: "fifth" };

/** Bass pitch in semitones above A1 (octave 1 … 2): root, chord fifth, octave root, 7th or a semitone below the next root. */
function bassSemis(deg: Degree, c: Chord, next: Chord): number {
  switch (deg) {
    case "root":
      return c.root;
    case "fifth":
      return c.root + interval(c, c.tones[2]); // the chord's 5th: +7, or +6 for Em7b5's ♭5
    case "rootOct":
      return c.root + 12;
    case "seventhOrApproach":
      // approach the next chord's root from a semitone below (octave 1); same root → the chord's 7th
      return next.root !== c.root ? mod(next.root - 1, 12) : c.root + interval(c, c.tones[3]);
  }
}

/** Stack pitch classes upward from `floor` (first above it, each next one above the previous), folding anything above `ceil` an octave down. */
function stack(pcs: number[], floor: number, ceil: number): number[] {
  const out: number[] = [];
  let prev = floor - 1;
  for (const p of pcs) {
    let s = prev + 1 + mod(p - (prev + 1), 12);
    prev = s;
    while (s > ceil) s -= 12;
    out.push(s);
  }
  return out.sort((a, b) => a - b);
}

/** Rootless Rhodes voicing: 3rd, 7th, 9th (or the 3rd again), 5th, in octaves 3–4 (semitones 12…36 above A2). */
export const keysVoicing = (c: Chord): number[] => stack([c.tones[1], c.tones[3], c.tones[4] ?? c.tones[1], c.tones[2]], 12, 36);
/** Brass stab: 3rd, 7th, 9th in octaves 4–5 (semitones 24…48). */
export const brassVoicing = (c: Chord): number[] => stack([c.tones[1], c.tones[3], c.tones[4] ?? c.tones[1]], 24, 48);

/**
 * v3 groove hits of one 16th step of a bar: pure and deterministic.
 * Still used by `score.planStep` until the v4 engine (Task 16) switches to the level functions below; remove it then.
 */
export function grooveStep(stepInBar: number, chord: Chord, next: Chord, sec: Section): GrooveHit[] {
  const s = mod(stepInBar, 16);
  const p = PATTERNS[sec.id];
  const k = p.scale;
  const hits: GrooveHit[] = [];
  if (p.kick.includes(s)) hits.push({ voice: "KICK", vel: VEL.KICK * k });
  if (p.snare.includes(s)) hits.push({ voice: "SNARE", vel: VEL.SNARE * k });
  if (p.hat.includes(s)) hits.push({ voice: "HAT", vel: (s % 2 === 0 ? VEL.HAT : VEL.GHOST) * k });
  if (p.ohat.includes(s)) hits.push({ voice: "OHAT", vel: VEL.OHAT * k });
  if (p.bass.includes(s)) {
    const hit: GrooveHit = { voice: "BASS", vel: VEL.BASS * k, freq: freqOf(1, bassSemis(BASS_DEGREE[s], chord, next)) };
    if (p.longBass) hit.long = true;
    hits.push(hit);
  }
  const ki = p.keys.indexOf(s);
  if (ki >= 0) {
    const v = keysVoicing(chord).map(ladderFreq);
    hits.push(p.arpeggio ? { voice: "KEYS", vel: VEL.KEYS * k, freq: v[ki % v.length] } : { voice: "KEYS", vel: VEL.KEYS * k, freqs: v });
  }
  if (p.brass.includes(s)) hits.push({ voice: "BRASS", vel: VEL.BRASS * k, freqs: brassVoicing(chord).map(ladderFreq) });
  if (p.saxPad && s === 0) hits.push({ voice: "SAXPAD", vel: VEL.SAXPAD * k, freq: freqOf(3, chord.tones[1]), long: true });
  return hits;
}

// ---------------------------------------------------------------- v4 (spec §4f): rhythm levels, layers, build-up

/** Velocity scale of a rhythm level. */
export const LEVEL_SCALE: Record<Level, number> = { 0: 0.5, 1: 0.7, 2: 0.9, 3: 1, 4: 1 };

const V4 = {
  KICK: 1, SNARE: 0.9, SNARE_SOFT: 0.6, GHOST_SNARE: 0.3, HAT: 0.55, HAT_OFF: 0.3, OHAT: 0.5,
  SHAKER: 0.5, SHAKER_OFF: 0.25, BASS: 0.8, KEYS: 0.6, BRASS: 0.8,
  DARBUKA: 0.7, CONGA: 0.6, TAIKO: 0.8, TIMP: 0.7,
};
/** Rising velocity of the fill steps 12–15 (snare at level ≥ 3, toms). */
const FILL_VEL: Record<number, number> = { 12: 0.5, 13: 0.6, 14: 0.75, 15: 0.9 };

const KICK_STEPS: Record<Level, number[]> = { 0: [0], 1: [0, 8], 2: [0, 6, 10], 3: [0, 6, 10], 4: [0, 3, 6, 10] };
const SNARE_STEPS: Record<Level, number[]> = { 0: [], 1: [12], 2: [4, 12], 3: [4, 12], 4: [4, 12] };
const HAT_STEPS: Record<Level, number[]> = { 0: [8], 1: EIGHTHS, 2: ALL16, 3: ALL16.filter((s) => s !== 14), 4: ALL16.filter((s) => s !== 14) };
const GHOSTS = [7, 15];

/**
 * Drum hits (KICK, SNARE, HAT, OHAT, SHAKER, TOM) of one step of bar `bar` at a rhythm level (spec §4f table):
 * 0 kick [0], hat [8] · 1 kick [0,8], soft snare [12], 8th hats · 2 kick [0,6,10], snare [4,12], 16th hats (8ths
 * accented) · 3 = 2 + ghost snares [7,15], open hat [14] (replacing the closed hat), 16th shaker · 4 = 3 + kick [3],
 * a second hat 32nd after every closed hat (`offsetSteps` 0.5), toms on 12–15 of odd bars.
 * Bar variants: `bar % 4 == 1` moves the ghost snares one step later (15 → 0); `bar % 4 == 3` at level ≥ 2 ends on a
 * fill (level 2: toms on 14, 15; level ≥ 3: snare on 12–15 rising 0.5 → 0.9). Velocities × `LEVEL_SCALE`.
 */
export function drumHits(level: Level, bar: number, step: number): GrooveHit[] {
  const s = mod(step, 16);
  const v = mod(bar, 4);
  const k = LEVEL_SCALE[level];
  const hits: GrooveHit[] = [];
  const hit = (voice: Voice, vel: number, offsetSteps?: number) =>
    hits.push(offsetSteps === undefined ? { voice, vel: vel * k } : { voice, vel: vel * k, offsetSteps });

  if (KICK_STEPS[level].includes(s)) hit("KICK", V4.KICK);

  let snare: number | undefined;
  if (SNARE_STEPS[level].includes(s)) snare = level === 1 ? V4.SNARE_SOFT : V4.SNARE;
  if (level >= 3 && GHOSTS.map((g) => (v === 1 ? (g + 1) % 16 : g)).includes(s)) snare ??= V4.GHOST_SNARE;
  if (level >= 3 && v === 3 && s >= 12) snare = FILL_VEL[s];
  if (snare !== undefined) hit("SNARE", snare);

  if (HAT_STEPS[level].includes(s)) {
    hit("HAT", s % 2 === 0 ? V4.HAT : V4.HAT_OFF);
    if (level === 4) hit("HAT", V4.HAT_OFF, 0.5);
  }
  if (level >= 3 && s === 14) hit("OHAT", V4.OHAT);
  if (level >= 3) hit("SHAKER", s % 2 === 0 ? V4.SHAKER : V4.SHAKER_OFF);

  const toms = (level === 4 && mod(bar, 2) === 1 && s >= 12) || (level === 2 && v === 3 && s >= 14);
  if (toms) hit("TOM", FILL_VEL[s]);
  return hits;
}

/** The chord-scale pitch strictly above (`dir` 1) or below (`dir` −1) `semis`. */
function scaleStep(semis: number, c: Chord, dir: 1 | -1): number {
  for (let d = 1; d <= 12; d++) if (c.scale.includes(mod(semis + dir * d, 12))) return semis + dir * d;
  return semis;
}

/** Level-3 passing 16ths: step 2 a scale step above the root, 9 below the octave root, 13 below the fifth. */
const PASSING: Record<number, (c: Chord) => number> = {
  2: (c) => scaleStep(c.root, c, 1),
  9: (c) => scaleStep(c.root + 12, c, -1),
  13: (c) => scaleStep(bassSemis("fifth", c, c), c, -1),
};

/** Level-4 walking 16ths: the chord scale over the bass register (semitones 0…23 above A1), up on even bars, down on
 * odd bars from the root (octave 1 up / octave 2 down), folding an octave at the edges; step 15 approaches the next
 * root from a semitone below, in the octave nearest the step-14 note (ties lower). */
function walkSemis(bar: number, s: number, c: Chord, next: Chord): number {
  const ladder = [...c.scale].sort((a, b) => a - b);
  const two = [...ladder, ...ladder.map((x) => x + 12)];
  const n = ladder.length;
  const r = ladder.indexOf(c.root);
  const at = (i: number) => {
    const up = mod(bar, 2) === 0;
    let idx = up ? r + i : r + n - i;
    if (idx >= 2 * n) idx -= n;
    if (idx < 0) idx += n;
    return two[idx];
  };
  if (s < 15) return at(s);
  const prev = at(14);
  const a = mod(next.root - 1, 12);
  return Math.abs(a - prev) <= Math.abs(a + 12 - prev) ? a : a + 12;
}

const BASS_STEPS: Record<Level, number[]> = {
  0: [0], 1: [0, 8], 2: [0, 3, 6, 8, 11, 14], 3: [0, 2, 3, 6, 8, 9, 11, 13, 14], 4: ALL16,
};

/**
 * Bass hits of one step at a rhythm level, pitches in octave 1–2 (`freqOf(1, ·)`): 0 one long root on step 0 ·
 * 1 root and octave root on [0, 8] · 2 the ostinato [0,3,6,8,11,14] · 3 the ostinato plus passing 16ths on 2, 9, 13 ·
 * 4 a walking 16th run (see `walkSemis`). Velocity 0.8 × `LEVEL_SCALE`.
 */
export function bassHits(level: Level, bar: number, step: number, chord: Chord, next: Chord): GrooveHit[] {
  const s = mod(step, 16);
  if (!BASS_STEPS[level].includes(s)) return [];
  let semis: number;
  if (level === 4) semis = walkSemis(bar, s, chord, next);
  else if (PASSING[s] && level === 3) semis = PASSING[s](chord);
  else semis = bassSemis(BASS_DEGREE[s], chord, next);
  const hit: GrooveHit = { voice: "BASS", vel: V4.BASS * LEVEL_SCALE[level], freq: freqOf(1, semis) };
  if (level === 0) hit.long = true;
  return [hit];
}

const KEYS_STEPS: Record<Level, number[]> = { 0: [0, 10], 1: [2, 10], 2: [2, 7, 10], 3: [2, 7, 10], 4: [2, 5, 7, 10, 13] };
const BRASS_STEPS: Record<Level, number[]> = { 0: [], 1: [], 2: [], 3: [3, 11], 4: [3, 6, 11, 14] };

/** Rhodes comping (level 0 arpeggiates the rootless voicing one tone a hit) and brass stabs (level ≥ 3). */
export function compHits(level: Level, step: number, chord: Chord): GrooveHit[] {
  const s = mod(step, 16);
  const k = LEVEL_SCALE[level];
  const hits: GrooveHit[] = [];
  const ki = KEYS_STEPS[level].indexOf(s);
  if (ki >= 0) {
    const v = keysVoicing(chord).map(ladderFreq);
    hits.push(level === 0 ? { voice: "KEYS", vel: V4.KEYS * k, freq: v[ki % v.length] } : { voice: "KEYS", vel: V4.KEYS * k, freqs: v });
  }
  if (BRASS_STEPS[level].includes(s)) hits.push({ voice: "BRASS", vel: V4.BRASS * k, freqs: brassVoicing(chord).map(ladderFreq) });
  return hits;
}

const DARBUKA = euclid(5, 8);
const CONGA = euclid(7, 12);
const TAIKO = euclid(3, 8);

/** Slot of a 16-step bar on a 12-step grid; hit only on the first step of each slot. */
const slot12 = (s: number): number => Math.floor((s * 12) / 16);

/**
 * Percussion of an active region layer (unpitched): MEA darbuka E(5,8) on the 8th steps · AFR conga E(7,12) rotated by
 * `bar % 3`, laid over 16 steps on the first step of each 12-grid slot · ASI taiko E(3,8) on the 8th steps ·
 * AME timpani [0, 8] · EUR shaker every step (8ths 0.5, off-16ths 0.25) · DOM/UNK none.
 */
export function layerHits(region: RegionName, step: number, bar: number): GrooveHit[] {
  const s = mod(step, 16);
  switch (region) {
    case "MEA":
      return s % 2 === 0 && DARBUKA[s / 2] ? [{ voice: "DARBUKA", vel: V4.DARBUKA }] : [];
    case "AFR": {
      const i = slot12(s);
      const first = s === 0 || slot12(s - 1) !== i;
      return first && rotate(CONGA, mod(bar, 3))[i] ? [{ voice: "CONGA", vel: V4.CONGA }] : [];
    }
    case "ASI":
      return s % 2 === 0 && TAIKO[s / 2] ? [{ voice: "TAIKO", vel: V4.TAIKO }] : [];
    case "AME":
      return s === 0 || s === 8 ? [{ voice: "TIMP", vel: V4.TIMP }] : [];
    case "EUR":
      return [{ voice: "SHAKER", vel: s % 2 === 0 ? V4.SHAKER : V4.SHAKER_OFF }];
    default:
      return [];
  }
}

/** Tutti brass: 3rd, 7th, 9th (or the 3rd again), 5th in octaves 4–5 (semitones 24…48). */
export const tuttiVoicing = (c: Chord): number[] => stack([c.tones[1], c.tones[3], c.tones[4] ?? c.tones[1], c.tones[2]], 24, 48);

/**
 * REPLAY transition hits. `build`: a snare roll on every step (0.3 + 0.7·amount), 16th hats (0.3 + 0.4·amount), a
 * `RISER` on step 0 of the first build bar (`bar` counts the bars of the build phase, 0 = first), and the bass
 * pulsing root / octave root on 0, 4, 8, 12. `hit`: on step 0 only, crash + kick + the tutti brass voicing, all 1.0.
 */
export function fillAndBuild(phase: BuildPhase, amount: number, step: number, bar: number, chord: Chord): GrooveHit[] {
  const s = mod(step, 16);
  if (phase === "hit")
    return s === 0
      ? [{ voice: "CRASH", vel: 1 }, { voice: "KICK", vel: 1 }, { voice: "BRASS", vel: 1, freqs: tuttiVoicing(chord).map(ladderFreq) }]
      : [];
  if (phase !== "build") return [];
  const a = Math.min(1, Math.max(0, amount));
  const hits: GrooveHit[] = [{ voice: "SNARE", vel: 0.3 + 0.7 * a }, { voice: "HAT", vel: 0.3 + 0.4 * a }];
  if (s === 0 && bar === 0) hits.push({ voice: "RISER", vel: 0.8 });
  if (s % 4 === 0) hits.push({ voice: "BASS", vel: V4.BASS, freq: freqOf(1, s % 8 === 0 ? chord.root : chord.root + 12) });
  return hits;
}
