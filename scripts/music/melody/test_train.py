"""Tests of the trained melody model (spec docs/superpowers/specs/2026-10-27-melody-trained-design.md, section Testing).

Run: python3 -m unittest discover -s scripts/music/melody
Toy corpora only (made up here); the real-bank tests read the exported files and skip when absent.
"""
from __future__ import annotations

import json
import os
import unittest

import grammar
import train

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHIP = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.json")
LOCAL = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.local.json")


def bar(*degs, rest_at=None):
    """notes of equal length filling the bar (a None = silence of that length)"""
    n = len(degs)
    return [[k / n, d, 1 / n] for k, d in enumerate(degs) if d is not None]


def toy_phrase(src="pdmx", piece="a", shift=0):
    b1 = bar(0 + shift, 1 + shift, 2 + shift, 3 + shift)
    b2 = bar(1 + shift, 2 + shift, 3 + shift, 4 + shift)  # a sequence of bar 1 by +1
    return {"src": src, "piece": piece, "bars": [b1, b2, b1, bar(2, 1, 1, 0)]}


def toy_corpus(n=40):
    return [toy_phrase(piece=f"p{i % 10}", shift=i % 2) for i in range(n)]


class TestReduceBar(unittest.TestCase):
    def test_keeps_first_last_and_longest(self):
        notes = [[0.0, 0, 0.1], [0.1, 5, 0.4], [0.5, 3, 0.1], [0.6, 4, 0.3], [0.9, 1, 0.1]]
        self.assertEqual(train.reduce_bar(notes, 4), [0, 5, 4, 1])
        self.assertEqual(train.reduce_bar(notes, 5), [0, 5, 3, 4, 1])
        self.assertEqual(train.reduce_bar(notes, 2), [0, 1])
        self.assertEqual(train.reduce_bar(notes, 1), [1])

    def test_fewer_notes_repeat_the_longest(self):
        notes = [[0.0, 2, 0.5], [0.5, 1, 0.25], [0.75, 0, 0.25]]
        self.assertEqual(train.reduce_bar(notes, 5), [2, 2, 2, 1, 0])

    def test_fewer_notes_with_a_rest(self):
        notes = [[0.0, 2, 0.25], [0.5, 1, 0.25], [0.75, 0, 0.25]]  # silence 0.25..0.5
        out = train.reduce_bar(notes, 5)
        self.assertEqual(len(out), 5)
        self.assertEqual(out.count(None), 1)
        self.assertEqual(out[0], 2)
        self.assertEqual(out[-1], 0)
        self.assertEqual(out.index(None), 1 + out[1:].index(None))

    def test_padding_is_marked(self):
        notes = [[0.0, 2, 0.5], [0.5, 1, 0.25], [0.75, 0, 0.25]]
        out, fill = train.reduce_bar(notes, 5, with_filler=True)
        self.assertEqual(out, [2, 2, 2, 1, 0])
        self.assertEqual(fill, [False, True, True, False, False])

    def test_padding_is_not_a_move(self):
        sparse = {"src": "pdmx", "piece": "x", "bars": [bar(0, 2)] * 3 + [bar(1, 0)]}
        m = train.learn({"jazz": [sparse] * 40}, hits=8)
        zero = sum(m.move["jazz"][k][0] for k in m.move["jazz"])
        self.assertEqual(zero, 0)

    def test_never_ends_on_a_rest(self):
        notes = [[0.0, 2, 0.25], [0.25, 1, 0.25]]  # silent second half
        for h in range(1, 10):
            out = train.reduce_bar(notes, h)
            self.assertEqual(len(out), h)
            self.assertIsNotNone(out[-1])


