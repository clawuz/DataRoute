import { routeHash } from "../audio/theory";
import type { CardPlan, GenreCard } from "./genres";

/** a verse of 16 bars cannot tell more than three regions without turning into a list */
export const EPISODE_CAP = 3;
/** bars of one block of the verse */
export const VERSE_BLOCK = 4;

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

/**
 * What a bar of the verse plays: `card` is the episode card (null = the home card), `blockEnd` marks the last bar of a block (the bridge
 * fill), `block` is 0-3 inside the verse and -1 outside it. `verseFirst` is the first bar of the verse in the form.
 */
export function episodeAt(bar: number, verseFirst: number, cards: GenreCard[]): { card: GenreCard | null; blockEnd: boolean; block: number } {
  const rel = bar - verseFirst;
  if (rel < 0 || rel >= 4 * VERSE_BLOCK) return { card: null, blockEnd: false, block: -1 };
  const block = Math.floor(rel / VERSE_BLOCK);
  const pick = PATTERN[Math.min(cards.length, EPISODE_CAP)][block];
  return { card: pick === null ? null : cards[pick] ?? null, blockEnd: rel % VERSE_BLOCK === VERSE_BLOCK - 1, block };
}
