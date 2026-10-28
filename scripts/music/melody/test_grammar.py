"""Tests of the melody grammar (spec docs/superpowers/specs/2026-10-27-melody-bank-design.md, section Testing).

Run: python3 -m unittest discover -s scripts/music/melody
"""
from __future__ import annotations

import json
import os
import re
import unittest

import grammar

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GENRES_TS = os.path.join(ROOT, "globe", "src", "personal", "genres.ts")
BANK = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.json")
LOW = grammar.LOW


def card_ids_of_genres_ts() -> list:
    src = open(GENRES_TS, encoding="utf-8").read()
    start = src.index("const BASE_CARDS")
    end = src.index("];", start)
    return re.findall(r'\{ id: "([a-z]+)"', src[start:end])


def sample_cards() -> list:
    """one card of every form, plus a few with unusual idioms"""
    seen = {}
    for cid, f in sorted(grammar.FORM_OF.items()):
        seen.setdefault(f, cid)
    return sorted(set(seen.values()) | {"hindustani", "celtic", "jazz", "tango", "flamenco", "salsa", "mevlevi"})


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs)


class TestCards(unittest.TestCase):
    def test_all_53_cards_have_a_form(self):
        ids = card_ids_of_genres_ts()
        self.assertEqual(len(ids), 53)
        for cid in ids:
            self.assertIn(cid, grammar.FORM_OF, cid)
            self.assertIn(grammar.FORM_OF[cid], grammar.FORMS)
        self.assertEqual(set(ids), set(grammar.FORM_OF))

    def test_every_card_has_an_idiom(self):
        for cid in card_ids_of_genres_ts():
            i = grammar.IDIOM_OF[cid]
            for k in ("span", "bias", "start", "cadence", "step", "repeat", "leaps"):
                self.assertIn(k, i)
            self.assertEqual(len(i["cadence"]), 4)

    def test_unknown_card_defaults_to_period(self):
        self.assertEqual(grammar.form_of("hip"), "period")


class TestInvariants(unittest.TestCase):
    def test_determinism(self):
        for cid in sample_cards():
            a = grammar.generate(cid, 6, 20, 7)
            b = grammar.generate(cid, 6, 20, 7)
            self.assertEqual(a, b)
            c = grammar.generate(cid, 6, 20, 8)
            self.assertNotEqual(a, c, cid)

    def test_bounds_cadence_rests(self):
        for cid in grammar.FORM_OF:
            idiom = grammar.IDIOM_OF[cid]
            for hits in range(1, 10):
                for p in grammar.generate(cid, hits, 12, 1):
                    self.assertEqual(len(p["b"]), 4)
                    self.assertEqual(p["c"], list(idiom["cadence"]))
                    self.assertEqual(p["f"], grammar.FORM_OF[cid])
                    self.assertIsNotNone(p["b"][0][0], (cid, hits, p))
                    self.assertEqual(p["s"], p["b"][0][0])
                    used = [d for bar in p["b"] for d in bar if d is not None]
                    self.assertEqual(p["span"], max(used))
                    self.assertIn(p["bias"], (-1, 0, 1))
                    for k, bar in enumerate(p["b"]):
                        self.assertEqual(len(bar), hits, (cid, hits, p))
                        self.assertIsNotNone(bar[-1])
                        self.assertEqual(bar[-1], p["c"][k])
                        for d in bar:
                            if d is not None:
                                self.assertIsInstance(d, int)
                                self.assertGreaterEqual(d, LOW)
                                self.assertLessEqual(d, idiom["span"], (cid, hits, p))

    def test_rest_share_is_moderate(self):
        for cid in grammar.FORM_OF:
            entries = rests = 0
            for p in grammar.generate(cid, 8, 40, 3):
                for bar in p["b"]:
                    entries += len(bar)
                    rests += sum(1 for d in bar if d is None)
            self.assertLessEqual(rests / entries, 0.3, cid)

    def test_no_wild_leaps(self):
        """the line moves like a melody: no leap wider than a sixth between neighbouring notes"""
        for cid in grammar.FORM_OF:
            for p in grammar.generate(cid, 8, 40, 5):
                line = [d for bar in p["b"] for d in bar if d is not None]
                for a, b in zip(line, line[1:]):
                    self.assertLessEqual(abs(a - b), 5, (cid, p["b"]))

    def test_not_a_random_walk(self):
        """every phrase reuses material: some bar shares at least half of its slots with another bar (or a transposition of it)"""
        for cid in grammar.FORM_OF:
            for p in grammar.generate(cid, 8, 30, 9):
                self.assertTrue(grammar.reuses_material(p["b"]), (cid, p["b"]))


