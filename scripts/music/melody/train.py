"""The trained melody model (spec docs/superpowers/specs/2026-10-27-melody-trained-design.md, section "The model"): a grammar skeleton
(four bars, the card's cadence at the end of every bar, bar operators) whose note moves are learned from the phrase corpus
(.corpora/phrases/<card>.jsonl, built by build_corpus.py).

For a card and a number of hits h:
1. every corpus phrase is clamped to [-2, span] of the card (an octave shift of the whole phrase, then octave folding of a note where its
   contour survives, else clamping), then every bar is reduced to h slots (`reduce_bar`);
2. learned, with additive smoothing 0.1 and back-off card -> cluster (CLUSTER_OF of genres.ts) -> all: the move table
   P(interval | previous interval, bar role 1..4, slot class first/middle/last), the bar operators (repeat / sequence / inversion / new
   for bars 2..4, and which earlier bar they reuse), the rest probability per slot class, the start degree of bar 1;
3. 600 phrases are generated (fixed seed), reranked by the mean log-likelihood of their moves plus a structure score, and the 64 most
   distinct are kept (`select`).

The model holds only counts; the bank holds generated phrases, never a corpus melody. Deterministic: random.Random(stable_seed(...)).
"""
from __future__ import annotations

import json
import math
import os
import random
import re
import sys
from collections import Counter, defaultdict
from typing import Dict, List, Optional, Sequence

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grammar  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GENRES_TS = os.path.join(ROOT, "globe", "src", "personal", "genres.ts")
PHRASES = os.path.join(ROOT, ".corpora", "phrases")

LOW = grammar.LOW
ALPHA = 0.1                  # additive smoothing
MAX_IV = 5                   # intervals clipped to +-5 scale degrees
INTERVALS = list(range(-MAX_IV, MAX_IV + 1))
MIN_CTX = 30                 # a level of the back-off answers when its context has at least this many observations
MIN_PHRASES, MIN_PIECES = 400, 40   # a card trains only with this much corpus, else it falls back to the grammar
MATCH = 0.75                 # a bar reuses an earlier one when this share of its slots (before the cadence) agrees. Task 3 swept
                             # 0.75 and 0.67 (which only differ at hits 4, 7 and 8): 0.67 counts 2-in-3 agreement as a repeat and raises
                             # the corpus's own rate at hits 8 from 45% to 66% without bringing the bank's moves closer: kept 0.75
OPS = ("repeat", "sequence", "inversion", "new")
SEQ_SHIFTS = (1, -1, 2, -2)
APPROACH_GAP = 2             # the slot before the cadence is at most this far from it
CADENCE_AWARE = True         # the slot before the cadence is drawn weighted by the probability of the move into the cadence (Task 3:
                             # without it the forced arrivals were mostly +-2, against the corpus's steps and repeats)
TRAINED_SHARE = 0.7          # the final entry: 70% trained, 30% grammar
MAKE, KEEP = 600, 64
LL_WEIGHT = 1.0              # the weight of the mean log-likelihood in the rerank (Task 3 swept 1, 0.5, 0.25: no gain, kept 1)
ONE_NOTE_PENALTY = 0.5       # per bar that is all one note
# the held-bar penalty of the rerank (0, 0.05, ..., 2), calibrated per (card, hits): the value whose pool's share of held bars
# (`held`) is nearest the corpus's (`Model.p_held`, padding not counted). A fixed 0.75 (Task 2) took the repeats away from
# repeat-heavy styles (funk, pop: KL above the walk's); none at all gave 2-3 times the corpus's held bars
HELD_GRID = tuple(k / 20 for k in range(41))
POOL_SHARE = 1 / 3           # the rerank keeps this share of the unique phrases (at least 2 x keep)
REUSE_CAP = 0.12             # the whole entry (trained + grammar) aims at most this much above the corpus's recurrence (the rule is
                             # 15 points; 3 points of margin for the rounding of a 64-phrase entry)