class TestClamp(unittest.TestCase):
    def test_octave_shift_of_the_whole_phrase(self):
        bars = [bar(7, 8, 9, 8), bar(7, 8, 9, 8), bar(7, 8, 9, 8), bar(7, 7, 7, 7)]
        out = train.clamp_phrase(bars, span=5, octave=7)
        self.assertEqual([n[1] for n in out[0]], [0, 1, 2, 1])

    def test_fold_keeps_contour_else_clamp(self):
        bars = [bar(0, 2, 4, 6), bar(4, 3, 2, 1), bar(0, 1, 2, 3), bar(2, 1, 0, 0)]
        out = train.clamp_phrase(bars, span=5, octave=7)
        degs = [n[1] for b in out for n in b]
        self.assertTrue(all(-2 <= d <= 5 for d in degs))
        self.assertEqual(degs[3], 5)  # 6 -> -1 would turn the rise into a fall: clamped

    def test_fold_when_contour_survives(self):
        # -3 between two 0s: folded up it becomes 4, above its neighbours (the dip turns into a peak): clamped to -2 instead
        bars = [bar(0, -3, 0, 1), bar(1, 1, 1, 1), bar(1, 1, 1, 1), bar(1, 1, 1, 0)]
        out = train.clamp_phrase(bars, span=6, octave=7)
        self.assertEqual(out[0][1][1], -2)


class TestLearn(unittest.TestCase):
    def setUp(self):
        self.model = train.learn({"jazz": toy_corpus()}, hits=4)

    def test_interval_table(self):
        p = self.model.p_move("jazz", prev=1, role=1, cls="middle")
        self.assertAlmostEqual(sum(p.values()), 1.0, places=6)
        self.assertEqual(max(p, key=p.get), 1)  # the toy rises by steps
        self.assertGreater(p[-5], 0)  # smoothing
        self.assertLess(p[-5], 0.01)

    def test_backoff_to_cluster_and_all(self):
        m = train.learn({"jazz": toy_corpus(), "funk": toy_corpus()}, hits=4)
        p = m.p_move("pop", prev=1, role=1, cls="middle")  # pop has no data: the anglo cluster answers
        self.assertEqual(max(p, key=p.get), 1)
        q = m.p_move("hindustani", prev=1, role=1, cls="middle")  # no cluster data: all
        self.assertEqual(max(q, key=q.get), 1)

    def test_operators(self):
        ops = self.model.p_op("jazz", 3)
        self.assertEqual(max(ops, key=ops.get), "repeat")  # bar 3 = bar 1
        ops2 = self.model.p_op("jazz", 2)
        self.assertEqual(max(ops2, key=ops2.get), "sequence")

    def test_start_and_rests(self):
        st = self.model.p_start("jazz")
        self.assertIn(max(st, key=st.get), (0, 1))
        self.assertLess(self.model.p_rest("jazz", "middle"), 0.1)


class TestGenerate(unittest.TestCase):
    def setUp(self):
        self.model = train.learn({"jazz": toy_corpus()}, hits=6)

    def test_determinism_and_contract(self):
        a = train.generate(self.model, "jazz", 6, n=50, seed=3)
        b = train.generate(self.model, "jazz", 6, n=50, seed=3)
        self.assertEqual(a, b)
        self.assertNotEqual(a, train.generate(self.model, "jazz", 6, n=50, seed=4))
        idiom = grammar.idiom_of("jazz")
        for p in a:
            self.assertEqual(len(p["b"]), 4)
            self.assertIsNotNone(p["b"][0][0])
            for k, bb in enumerate(p["b"]):
                self.assertEqual(len(bb), 6)
                self.assertEqual(bb[-1], idiom["cadence"][k])
                for d in bb:
                    if d is not None:
                        self.assertGreaterEqual(d, -2)
                        self.assertLessEqual(d, idiom["span"])

    def test_select_is_distinct_and_capped(self):
        ps = train.select(self.model, "jazz", 6, keep=20, make=120, seed=0)
        strs = [train.encode(p) for p in ps]
        self.assertLessEqual(len(strs), 20)
        self.assertEqual(len(set(strs)), len(strs))

    def test_hits_one(self):
        m = train.learn({"jazz": toy_corpus()}, hits=1)
        ps = train.generate(m, "jazz", 1, n=5, seed=0)
        self.assertEqual(ps[0]["b"], [[c] for c in grammar.idiom_of("jazz")["cadence"]])


