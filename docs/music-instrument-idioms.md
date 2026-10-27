# How the instruments are really played, and what the composer should do about it

Date: 2026-10-26. Status: **research and plan**, nothing of this is built yet.

Why: every piece has the same skeleton (64 bars, four one-bar chords, a hook of four motifs, the roles pad / bass / hook / pluck / drums by rank) and
every instrument plays the same kind of thing: one note after another. A kemençe, a nylon guitar, a kanun and a tenor saxophone all get "a note on a
slot". Real music does not work like that: each instrument has its own gestures (strumming, tremolo, drone strings, glides, grace notes, walking
lines), and each tradition has its own *form* (taksim → usul; alap → jor → jhala; llamada → falseta; AABA; cyclic layers).

## 0. What this is based on

- **Sourced** (web search 2026-10-26; the sources are scholarly pages, teaching sites and encyclopedia entries, the search results were thin on detail,
  and the points are marked ✔ below): a 2026 Acta Acustica study on the kemençe; theses on bağlama technique (Sakarya, İTÜ); flamenco method
  vocabulary; Darbar (Hindustani format); Turkish makam performance order (taksim → peşrev → …); jazz rhythm-section role handouts (Marshall University,
  Dan Adler); kanun taksim studies (İnönü, Okan); Wikipedia "Colotomy"; Riffhard on bossa nova guitar; country guitar lessons (Premier Guitar, Lick Library).
- **General musical knowledge** (marked ○): things I know from the literature of these traditions but did not find a page for in this round; to be
  checked by ear and by the user, who knows these traditions better than a generated plan does.
- **Not done**: no melodies are copied from any recording or score. Only *how an instrument is used* and *how a piece is shaped* are taken.
  (SymbTr stays CC BY-NC-SA: statistics only, as before.)

## 1. Instruments: what they do, and what the composer can generate

"Gesture" = what one abstract note (pitch, length, loudness) becomes. All gestures are made of the same ingredients the sampler can play:
several notes at once, short notes in a quick series, a note that starts a little before/after, a pitch that glides (playback-rate ramp), a
quieter grace note.