SHIPPABLE_SOURCES = ("pdmx", "nottingham")
# a card that trains on its REGION's folk tunes only (local bank: SymbTr), not on its whole makam family: the karadeniz card learns the
# horon from the eastern Black Sea tunes (a place of the region in the composer field, or the region named in the title); the
# western Black Sea (Samsun, Sinop, Kastamonu, Bartın) does not dance the horon and is left out
HORON_PLACES = ("trabzon", "macka", "rize", "artvin", "giresun", "ordu")
HORON_WORDS = ("karadeniz", "horon", "kemence")
REGION_MIN = 150             # a region card trains on at least this many regional phrases (else it is the grammar's)
ASIDE = "~"                  # the other phrases of a region card are learned under "~card" (same cluster): the back-off is unchanged


# ---------------------------------------------------------------- cards

def _load_clusters() -> Dict[str, str]:
    src = open(GENRES_TS, encoding="utf-8").read()
    start = src.index("export const CLUSTER_OF")
    block = src[start:src.index(").flatMap", start)]
    out = {}
    for m in re.finditer(r'"?([a-z-]+)"?: \[([^\]]*)\]', block):
        for cid in re.findall(r'"([a-z]+)"', m.group(2)):
            out[cid] = m.group(1)
    return out


CLUSTER_OF = _load_clusters()


def horon_piece(name: str) -> bool:
    """a SymbTr file of the eastern Black Sea: its place (the composer field) is one of HORON_PLACES, or a word of its title names the
    region (whole words: "gordum" is not "ordu", "kemenceci" is not "kemence")"""
    parts = os.path.basename(name)[:-4].split("--") if name.endswith(".txt") else name.split("--")
    place = parts[4].split("-")[0] if len(parts) > 4 else ""
    title = parts[3].split("_") if len(parts) > 3 else []
    return place in HORON_PLACES or any(w in HORON_WORDS for w in title)


REGION_OF = {"karadeniz": horon_piece}
for _c in REGION_OF:
    CLUSTER_OF[ASIDE + _c] = CLUSTER_OF.get(_c)


def training_phrases(card: str, phrases):
    """the phrases a card trains on: all of them, or for a region card (REGION_OF) the SymbTr phrases its region rule accepts"""
    rule = REGION_OF.get(card)
    if rule is None:
        return list(phrases)
    return [p for p in phrases if p["src"] == "symbtr" and p.get("via", "region") == "region" and rule(p["piece"])]


def region_split(corpus):
    """{card: phrases} with every region card's other phrases moved to ASIDE + card (learned, but not as the card's own)"""
    out = {}
    for card, phrases in corpus.items():
        if card in REGION_OF:
            own = training_phrases(card, phrases)
            ids = {id(p) for p in own}
            out[card] = own
            out[ASIDE + card] = [p for p in phrases if id(p) not in ids]
        else:
            out[card] = phrases
    return out


def _load_octaves() -> Dict[str, int]:
    sys.path.insert(0, os.path.join(HERE, "corpus"))
    import common  # noqa: E402
    return {cid: len(scale) for cid, scale in common.load_cards().items()}


OCTAVE_OF = _load_octaves()


def span_of(card: str) -> int:
    return grammar.idiom_of(card)["span"]


def encode(p) -> str:
    """four bars -> "5342|4531|..." : digit = base-36 of (degree + 2), "." = rest"""
    b = p["b"] if isinstance(p, dict) else p
    return "|".join("".join("." if d is None else "0123456789ab"[d + 2] for d in bar) for bar in b)


def _sign(x) -> int:
    return (x > 0) - (x < 0)


# ---------------------------------------------------------------- 1. clamp and reduce

