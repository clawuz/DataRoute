"""Tests of the phrase-corpus ingest (spec docs/superpowers/specs/2026-10-27-melody-trained-design.md, section "The phrase corpus").

Run: python3 -m unittest discover -s scripts/music/melody/corpus

The fixtures are written by hand in the formats of the three sources (no corpus melody is copied into the repo); the tests marked
`real data` read three real SymbTr files, PDMX.csv and one Nottingham book from `.corpora/` when it is on disk and are skipped otherwise.
"""
from __future__ import annotations

import io
import json
import os
import struct
import unittest

import common
import nottingham
import pdmx
import symbtr

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
CORPORA = os.path.join(ROOT, ".corpora")
HAVE_SYMBTR = os.path.isdir(os.path.join(CORPORA, "symbtr", "repo", "txt"))
HAVE_PDMX = os.path.isfile(os.path.join(CORPORA, "pdmx", "PDMX.csv"))
HAVE_NOTT = os.path.isdir(os.path.join(CORPORA, "nottingham", "repo", "ABC_cleaned"))

def read(path, enc="utf-8"):
    with open(path, encoding=enc) as f:
        return f.read()


def load_json(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


HEAD = "Sira\tKod\tNota53\tNotaAE\tKoma53\tKomaAE\tPay\tPayda\tMs\tLNS\tBas\tSoz1\tOffset\n"


def row(i, kod, nota, koma, pay, payda, off, soz=""):
    return f"{i}\t{kod}\t{nota}\t{nota}\t{koma}\t{koma}\t{pay}\t{payda}\t0\t99\t96\t{soz}\t{off}\n"


# a made-up two-bar düyek-like line in 4/4 (one whole note per bar), karar La4 = 300 commas (hicaz-like steps), a grace note (Kod 8, no
# duration), a rest, a phrase mark (Kod 53), then an usul change to 2/4 for two bars
SYMBTR_TXT = (
    HEAD
    + row(1, 51, "", 0, 4, 4, 0.0, "Sofyan")
    + row(2, 9, "La4", 300, 1, 4, 0.25)            # karar
    + row(3, 9, "Sib4", 305, 1, 4, 0.5)            # +5 commas: hicaz 2nd (1.13 st = 5 commas)
    + row(4, 8, "Do#5", 317, 0, 0, 0.5)            # grace: skipped
    + row(5, 9, "Do#5", 317, 1, 4, 0.75)           # +17 commas: hicaz 3rd (3.85 st = 17 commas)
    + row(6, 9, "Re5", 322, 1, 4, 1.0)             # +22: 4th
    + row(7, 53, "", 0, 0, 0, 1.0)                 # phrase mark: no time
    + row(8, 9, "Mi5", 331, 1, 2, 1.5)             # +31: 5th
    + row(9, 9, "Es", -1, 1, 4, 1.75)              # rest
    + row(10, 9, "Re5", 322, 1, 4, 2.0)
    + row(11, 51, "", 0, 2, 4, 2.0, "Nimsofyan")   # usul change: bars of half a whole note
    + row(12, 9, "Do#5", 317, 1, 4, 2.5)
    + row(13, 9, "Sib4", 305, 1, 4, 3.0)
    + row(14, 9, "Sol4", 291, 1, 4, 3.5)          # -9 commas: a whole tone below the karar
    + row(15, 9, "La4", 300, 1, 4, 4.0)            # the last note = karar (Offset counts measures)
)


def vlq(n: int) -> bytes:
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def track(events) -> bytes:
    """events: (abs_tick, bytes) sorted"""
    data = b""
    last = 0
    for t, ev in events:
        data += vlq(t - last) + ev
        last = t
    data += vlq(0) + b"\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def tiny_midi() -> bytes:
    """format 1, 480 tpq, a 1/4 pickup measure then 3/4, one flat minor key signature (D minor); track 1 = a melody (high) with a two-note chord on the first beat;
    track 2 = a bass with more notes than the melody's, but lower; a drum channel note that must be ignored. """
    tpq = 480
    # the pickup is its own 1/4 measure, then 3/4 (as the PDMX MIDI writes it); -1 sharps (1 flat), minor
    meta = [(0, b"\xff\x58\x04\x01\x02\x18\x08"), (0, b"\xff\x59\x02\xff\x01"), (tpq, b"\xff\x58\x04\x03\x02\x18\x08")]
    mel = []
    # pickup A4 (one beat), then bars of three quarters: D5 E5 F5 | A5 G5 F5 | E5 C#5 D5 | D5 (dotted half)
    pitches = [69, 74, 76, 77, 81, 79, 77, 76, 73, 74]
    t = 0
    for p in pitches:
        mel.append((t, bytes([0x90, p, 80])))
        if t == tpq:  # the chord on the first downbeat: a lower note under D5
            mel.append((t, bytes([0x90, 65, 80])))
            mel.append((t + tpq, bytes([0x80, 65, 0])))
        mel.append((t + tpq, bytes([0x80, p, 0])))
        t += tpq
    mel.append((t, bytes([0x90, 74, 80])))
    mel.append((t + 3 * tpq, bytes([0x80, 74, 0])))
    mel.sort(key=lambda e: (e[0], e[1][0] & 0xF0 == 0x90))
    bass = []
    for i in range(24):
        tt = tpq + i * tpq // 2
        bass.append((tt, bytes([0x91, 38, 70])))
        bass.append((tt + tpq // 2, bytes([0x81, 38, 0])))
    bass.append((0, bytes([0x99, 36, 100])))
    bass.append((tpq, bytes([0x89, 36, 0])))
    bass.sort(key=lambda e: (e[0], e[1][0] & 0xF0 == 0x90))
    tracks = [track(meta), track(mel), track(bass)]
    return b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), tpq) + b"".join(tracks)


ABC_TUNE = """X: 7
T:A Made-up Dorian Reel
M:4/4
L:1/8
K:Ador
E|:"Am"A2 AB c2 BA|"G"G2 B>A G2 (3ABc|"Am"A2 e2 ^f2 e2|"Em"[EB]4 z4:|
"""


class TestCards(unittest.TestCase):
    def test_52_cards_and_scales(self):
        cards = common.load_cards()
        self.assertEqual(len(cards), 52)
        self.assertEqual(cards["anatolian"], [0, 1.58, 2.94, 4.98, 7.02, 9.28, 9.96])
        self.assertEqual(cards["jazz"], [0, 2, 3, 5, 7, 9, 10])
        self.assertEqual(cards["dance"], [0, 2, 4, 7, 9])

    def test_tables_name_only_real_cards(self):
        cards = common.load_cards()
        mk = load_json("makam-cards.json")
        cm = load_json("cards-map.json")
        named = set()
        for fam in mk["families"].values():
            named.update(fam["cards"])
        for v in list(mk["forms"].values()) + list(mk["regions"].values()) + list(mk["title_regions"].values()):
            named.update(v["cards"])
        for r in cm["pdmx"]["rules"]:
            named.add(r["card"])
            self.assertTrue(r.get("comment"), r)
        for v in cm["nottingham"]["books"].values():
            named.update(v["cards"])
        self.assertLessEqual(named, set(cards))


class TestDegrees(unittest.TestCase):
    def test_nearest_degree_octave_extended(self):
        hicaz = [0, 1.13, 3.85, 4.98, 7.02, 9.28, 9.96]
        self.assertEqual(common.nearest_degree(0, hicaz), 0)
        self.assertEqual(common.nearest_degree(12, hicaz), 7)
        self.assertEqual(common.nearest_degree(12 + 3.85, hicaz), 9)
        self.assertEqual(common.nearest_degree(-2.04, hicaz), -1)  # below the karar: the 7th of the octave below
        self.assertEqual(common.nearest_degree(7, [0, 2, 4, 7, 9]), 3)
        self.assertEqual(common.nearest_degree(12, [0, 2, 4, 7, 9]), 5)

    def test_commas(self):
        hicaz = [0, 1.13, 3.85, 4.98, 7.02, 9.28, 9.96]
        self.assertEqual([common.comma_degree(c, hicaz) for c in (0, 5, 17, 22, 31, 53, -9)], [0, 1, 2, 3, 4, 7, -1])
        ussak = [0, 1.58, 2.94, 4.98, 7.02, 9.28, 9.96]
        # a hicaz 3rd (17 commas = 3.85 st) into uşşak: the nearest is the 3rd (2.94) — not the 4th (4.98)
        self.assertEqual(common.comma_degree(17, ussak), 2)

    def test_diatonic_transfer(self):
        major, minor = common.MODES["major"], common.MODES["minor"]
        # the leading tone in minor and the flat 7th in major are both the 7th degree
        self.assertEqual(common.diatonic_degree(11, minor), 6)
        self.assertEqual(common.diatonic_degree(10, major), 6)
        self.assertEqual(common.diatonic_degree(3, major), 2)
        self.assertEqual(common.diatonic_degree(-1, minor), -1)
        self.assertEqual(common.diatonic_degree(24, major), 14)
        # a 7-note card keeps the diatonic index; a pentatonic card takes the nearest of its notes
        self.assertEqual(common.to_card(2, major, [0, 2, 3, 5, 7, 8, 10]), 2)  # the major 3rd becomes the card's (minor) 3rd
        self.assertEqual(common.to_card(4, major, [0, 2, 4, 7, 9]), 3)          # G
        self.assertEqual(common.to_card(3, major, [0, 2, 4, 7, 9]), 2)          # F (5 st) -> E (4) is nearer than G (7)
        self.assertEqual(common.to_card(6, major, [0, 2, 4, 7, 9]), 5)          # B (11) -> the upper C (12)
        self.assertEqual(common.to_card(-1, major, [0, 2, 4, 7, 9]), 0)         # B below -> the tonic (1 st away), not A (2 st)

    def test_octave_choice(self):
        # a line that lives an octave above its tonic is moved down when that brings more notes into [-2, 9]
        self.assertEqual(common.best_octave([8, 9, 10, 11, 12, 13, 14], 7), -7)
        self.assertEqual(common.best_octave([0, 2, 4, 5, 7], 7), 0)
        self.assertEqual(common.best_octave([-9, -8, -7, -5, -3], 7), 7)


class TestWindows(unittest.TestCase):
    def bar(self, n, degree=0, rest=0.0):
        d = (1 - rest) / n
        return [[round(i * d, 4), degree + i, round(d, 4)] for i in range(n)]

    def test_stride_and_rules(self):
        bars = [self.bar(4) for _ in range(8)]
        ws = common.windows(bars)
        self.assertEqual([w["start"] for w in ws], [0, 2, 4])
        self.assertEqual(len(ws[0]["bars"]), 4)

    def test_sparse_and_resty_windows_are_dropped(self):
        sparse = [self.bar(2) for _ in range(4)]
        self.assertEqual(common.windows(sparse), [])
        resty = [self.bar(4, rest=0.5) for _ in range(4)]
        self.assertEqual(common.windows(resty), [])

    def test_broken_runs(self):
        bars = [self.bar(4), self.bar(4), None, self.bar(4), self.bar(4), self.bar(4), self.bar(4), self.bar(4)]
        self.assertEqual([w["start"] for w in common.windows(bars)], [4])

    def test_clipping(self):
        bars = [[[0, -5, 0.25], [0.25, 12, 0.25], [0.5, 3, 0.25], [0.75, 4, 0.25]] for _ in range(4)]
        self.assertEqual(common.windows(bars), [])  # half of the notes out of range: dropped
        bars = [[[0, 0, 0.25], [0.25, 10, 0.25], [0.5, 3, 0.25], [0.75, 4, 0.25]] for _ in range(4)]
        w = common.windows(bars)[0]
        self.assertEqual(w["bars"][0][1][1], 9)

    def test_split_into_bars(self):
        notes = [(0.0, 0.5, 0), (0.5, 1.0, 4), (1.5, 0.5, 7)]  # (onset, dur, value) in some unit; the 2nd note crosses the bar line
        bars = common.split_bars(notes, [(0.0, 1.0), (1.0, 1.0)], end=2.0)
        self.assertEqual(bars[0], [[0.0, 0, 0.5], [0.5, 4, 0.5]])
        self.assertEqual(bars[1], [[0.0, 4, 0.5], [0.5, 7, 0.5]])


class TestSymbTr(unittest.TestCase):
    def test_parse(self):
        p = symbtr.parse_text(SYMBTR_TXT)
        self.assertEqual(p["karar"], 300)
        self.assertTrue(p["offset_ok"])
        self.assertEqual(len(p["bars"]), 4)
        self.assertEqual([round(L, 4) for _, L in p["grid"]], [1.0, 1.0, 0.5, 0.5])
        b0 = p["bars"][0]
        self.assertEqual([n[1] for n in b0], [0, 5, 17, 22])   # commas above the karar; the grace note is gone
        self.assertEqual([n[0] for n in b0], [0.0, 0.25, 0.5, 0.75])
        b1 = p["bars"][1]
        self.assertEqual([n[1] for n in b1], [31, 22])          # the rest is not a note
        self.assertEqual(b1[0][2], 0.5)
        self.assertEqual([n[1] for n in p["bars"][3]], [-9, 0])

    def test_degrees_in_the_card_scale(self):
        p = symbtr.parse_text(SYMBTR_TXT)
        hicaz = [0, 1.13, 3.85, 4.98, 7.02, 9.28, 9.96]
        bars = symbtr.card_bars(p, hicaz)
        self.assertEqual([n[1] for n in bars[0]], [0, 1, 2, 3])
        self.assertEqual([n[1] for n in bars[3]], [-1, 0])

    def test_long_usul_is_split(self):
        self.assertEqual(symbtr.sub_bars(28, 8), 2)     # devr-i kebir 28/8 -> two bars of 14/8
        self.assertEqual(symbtr.sub_bars(28, 4), 4)     # 28/4 -> four bars of 7/4
        self.assertEqual(symbtr.sub_bars(9, 8), 1)
        self.assertEqual(symbtr.sub_bars(120, 4), 15)
        self.assertIsNone(symbtr.sub_bars(13, 4))       # no even split at or under two whole notes

    def test_cards_of_a_file_name(self):
        mk = symbtr.load_table()
        self.assertEqual(symbtr.cards_of("hicaz--sarki--aksak--x--y.txt", mk)[0][0], "karsilama")
        cs = dict(symbtr.cards_of("hicaz--sarki--aksak--x--y.txt", mk))
        self.assertIn("arabic", cs)
        cs = dict(symbtr.cards_of("huseyni--turku--aksak--x--trabzon.txt", mk))
        self.assertEqual(cs.get("karadeniz"), "region")
        self.assertIn("anatolian", cs)
        cs = dict(symbtr.cards_of("muhayyer--zeybek--agiraksak--x--eskisehir.txt", mk))
        self.assertEqual(cs.get("zeybek"), "form")
        cs = dict(symbtr.cards_of("rast--ilahi--duyek--x--y.txt", mk))
        self.assertEqual(cs.get("mevlevi"), "form")
        self.assertEqual(symbtr.cards_of("acem--seyir--sofyan--1--x.txt", mk), [])   # seyir = a scale demonstration: not used
        cs = dict(symbtr.cards_of("zzunknown--sarki--aksak--x--y.txt", mk))
        self.assertEqual(cs, {"anatolian": "makam"})
        # a folk piece whose TITLE names the region (no place in the composer field) goes to the region's card too
        cs = dict(symbtr.cards_of("karcigar--mandra--devrituran--karadeniz_oyunhavasi--.txt", mk))
        self.assertEqual(cs.get("karadeniz"), "region")
        cs = dict(symbtr.cards_of("huzzam--turku--ikizaksak--cirpinirdi_karadeniz--uzeyir_hacibeyov.txt", mk))
        self.assertEqual(cs.get("karadeniz"), "region")
        cs = dict(symbtr.cards_of("ussak--sarki--aksak--karadeniz--y.txt", mk))   # not a folk form: the makam decides
        self.assertNotEqual(cs.get("karadeniz"), "region")

    def test_repeat_bar_code_skips_the_piece(self):
        txt = SYMBTR_TXT + "16\t35\t\t\t-1\t-1\t0\t0\t0\t0\t0\t\t3.0\n"
        with self.assertRaises(symbtr.Skip):
            symbtr.parse_text(txt)

    @unittest.skipUnless(HAVE_SYMBTR, "real data")
    def test_real_files(self):
        d = os.path.join(CORPORA, "symbtr", "repo", "txt")
        names = sorted(os.listdir(d))
        picks = [n for n in names if n.startswith("hicaz--sarki--")][:1] + [n for n in names if "--turku--" in n][:1] + \
            [n for n in names if "--devrikebir--" in n][:1]
        self.assertEqual(len(picks), 3)
        for n in picks:
            p = symbtr.parse_text(read(os.path.join(d, n)))
            self.assertGreater(len(p["bars"]), 4, n)
            self.assertTrue(p["offset_ok"], n)   # our exact running time agrees with the file's Offset column
            bars = symbtr.card_bars(p, common.load_cards()["anatolian"])
            self.assertTrue(any(common.windows(bars)), n)


class TestMidi(unittest.TestCase):
    def test_parse_and_melody(self):
        m = common.parse_midi(tiny_midi())
        self.assertEqual(m["tpq"], 480)
        self.assertEqual([t[1:] for t in m["timesig"]], [(1, 4), (3, 4)])
        self.assertEqual(m["keysig"][0][1:], (-1, 1))
        mel = pdmx.melody(m)
        # the high track is the melody (the bass has more notes, but is low); the chord's top note is kept
        self.assertEqual([p for _, _, p in mel][:4], [69, 74, 76, 77])

    def test_piece(self):
        piece = pdmx.piece_from_midi(tiny_midi())
        self.assertEqual(piece["tonic"], 2)          # D minor from the key signature and the notes
        self.assertEqual(piece["mode"], "minor")
        bars = common.card_bars_diatonic(piece, [0, 2, 3, 5, 7, 8, 10])
        self.assertIsNone(bars[0])                             # the pickup measure is not a bar
        self.assertEqual(len(bars), 5)
        self.assertEqual([n[1] for n in bars[1]], [0, 1, 2])   # D5 E5 F5: the octave choice puts the line on the tonic
        self.assertEqual([n[1] for n in bars[3]], [1, -1, 0])  # E C# D: the leading tone is the 7th degree below
        self.assertEqual(bars[4], [[0.0, 0, 1.0]])


class TestAbc(unittest.TestCase):
    def test_parse(self):
        tunes = nottingham.parse_book(ABC_TUNE)
        self.assertEqual(len(tunes), 1)
        t = tunes[0]
        self.assertEqual(t["tonic"], 9)
        self.assertEqual(t["mode"], "dorian")
        bars = t["bars"]
        self.assertIsNone(bars[0])                  # the pickup bar is not a full bar
        self.assertEqual(len(bars), 5)
        b1 = bars[1]
        self.assertEqual([n[1] for n in b1], [0, 0, 2, 3, 2, 0])  # A2 AB c2 BA in semitones above A
        self.assertEqual([n[0] for n in b1], [0, 0.25, 0.375, 0.5, 0.75, 0.875])
        b2 = bars[2]
        self.assertEqual([round(n[2], 4) for n in b2], [0.25, 0.1875, 0.0625, 0.25, 0.0833, 0.0833, 0.0833])
        self.assertEqual([n[1] for n in bars[3]], [0, 7, 9, 7])   # ^f = F#: the dorian 6th (9 st)
        self.assertEqual([n[1] for n in bars[4]], [2])           # the chord [EB]: top note B; z4 = rest

    def test_keys(self):
        self.assertEqual(nottingham.parse_key("G"), (7, "major"))
        self.assertEqual(nottingham.parse_key("Em"), (4, "minor"))
        self.assertEqual(nottingham.parse_key("Dmix"), (2, "mixolydian"))
        self.assertEqual(nottingham.parse_key("Bb"), (10, "major"))
        self.assertEqual(nottingham.parse_key("F#m"), (6, "minor"))

    @unittest.skipUnless(HAVE_NOTT, "real data")
    def test_real_book(self):
        path = os.path.join(CORPORA, "nottingham", "repo", "ABC_cleaned", "jigs.abc")
        tunes = nottingham.parse_book(read(path, "latin-1"))
        self.assertGreater(len(tunes), 300)
        full = sum(1 for t in tunes for b in t["bars"] if b is not None)
        self.assertGreater(full / max(1, sum(len(t["bars"]) for t in tunes)), 0.8)


class TestPdmxSelection(unittest.TestCase):
    def test_rules(self):
        cm = load_json("cards-map.json")
        rules = pdmx.compile_rules(cm["pdmx"]["rules"])
        row = {"genres": "jazz", "tags": "NA", "title": "Some Blues", "song_name": "", "composer_name": "", "artist_name": ""}
        self.assertIn("jazz", [c for c, _ in pdmx.match(row, rules)])
        row = {"genres": "NA", "tags": "irish-fiddle", "title": "The Kesh Jig", "song_name": "", "composer_name": "", "artist_name": ""}
        self.assertIn("celtic", [c for c, _ in pdmx.match(row, rules)])
        row = {"genres": "classical", "tags": "NA", "title": "Sonata", "song_name": "", "composer_name": "Wolfgang Amadeus Mozart",
               "artist_name": ""}
        got = dict(pdmx.match(row, rules))
        self.assertEqual(got.get("classical"), 0)   # tier 0: a named composer

    @unittest.skipUnless(HAVE_PDMX, "real data")
    def test_real_selection_is_licence_clean(self):
        sel = pdmx.select(os.path.join(CORPORA, "pdmx", "PDMX.csv"), limit_rows=20000)
        self.assertTrue(sel)
        for path, info in list(sel.items())[:200]:
            self.assertTrue(path.startswith("./mid/"))
            self.assertIn(info["license"], ("publicdomain", "cc-zero"))


class TestDeterminism(unittest.TestCase):
    def test_same_input_same_phrases(self):
        cards = common.load_cards()
        a = [common.windows(symbtr.card_bars(symbtr.parse_text(SYMBTR_TXT), cards[c])) for c in ("anatolian", "akdeniz")]
        b = [common.windows(symbtr.card_bars(symbtr.parse_text(SYMBTR_TXT), cards[c])) for c in ("anatolian", "akdeniz")]
        self.assertEqual(json.dumps(a), json.dumps(b))
        p1 = json.dumps(common.card_bars_diatonic(pdmx.piece_from_midi(tiny_midi()), cards["classical"]))
        p2 = json.dumps(common.card_bars_diatonic(pdmx.piece_from_midi(tiny_midi()), cards["classical"]))
        self.assertEqual(p1, p2)


if __name__ == "__main__":
    unittest.main()
