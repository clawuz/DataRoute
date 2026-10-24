# World instruments, share-by-region composition, on-demand samples, credits

Date: 2026-10-24. Branch: `feat/ui-v2`. Site: https://worldofmusic.web.app (deploys only when the user says so, to `hosting:main` only).

## Goal

The personal site plays recorded instruments from the lite pack (VSCO orchestra + a few Freesound world instruments). A second pack
("world", 67 instruments, 528 files, ~17 MB, staged in `tmp-music-v1/pack-full/` and listened to by the user) adds guitars, basses,
keyboards and regional instruments. This work puts the pack on the site, makes the music use it by where the trip goes, loads only what
a piece plays, and credits every source.

Out of scope (decided by the user): a minimum of three destinations, a new "few to many" listening page, replacing the music rules
(`compose.ts` stays rule-based, deterministic, a function of the routes only), the missing instruments (tulum, sitar, zurna, …).

## 1. The pack on the site

- `scripts/samples/export_world_pack.py` copies the staged pack into `globe/public/samples/world/` (mp3 + `manifest.json`) and writes
  `globe/src/audio/world-pack.ts` (generated, committed): the instrument names, each one's family and (for NSynth) its variants.
- All 67 instruments go in. The 23 NSynth recordings are variants of six families (`GUITAR_AC`, `GUITAR_EL`, `EKEYS`, `KEYS_AC`,
  `ORGAN_EL`, `BASS_EL`); a card names the family and the composer picks the variant from the route hash (deterministic).
- `lite` stays untouched. A name present in both packs plays from lite (the existing one), so nothing that sounds today changes.
- Types: world instruments are a separate string type `WorldInstrument` (from the generated list), not new members of the
  `Instrument` union, so the exhaustive synth tables keep compiling. `baseOf` maps every world instrument to a synthesised stand-in
  by its kind (held reed/flute → FLUTE, plucked string → HARP, keys → PNO, bass → BASS, hand drum → TOM, …) for the first seconds and
  for offline.

## 2. On-demand loading (sampler)

- Today `player.ts` calls `sampler.load("/samples/lite/manifest.json")` on start and decodes every file. New: `sampler.use(manifestUrls)`
  reads the manifests (small JSON) once; `sampler.ensure(names)` fetches and decodes only the files of those instruments and resolves
  when they are present or after a 4 s timeout (an instrument that did not arrive is played by its stand-in; no error is shown).
- `Experience`/`player` collects the instruments of a piece (`new Set(piece.notes.map(n => n.inst))` resolved through the variant
  rule), calls `ensure` and then starts. The play button shows a loading state while it waits.
- Already decoded buffers are reused when the user changes the selection (cache by URL, as now).

## 3. Composition by the share of each region

Kept: the card of the **starting** airport gives tempo, scale, progression and the main instruments; the routes' roles by length;
the tempo lift by route count; everything deterministic.

Replaced: the rule "every third route takes its destination's card" in `planCards`.

- Each route's colour = the card of its far end (`cardsOfAirport(far, region)` with the hash choice as today). Routes whose colour is the
  main card are not coloured.
- Colour budget: `round(0.6 × n)` routes (at least one when n ≥ 2, never more than the number of routes not on the main card). Each
  colour present gets `max(1, floor(share × budget))` routes, `share` = its routes / all coloured candidates; the rest of the budget goes
  to the larger colours first (ties by the hash of the card id); a colour with candidates always gets at least one route, even beyond the budget. Within a colour the longest routes are taken first (they carry the audible roles).
- Cards get an optional `bass` voice list (the bass route draws from it; the chord pad never does, so a bass guitar is never asked to play chords).
- A coloured route plays its card's figure, accents, instruments **and melody scale**; chords stay in the main card's scale so the
  harmony holds.
- Cards get the new instruments (a table in `docs/music-genre-cards.md` is updated with the code):

| Cards | New voices |
|---|---|
| anatolian, karsilama, arabic | `NEY_MAKAM`, `KEMENCE_MAKAM`, `BAGLAMA_MAKAM`, `BAGLAMA_EXTRA`, `BAGPIPE` (karsilama) |
| persian | `SANTUR`, `DARBUKA_VCSL` |
| hindustani | `TANPURA`, `TABLA` |
| eastasia | `KOTO`, `SHAKUHACHI`, `ERHU`, `KAYAGEUM`, `DANTRANH` |
| gamelan | `VIBES`, `STEELDRUM` (stand-ins, no gamelan recordings) |
| westafrica, eastafrica | `KALIMBA`, `MBIRA`, `DJEMBE` |
| salsa, mariachi, flamenco, bossa, tango | `NYLONGUITAR`, `STEELDRUM`, `ACCORDION` (tango), `UPRIGHTBASS` |
| celtic | `TINWHISTLE`, `BAGPIPE`, `FRAMEDRUM` |
| slavic, centralasia | `ACCORDION`, `PSALTERY`, `HARMONICA`, `BENDIR` |
| jazz, funk, pop, cinematic | `GUITAR_EL`, `EKEYS`, `BASS_EL`, `UPRIGHTBASS`, `TENORSAX`, `STEINWAY`, `DRUMKIT` |
| romantic, baroque | `STEINWAY`, `KAWAI`, `HARPSICHORD`, `ORGAN` |

  Cards keep their current synth/lite voices as the fallback entries of each list; the choice from a list stays the existing hash rule.
- A region with no world instrument keeps today's voices.

## 4. Credits page

- `scripts/samples/make_credits.py` builds `globe/public/credits.html` from the ledgers (`docs/music-pack-lite-ledger.json`,
  `docs/music-pack-freesound-ledger.json`, the world pack's `ledger.json`). Regenerable, never hand-edited.
- Lists: VSCO 2 CE and VCSL (CC0, Versilian Studios), Freesound sounds (CC0 as a thank-you, CC BY with author, title, link, licence),
  Google NSynth (CC BY 4.0), ajaysm's makam scales, adsb.fi (live flights, linked), NASA textures, Turkish Airlines fonts note.
- Styled like the site (same fonts and colours); a "Credits" link in the footer/landing that opens it. Included in both builds.

## Testing and verification

- Vitest: the share allocation (counts, determinism, the minimum, ties, a single colour, no coloured candidates), variant choice is a
  function of the hash, manifest ↔ files exist, every world instrument has a stand-in.
- `npm --prefix globe run build:personal` (tsc + vite) passes.
- Browser check on the dev server with three selections (one region, three regions, a long list): the network log shows only the
  instruments of that piece being fetched; the credits page renders.
- No deploy. The user says "canlıya al" for `hosting:main`.

## Risks

- Pack files in git: +~17 MB. Accepted (lite is committed the same way).
- Some world samples were never auditioned on the globe itself (pitch roots were measured, not heard in context); a bad note is fixed by
  dropping the zone with `scripts/samples/prune_pack.py` and re-exporting.
- `groove.test.ts` is a known flaky test, unrelated.