def clamp_phrase(bars, span: int, octave: int, lo: int = LOW):
    """the phrase's notes moved into [lo, span]: the whole phrase an octave down or up when that puts more notes inside (the contour
    is kept), then each note still outside is folded by an octave when its direction to both neighbours stays the same, else clamped"""
    flat = [n[1] for b in bars for n in b]
    if not flat:
        return [list(map(list, b)) for b in bars]

    def inside(shift):
        return sum(lo <= d + shift <= span for d in flat)
    shift = max((0, -octave, octave), key=lambda s: (inside(s), s == 0, s < 0))
    ds = [d + shift for d in flat]
    out = list(ds)
    for i, d in enumerate(ds):
        if lo <= d <= span:
            continue
        f = d - octave if d > span else d + octave
        ok = lo <= f <= span
        if ok and i > 0:
            ok = _sign(d - ds[i - 1]) == _sign(f - ds[i - 1])
        if ok and i + 1 < len(ds):
            ok = _sign(ds[i + 1] - d) == _sign(ds[i + 1] - f)
        out[i] = f if ok else max(lo, min(span, d))
    res, k = [], 0
    for b in bars:
        nb = []
        for n in b:
            nb.append([n[0], out[k], n[2]])
            k += 1
        res.append(nb)
    return res


def reduce_bar(notes, h: int, with_filler: bool = False):
    """a bar of notes (onset 0..1, degree, duration) -> h slots (None = rest). With >= h notes: the first, the last and the h-2 longest
    of the middle in time order. With fewer: the longest note repeated into the gaps; when the source has a rest, one gap in four
    (at least one) becomes a rest where the silence was (never the last slot).
    with_filler: also return a mask of the slots that are padding (the repeats of the longest note): they are not moves of the source,
    so the move table skips them (else a sparse corpus at many hits learns mostly "hold the note")."""
    res, fill = _reduce(notes, h)
    return (res, fill) if with_filler else res


def _reduce(notes, h: int):
    notes = sorted(notes, key=lambda n: n[0])
    if not notes:
        return ([None] * (h - 1) + [0], [True] * h) if h > 1 else ([0], [True])
    if h == 1:
        return [notes[-1][1]], [False]
    m = len(notes)
    if m >= h:
        mid = notes[1:-1]
        idx = sorted(sorted(range(len(mid)), key=lambda i: (-mid[i][2], i))[:h - 2])
        return [notes[0][1]] + [mid[i][1] for i in idx] + [notes[-1][1]], [False] * h
    g = h - m
    # the silences: (position = number of notes before it, length)
    gaps = []
    t = 0.0
    for i, (on, _, du) in enumerate(notes):
        if on - t > 1e-3:
            gaps.append((i, on - t))
        t = max(t, on + du)
    if 1.0 - t > 1e-3:
        gaps.append((m, 1.0 - t))
    gaps = [x for x in gaps if x[1] >= 1.0 / (2 * h)]
    r = (g + 3) // 4 if gaps else 0
    pos = max(gaps, key=lambda x: (x[1], -x[0]))[0] if gaps else -1
    longest = max(range(m), key=lambda i: (notes[i][2], -i))
    out: List[Optional[int]] = []
    fill: List[bool] = []
    for i, (_, d, _) in enumerate(notes):
        if i == pos:
            out += [None] * r
            fill += [False] * r
        out.append(d)
        fill.append(False)
        if i == longest:
            out += [d] * (g - r)
            fill += [True] * (g - r)
    if pos == m:  # the silence at the end of the bar: the rest goes before the last note
        out = out[:-1] + [None] * r + out[-1:]
        fill = fill[:-1] + [False] * r + fill[-1:]
    return out, fill


def prepare(bars, card: str, hits: int) -> List[List[Optional[int]]]:
    """a corpus phrase -> four reduced bars of `hits` slots, clamped to the card's range"""
    return [s for s, _ in prepare_with_filler(bars, card, hits)]


def prepare_with_filler(bars, card: str, hits: int):
    cl = clamp_phrase(bars, span_of(card), OCTAVE_OF.get(card, 7))
    return [reduce_bar(b, hits, with_filler=True) for b in cl]


# ---------------------------------------------------------------- 2. learn