def phrases(form, hits_range=range(4, 10), n=30):
    cards = [c for c, f in grammar.FORM_OF.items() if f == form]
    for cid in cards:
        for hits in hits_range:
            for p in grammar.generate(cid, hits, n, 11):
                yield cid, hits, p


class TestFormSignatures(unittest.TestCase):
    def test_seyir(self):
        for cid, hits, p in phrases("seyir"):
            b = p["b"]
            self.assertEqual(b[3][-1], 0, (cid, b))
            self.assertGreater(max(d for d in b[1] if d is not None), max(d for d in b[0] if d is not None), (cid, hits, b))
            # the karar is approached by a step
            self.assertLessEqual(abs(b[3][-2] - 0), 1, (cid, b)) if b[3][-2] is not None else None

    def test_raga(self):
        for cid, hits, p in phrases("raga"):
            b = p["b"]
            top = max(d for bar in b for d in bar if d is not None)
            self.assertIn(top, b[2], (hits, b))
            self.assertGreater(top, max(d for d in b[1] if d is not None))
            self.assertLessEqual(min(d for d in b[0] if d is not None), 1, b)

    def test_ostinato(self):
        for cid, hits, p in phrases("ostinato", range(5, 10)):
            b = p["b"]
            same = total = 0
            for bar in b[1:]:
                for k in range(hits - 1):
                    total += 1
                    same += bar[k] == b[0][k]
            self.assertGreaterEqual(same / total, 0.7, (cid, b))
            used = [d for bar in b for d in bar if d is not None]
            self.assertLessEqual(max(used) - min(used), 4)

    def test_period(self):
        for cid, hits, p in phrases("period"):
            b = p["b"]
            m = (hits + 1) // 2
            self.assertEqual(b[2][:m - 1 or 1], b[0][:m - 1 or 1], (cid, b))

    def test_riff(self):
        for cid, hits, p in phrases("riff"):
            b = p["b"]
            self.assertEqual(b[0][:-1], b[1][:-1], (cid, b))

    def test_song(self):
        for cid, hits, p in phrases("song"):
            b = p["b"]
            self.assertEqual(b[0][: hits - 2], b[1][: hits - 2], (cid, b))
            self.assertGreater(mean(b[2]), mean(b[0]) - 0.01, (cid, b))

    def test_cyclic(self):
        for cid, hits, p in phrases("cyclic"):
            b = p["b"]
            self.assertEqual(b[0][: hits - 2], b[1][: hits - 2], (cid, b))
            used = [d for bar in b for d in bar if d is not None]
            self.assertLessEqual(max(used), 5)

    def test_horon(self):
        """the Black Sea horon: a zigzag motif repeated exactly (bars 1-2 differ only in the cadence), a tight range, a held final"""
        self.assertEqual(grammar.FORM_OF["karadeniz"], "horon")
        same = total = zig = wins = 0
        for cid, hits, p in phrases("horon", range(4, 10), 60):
            b = p["b"]
            total += 1
            same += b[0][:-1] == b[1][:-1]
            used = [d for bar in b for d in bar if d is not None]
            self.assertLessEqual(max(used) - min(used), 5, (hits, b))
            self.assertEqual([bar[-1] for bar in b], p["c"])
            self.assertEqual(b[3][-1], b[3][-2], (hits, b))      # the held final
            for bar in b:
                for x, y, z in zip(bar, bar[1:], bar[2:]):
                    wins += 1
                    zig += x is not None and x == z and x != y
            self.assertLessEqual(sum(d is None for bar in b for d in bar), 0.05 * 4 * hits, b)
        self.assertGreaterEqual(same / total, 0.9)
        self.assertGreaterEqual(zig / wins, 0.4)

    def test_horon_is_deterministic(self):
        self.assertEqual(grammar.generate("karadeniz", 6, 30, 4), grammar.generate("karadeniz", 6, 30, 4))
        self.assertNotEqual(grammar.generate("karadeniz", 6, 30, 4), grammar.generate("karadeniz", 6, 30, 5))

    def test_arch(self):
        for cid, hits, p in phrases("arch"):
            b = p["b"]
            peak = max(d for bar in b for d in bar if d is not None)
            where = [k for k, bar in enumerate(b) if peak in bar]
            self.assertTrue(any(k in (1, 2) for k in where), (cid, b))
            self.assertGreater(peak, b[0][0], (cid, b))

    def test_forms_differ(self):
        """the signature properties of one form do not all hold for another: the eight forms are not the same generator"""
        sig = {}
        for form in grammar.FORMS:
            cid = next(c for c, f in sorted(grammar.FORM_OF.items()) if f == form)
            ps = grammar.generate(cid, 8, 60, 2)
            rest = sum(d is None for p in ps for bar in p["b"] for d in bar) / (60 * 32)
            same12 = sum(p["b"][0][:-1] == p["b"][1][:-1] for p in ps) / 60
            peak3 = sum(max(x for x in p["b"][2] if x is not None) == p["span"] for p in ps) / 60
            sig[form] = (round(rest, 2), round(same12, 2), round(peak3, 2))
        self.assertEqual(len(set(sig.values())), len(grammar.FORMS), sig)


