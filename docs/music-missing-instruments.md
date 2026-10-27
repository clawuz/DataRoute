# Missing instruments (research list)

Licence rule: CC0 and CC BY are accepted. NC (non-commercial) is accepted for now because the music made with it is original, but every NC file carries `nc: true` in `docs/music-pack-world-ledger.json` and a "non-commercial licence" mark on `docs/credits.html`, and a deploy that includes NC files needs the owner's explicit yes. ND and unclear licences are not accepted. Keep a ledger entry (source, author, licence, url) for every sample that is taken.

The real recordings of 2026-10-28 are cut into notes by `scripts/samples/add_real_recordings.py` (pitch measured with pyin; a note holds within 40 cents for at least 0.4 s).

| Instrument | Stand-in now | Why it is not right | Search terms | Status |
| --- | --- | --- | --- | --- |
| kemençe (real bowed, Black Sea) | KEMENCE_MAKAM (world pack), VIOLIN | the stand-in is a makam recording, not the tight, high, rasping karadeniz kemençe | "kemençe" sample, "Pontic lyra", "kemence solo CC0", freesound "kemence" | added 2026-10-28 (CC BY-NC, NC flagged): KEMENCE_REAL, 3 zones from alexanderness 501341; the karadeniz card plays it first, KEMENCE_MAKAM stays |
| sitar | none (SANTUR, HARP) | no sympathetic-string buzz or meend glides | "sitar" "sitar single note", "sitar CC0", freesound sitar pluck, archive.org sitar | still missing: 5 files fetched 2026-10-28 (CC BY-NC) were strums of the sympathetic strings (several pitches at once) and a sound effect, so no zone; SITAR is not in the pack. Look for single plucks of the main string |
| sarod / sarangi | VIOLIN (sarangi), SANTUR | a bowed violin lacks the sarangi's nasal, gliding sound; no fretless metal-plate sarod | "sarangi", "sarod", "Indian bowed", freesound sarangi | sarangi added 2026-10-28 (CC BY 3.0 Johnnydhol, CC0 sarman1234): SARANGI, 5 zones; sarod still missing |
| bansuri | FLUTE | concert flute is clean; the bansuri is breathy and lower | "bansuri", "Indian bamboo flute", "bamboo flute sustain" | added 2026-10-28 (CC BY 4.0 sankalp, CC0 PhonosUPF): BANSURI, 3 zones |
| harmonium | ACCORDION | accordion has a different attack and bellows noise; harmonium is a reed organ drone | "harmonium", "reed organ", "pump organ" | not started |
| mandolin | PSALTERY, HARP | no tremolo-picked mandolin for Italian and Greek cards | "mandolin tremolo", "mandolin single note", "mandolin CC0" | not started |
| zurna | DUDUK, NEY_MAKAM | zurna is a loud double reed with a piercing sound, not a soft duduk | "zurna", "zurna solo", "mizmar", "shawm", "rhaita" | added 2026-10-28 (CC BY 4.0 cdrk): ZURNA, 2 zones (thin: one recording of two notes); the dogu card plays it first |
| tulum | BAGPIPE | Black Sea goat-skin bagpipe has a different drone and scale | "tulum", "Pontic bagpipe", "goat bagpipe", "Karadeniz tulum" | not started |
| solo ud | OUD (lite pack) | single lite recording set; no tremolo, slides or long takes | "oud" "oud taqsim", "oud tremolo", "arabic oud single notes" | not started |
| clarinet, jazz articulations | CLA (glide only) | no growl, scoop or fall-offs | "clarinet jazz", "clarinet glissando", "clarinet growl", "clarinet scoop" | not started |
| accordion musette | ACCORDION | no wet-tuned musette reeds | "accordion musette", "wet tuned accordion", "bandoneon" | not started |
| ney (real, not the makam scale slices) | NEY_MAKAM | the makam slices are scale steps of a teaching recording | "ney", "ney taksim", "ney single note" | added 2026-10-28 (CC BY-NC, NC flagged): NEY_REAL, 2 zones from _bliind 491638 and 491640 (thin); the mevlevi card plays it first, NEY_MAKAM stays. Not added to anatolian or icanadolu: their ney notes reach below its range |

Still missing (2026-10-28): mandolin, tulum, harmonium, solo ud (and sitar, sarod, clarinet articulations, accordion musette).