def slot_class(j: int, h: int) -> str:
    if j == h - 1:
        return "last"
    return "first" if j == 0 else "middle"


def _match(a, b) -> bool:
    if not a:
        return False
    same = sum(1 for x, y in zip(a, b) if x == y)
    return same >= MATCH * len(a) - 1e-9


def _invert(body):
    f = next((d for d in body if d is not None), None)
    return [None if d is None else 2 * f - d for d in body]


def _shift(body, t):
    return [None if d is None else d + t for d in body]


def classify_bar(slots, k: int):
    """the operator of bar k (0-based, k >= 1) relative to the earlier bars: (op, j, t), nearest earlier bar first"""
    h = len(slots[0])
    body = slots[k][:h - 1]
    if h < 2 or all(d is None for d in body):
        return ("new", -1, 0)
    for j in range(k - 1, -1, -1):
        if _match(body, slots[j][:h - 1]):
            return ("repeat", j, 0)
    for j in range(k - 1, -1, -1):
        for t in SEQ_SHIFTS:
            if _match(body, _shift(slots[j][:h - 1], t)):
                return ("sequence", j, t)
    for j in range(k - 1, -1, -1):
        prev = slots[j][:h - 1]
        if any(d is not None for d in prev) and _match(body, _invert(prev)):
            return ("inversion", j, 0)
    return ("new", -1, 0)


REUSE_OPS = ("repeat", "sequence")


def recurring(slots) -> bool:
    """some bar (2..4) repeats or sequences an earlier bar (the bar similarity of `classify_bar`, threshold MATCH)"""
    return len(slots[0]) >= 2 and any(classify_bar(slots, k)[0] in REUSE_OPS for k in range(1, 4))


def distinct_motifs(slots) -> int:
    """the number of distinct bar-motifs of a phrase: 1 + the bars (2..4) that neither repeat nor sequence an earlier bar"""
    if len(slots[0]) < 2:
        return 1
    return 1 + sum(classify_bar(slots, k)[0] not in REUSE_OPS for k in range(1, 4))


def _moves(slots, filler=None):
    """(prev interval, role 1..4, slot class, interval) for every sounding slot after the first (padding slots skipped), plus the
    start degree"""
    h = len(slots[0])
    last = pi = None
    start = None
    out = []
    for k, bar in enumerate(slots):
        for j, d in enumerate(bar):
            if d is None:
                continue
            if last is None:
                start = d
            elif filler is not None and filler[k][j]:
                continue
            else:
                iv = max(-MAX_IV, min(MAX_IV, d - last))
                out.append((pi, k + 1, slot_class(j, h), iv))
                pi = iv
            last = d
    return start, out


