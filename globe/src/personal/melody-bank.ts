/**
 * The melody bank (version 2, compact): phrases made offline by the form grammars of scripts/music/melody, stored as strings in
 * melody-bank.json. A phrase is four bars joined by "|"; a bar has one character per hit: the base-36 digit of (degree + 2), or "."
 * for a rest. Start, span and bias are derived here; the cadence is forced from the idiom. `pickPhrase` chooses one for a hook.
 */
import type { Idiom } from "./idiom";
import bankJson from "./melody-bank.json";

/** the lowest scale degree of a phrase (the same as LOW in idiom.ts; kept here so that the two modules do not import each other) */
const FLOOR = -2;

interface Bank {
  version: number;
  cards: Record<string, Record<string, string[]>>;
}
export const BANK = bankJson as unknown as Bank;

export interface Decoded {
  bars: (number | null)[][];
  /** the first degree of the phrase (slot 0 of bar 1 always sounds) */
  s: number;
  /** the highest degree used */
  span: number;
  /** net direction: sign of (mean of the last bar - mean of the first bar), level within half a degree */
  bias: -1 | 0 | 1;
}

/** one bar string -> degrees (null = rest) */
export const decodeBar = (bar: string): (number | null)[] => Array.from(bar, (ch) => (ch === "." ? null : parseInt(ch, 36) - 2));

const mean = (bar: (number | null)[]): number => {
  const xs = bar.filter((d): d is number => d !== null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
};

export function decodePhrase(str: string): Decoded {
  const bars = str.split("|").map(decodeBar);
  const all = bars.flat().filter((d): d is number => d !== null);
  const diff = mean(bars[3]) - mean(bars[0]);
  const bias = Math.abs(diff) < 0.5 ? 0 : diff > 0 ? 1 : -1;
  return { bars, s: bars[0][0] ?? all[0], span: Math.max(...all), bias };
}

const cache = new Map<string, Decoded[]>();
/** the decoded phrases of an entry, or null when the card or the number of hits has none */
export function entryOf(cardId: string, hits: number): Decoded[] | null {
  const key = `${cardId}|${hits}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = BANK.cards[cardId]?.[String(hits)];
  if (!raw || raw.length === 0) return null;
  const dec = raw.map(decodePhrase);
  cache.set(key, dec);
  return dec;
}

/**
 * The four bars of a hook from the bank (null degree = a rest), or null when the card / hits has no entry (the caller falls back to
 * the walk). Candidates are filtered in this order, each step relaxed when it would leave none: span <= idiom.span; start degree
 * equal to `start`, else one of idiom.start; bias equal to the idiom's (when it has one), else for a level idiom the heading `dir`
 * is preferred with probability 0.6. The phrase is shifted to `start` when that keeps it inside [LOW, span]; the last entry of each
 * bar is forced to the idiom's cadence.
 */
export function pickPhrase(cardId: string, hits: number, idiom: Idiom, dir: 1 | -1, rnd: () => number, start: number): (number | null)[][] | null {
  const all = entryOf(cardId, hits);
  if (!all) return null;
  const narrow = (xs: Decoded[], keep: (p: Decoded) => boolean): Decoded[] => {
    const ys = xs.filter(keep);
    return ys.length ? ys : xs;
  };
  let c = narrow(all, (p) => p.span <= idiom.span);
  const exact = c.filter((p) => p.s === start);
  c = exact.length ? exact : narrow(c, (p) => idiom.start.includes(p.s));
  if (idiom.bias !== 0) c = narrow(c, (p) => p.bias === idiom.bias);
  else if (rnd() < 0.6) c = narrow(c, (p) => p.bias === dir);
  const pick = c[Math.min(c.length - 1, Math.floor(rnd() * c.length))];
  const shift = start - pick.s;
  const fits = shift === 0 || pick.bars.every((bar) => bar.every((d) => d === null || (d + shift >= FLOOR && d + shift <= idiom.span)));
  const out = pick.bars.map((bar) => bar.map((d) => (d === null || !fits ? d : d + shift)));
  out.forEach((bar, k) => {
    bar[bar.length - 1] = idiom.cadence[k];
  });
  return out;
}
