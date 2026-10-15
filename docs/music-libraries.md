# Sound libraries for the personal pieces — sources and licences

The personal pieces (cards 1 and 2) are played by `globe/src/audio/sampler.ts` from recorded instruments when a pack is
published at `/samples/lite/manifest.json` (later `/samples/full/`). Without a pack the synthesised voices play.
Every file that goes into a pack must be listed here with its source and licence.

## Candidates (checked 2026-10)

| Source | Contents | Licence | Use |
|---|---|---|---|
| [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE) (Versilian) | strings, woodwinds, brass, percussion, harp, organ | **CC0 1.0** | Main source. Levels are uneven and there are no loops: normalise and trim. Repo ≈ 2.3 GB: fetch single files only |
| [VCSL](https://github.com/sgossner/VCSL) (Versilian Community Sample Library) | wide range, incl. world percussion | **CC0 1.0** | Look for darbuka / frame drums / plucked world instruments. Repo ≈ 4 GB: fetch single files only |
| [University of Iowa MIS](https://theremin.music.uiowa.edu/MIS.html) | flute, oboe, clarinets, bassoon, saxes, horn, trombones, cello, double bass, piano, vibraphone/marimba, percussion | free for any project, no restrictions | Dry single notes at 3 dynamics: good for sustained winds and strings |
| Sonatina Symphonic Orchestra | full orchestra, SFZ | CC **Sampling Plus 1.0** | Only after its terms are checked against our use |
| Philharmonia Orchestra samples | whole orchestra + percussion | free for music; **not to be redistributed "as is" as a sample pack** | Not used without written permission (digital@philharmonia.co.uk) |
| Salamander Grand Piano | piano | CC-BY 3.0 (to verify) | Piano, 6–8 notes; credit needed |
| FluidR3_GM / MuseScore General | GM soundfont | MIT | Fallback only |
| Tone.js instrument packages | single instruments | CC-BY 3.0 | Fallback only |
| Saz, kanun, ney, oud, darbuka | **no open library of quality found** | commercial packs (e.g. Soundiron Acoustic Saz) forbid redistribution of samples | Search Freesound for CC0 / CC-BY single notes; otherwise keep the synthesis |

## Ledger of files in a published pack

| Pack | Instrument | File | Source | Licence | Credit needed |
|---|---|---|---|---|---|
| lite | strings, woodwinds, brass, harp, mallets, percussion (30 instruments) | see [music-pack-lite-ledger.md](music-pack-lite-ledger.md) | VSCO 2 Community Edition | CC0 1.0 | no |