class Model:
    """counts for one number of hits; probabilities by back-off card -> cluster -> all with additive smoothing"""

    def __init__(self, hits: int):
        self.h = hits
        self.move = defaultdict(lambda: defaultdict(Counter))   # card -> (prev, role, cls) -> Counter(iv)
        self.ops = defaultdict(lambda: defaultdict(Counter))    # card -> role -> Counter(op)
        self.opsrc = defaultdict(lambda: defaultdict(Counter))  # card -> (role, op) -> Counter((j, t))
        self.start = defaultdict(Counter)                       # card -> Counter(degree)
        self.rest = defaultdict(lambda: defaultdict(lambda: [0, 0]))  # card -> cls -> [rests, slots]
        self.rec = defaultdict(lambda: [0, 0])                  # card -> [phrases with a recurring bar, phrases]
        self.held = defaultdict(lambda: [0, 0])                 # card -> [held bars (padding not counted), bars]
        self._cache: Dict[tuple, object] = {}

    def add(self, card: str, slots, filler=None) -> None:
        h = self.h
        start, moves = _moves(slots, filler)
        if start is None:
            return
        self.start[card][start] += 1
        for pi, role, cls, iv in moves:
            self.move[card][(pi, role, cls)][iv] += 1
        for k, bar in enumerate(slots):
            for j, d in enumerate(bar):
                c = self.rest[card][slot_class(j, h)]
                c[0] += d is None
                c[1] += 1
        for k, bar in enumerate(slots):
            real = bar if filler is None else [None if filler[k][j] else d for j, d in enumerate(bar)]
            self.held[card][0] += held(real)
            self.held[card][1] += 1
        self.rec[card][0] += any(classify_bar(slots, k)[0] in REUSE_OPS for k in range(1, 4))
        self.rec[card][1] += 1
        for k in range(1, 4):
            op, j, t = classify_bar(slots, k)
            self.ops[card][k + 1][op] += 1
            if op != "new":
                self.opsrc[card][(k + 1, op)][(j, t)] += 1
        self._cache.clear()

    # -- back-off
    def _levels(self, card: str):
        cl = CLUSTER_OF.get(card)
        same = [c for c in self.start if CLUSTER_OF.get(c) == cl] if cl else []
        return [[card], same, list(self.start)]

    def _counter(self, table, cards, key, need=MIN_CTX):
        c = Counter()
        for cid in cards:
            if cid in table and key in table[cid]:
                c.update(table[cid][key])
        return c

    def _backoff(self, table, card, key):
        levels = self._levels(card)
        for cards in levels:
            c = self._counter(table, cards, key)
            if sum(c.values()) >= MIN_CTX:
                return c
        return self._counter(table, levels[-1], key)

    def p_move(self, card: str, prev, role: int, cls: str) -> Dict[int, float]:
        ck = ("m", card, prev, role, cls)
        if ck not in self._cache:
            c = self._backoff(self.move, card, (prev, role, cls))
            n = sum(c.values()) + ALPHA * len(INTERVALS)
            self._cache[ck] = {iv: (c[iv] + ALPHA) / n for iv in INTERVALS}
        return self._cache[ck]

    def p_op(self, card: str, role: int) -> Dict[str, float]:
        ck = ("o", card, role)
        if ck not in self._cache:
            c = self._backoff(self.ops, card, role)
            n = sum(c.values()) + ALPHA * len(OPS)
            self._cache[ck] = {op: (c[op] + ALPHA) / n for op in OPS}
        return self._cache[ck]

    def op_sources(self, card: str, role: int, op: str) -> Counter:
        ck = ("s", card, role, op)
        if ck not in self._cache:
            self._cache[ck] = self._backoff(self.opsrc, card, (role, op))
        return self._cache[ck]

    def p_start(self, card: str) -> Dict[int, float]:
        ck = ("st", card)
        if ck not in self._cache:
            span = span_of(card)
            c = Counter()
            for cards in self._levels(card):
                c = Counter()
                for cid in cards:
                    c.update(self.start.get(cid, {}))
                if sum(c.values()) >= MIN_CTX:
                    break
            degs = range(LOW, span + 1)
            n = sum(c[d] for d in degs) + ALPHA * len(degs)
            self._cache[ck] = {d: (c[d] + ALPHA) / n for d in degs}
        return self._cache[ck]

    def p_recur(self, card: str) -> float:
        """the share of corpus phrases with a recurring bar (`recurring`), by back-off"""
        r = t = 0
        for cards in self._levels(card):
            r = sum(self.rec[c][0] for c in cards if c in self.rec)
            t = sum(self.rec[c][1] for c in cards if c in self.rec)
            if t >= MIN_CTX:
                break
        return r / t if t else 0.5

    def p_held(self, card: str) -> float:
        """the share of corpus bars held on one note for more than half their slots (padding slots not counted), by back-off"""
        r = t = 0
        for cards in self._levels(card):
            r = sum(self.held[c][0] for c in cards if c in self.held)
            t = sum(self.held[c][1] for c in cards if c in self.held)
            if t >= MIN_CTX:
                break
        return r / t if t else 0.0

    def p_rest(self, card: str, cls: str) -> float:
        ck = ("r", card, cls)
        if ck not in self._cache:
            r = t = 0
            for cards in self._levels(card):
                r = t = 0
                for cid in cards:
                    if cid in self.rest and cls in self.rest[cid]:
                        r += self.rest[cid][cls][0]
                        t += self.rest[cid][cls][1]
                if t >= MIN_CTX:
                    break
            self._cache[ck] = (r + ALPHA) / (t + 2 * ALPHA)
        return self._cache[ck]


