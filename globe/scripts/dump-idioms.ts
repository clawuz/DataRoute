/**
 * Dumps the melodic idiom of every genre card (idiomOf over DEFAULT_IDIOM) to scripts/music/melody/idioms.json, the input of the
 * Python melody grammar (scripts/music/melody/grammar.py). Run from globe/: `npx --yes vite-node scripts/dump-idioms.ts`.
 */
import { writeFileSync } from "node:fs";
import { CARDS } from "../src/personal/genres";
import { DEFAULT_IDIOM, LOW, idiomOf } from "../src/personal/idiom";

const cards = Object.fromEntries(CARDS.map((c) => [c.id, idiomOf(c)]));
const out = { LOW, DEFAULT: DEFAULT_IDIOM, cards };
const target = new URL("../../scripts/music/melody/idioms.json", import.meta.url);
writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${Object.keys(cards).length} cards to ${target.pathname}`);