| Instrument (pack name) | How it is played | Gesture to generate |
|---|---|---|
| **Kemençe** (KEMENCE_MAKAM) | Horsehair bow, no fingerboard, fingertips on the strings; fast articulation for horon dances ✔; a drone (often the open bass string) under a tune on the higher strings, often in parallel fourths ✔; two strings can sound together ✔ | Every melody note is doubled a fourth/fifth below as a quiet second voice; the open-string drone note repeats under it; very short notes in runs (horon: quick notes in groups of 2+2+3), 1-2 grace notes before beats |
| **Bağlama / saz** (SAZ, BAGLAMA_*) | Plectrum (mızrap/tezene) with a stroke direction that follows the regional style ✔; **şelpe** = open strings struck with the fingers ✔; left hand: tapping, string pulling, vibrato, tremolo, trill, glissando ✔; tuning families (düzen, bozuk düzen) ✔ | Melody notes as quick down-up strokes; on strong beats a **strum** across 2-3 notes (şelpe: a muted rhythmic chord on the off-beats); trills and slides (pitch glide of a semitone) on long notes |
| **Kanun, santur** (KANUN, SANTUR) | Two plectra; **tremolo** (fast repeated notes) on long notes ✔; octave doubling and fast passages ✔; players differ in how much they ornament ✔; taksim solo, sometimes over a tonic drone ✔ | A note longer than a quarter becomes a tremolo (12 hits a second, softer); octave doubling on phrase starts; fast scale runs between phrases |
| **Ud / nylon guitar as ud** (NYLONGUITAR) | Plectrum, a "silent tap" linking two notes ✔ (forum, weak); rhythmic and melodic; short decaying notes | Two-note hammer-ons (grace note + main note, 40 ms apart); a rhythmic strum on usul beats; melody in short decaying notes |
| **Zurna + davul** (DUDUK, NEY_MAKAM + FRAMEDRUM) | Loud double-reed with continuous circular-breathed phrases and ornaments, a drone (ison) under it ○; the davul keeps the usul with a heavy beat on the strong places and a light stroke between ✔ (the pair is the standard outdoor dance duo; 7/8, 9/8, 11/8 practised ✔); halay dances | Melody never rests for long; a held drone note under the zurna (the tonic); davul: strong stroke on `strong` beats of the cell, light strokes on the others |
| **Ney** (NEY_MAKAM) | Breathy solo wind; phrases with breath gaps, long notes with vibrato; leads the Mevlevi first part ✔ | Long notes with delayed vibrato (slow pitch wobble), a breath rest between phrases, grace notes slide in from below |
| **Flamenco guitar** (NYLONGUITAR) | **Compás** (12 or 4 beats) ✔; **rasgueado** (finger strum) ✔; **picado** (fast single notes) ✔; **golpe** (tap on the top) ✔; alzapúa (thumb) ✔; **falseta** (solo passage) between **llamadas** (calls), cierre, letra, escobilla ✔ | A rasgueado = 4-5 notes of the chord spread over 60-80 ms, down-up; picado = runs of 16ths on the scale; a golpe = a soft short click on the off-beat; the form alternates falseta (melodic) and rasgueado (compás) |
| **Spanish classical guitar** (NYLONGUITAR) | p-i-m-a arpeggio, thumb on the bass, melody on the top strings ○ | Arpeggio patterns: thumb = chord root on beats, i-m-a = upper chord notes in order, a melody note on top |
| **Bossa guitar** (NYLONGUITAR) | Thumb plays bass on beats 1 and 3, fingers play the chord on the off-beats and on 16th anticipations ✔; the bass alternates root and fifth ✔; a two-bar cycle from Brazilian 2/4 thinking ✔ | A fixed 2-bar pattern: bass (root, fifth), chord on `& of 2`, `4`, `& of 1` etc. (the classical "bossa clave"), soft |
| **Samba** (cavaquinho = PSALTERY, surdo, tamborim) | Cavaquinho: steady 16th strum ○; surdo: strong second beat ○; tamborim and pandeiro: a 16-step figure ○ | Strum 16ths with the accents of the card; bass drum on 2 |
| **Country guitar** (GUITAR_AC) | **Boom-chick**: a bass note, then the strummed chord, alternating bass notes ✔; **Travis picking**: the thumb keeps an alternating bass, the fingers play melody ✔; chicken pickin' ✔ | Thumb = alternating root/fifth on every beat, fingers = a syncopated melody over it; chords strummed on 2 and 4 |
| **Fiddle** (VIOLIN), pedal steel | Folk melody with double stops, slides and short bow strokes ◐ (double stop and slide built, section 1b) | Melody notes with a grace-slide in, a drone string, double stops on the strong beats |
| **Sitar / sarod / Hindustani ney** (TANPURA drone + a melody voice) | Static drone that never changes chord ✔; instruments imitate vocal ornament ✔: **meend** (glide), **gamak** (shake), **andolan** (slow oscillation) ✔; alap has no pulse ✔ | Tanpura: four strings in a 4-note cycle (Pa-Sa-Sa-lower Sa) with 2 s between strokes; the melody glides from note to note (pitch ramp), 4 or 5 notes per breath |
| **Tabla** (TABLA) | Fixed theka cycles (teental 16), the tabla enters at the gat ✔ | A 16-beat theka with a clap and a wave (strong/open/closed strokes) |
| **Jazz rhythm section** (UPRIGHTBASS, EKEYS, GUITAR_EL, TENORSAX) | Walking bass: quarter notes outlining the chord, starting on the root and approaching the next root by a fifth or a half step ✔; a 2-feel on beats 1 and 3 in ballads ✔; the ride cymbal keeps the pulse, hi-hat on 2 and 4 ✔; piano/guitar **comp**: chords punctuating the rhythm, anticipations on the upbeat ✔; guitar sometimes steady quarter chords ✔ | Bass: 4 quarters per bar from chord tones + passing note; comping: chords on `& of 2` and `4`, off-beat 8ths; ride: x . x x . x (swing); solos by the sax/piano over changes |
| **Gamelan family** (STEELDRUM, VIBES, GONG) | **Colotomic** cycle: gong ageng marks the largest cycle, kenong divides it in 4, kempul and ketuk subdivide further ✔; balungan (core melody) ✔; elaborating instruments play an "inner melody" that anticipates the balungan ✔; heterophony: the same melody played differently at once ✔ | A big cycle (e.g. 16 beats): gong on 1, kenong on 5/9/13, kempul between; the core melody one note per beat; an elaborating layer 2×/4× faster, the same notes ornamented |
| **West African ensemble** (DJEMBE, MBIRA, KALIMBA, bell) | Bell pattern as the timeline (Ewe) ✔; interlocking parts form a polyrhythm ✔; master drummer calls, others answer ✔; repeated cyclic layers ✔ | A bell (the `cell` of the card) never changes; 3-4 interlocking layers enter one by one; the master line (lead) varies over them, the response stays fixed |
| **Mbira** | Interlocking two-hand cycle, 12-24 beats ○ | Two interlocked 8th-note lines (left bass, right upper), repeated with slow variation |
| **Tango** (ACCORDION, VIOLIN, UPRIGHTBASS) | Marcato in 4 (the strong beats), arrastre (drag into the beat), yeites ○ | Four heavy quarters in the bass; the melody slides into the strong beats from a semitone below |
| **R&B / neo-soul** (RHODES, BASS_EL) | Sparse chords with extensions, a syncopated bass, a laid-back drum behind the beat ○ | Chords on the `&`, a bass that answers the kick, drums late by 15-25 ms |
| **Classical strings, piano** | Alberti bass, scale runs, trills before cadences ○ | Left hand: 1-5-3-5 pattern; trill on the last note of a phrase |
| **Accordion** (ACCORDION) | Musette waltz: bass note on 1, chord on 2 and 3 ○; tango: marcato ○ | Oom-pah-pah (bass, chord, chord) |
| **Bagpipe / tulum** (BAGPIPE, BAGPIPE_DRONE) | A continuous drone under a chanter that never stops; grace-note ornaments separate repeated notes ○ | Constant drone, melody with a grace note before every repeated note |

