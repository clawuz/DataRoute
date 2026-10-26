# Destination styles: every selection sounds like where it goes

Date: 2026-10-26. Branch: `feat/ui-v2`. Builds on the genre cards (`genres.ts`), the journey (`journey.ts`) and the world pack.

## Why

The user: "every selection gives the same feeling". Three causes in the code:

1. The **main card** (tempo, scale, chords, groove, the family of sound) comes from the place the trip LEAVES (`planCards`: `homeCards`, `takeGeneric`).
   With `h=IST` that is always Turkey: one of four cards (`cinematic`, `anatolian`, `romantic`, `karsilama`). Every piece starts from the same four feels.
2. The cards are by COUNTRY (`BY_ISO`); all 53 Turkish airports, all 15 US ones, all 11 Italian ones are the same. Turkey has no regional music
   (Karadeniz, İç Anadolu, Akdeniz, Ege, Doğu Anadolu), Greece, Italy and Spain share cards with others, the US has no R&B, country or classical.
3. The 27 cards have no traditions the user named: Black Sea horon (kemençe, tulum), Central Anatolian bağlama/saz, Turkish Mediterranean (ud, tambur, kanun),
   East Anatolian davul-zurna, Greek, Italian symphonic, Spanish classical guitar, R&B, country, classical.

## Decisions (the user's, 2026-10-26)

- **The main style follows the weight of the destinations**: the card that most routes go to (by far end; ties by total distance, then hash) is the main card.
  Tempo, scale, chords, groove and family come from it. Home (where the trip leaves) is no longer the main card; it is `plan.home` (the old choice of the main card, kept as it was).
- **Missing instruments are approximated with the pack's instruments** (zurna → DUDUK / NEY_MAKAM, tulum → BAGPIPE / BAGPIPE_DRONE, ud → NYLONGUITAR / KANUN, tambur → SAZ,
  bouzouki → SAZ / NYLONGUITAR, davul → FRAMEDRUM / BENDIR, mandolin → HARP / PSALTERY); real recordings replace them later (`docs/music-pack-world-ledger.json`, parked list).

## What changes

### 1. New cards (11), by hand, like the existing ones (`genres.ts`; voices of the world pack in `BASE_CARDS` itself or `WORLD_VOICES`)

| id | name | family | bpm | scale (visited / wish) | cell (units) | notes |
|---|---|---|---|---|---|---|
| `karadeniz` | Black Sea horon | folk, fast | 112–126 | USSAK / HICAZ | [2,2,3] (7/8), accent [1.3,0.9,1.1] | melody KEMENCE_MAKAM, BAGPIPE (tulum), pluck BAGLAMA_EXTRA, SAZ; held BAGPIPE_DRONE, CELLO; perc FRAMEDRUM |
| `icanadolu` | Central Anatolian bağlama | folk | 88–108 | USSAK / HICAZ | [2,1,1,2,2] (düyek 8), accent [1.25,0.85,0.85,1.1,0.9] | melody SAZ, BAGLAMA_MAKAM; pluck BAGLAMA_EXTRA, SAZ; held CELLO, VIOLA; perc BENDIR |
| `akdeniz` | Turkish Mediterranean (ud, tambur, kanun) | folk | 96–114 | HICAZ / NIHAVENT | [3,2,2,3] (aksak 10), accent [1.25,0.9,0.9,1.1] | melody KANUN, NYLONGUITAR (ud); pluck NYLONGUITAR, SAZ (tambur); held CELLO, VIOLA; perc DARBUKA |
| `dogu` | East Anatolian davul-zurna halay | folk, fast | 104–124 | HICAZ / SEGAH | [1,1,1,1], accent [1.35,0.8,1.1,0.8] | melody DUDUK, NEY_MAKAM (zurna); pluck SAZ, BAGLAMA_EXTRA; held DUDUK, CELLO; perc FRAMEDRUM (davul) |
| `zeybek` | Aegean zeybek | folk | 82–98 | USSAK / HICAZ | [2,2,2,3] (9/8), accent [1.3,0.85,0.9,1.15] | melody CLA, SAZ; pluck SAZ, NYLONGUITAR; held CELLO, VIOLA; perc DARBUKA |
| `greek` | Greek syrtos & kalamatianos | folk | 100–120 | HICAZ / DORIAN | [3,2,2] (7/8), accent [1.3,0.9,1] | melody SAZ (bouzouki), CLA, NYLONGUITAR; pluck NYLONGUITAR, SAZ; held ACCORDION, CELLO; perc BENDIR |
| `italian` | Italian symphonic & tarantella | symphonic | 84–110 | MINOR / MAJOR | [3,3] (6/8), accent [1.2,0.9] | melody VIOLIN, HARP, FLUTE; pluck HARP, PSALTERY; held CELLO, VIOLA, HORN; perc TIMP; prog [[0,3],[8,4],[3,4],[7,4]] |
| `classical` | Classical (Vienna) | chamber | 92–116 | MAJOR / LYDIAN | [1,1,1,1], accent [1.15,0.85,1,0.85] | melody VIOLIN, FLUTE, OBOE, PNO; pluck PNO, HARP; held CELLO, VIOLA, BSN; perc TRI; prog [[0,4],[5,4],[7,4],[0,4]] |
| `rnb` | R&B / neo-soul | pulse | 76–96 | DORIAN / MIXO | [3,3,2], accent [1.2,1,1.1], swing 0.2 | melody RHODES, EKEYS, TENORSAX; pluck GUITAR_EL, EKEYS; held RHODES, CELLO; bass BASS_EL, UPRIGHTBASS; perc CONGA; prog [[0,3],[5,3],[10,4],[3,4]] |
| `country` | Country & Americana | folk | 92–116 | MAJOR / MIXO | [1,1,1,1], accent [1.2,0.85,1,0.85], swing 0.12 | melody VIOLIN, HARMONICA, GUITAR_AC; pluck GUITAR_AC, FOLKHARP; held HARMONICA, CELLO; bass UPRIGHTBASS; perc TAMB; prog [[0,4],[5,4],[7,4],[0,4]] |
| `spguitar` | Spanish classical guitar | chamber | 76–96 | MINOR / MAJOR | [3,1,2,2], accent [1.25,0.9,1.05,0.95] | melody NYLONGUITAR, FLUTE; pluck NYLONGUITAR; held CELLO, VIOLA; perc FRAMEDRUM; prog [[0,3],[10,4],[8,4],[7,4]] |

