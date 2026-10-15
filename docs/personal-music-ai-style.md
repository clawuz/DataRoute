# What the AI tracks are like, and what our own composer took from them

Eleven ElevenLabs tracks were made for different characters (few / many regions, Asia-heavy, Africa-heavy, Turkish
melodies) and analysed by `scripts/music/analyze-ai-tracks.ts` (onsets and pitch with `globe/src/personal/analyze.ts`,
chroma for key and chords, loudness over the length).

| Finding | Value in the AI tracks | Now in `globe/src/personal/compose.ts` |
|---|---|---|
| Tempo | journeys about 84 bpm, wishes about 100 bpm (as prompted) | `BPM_RANGE`: visited 80–88, wish 96–104 |
| Key | mostly A minor / C major, then D, G, E | `KEY_SHIFTS`: visited A minor (and D, E), wish C / G / D / A major |
| Chords | simple diatonic loops: Am F Am F, C F Am G, G C G C, D G Bm, Am D | `PROGS`: both moods have a loop of that kind |
| Density | 2.5–4.7 notes a second, 3.5 on average | about 1.5–7 a second, following the number of routes |
| Register | median MIDI 43–55 (mostly low and mid), 90th percentile 62–74 | melody and plucks an octave lower, a floor per instrument so no recording is stretched |
| Shape | starts at 25–50 % of the loudest, rises to the top at 70–80 % of the length, ends at 55–65 % | `FORM` 8/16/8/20/4/8 bars, levels 0.45 → 1 → 0.78, routes all in within 12 bars and playing to the end |
| Colour | warm: spectral centre about 620 Hz, piano and strings | piano as a prominent voice, strings, harp, timpani |