def learn(corpora: Dict[str, Sequence[dict]], hits: int) -> Model:
    """a model from {card: [phrase lines {src, piece, bars}]}"""
    m = Model(hits)
    for card, phrases in corpora.items():
        for ph in phrases:
            red = prepare_with_filler(ph["bars"], card, hits)
            m.add(card, [s for s, _ in red], [f for _, f in red])
    return m


# ---------------------------------------------------------------- 3. generate, rerank, select

def _draw(rng: random.Random, dist: Dict[int, float]):
    keys = list(dist)
    tot = sum(dist.values())
    x = rng.random() * tot
    for k in keys:
        x -= dist[k]
        if x <= 0:
            return k
    return keys[-1]


def loglik(model: Model, card: str, bars) -> float:
    _, moves = _moves(bars)
    if not moves:
        return 0.0
    return sum(math.log(model.p_move(card, pi, role, cls)[iv]) for pi, role, cls, iv in moves) / len(moves)


def _new_bar(model, card, rng, role, h, cad, span, last, pi):
    bar: List[Optional[int]] = []
    for j in range(h):
        cls = slot_class(j, h)
        if j == h - 1:
            bar.append(cad)
            break
        rest_ok = not (role == 1 and j == 0) and last is not None and (not bar or bar[-1] is not None)
        if rest_ok and rng.random() < model.p_rest(card, cls):
            bar.append(None)
            continue
        if last is None:
            d = _draw(rng, model.p_start(card))
        else:
            dist = model.p_move(card, pi, role, cls)
            ok = {iv: p for iv, p in dist.items() if LOW <= last + iv <= span and (j != h - 2 or abs(last + iv - cad) <= APPROACH_GAP)}
            if j == h - 2 and CADENCE_AWARE:  # the move into the forced cadence is a move too: weigh by the model's last-slot table
                ok = {iv: p * model.p_move(card, iv, role, "last")[max(-MAX_IV, min(MAX_IV, cad - last - iv))] for iv, p in ok.items()}
            if not ok:  # nothing reachable: the nearest legal degree toward the cadence
                tgt = max(LOW, min(span, cad))
                ok = {tgt - last: 1.0} if abs(tgt - last) <= MAX_IV else {_sign(tgt - last) * MAX_IV: 1.0}
            iv = _draw(rng, ok)
            d = last + iv
            pi = iv
        bar.append(d)
        last = d
    last_iv = cad - last if last is not None else None
    return bar, cad, (max(-MAX_IV, min(MAX_IV, last_iv)) if last_iv is not None else pi)


def make_phrase(model: Model, card: str, h: int, rng: random.Random) -> dict:
    idiom = grammar.idiom_of(card)
    cad, span = list(idiom["cadence"]), idiom["span"]
    if h == 1:
        bars = [[c] for c in cad]
        return {"b": bars, "ops": ("new",) * 3}
    bars: List[List[Optional[int]]] = []
    ops = []
    last = pi = None
    for k in range(4):
        role = k + 1
        op = "new"
        if k > 0:
            op = _draw(rng, model.p_op(card, role))
            if op != "new":
                srcs = {jt: n for jt, n in model.op_sources(card, role, op).items() if jt[0] < k}
                if not srcs:
                    op = "new"
        if op == "new":
            bar, last, pi = _new_bar(model, card, rng, role, h, cad[k], span, last, pi)
        else:
            j, t = _draw(rng, srcs)
            body = bars[j][:h - 1]
            body = _shift(body, t) if op == "sequence" else _invert(body) if op == "inversion" else list(body)
            body = [None if d is None else max(LOW, min(span, d)) for d in body]
            if body and body[-1] is not None and abs(body[-1] - cad[k]) > APPROACH_GAP:
                body[-1] = cad[k] + _sign(body[-1] - cad[k]) * APPROACH_GAP
            if body and body[0] is None and k == 0:
                body[0] = cad[k]
            bar = body + [cad[k]]
            last = cad[k]
            pi = None
        bars.append(bar)
        ops.append(op)
    return {"b": bars, "ops": tuple(ops[1:])}


