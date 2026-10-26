import { routeHash } from "../audio/theory";
import type { CardPlan, GenreCard } from "./genres";

/** the verse tells up to six regions: three in four-bar blocks, four to six in two-bar blocks */
export const EPISODE_CAP = 6;
/** bars of one block of the verse when it tells up to three regions */
export const VERSE_BLOCK = 4;
/** bars of one block of the verse when it tells four to six regions (eight blocks) */
export const VERSE_SHORT_BLOCK = 2;

/** which block (A = home, B, C, D = the first, second, third episode card) plays in each of the four verse blocks */
const PATTERN: Record<number, (number | null)[]> = {
  0: [null, null, null, null],
  1: [null, 0, null, 0],
  2: [null, 0, null, 1],
  3: [null, 0, 1, 2],
};

/**
 * The cards that get an episode: the cards of the coloured routes (the routes that play the card of their own destination),
 * the ones with the most routes first, ties by the hash of the card id, at most `EPISODE_CAP`.
 */
export function episodeCards(plan: CardPlan): GenreCard[] {
  const count = new Map<string, { card: GenreCard; n: number }>();
  for (const c of plan.perRoute) {
    if (c === plan.main) continue;
    const e = count.get(c.id);
    if (e) e.n++;
    else count.set(c.id, { card: c, n: 1 });
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n || routeHash(a.card.id) - routeHash(b.card.id))
    .slice(0, EPISODE_CAP)
    .map((e) => e.card);
}

/** the eight blocks of a verse with n (4-6) episode cards: [home, c0, c1, ...] cycled, ending with home when it fits */
function shortPattern(n: number): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let k = 0; k < n; k++) out.push(k);
  for (let k = 0; out.length < 7; k++) out.push(k % n);
  out.length = Math.min(out.length, 7);
  out.push(null);
  return out;
}

/**
 * What a bar of the verse plays: `card` is the episode card (null = the home card), `blockEnd` marks the last bar of a block (the bridge
 * fill), `block` is 0-3 inside the verse and -1 outside it. `verseFirst` is the first bar of the verse in the form.
 */
export function episodeAt(bar: number, verseFirst: number, cards: GenreCard[]): { card: GenreCard | null; blockEnd: boolean; block: number } {
  const rel = bar - verseFirst;
  if (rel < 0 || rel >= 4 * VERSE_BLOCK) return { card: null, blockEnd: false, block: -1 };
  if (cards.length >= 4) {
    const n = Math.min(cards.length, EPISODE_CAP);
    const block = Math.floor(rel / VERSE_SHORT_BLOCK);
    const pick = shortPattern(n)[block];
    return { card: pick === null ? null : cards[pick] ?? null, blockEnd: rel % VERSE_SHORT_BLOCK === VERSE_SHORT_BLOCK - 1, block };
  }
  const block = Math.floor(rel / VERSE_BLOCK);
  const pick = PATTERN[cards.length][block];
  return { card: pick === null ? null : cards[pick] ?? null, blockEnd: rel % VERSE_BLOCK === VERSE_BLOCK - 1, block };
}
