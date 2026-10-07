import type { Section, SectionId } from "./form";
import { ladderFreq, type Chord } from "./harmony";
import { freqOf } from "./theory";

/**
 * Music v3 rhythm section (spec §4e): pure 16-step patterns per section, Farandole in spirit
 * (driving bass ostinato, syncopated Rhodes comping, brass stabs, kick/snare/hats).
 */
export type Voice = "KICK" | "SNARE" | "HAT" | "OHAT" | "BASS" | "KEYS" | "BRASS" | "SAXPAD";

export interface GrooveHit {
  voice: Voice;
  vel: number;
  /** single pitch (bass, keys arpeggio, sax pad) */
  freq?: number;
  /** chord voicing (keys comping, brass stab) */
  freqs?: number[];
  /** sustained note (night bass, evening sax pad) */
  long?: boolean;
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

/** The groove hits of one 16th step of a bar: pure and deterministic. */
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