def structure_score(p: dict) -> float:
    """penalties of the rerank: too many rests, bars of one note (the held-bar penalty and the reuse bonus are calibrated in `select`)"""
    b = p["b"]
    h = len(b[0])
    s = 0.0
    slots = [d for bar in b for d in bar]
    if sum(d is None for d in slots) / len(slots) > 0.4:
        s -= 1.0
    if h >= 3:
        s -= ONE_NOTE_PENALTY * sum(1 for bar in b if len({d for d in bar if d is not None}) == 1)
    return s


def held(bar) -> bool:
    """a bar (of at least 4 slots) held on one note for more than half of its slots"""
    return len(bar) >= 4 and longest_run(bar) * 2 > len(bar)


def longest_run(bar) -> int:
    """the longest run of one repeated sounding note (rests between them do not break it)"""
    best = run = 0
    prev = None
    for d in bar:
        if d is None:
            continue
        run = run + 1 if d == prev else 1
        prev = d
        best = max(best, run)
    return best


def generate(model: Model, card: str, h: int, n: int = MAKE, seed: int = 0) -> List[dict]:
    out = []
    for i in range(n):
        p = make_phrase(model, card, h, random.Random(grammar.stable_seed("trained", card, h, i, seed)))
        p["ll"] = loglik(model, card, p["b"])
        p["score"] = LL_WEIGHT * p["ll"] + structure_score(p)
        p["rec"] = recurring(p["b"])
        p["held"] = sum(held(bar) for bar in p["b"])
        p["s"] = p["b"][0][0]
        p["bias"] = grammar.phrase_bias(p["b"])
        out.append(p)
    return out


def _key(p: dict):
    means = tuple(grammar._round(grammar._mean(bar)) for bar in p["b"])
    return (p["s"], means, p["ops"])


def reuse_target(corpus_rate: float, grammar_rate: float, share: float = TRAINED_SHARE) -> float:
    """the recurrence the trained part aims at: the corpus's, lowered only as far as needed for the mixed entry (share trained,
    1 - share grammar phrases that recur at grammar_rate) to stay within REUSE_CAP of the corpus"""
    return max(0.0, min(corpus_rate, (corpus_rate + REUSE_CAP - (1 - share) * grammar_rate) / share))