class TestBankEntry(unittest.TestCase):
    def test_entry_is_diverse_and_matches_bias(self):
        for cid in sample_cards():
            idiom = grammar.IDIOM_OF[cid]
            entry = grammar.bank_entry(cid, 6, keep=48, make=200)
            self.assertGreater(len(entry), 20, cid)
            keys = {json.dumps(p["b"]) for p in entry}
            self.assertEqual(len(keys), len(entry))
            if idiom["bias"] != 0:
                share = sum(p["bias"] == idiom["bias"] for p in entry) / len(entry)
                self.assertGreaterEqual(share, 0.8, cid)
            starts = {p["s"] for p in entry}
            self.assertTrue(starts & set(idiom["start"]), (cid, starts))

    def test_bias_zero_cards_have_both_directions(self):
        for cid in ("classical", "pop", "funk", "chinese", "greek"):
            entry = grammar.bank_entry(cid, 6, keep=48, make=200)
            biases = {p["bias"] for p in entry}
            self.assertTrue({-1, 1} <= biases, (cid, biases))


class TestBankFile(unittest.TestCase):
    def test_bank_file(self):
        if not os.path.exists(BANK):
            self.skipTest("bank not exported yet")
        self.assertLess(os.path.getsize(BANK), 1024 * 1024)
        bank = json.load(open(BANK, encoding="utf-8"))
        self.assertEqual(bank["version"], 2)
        self.assertEqual(set(bank["cards"]), set(grammar.FORM_OF))
        for cid, by in bank["cards"].items():
            self.assertEqual(sorted(by, key=int), [str(h) for h in range(1, 10)], cid)
            cad = grammar.idiom_of(cid)["cadence"]
            for h, ps in by.items():
                self.assertGreater(len(ps), 0)
                self.assertLessEqual(len(ps), 64)
                self.assertEqual(len(set(ps)), len(ps), (cid, h))
                for s in ps:
                    bars = s.split("|")
                    self.assertEqual([len(b) for b in bars], [int(h)] * 4, s)
                    for k, bar in enumerate(bars):
                        self.assertRegex(bar, r"^[0-9ab.]+$")
                        self.assertNotEqual(bar[-1], ".")
                        self.assertEqual(int(bar[-1], 36), cad[k] + 2, (cid, s))
                    self.assertNotEqual(bars[0][0], ".")

    def test_encode_roundtrip(self):
        import export_bank
        p = grammar.bank_entry("anatolian", 6, keep=3, make=50)[0]
        s = export_bank.encode(p)
        back = [[None if ch == "." else int(ch, 36) - 2 for ch in bar] for bar in s.split("|")]
        self.assertEqual(back, p["b"])


if __name__ == "__main__":
    unittest.main()