## 1b. Status (2026-10-27): the first gestures are built

`personal/gestures.ts`, applied at the end of `composePiece`. Added notes are hidden (`show: false`); see "Gestures" in `music-data-mapping.md`.

- **Kemençe**: built: double stop a fourth below, grace note a tone above on the beat, held open tonic each bar. Not built: the fast horon bow articulation.
- **Bağlama / saz**: built: şelpe on strong beats, glide into long hook notes. Not built: the regional stroke direction.
- **Kanun, santur**: built: tremolo on long notes with an octave on the first hit. Not built: maqam-specific fast passages.
- **Nylon guitar (ud, flamenco, bossa, samba)**: built: a card-spread strum on beats 0 and 2 of the bar (down strokes). Not built: rasgueado patterns, picado, golpe, the p-i-m-a arpeggio.
- **Upright bass**: built: the jazz walking line, the root-fifth alternation in country, bossa, samba, salsa and tango. Not built: the tango marcato and arrastre.
- **Tanpura**: built: the four-stroke cycle (Pa, Sa, Sa, low Sa). Not built: the jawari buzz.
- **Ney**: built: slides into notes, deeper at phrase starts. Not built: delayed vibrato.
- **Accordion**: built: oom-pah (bass on beats 0 and 2, a two-note chord stab on beats 1 and 3). **Fiddle (violin)**: built: a hidden fifth below on hook notes of 0.5 s or more (the double stop) and a glide into the first note after a gap. Not built: the drone string and double stops on the strong beats only.
- Not started: tabla theka, gamelan colotomic cycle, mbira, string trills, form templates.

## 2. Forms: what a piece of each tradition is shaped like