Each also gets an entry in `IDIOMS` (`idiom.ts`: the way its melody moves; makam-like cards bias −1) and, when the card has a signature low voice, in `DRONE_BY_CARD`
(karadeniz → BAGPIPE_DRONE). The cards that already exist stay as they are. All values are hand-set judgements to be tuned by ear (the docs say so).

### 2. Destination → cards, by airport first (`genres.ts`: `cardsOfAirport`)

An `BY_AIRPORT` table (IATA → card ids, the first is the most likely; the hash of the route picks among them) is looked up before `BY_ISO` and `BY_REGION`.

- **Turkey** (53 airports; unlisted ones — Marmara and the big hubs — keep `BY_ISO.TR`):
  Karadeniz: TZX RZV OGU SZF NOP KFS ONQ MZH TJK → `karadeniz`; İç Anadolu: ESB ASR KYA NAV VAS AOE ISE KZR → `icanadolu`; Akdeniz: AYT GZP DLM ADA COV HTY KCM → `akdeniz`;
  Ege: ADB BJV DNZ USQ EDO CKZ → `zeybek`; Doğu / Güneydoğu Anadolu: VAN ERZ ERC KSY AJI IGD MSR BGG EZS MLX DIY BAL MQM SXZ NKT YKO GNY GZT ADF → `dogu`;
  Istanbul and the rest of Marmara (IST SAW KCO TEQ YEI): `anatolian`, `karsilama`, `cinematic`, `jazz` (as today plus jazz).
- **Greece / Cyprus**: GR → `greek`; ECN → `greek`, `anatolian`.
- **Italy**: all → `italian` (and `romantic` second).
- **Spain**: Seville, Málaga → `flamenco`; Madrid, Barcelona, Bilbao, Valencia, Zaragoza → `spguitar`, `flamenco`.
- **Germany / Austria / Switzerland**: `classical`, `baroque` (DE also `pop`).
- **United States**: JFK EWR BOS IAD → `jazz`, `classical`, `pop`; MIA → `salsa`, `pop`; LAX SFO OAK SEA → `pop`, `rnb`, `cinematic`; ATL DTW ORD → `rnb`, `funk`, `jazz`; DFW IAH DEN → `country`, `rnb`; any other US airport → `pop`, `jazz`, `country`, `rnb`.
- **United Kingdom**: LHR LGW STN MAN BHX → `pop`, `classical`, `celtic`; EDI → `celtic`.
- **Australia**: `country`, `pop`. **France** keeps `romantic`, `jazz`, `pop`.
- Every card must be reachable from at least one airport (a test).

### 3. The main card follows the destinations (`genres.ts`: `planCards`)

- `colourOf[i]` (the card of route i's far end; unchanged, now `colourCardOf`) is counted by card id; `main` = the card with the most routes, ties by the sum of `distKm`, then by `routeHash(card.id)`.
- The old choice (`homeCards` pick, with `takeGeneric`) stays but becomes `plan.home` (a new field of `CardPlan`).
- `allocateColour` as before (the routes of the main card are not coloured, the rest share the budget).
- With one route, main = the card of its far end.

### 4. Home and the journey (`journey.ts`, `compose.ts`)

- The home drone follows `plan.home` (not main): `droneVoice(plan.home.id)`.
- The journey: **intro and outro play the home groove** when `plan.home !== plan.main`; the **verse plays Istanbul's** when the trip changes planes there (unchanged); the **build and the chorus play the main card** (the destination sound IS the main now, so `dest` goes away); the break plays Istanbul's on a transit trip, else the main.
  `journeyOf` returns `{ home: GenreCard | null, transit: GenreCard | null }` (home null when it is the main card); null when both are null. Pieces with one sound stay unchanged.

## Not in this step

Real recordings of zurna, tulum, ud, tambur, sitar; per-city cards for countries other than the ones above; new samples; the exact quotation of known tunes; changing `COLOUR_SHARE`.

## Testing

- Cards: every new card has valid fields (scale 5 or 7 degrees ascending in [0,12), bpm within 76–126, cell sums > 0 with at least one hit, accent length = cell length when given, four voices lists non-empty, every voice exists in the pack or is a world family), has an idiom entry, and appears in the docs table.
- Mapping: every airport of `destinations.json` returns ≥ 1 card; the Turkish regions are as listed; every card is reachable from at least one airport.
- Plan: `main` = the card with the most routes; ties as written; `plan.home` equals the old choice; with `h=IST` and eight routes to the US the main card is not Turkish.
- Journey: the sections as in 4; golden hashes are re-captured at this step (a comment says why).
- Variety audit (a probe script, results pasted in the docs): over 300 random selections of 3–8 places, no card is the main card in more than 20% of them, at least 18 distinct main cards appear, the bpm spreads over 76–126.
