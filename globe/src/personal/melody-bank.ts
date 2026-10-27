/**
 * The melody bank (version 2, compact): phrases made offline by the form grammars of scripts/music/melody, stored as strings in
 * melody-bank.json. A phrase is four bars joined by "|"; a bar has one character per hit: the base-36 digit of (degree + 2), or "."
 * for a rest. Start, span and bias are derived here; the cadence is forced from the idiom. `pickPhrase` chooses one for a hook.
 *
 * Two files: melody-bank.json (shippable: trained on PDMX / Nottingham, committed) and melody-bank.local.json (git-ignored: adds the
 * makam cards trained on SymbTr, CC BY-NC-SA, local listening only). `?melody=bank` uses the local file when this checkout has one
 * (dev server and tests only: a production build never bundles it), `?melody=bank-shippable` always the shippable file.
 */
import type { Idiom } from "./idiom";
import shipJson from "./melody-bank.json";

/** the lowest scale degree of a phrase (the same as LOW in idiom.ts; kept here so that the two modules do not import each other) */
const FLOOR = -2;

export interface Bank {
  version: number;
  cards: Record<string, Record<string, string[]>>;
  /** the corpora each card's phrases were trained on ("grammar" = the form grammar) */
  sources?: Record<string, string[]>;
}
/** which bank a hook reads: the selected one (local when present) or always the shippable one */
export type BankChoice = "bank" | "bank-shippable";

const LOCAL_KEY = "./melody-bank.local.json";
/** the shippable bank (melody-bank.json) */
export const SHIP_BANK = shipJson as unknown as Bank;

/** the local bank when `modules` (an eager `import.meta.glob` result) holds it, else `ship` */
export function chooseBank(modules: Record<string, unknown>, ship: Bank): Bank {
  const m = modules[LOCAL_KEY] as { default?: Bank } | Bank | undefined;
  if (!m) return ship;
  return ("default" in m && m.default ? m.default : m) as Bank;
}

/** the bank of a choice: "bank-shippable" is always `ship` (the local modules are never looked at) */
export function selectBank(which: BankChoice, modules: Record<string, unknown>, ship: Bank): Bank {
  return which === "bank-shippable" ? ship : chooseBank(modules, ship);
}

// the glob finds nothing (and fails nothing) when the file is missing; a production build never includes it
const LOCAL_MODULES: Record<string, unknown> = import.meta.env.PROD ? {} : import.meta.glob("./melody-bank.local.json", { eager: true });
/** the selected bank: melody-bank.local.json when present (outside production builds), else melody-bank.json */
export const BANK = selectBank("bank", LOCAL_MODULES, SHIP_BANK);
export const bankOf = (which: BankChoice = "bank"): Bank => (which === "bank-shippable" ? SHIP_BANK : BANK);

export interface Decoded {
  bars: (number | null)[][];
  /** the first degree of the phrase (slot 0 of bar 1 always sounds) */
  s: number;
  /** the highest degree used */
  span: number;
  /** net direction: sign of (mean of the last bar - mean of the first bar), level within half a degree */
  bias: -1 | 0 | 1;
  /** the share of repeated moves (`repeatShare`) */
  rep: number;
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
  return { bars, s: bars[0][0] ?? all[0], span: Math.max(...all), bias, rep: repeatShare(bars) };
}

const cache = new Map<string, Decoded[]>();
/** the decoded phrases of an entry, or null when the card or the number of hits has none */
export function entryOf(cardId: string, hits: number, which: BankChoice = "bank"): Decoded[] | null {
  const key = `${which}|${cardId}|${hits}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = bankOf(which).cards[cardId]?.[String(hits)];
  if (!raw || raw.length === 0) return null;
  const dec = raw.map(decodePhrase);
  cache.set(key, dec);
  return dec;
}

/** the share of the moves between consecutive sounding degrees (rests skipped) that repeat the degree; 0 with fewer than two */
export function repeatShare(bars: (number | null)[][]): number {
  const xs = bars.flat().filter((d): d is number => d !== null);
  if (xs.length < 2) return 0;
  let r = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] === xs[i - 1]) r++;
  return r / (xs.length - 1);
}

/** how far above idiom.repeat the share of repeated moves of a phrase may go: the first cap, then relaxed once by 0.1, then none */
const REPEAT_SLACK = [0.15, 0.25];

/**
 * The phrase `pickPhrase` takes, before it is shifted and given its cadence (null when the card / hits has no entry). Candidates are
 * filtered in this order, each step relaxed when it would leave none: span <= idiom.span; a share of repeated moves (`repeatShare`) of
 * at most idiom.repeat + 0.15, else + 0.25, else any (no lines of the same note); start degree equal to `start`, else one of
 * idiom.start; bias equal to the idiom's (when it has one), else for a level idiom the heading `dir` is preferred with probability
 * 0.6. The random draws do not depend on the filters (deterministic for the same `rnd`).
 */
export function choosePhrase(cardId: string, hits: number, idiom: Idiom, dir: 1 | -1, rnd: () => number, start: number, which: BankChoice = "bank"): Decoded | null {
  const all = entryOf(cardId, hits, which);
  if (!all) return null;
  const narrow = (xs: Decoded[], keep: (p: Decoded) => boolean): Decoded[] => {
    const ys = xs.filter(keep);
    return ys.length ? ys : xs;
  };
  let c = narrow(all, (p) => p.span <= idiom.span);
  for (const slack of REPEAT_SLACK) {
    const ys = c.filter((p) => p.rep <= idiom.repeat + slack + 1e-9);
    if (ys.length) {
      c = ys;
      break;
    }
  }
  const exact = c.filter((p) => p.s === start);
  c = exact.length ? exact : narrow(c, (p) => idiom.start.includes(p.s));
  if (idiom.bias !== 0) c = narrow(c, (p) => p.bias === idiom.bias);
  else if (rnd() < 0.6) c = narrow(c, (p) => p.bias === dir);
  return c[Math.min(c.length - 1, Math.floor(rnd() * c.length))];
}

/**
 * The four bars of a hook from the bank (null degree = a rest), or null when the card / hits has no entry (the caller falls back to
 * the walk). The phrase is the one `choosePhrase` takes, shifted to `start` when that keeps it inside [LOW, span]; the last entry of
 * each bar is forced to the idiom's cadence. `which` picks the bank (see `bankOf`).
 */
export function pickPhrase(cardId: string, hits: number, idiom: Idiom, dir: 1 | -1, rnd: () => number, start: number, which: BankChoice = "bank"): (number | null)[][] | null {
  const pick = choosePhrase(cardId, hits, idiom, dir, rnd, start, which);
  if (!pick) return null;
  const shift = start - pick.s;
  const fits = shift === 0 || pick.bars.every((bar) => bar.every((d) => d === null || (d + shift >= FLOOR && d + shift <= idiom.span)));
  const out = pick.bars.map((bar) => bar.map((d) => (d === null || !fits ? d : d + shift)));
  out.forEach((bar, k) => {
    bar[bar.length - 1] = idiom.cadence[k];
  });
  return out;
}