| Tradition | Form | What changes in the composer |
|---|---|---|
| **Turkish art music / makam** (akdeniz, karsilama partly) | Taksim (free, solo, no meter) → peşrev in an usul → the sections ✔; makam = scale + seyir (melodic path) ✔ | Intro = a solo taksim in free time (one voice, drone), then the usul cycle |
| **Turkish folk** (anatolian, icanadolu, karadeniz, dogu, zeybek) | Short phrase cycles over an usul or aksak figure; dance pieces repeat the same melodic phrase with variation; a drone underneath; no chord changes ○ | No four-chord progression: tonic drone + melody + the figure; sections = louder/denser repeats; kemençe/zurna lead |
| **Hindustani** | **Alap** (slow, free, no pulse) → **jor** (steady pulse, medium) → **jhala** (fast climax) ✔; gat with tabla in a fixed theka ✔; drone does not change chord ✔ | The piece accelerates: tempo and note density grow section by section; the hook voices glide; no chords |
| **Arabic / khaleeji / maghrebi** | Taqsim (solo, free) then a maqsum/saidi cycle, call and response between the soloist and the ensemble ○ | Intro taqsim, then rhythm cycle with a soloist and answering ensemble (reuses the new call-and-response) |
| **Flamenco** | Compás cycles; falseta / llamada / cierre / letra / escobilla ✔ | Sections alternate rasgueado compás and falseta; calls (a loud strum) mark a section change |
| **Jazz** | Head (the tune) → solos over the changes → head ○; AABA 32 bars (not found in the search, from general knowledge) ○ | A 32-bar chorus with a bridge (B) in a different key; the hook plays the head, then the sax/piano "solo" is a walk over the chord tones |
| **Blues / country** | 12-bar form: I I I I / IV IV I I / V IV I V ○ | Chord table for the 12 bars; chorus = 12 bars repeating |
| **Gamelan** | A colotomic cycle repeated with growing elaboration ✔ | No chords; sections are cycle counts: the balungan stays, the elaborating layer gets denser |
| **West African** | A timeline plus interlocking layers, entering one by one, master drummer calls ✔ | Layers added every 4 bars (the build is the form), call and response, no chord changes |
| **Bossa / samba** | Verse-like cycles over a 2-bar groove, cadences of ii-V-I ○ | A 2-bar clave pattern as the base |
| **Classical (Viennese), baroque, Italian, Russian** | Theme and variations, period (4+4) phrases, sequences, trills at cadences ○ | Antecedent-consequent phrases; sequence (the motif repeated a step lower); a trill at every cadence |
| **Pop / R&B / Bollywood / cumbia** | Verse-chorus (what we have) ○ | Keep |

## 3. How to build it (a plan, in the order that gives the biggest audible change first)

The generator today: `compose.ts` makes `notes: {t, d, instrument, freq, vel, route, …}`. Two new layers go on top:

**A. An articulation layer `gestures.ts`** (pure functions, after the notes are made, before `humanize`): `gesture(instrument, note, context) → note[]`.
Ingredients: `strum` (spread chord), `tremolo` (repeated notes), `graceIn` (a quick note before), `doubleStop` (a second voice a fourth/fifth/octave
away), `glide` (pitch ramp to the note — needs `PersonalNote.glideFrom?: number` and the player ramping `playbackRate`), `drone` (a repeating
low note), `arpeggio` (the chord notes in order), `walk` (bass quarter notes), `comp` (off-beat chords). One table `GESTURES_BY_INSTRUMENT`
says which gestures an instrument gets (e.g. KEMENCE: `doubleStop(4th, 0.5)`, `graceIn`; KANUN: `tremolo` over a quarter; SAZ: `strum` on strong beats +
`graceIn`; NYLONGUITAR: by card `rasgueado` / `arpeggio` / `bossa`; UPRIGHTBASS in jazz: `walk`).
Effort: medium. Visible effect: every instrument stops being "one note, one slot".