def select(model: Model, card: str, h: int, keep: int = KEEP, make: int = MAKE, seed: int = 0, target: Optional[float] = None) -> List[dict]:
    """generate `make`, drop duplicates, rerank, keep `keep`:
    1. the pool: the best POOL_SHARE (at least 2 x keep) by score, with the held-bar penalty of HELD_GRID that brings the pool's share
       of held bars nearest the corpus's (`Model.p_held`), and the reuse bonus calibrated to hit `target` (default: the
       corpus's share of phrases with a recurring bar, `Model.p_recur`) exactly: the pool takes the best round(target x size) of the
       recurring phrases and the best of the others;
    2. the pool in a fixed pseudo-random order (the head of a likelihood ranking is mode-seeking, mostly steps; a sample of the pool
       keeps the corpus's moves), each class spread by round robin over the distinct (start, bar means, operator pattern) groups so that
       any prefix is diverse, a card with a direction keeping that direction first;
    3. the two classes interleaved so that any prefix keeps the target share."""
    seen, uniq = set(), []
    for i, p in enumerate(generate(model, card, h, make, seed)):
        s = encode(p)
        if s not in seen:
            seen.add(s)
            uniq.append((i, p))
    size = max(keep * 2, int(len(uniq) * POOL_SHARE))
    target = model.p_recur(card) if target is None else target
    held_target = model.p_held(card)

    def pool_of(w):
        best = sorted(uniq, key=lambda ip: (-(ip[1]["score"] - w * ip[1]["held"]), ip[0]))
        rec = [p for _, p in best if p["rec"]]
        oth = [p for _, p in best if not p["rec"]]
        n = min(len(rec), max(size - len(oth), round(target * size)))
        return rec[:n], oth[:size - n]

    def held_gap(w):
        rec, oth = pool_of(w)
        return abs(sum(p["held"] for p in rec + oth) / (4 * max(1, len(rec) + len(oth))) - held_target)
    w = min(HELD_GRID, key=lambda x: (round(held_gap(x), 4), x))
    rec, oth = pool_of(w)
    n_rec = len(rec)
    shuffle = lambda ps: sorted(ps, key=lambda p: grammar.stable_seed("pick", card, h, seed, encode(p)))  # noqa: E731
    rec, oth = shuffle(rec), shuffle(oth)

    def spread(ps):
        groups: Dict[tuple, List[dict]] = {}
        for p in ps:
            groups.setdefault(_key(p), []).append(p)
        lanes = list(groups.values())
        out, depth = [], 0
        while any(len(l) > depth for l in lanes):
            out.extend(l[depth] for l in lanes if len(l) > depth)
            depth += 1
        return out

    want = grammar.idiom_of(card)["bias"]

    def ordered(ps):
        if want == 0:
            return spread(ps)
        return spread([p for p in ps if p["bias"] == want]) + spread([p for p in ps if p["bias"] != want])
    rec, oth = ordered(rec), ordered(oth)
    share = n_rec / max(1, n_rec + len(oth))
    out, ri, oi = [], 0, 0
    while len(out) < keep and (ri < len(rec) or oi < len(oth)):
        take_rec = ri < len(rec) and (oi >= len(oth) or ri < math.floor((len(out) + 1) * share + 0.5))
        if take_rec:
            out.append(rec[ri])
            ri += 1
        else:
            out.append(oth[oi])
            oi += 1
    if want != 0:  # the direction first across both classes (stable: the interleaving order is kept inside each)
        out.sort(key=lambda p: p["bias"] != want)
    return out


def mix(trained: List[str], gram: List[str], n: int = KEEP, share: float = TRAINED_SHARE) -> List[str]:
    """n strings: round(n * (1 - share)) from the grammar spread through the list (any prefix keeps the ratio), the rest trained; a
    side that runs short is filled from the other; no duplicates"""
    want_g = round(n * (1 - share))
    out, seen = [], set()
    ti = gi = 0
    taken_g = 0
    while len(out) < n and (ti < len(trained) or gi < len(gram)):
        use_g = (math.floor((len(out) + 1) * (1 - share) + 1e-9) > taken_g and taken_g < want_g) or ti >= len(trained)
        if use_g and gi < len(gram):
            s = gram[gi]
            gi += 1
            if s not in seen:
                taken_g += 1
        elif ti < len(trained):
            s = trained[ti]
            ti += 1
        else:
            s = gram[gi]
            gi += 1
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def eligible(phrases: Sequence[dict]) -> bool:
    return len(phrases) >= MIN_PHRASES and len({(p["src"], p["piece"]) for p in phrases}) >= MIN_PIECES


# ---------------------------------------------------------------- the real corpus

def read_corpus(path: str = PHRASES):
    """{card: [phrase lines]} for every .jsonl (only `src`, `piece`, `via` and `bars` kept)"""
    out = {}
    for fn in sorted(os.listdir(path)):
        if fn.endswith(".jsonl"):
            with open(os.path.join(path, fn), encoding="utf-8") as f:
                out[fn[:-6]] = [{k: v for k, v in json.loads(line).items() if k in ("src", "piece", "via", "bars")} for line in f]
    return out
