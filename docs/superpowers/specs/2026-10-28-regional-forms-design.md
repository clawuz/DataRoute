# Regional forms: the horon, the halay and the uzun hava have their own shape

Date: 2026-10-28. Branch: `feat/ui-v2`. From `docs/music-regional-turkish.md` (research) and `docs/music-instrument-idioms.md` (forms). The user: "there is no general Karadeniz feeling" and agreed to the whole list in order: (1) slow-to-fast form, (2) uzun hava free-time intro, (3) metre variants per card, (4) a real kemençe recording (a search and a permission, not code).

## Today

Every piece has the same 64-bar form (intro 8, verse 16, build 8, chorus 20, break 4, outro 8) and the same groove speed in every section; only the loudness and the roles change. A horon or halay does not start slow and thicken; a long air (uzun hava) does not start in free time.

## The change: three card forms (`GenreCard.form?: "horon" | "halay" | "uzunhava"`) and metre variants (`GenreCard.cells?`)

### A. `horon` (card `karadeniz`): düz horon → yayma → dik horon
- **Intro (bars 0–7):** düz horon: slow and sparse: the drone (the tulum/kemençe drone voice) and the hook playing ONLY the first hit of each bar as a long note (length 3 beats), no drums except the kudüm/frame drum on beat 0 of every second bar.
- **Verse:** yayma horon: the card's figure at its normal speed, drums as today (the main figure), the hook plays its two bars of four.
- **Build and chorus:** dik horon: the figure at **double speed**: every unit of the cell is halved so the figure repeats twice per bar (hits double; the hook motif is taken from the bank for `min(2 × hits, 9)` hits), the hook notes are half as long, the kick lands on the strong places of both repeats, the hat plays every hit, the bass doubles its pulse.
- **Break:** back to the sparse düz horon (as the intro, without the kudüm). **Outro:** the verse figure thinning out: hook on the first hit of each bar again.

### B. `halay` (card `dogu`): heavy slow davul → fast halay
- **Intro:** the davul (frame drum voice, the `perc`) alone on the strong beats of the figure (heavy: vel × 1.2) and the zurna/lead voice as a long call: the hook plays the first hit of each bar as a long note; no bass, no hat.
- **Verse:** the figure at normal speed. **Build, chorus:** the figure at double speed as in A (hits double, hook from the bank for `min(2h, 9)` hits), davul accents on the strong places. **Break, outro:** the intro shape (davul and the long call).

### C. `uzunhava` (cards `icanadolu`, `mevlevi`): a free-time long air, then the metre
- **Intro (bars 0–7) and outro (bars 56–63):** free time: **no drums, no bass, no pluck**, only the pad/drone voices (each bar one long note, no re-strike on beats) and the hook as **long, off-grid notes**: each hook note starts at a deterministic offset in ±0.3 beat of its grid place (hash of route key and bar), lasts 1.5 to 3.5 beats, and there is one rest beat between phrases (the second bar of every pair of bars is shorter); the melody comes from the bank for `hits = 2` (a slow line); loudness × 0.8.
- **Verse to break:** the normal metred groove (as today). The transition: bar 7 plays the figure's first hit only (a pick-up), bar 8 starts the groove.

### D. Metre variants (`GenreCard.cells?: { cell: number[]; accent?: number[] }[]`)
A card may list alternative figures; the piece takes `cells[routeHash(main card id + first route key) % cells.length]` instead of `cell` (when the field is absent nothing changes). Entries:
- `karadeniz`: `[2,2,3]` (7/8), `[2,2,2,3]` (9/8), `[1,1,1,1]` (the 4/4 dik horon), `[3,2,2]` (7/8 alt).
- `dogu`: `[1,1,1,1]` (4/4), `[1,1]` (2/4), `[2,2,2,3]` (9/8), `[2,2,1]` (5/8).
- `zeybek`: `[3,2,2,2]`, `[2,2,2,3]`, `[2,2,3,2]` (the three groupings of the research).
The episode grooves, the journey and everything that reads `card.cell` use the chosen cell (`grooveOf` takes it from a function `cellOf(card, seed)` so that one piece always uses one choice per card).

### E. The kemençe recording (no code)
A search for real kemençe/tulum/zurna recordings (Freesound, Commons, Internet Archive) with all licences flagged; a list and a request for download permission to the user.

## Code shape

- `genres.ts`: `form?` and `cells?` on `GenreCard`, the three entries above, `cellOf(card, seed)`.
- `compose.ts`: `formAt(card, section)` returns the **speed** (`slow` | `normal` | `double`) and the **mode** (`sparse` | `free` | `normal`) of a bar for the main card and the episode/stage cards; `grooveOf(card, speed)` builds the doubled figure; roles are thinned in `sparse`/`free` bars (see A–C); the free-time intro uses the new note placement; everything else is unchanged for cards without a `form`. Pieces whose cards have no `form` stay byte-identical (the existing goldens' `GOLDEN_NO_COLOUR` rows for non-form cards stay as they are).
- The melody: the hook's motif for a doubled bar is taken from the bank/walk with `min(2 × hits, 9)` hits; the existing hit-index logic (`hi % m.length`) keeps working.
- Gestures (`gestures.ts`) are unchanged; long notes in the intro get the tremolo/glide gestures by their rules.
- Docs: `docs/music-data-mapping.md` (a "Regional forms" section), `docs/music-genre-cards.md` (the `form` and `cells` fields), `docs/music-regional-turkish.md` (status).

## Not in this step

A real tempo ramp (the tempo of a piece is fixed: the change of speed is the doubled figure); the 7/16 horon; Akdeniz/yörük (no source); real kemençe audio.

## Testing

- `genres`: `cellOf` determinism and range; cards without `cells` unchanged; every `cells` entry has a positive hit and a matching `accent` length.
- Composed pieces for a Karadeniz selection (`TZX,RZV,OGU` home IST) and a Doğu selection (`VAN,ERZ,ERC`): the number of hook notes per bar in the intro < the verse < the chorus (strictly increasing means over bars 0–7, 8–23, 32–51); drums absent in the first bars of a `halay`/`horon` intro except the kudüm/davul; the chorus kick/bass hits per bar ≥ 1.8 × the verse's; for `uzunhava` (`ESB,ASR,KYA,NAV` home IST: the Konya route has `mevlevi`, ESB… `icanadolu`): in bars 0–7 no kick/backbeat/hat/pluck/bass note, hook notes off the grid (at least half of them off the beat grid by > 20 ms) and longer than 1.5 beats on average; from bar 8 the usual groove.
- Invariants over 300 seeded selections: no NaN/negative, ranges, note count ≤ 6000, determinism, `drawDur` bounds.
- Goldens re-captured (reason in the comment).