**B. A form-template layer `forms.ts`:** `formOf(card)` returns the list of sections, how long each is, which roles play and which "mode"
each section has (free-time taksim, cyclic, accelerating, AABA, 12-bar…). Today `FORM` in `compose.ts` is a constant and `ACTIVE` is a table by section; both
become `formOf(card)` data. Effort: large, because chords, lift, drone, episodes, clip and journey all read the form (bar numbers 8, 24, 32 appear in several places).
Do it in slices: (1) cyclic forms without chords (makam folk, gamelan, West African, Hindustani) — the progression table is replaced by a drone; (2) AABA and 12-bar
progressions for jazz and country; (3) taksim/alap intros in free time (needs a time-free section: notes with a rubato table); (4) call-and-response forms.

**C. Per-style bass/drum patterns** (small): walking bass, tumbao, bossa 2-bar, boom-chick, Alberti, oom-pah-pah as bass patterns by card, instead of "the strong beats of the cell".

**First slice I recommend (a few days of work in the same SDD flow, each step reviewed):**
1. Gestures for 6 instruments where the change is most audible: KEMENCE (double stop + drone), SAZ (strum + grace), KANUN/SANTUR (tremolo), NYLONGUITAR (rasgueado, bossa, arpeggio by card), UPRIGHTBASS (walk in jazz, root-fifth in country/bossa), TANPURA (the 4-string cycle). Plus the pitch glide.
2. The form slice (1): drone instead of chords for the 14 folk/makam/gamelan/African/Hindustani cards.
3. Jazz AABA and country 12-bar.
4. Taksim/alap intro.

**Not covered / needs the user:** exact usul figures per region (the cells are my judgement), the fretless intonation of the
pack's samples (makam intervals need a pitch-bend per note, which the sampler can do with `detune`), and real recordings of the missing
instruments (the gestures are only as good as the samples they play).


## Measured after the first slice (2026-10-27)

Eight selections (home Istanbul, visited). `hidden` = notes that sound but are not drawn (the gesture notes).

| selection | main card | drawn | hidden | hidden share by instrument | notes/bar chorus |
|---|---|---|---|---|---|
| Karadeniz | karadeniz | 608 | 220 | KEMENCE_MAKAM 190, CELLO 30 | 21 |
| Hindistan | hindustani | 564 | 30 | CELLO 30 | 14 |
| Brezilya | samba | 344 | 30 | CELLO 30 | 8 |
| Magrip | maghrebi | 608 | 30 | CELLO 30 | 15 |
| Japonya | pop | 744 | 30 | CELLO 30 | 18 |
| Italya | romantic | 560 | 30 | CELLO 30 | 14 |
| ABD | pop | 748 | 30 | BAGPIPE_DRONE 30 | 18 |
| Nijerya | westafrica | 764 | 30 | CELLO 30 | 21 |

Reading: the first slice changes the sound **only where its instruments play the roles the gestures look at**: the Karadeniz piece (kemençe: double stops, grace notes, drone: 220 hidden notes of 828) and the home drone of a few cards. The saz strum did not fire (its threshold `vel >= 0.5` is above the velocity of the pluck role, 0.3-0.42), the kanun/santur tremolo did not fire (they play the short pluck notes, not long hook notes), and the other instruments of the table (violin, harp, piano, accordion, koto, sax, guitars) have no gesture yet. Next: widen the gestures to the roles and instruments that are really used (see the status line below).

## Measured after the wider coverage (2026-10-27)

Same method, with the selections written out (home Istanbul, visited): Karadeniz TZX RZV OGU; Hindistan DEL BOM BLR; Brezilya GRU GIG BSB; Magrip CMN ALG TUN; Japonya NRT KIX FUK; Italya FCO MXP VCE; ABD JFK LAX ORD; Nijerya LOS ABV PHC. (The 8 selections of the first table were not written down; this set reproduces the Karadeniz row exactly and is measured before and after on the same code base. `share` = hidden / all notes.)

