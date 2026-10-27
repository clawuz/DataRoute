"""Tests of evaluate.py (the measures and the acceptance rules). Run: python3 -m unittest discover -s scripts/music/melody"""
from __future__ import annotations

import json
import os
import unittest

import evaluate as ev
import grammar


class TestMeasures(unittest.TestCase):
    def test_moves_skip_rests_and_clip(self):
        self.assertEqual(ev.moves([0, None, 1, 1, 9, None]), [1, 0, 5])
        self.assertEqual(ev.phrase_moves(ev.decode("23|4.|55|67")), [1, 1, 1, 0, 1, 1])

    def test_shares(self):
        s = ev.shares([1, -1, 0, 3], [0, None, 1, 2])
        self.assertEqual((s["step"], s["leap"], s["repeat"], s["rest"]), (0.5, 0.25, 0.25, 0.25))

    def test_kl(self):
        p = ev.dist([1, 1, -1, 0])
        self.assertAlmostEqual(ev.kl(p, p), 0.0)
        self.assertGreater(ev.kl(ev.dist([3, 3, 3]), p), ev.kl(ev.dist([1, -1, 0]), p))

    def test_patterns(self):
        self.assertEqual(ev.patterns([[1, 1, 1, 1]])[0], ("+1+1+1", 1.0))

    def test_cadence_check_and_failures(self):
        cad = grammar.idiom_of("pop")["cadence"]
        good = "|".join("3" + "0123456789ab"[c + 2] for c in cad)
        bad = good[:-1] + "."
        self.assertEqual(ev.cadence_check({"cards": {"pop": {"2": [good]}}}), (4, 4, 0))
        self.assertEqual(ev.cadence_check({"cards": {"pop": {"2": [bad]}}}), (4, 3, 1))
        rows = [{"card": "pop", "trained": True, "h": {8: {"kl_bank": 0.2, "kl_walk": 0.1}}},
                {"card": "thai", "trained": False, "h": {8: {"kl_bank": 0.5, "kl_walk": 0.1}}}]
        f = ev.failures(rows, {"x": (4, 4, 0)})
        self.assertEqual(len(f), 1)
        self.assertIn("pop", f[0])
        self.assertEqual(len(ev.failures([], {"x": (4, 3, 1)})), 2)

    def test_karadeniz_measures(self):
        self.assertEqual(ev.zigzag([[1, 2, 1, 2, 0], [3, None, 3, 3]]), (2, 4))   # 1 2 1, 2 1 2 zig; 1 2 0, 3 3 3 not
        st = ev.phrase_stats([[[1, 2, 1, 2], [1, 2, 1, 0], [0, 1, 0, 2], [1, 0, 0, 0]]])
        self.assertEqual(st["same12"], 1.0)
        self.assertEqual(st["range"], 2)
        self.assertEqual(st["patterns"][0][0], "1 2 1 2")
        self.assertAlmostEqual(st["repeat"], 3 / 15)

    def test_walk_samples_file(self):
        if not os.path.exists(ev.WALK):
            self.skipTest("walk samples not dumped")
        with open(ev.WALK, encoding="utf-8") as f:
            walk = json.load(f)
        self.assertEqual(set(walk["cards"]), set(grammar.FORM_OF))
        for cid, by in walk["cards"].items():
            self.assertEqual(sorted(by), ["6", "8"])
            self.assertEqual(len(by["8"]), 200)


if __name__ == "__main__":
    unittest.main()
