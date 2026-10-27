/**
 * Dumps phrases of the old hook melody (the seeded walk of `phraseMotifs` without a bank) for the melody evaluation
 * (scripts/music/melody/evaluate.py): 200 phrases per card at hits = 6 and 8, encoded like the bank (one base-36 digit of degree + 2
 * per slot, bars joined by "|"). The start degree and the heading are drawn as composePiece draws them (first occurrence). Deterministic.
 * Run from globe/: `npx --yes vite-node scripts/dump-walk-phrases.ts`.
 */
import { writeFileSync } from "node:fs";
import { CARDS } from "../src/personal/genres";
import { idiomOf, phraseMotifs } from "../src/personal/idiom";

const N = 200;
const HITS = [6, 8];
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const enc = (bars: (number | null)[][]) => bars.map((b) => b.map((d) => (d === null ? "." : (d + 2).toString(36))).join("")).join("|");

const cards: Record<string, Record<string, string[]>> = {};
for (const c of CARDS) {
  const idiom = idiomOf(c);
  cards[c.id] = {};
  for (const h of HITS) {
    const out: string[] = [];
    for (let i = 0; i < N; i++) {
      const rnd = lcg(1 + i * 7919 + h * 104729);
      const dir: 1 | -1 = i % 2 ? 1 : -1;
      out.push(enc(phraseMotifs(idiom, h, dir, rnd, () => idiom.start[Math.floor(rnd() * idiom.start.length)])));
    }
    cards[c.id][String(h)] = out;
  }
}
const target = new URL("../../scripts/music/melody/walk-samples.json", import.meta.url);
writeFileSync(target, JSON.stringify({ version: 1, n: N, hits: HITS, cards }) + "\n");
console.log(`wrote ${CARDS.length} cards x ${HITS.length} hits x ${N} walk phrases to ${target.pathname}`);