class TestStructure(unittest.TestCase):
    def test_held_bars_score_lower(self):
        moving = {"b": [[0, 1, 2, 1, 2, 2], [3, 2, 1, 2, 1, 0], [0, 1, 2, 1, 2, 2], [3, 2, 1, 2, 1, 4]], "ops": ("new", "repeat", "new")}
        held = {"b": [[0, 0, 0, 0, 1, 2], [3, 2, 1, 2, 1, 0], [0, 1, 2, 1, 2, 2], [3, 2, 1, 2, 1, 4]], "ops": ("new", "new", "new")}
        self.assertEqual(train.longest_run([0, 0, None, 0, 1, 2]), 3)
        self.assertGreater(train.structure_score(moving), train.structure_score(held))


class TestEligibility(unittest.TestCase):
    def test_thresholds(self):
        many = [{"src": "pdmx", "piece": f"p{i % 50}"} for i in range(400)]
        self.assertTrue(train.eligible(many))
        self.assertFalse(train.eligible(many[:399]))
        few_pieces = [{"src": "pdmx", "piece": f"p{i % 39}"} for i in range(800)]
        self.assertFalse(train.eligible(few_pieces))


class TestMix(unittest.TestCase):
    def test_mix_70_30_interleaved(self):
        trained = [f"t{i}" for i in range(64)]
        gram = [f"g{i}" for i in range(64)]
        out = train.mix(trained, gram, 64)
        self.assertEqual(len(out), 64)
        self.assertEqual(sum(s.startswith("g") for s in out), 19)
        self.assertTrue(any(s.startswith("g") for s in out[:6]))

    def test_mix_fills_from_grammar_when_trained_is_short(self):
        out = train.mix(["t0", "t1"], [f"g{i}" for i in range(10)], 8)
        self.assertEqual(len(out), 8)
        self.assertEqual(len(set(out)), 8)


def check_bank(tc, path, ship):
    if not os.path.exists(path):
        tc.skipTest("bank not exported yet")
    tc.assertLess(os.path.getsize(path), 1024 * 1024)
    with open(path, encoding="utf-8") as f:
        text = f.read()
    bank = json.loads(text)
    tc.assertEqual(bank["version"], 2)
    tc.assertEqual(set(bank["cards"]), set(grammar.FORM_OF))
    tc.assertEqual(set(bank["sources"]), set(grammar.FORM_OF))
    if ship:
        tc.assertNotIn("symbtr", text)
    for cid, by in bank["cards"].items():
        cad = grammar.idiom_of(cid)["cadence"]
        span = grammar.idiom_of(cid)["span"]
        for h, ps in by.items():
            tc.assertTrue(0 < len(ps) <= 64)
            tc.assertEqual(len(set(ps)), len(ps))
            for s in ps:
                bars = s.split("|")
                tc.assertEqual([len(b) for b in bars], [int(h)] * 4, s)
                tc.assertNotEqual(bars[0][0], ".")
                for k, b in enumerate(bars):
                    tc.assertEqual(int(b[-1], 36) - 2, cad[k], (cid, s))
                    for ch in b:
                        if ch != ".":
                            tc.assertTrue(-2 <= int(ch, 36) - 2 <= span, (cid, s))
    return bank


class TestBanks(unittest.TestCase):
    def test_shippable(self):
        bank = check_bank(self, SHIP, ship=True)
        for cid, src in bank["sources"].items():
            self.assertTrue(set(src) <= {"pdmx", "nottingham", "grammar"}, (cid, src))

    def test_local(self):
        bank = check_bank(self, LOCAL, ship=False)
        self.assertTrue(any("symbtr" in s for s in bank["sources"].values()))

    def test_local_is_git_ignored(self):
        with open(os.path.join(ROOT, ".gitignore"), encoding="utf-8") as f:
            gi = f.read()
        self.assertIn("globe/src/personal/melody-bank.local.json", gi)


if __name__ == "__main__":
    unittest.main()
