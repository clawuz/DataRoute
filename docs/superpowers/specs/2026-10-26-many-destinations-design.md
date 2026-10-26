# Many destinations: the dominant region leads, more regions are told

Date: 2026-10-26. Branch: `feat/ui-v2`. Continues the destination styles (51 cards, main card = the card most routes go to).

## Why

With many selections (say 12 places in 12 countries) every card has one route: "the card with most routes" is decided by total distance and a hash, so the piece sounds like a random country, and the verse (episodes) tells only three of the twelve.

## Decisions (the recommendation of 2026-10-26, "birinci ve üçüncüyü birlikte")

1. **The main card follows the dominant REGION.** Cards belong to 12 clusters. The cluster with the most routes (far-end cards) leads (ties: larger total distance, then smaller hash of the cluster id); the main card is the card of that cluster with the most routes (ties: distance, hash). With few routes in a single cluster nothing changes except when another cluster has more routes in total than the leading card has alone.
2. **The verse tells more regions when there are more colours.** With 1–3 episode cards the verse is as today (four blocks of four bars). With 4 or more colours the verse is eight blocks of two bars and up to six cards are told: `[home, c0, c1, c2, c3, …]`; the bridge fill closes every block (bars 9, 11, 13, … of the verse, i.e. every second bar).

## Clusters (a fixed table in `genres.ts`, `CLUSTER_OF`)

| cluster | cards |
|---|---|
| turkish | anatolian, karsilama, karadeniz, icanadolu, akdeniz, dogu, zeybek |
| arab | arabic, khaleeji, maghrebi |
| persian-central | persian, centralasia, caucasus |
| south-asia | hindustani, bollywood |
| east-asia | eastasia, chinese |
| south-east-asia | gamelan, thai |
| africa | westafrica, eastafrica, afrobeat |
| latin | salsa, mariachi, bossa, samba, tango, cumbia, andean |
| south-europe | greek, italian, flamenco, spguitar, fado |
| slavic | slavic, russian |
| west-europe | baroque, romantic, classical, chanson |
| north | nordic, celtic, calm |
| anglo | pop, jazz, funk, country, rnb, cinematic, epic, dance |

(13 clusters; every one of the 51 cards is in exactly one — a test checks it.)

## Code

- `genres.ts`: `export const CLUSTER_OF: Record<string, string>` (card id → cluster) and `clusterOf(card)`; `planCards`: the tally is by cluster first. `home` is unchanged.
- `episodes.ts`: `EPISODE_CAP` becomes 6; `episodeCards` unchanged otherwise (cards of the coloured routes, most routes first, ties by hash, cap 6). `episodeAt` uses 4-bar blocks and the old patterns when the number of cards is 0–3 (byte-identical to today), and 2-bar blocks with the pattern `[null, c0, …, cN-1]` filled up to eight blocks by cycling `c0, c1, …` and ending with `null` when it fits, for 4–6 cards: n=4 → `[null,0,1,2,3,0,1,null]`; n=5 → `[null,0,1,2,3,4,0,null]`; n=6 → `[null,0,1,2,3,4,5,null]`. `block` is the block index (0–7 here) and `blockEnd` the last bar of a block. Export `VERSE_BLOCK` for the 4-bar case only (the 2-bar case is `VERSE_SHORT_BLOCK = 2`).
- `compose.ts`: nothing but what follows from `episodeAt` (cards map includes every episode card; `style.episodes` lists up to six).

## Not in this step

Blending the tempo of several cards; changing how many routes are coloured (`COLOUR_SHARE`); the chorus (it plays the main card).

## Testing

- Clusters: every card in `CARDS` is in `CLUSTER_OF` exactly once; `CLUSTER_OF` has no unknown card.
- Plan: with 6 routes to 6 different countries of one cluster and 3 routes to 3 different clusters (one card each), the main card is in the first cluster; ties follow the written rule; existing plan tests keep passing (fix inputs, not assertions, when the cluster rule changes an expectation, and say so).
- Episodes: for 0–3 cards `episodeAt` equals the old table (kept tests); for 4, 5, 6 cards the eight-block patterns above; `blockEnd` every second bar; fills every second bar of the verse only in a piece with episodes; none outside the verse.
- Variety test and goldens: goldens re-captured where the plan changes (reason in the comment).