| selection | main card | notes before | hidden before (share) | notes after | hidden after (share) | hidden by instrument after |
|---|---|---|---|---|---|---|
| Karadeniz | karadeniz | 828 | 220 (27%) | 1220 | 612 (50%) | SAZ 392, KEMENCE_MAKAM 190, CELLO 30 |
| Hindistan | hindustani | 606 | 30 (5%) | 1050 | 474 (45%) | NS_GUITAR_AC_015 392, PNO 52, CELLO 30 |
| Brezilya | samba | 276 | 0 (0%) | 276 | 0 (0%) | (a horn alone) |
| Magrip | maghrebi | 638 | 30 (5%) | 1100 | 492 (45%) | SANTUR 392, VIOLIN 70, CELLO 30 |
| Japonya | pop | 410 | 30 (7%) | 570 | 190 (33%) | PNO 160, CELLO 30 |
| Italya | romantic | 590 | 30 (5%) | 646 | 86 (13%) | PNO 56, CELLO 30 |
| ABD | rnb | 642 | 30 (5%) | 1128 | 516 (46%) | NS_GUITAR_EL_028 412, NS_EKEYS_098 74, CELLO 30 |
| Nijerya | afrobeat | 762 | 30 (4%) | 762 | 30 (4%) | CELLO 30 |

Reading: six of eight selections now have 10% or more hidden notes (the coverage test asserts this). Brazil plays a single horn and Nigeria plays kalimba, tenor sax (only a glide, which adds no notes) and bassoon: no gesture adds notes there, so they stay at 0% and 4%. The saz/guitar/santur strum or roll on every plucked beat is the bulk (about 390 hidden notes each); the piano share is small because its hook and plucked notes are few. The glides (violin, winds) change the sound without adding notes and are not in these numbers.

## Measured after the review fixes (2026-10-27)

A whole-slice review found: octave folding turned some gesture notes into unisons with the drawn note, a tremolo ran over the next note, too many hidden notes for a phone, the kemençe drone ignored the key lift, the tanpura had two cycles (tonic and fifth), the shared clip carried the tail of a tremolo, and gesture entries for family names (EKEYS, KEYS_AC, GUITAR_AC, GUITAR_EL) could never match because a note carries the resolved name (NS_*). The fixes: an added note that folds into a unison with a drawn note of its route and instrument within 50 ms is dropped; a tremolo stops 10 ms before the next note of its route and instrument; the saz/guitar strum and the kanun/santur roll of the plucked role sound on beats 0 and 2 only (country keeps its off-beat chick); a hidden note of 0.2 s or less (`short`) rings out for 0.25 s in the sampler instead of 1.2 s; the kemençe drone is silent in the break and the lifted bars like the home drone; the tanpura cycle runs on the tonic drone note only; `clipNotes` carries a hidden note only while it has more than 0.2 s left; the walking bass cuts its first note to one beat; NS_KEYS_AC_* joins the piano family.

Same eight selections (home Istanbul, visited), measured with a scratch probe. `voices` = the most notes sounding at once, a note sounding from its start to its end plus the sampler tail (1.2 s for a plucked note; 0.25 s for a `short` one after the fixes).

| selection | notes before | hidden before (share) | voices before | notes after | hidden after (share) | voices after |
|---|---|---|---|---|---|---|
| Karadeniz | 1220 | 612 (50%) | 28 | 1028 | 420 (41%) | 24 |
| Hindistan | 1050 | 474 (45%) | 22 | 862 | 286 (33%) | 19 |
| Brezilya | 276 | 0 (0%) | 6 | 276 | 0 (0%) | 6 |
| Magrip | 1100 | 492 (45%) | 23 | 866 | 258 (30%) | 19 |
| Japonya | 570 | 190 (33%) | 14 | 570 | 190 (33%) | 12 |
| Italya | 646 | 86 (13%) | 14 | 646 | 86 (13%) | 14 |
| ABD | 1128 | 516 (46%) | 22 | 920 | 308 (34%) | 20 |
| Nijerya | 762 | 30 (4%) | 17 | 762 | 30 (4%) | 17 |

Over 50 seeded selections the largest number of hidden notes in one piece fell from 1530 to 1303 (mean 305); the largest piece has 2815 notes. The test bound is 1570 (1303 plus 20%). Six of the eight selections still have 10% or more hidden notes.
