/**
 * How a melody of a tradition moves, as a few numbers per genre card. These are HAND-SET judgements of the known character
 * of each tradition, written down as a table so that they can be tuned by listening: they are not measurements (the reference
 * statistics of the project hold scales and rhythms, not melodic intervals). The large contour of a hook is the flight's
 * altitude; the small motif rides on it and is made by `walkMotif`.
 */
export interface Idiom {
  /** share of moves that are one scale step (the rest are leaps) */
  step: number;
  /** share of moves that repeat the note */
  repeat: number;
  /** sizes, in scale degrees, a leap may have */
  leaps: number[];
  /** −1 descending seyir (Anatolian, Arabic, Persian, flamenco), 0 arch, +1 ascending (alap-like) */
  bias: -1 | 0 | 1;
  /** the highest scale degree the motif may reach */
  span: number;
  /** how many degrees the altitude of the flight lifts the line */
  arc: number;
  /** the degrees a motif may start on */
  start: number[];
  /** the degrees the four bars of a phrase (A B A B′) end on: a descending line comes home on the karar, an ascending one ends high */
  cadence: [number, number, number, number];
}

/** the lowest scale degree a motif may reach */
export const LOW = -2;

export const DEFAULT_IDIOM: Idiom = { step: 0.65, repeat: 0.15, leaps: [2, 3], bias: 0, span: 6, arc: 3, start: [0, 2, 4], cadence: [2, 0, 2, 4] };

export const IDIOMS: Record<string, Partial<Idiom>> = {
  cinematic: { step: 0.6, repeat: 0.1, leaps: [2, 3], span: 6, arc: 3 },
  romantic: { step: 0.7, repeat: 0.05, leaps: [2, 4], span: 7, arc: 3 },
  baroque: { step: 0.75, repeat: 0.05, leaps: [2, 3], span: 7, arc: 2 },
  anatolian: { step: 0.8, repeat: 0.25, leaps: [2], bias: -1, span: 5, arc: 2, start: [3, 4, 2] },
  karsilama: { step: 0.7, repeat: 0.2, leaps: [2], bias: 0, span: 5, arc: 2, start: [0, 2, 4] },
  arabic: { step: 0.8, repeat: 0.2, leaps: [2], bias: -1, span: 6, arc: 3, start: [3, 4, 2] },
  persian: { step: 0.8, repeat: 0.25, leaps: [2], bias: -1, span: 6, arc: 3, start: [3, 4, 2] },
  hindustani: { step: 0.85, repeat: 0.3, leaps: [2], bias: 1, span: 7, arc: 4, start: [0, 2, 4] },
  eastasia: { step: 0.35, repeat: 0.1, leaps: [2, 3], span: 4, arc: 2 },
  gamelan: { step: 0.5, repeat: 0.35, leaps: [2], span: 4, arc: 1 },
  westafrica: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 4, arc: 2 },
  eastafrica: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 4, arc: 2 },
  salsa: { step: 0.55, repeat: 0.25, leaps: [2, 3], span: 6, arc: 2 },
  mariachi: { step: 0.55, repeat: 0.2, leaps: [2, 3], span: 6, arc: 2 },
  bossa: { step: 0.6, repeat: 0.15, leaps: [2, 3], span: 6, arc: 3 },
  tango: { step: 0.6, repeat: 0.15, leaps: [2, 3], bias: -1, span: 6, arc: 3 },
  flamenco: { step: 0.8, repeat: 0.3, leaps: [2], bias: -1, span: 5, arc: 2, start: [4, 3, 2] },
  celtic: { step: 0.55, repeat: 0.1, leaps: [2, 3, 4], span: 7, arc: 3 },
  nordic: { step: 0.85, repeat: 0.3, leaps: [2], span: 5, arc: 2 },
  calm: { step: 0.85, repeat: 0.3, leaps: [2], span: 5, arc: 2 },
  slavic: { step: 0.7, repeat: 0.15, leaps: [2, 3], bias: -1, span: 6, arc: 3 },
  centralasia: { step: 0.6, repeat: 0.3, leaps: [2, 3], bias: -1, span: 6, arc: 2 },
  dance: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 6, arc: 2 },
  epic: { step: 0.5, repeat: 0.1, leaps: [2, 4, 5], span: 7, arc: 4 },
  jazz: { step: 0.5, repeat: 0.1, leaps: [2, 3, 4], span: 7, arc: 3 },
  funk: { step: 0.4, repeat: 0.4, leaps: [3, 4], span: 6, arc: 2 },
  pop: { step: 0.5, repeat: 0.3, leaps: [2, 3], span: 6, arc: 3 },
};

const CADENCE_OF_BIAS: Record<number, [number, number, number, number]> = { [-1]: [2, 0, 2, 0], 0: [2, 0, 2, 4], 1: [2, 2, 4, 4] };

export const idiomOf = (card: { id: string }): Idiom => {
  const own = IDIOMS[card.id] ?? {};
  const merged: Idiom = { ...DEFAULT_IDIOM, ...own };
  if (!own.cadence) merged.cadence = CADENCE_OF_BIAS[merged.bias];
  return merged;
};

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/**
 * The scale degrees of the hits of ONE bar: a walk that starts on `start`, moves by steps, repeats and leaps as the idiom says, is
 * pulled by the idiom's own direction (`bias`, which wins over the heading of the route `dir`), stays inside [LOW, span], comes
 * toward the cadence in its last free move (by up to 2 degrees) and ends on the cadence degree `end`. `rnd` is a seeded generator: the same input gives the same bar.
 */
export function walkMotif(idiom: Idiom, hits: number, dir: 1 | -1, rnd: () => number, start: number, end: number): number[] {
  const out: number[] = [];
  const drift = idiom.bias !== 0 ? 0.6 * idiom.bias + 0.15 * dir : 0.4 * dir;
  const pUp = clamp(0.5 + drift / 2, 0.1, 0.9);
  let d = clamp(start, LOW, idiom.span);
  for (let k = 0; k < hits; k++) {
    out.push(d);
    const rep = rnd() < idiom.repeat;
    const up = rnd() < pUp ? 1 : -1;
    const size = rnd() < idiom.step ? 1 : idiom.leaps[Math.floor(rnd() * idiom.leaps.length)];
    if (hits >= 3 && k === hits - 3) {
      // the move into the second-to-last degree approaches the cadence instead of jumping onto it
      const gap = end - d;
      if (Math.abs(gap) > 1) d += Math.sign(gap) * Math.min(2, Math.abs(gap));
      continue;
    }
    if (rep) continue;
    d += up * size;
    if (d > idiom.span) d = idiom.span - (d - idiom.span);
    if (d < LOW) d = LOW + (LOW - d);
    d = clamp(d, LOW, idiom.span);
  }
  if (out.length > 0) out[out.length - 1] = end;
  return out;
}

/**
 * The four bars of a phrase (A B A B′): each bar is a walk of the idiom that ends on its cadence degree; bar 3 repeats bar 1 exactly
 * (the return) when they end on the same degree. `startOf` draws the start degree of a bar.
 */
export function phraseMotifs(idiom: Idiom, hits: number, dir: 1 | -1, rnd: () => number, startOf: () => number): number[][] {
  const make = (end: number): number[] => walkMotif(idiom, hits, dir, rnd, startOf(), end);
  const [c0, c1, c2, c3] = idiom.cadence;
  const A = make(c0);
  const B = make(c1);
  return [A, B, c2 === c0 ? A.slice() : make(c2), make(c3)];
}
