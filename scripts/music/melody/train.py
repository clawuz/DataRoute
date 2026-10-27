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
MATCH = 0.75                 # a bar reuses an earlier one when this share of its slots (before the cadence) agrees
OPS = ("repeat", "sequence", "inversion", "new")
SEQ_SHIFTS = (1, -1, 2, -2)
APPROACH_GAP = 2             # the slot before the cadence is at most this far from it
TRAINED_SHARE = 0.7          # the final entry: 70% trained, 30% grammar
MAKE, KEEP = 600, 64
SHIPPABLE_SOURCES = ("pdmx", "nottingham")


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
    b = p["b"]
    h = len(b[0])
    s = 0.0
    if any(op != "new" for op in p["ops"]) or (h >= 3 and grammar.reuses_material(b)):
        s += 0.5
    slots = [d for bar in b for d in bar]
    if sum(d is None for d in slots) / len(slots) > 0.4:
        s -= 1.0
    if h >= 3:
        s -= 0.5 * sum(1 for bar in b if len({d for d in bar if d is not None}) == 1)
    if h >= 4:  # a bar held on one note for more than half of its slots (likelihood favours repeats: this keeps the line moving)
        s -= 0.75 * sum(1 for bar in b if longest_run(bar) * 2 > h)
    return s


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
        p["score"] = p["ll"] + structure_score(p)
        p["s"] = p["b"][0][0]
        p["bias"] = grammar.phrase_bias(p["b"])
        out.append(p)
    return out


def _key(p: dict):
    means = tuple(grammar._round(grammar._mean(bar)) for bar in p["b"])
    return (p["s"], means, p["ops"])


def select(model: Model, card: str, h: int, keep: int = KEEP, make: int = MAKE, seed: int = 0) -> List[dict]:
    """generate `make`, drop duplicates, keep the best third by score, then round robin over the distinct (start, bar means,
    operator pattern) groups (best group first) so that any prefix is diverse; a card with a direction keeps that direction first"""
    seen, uniq = set(), []
    for i, p in enumerate(generate(model, card, h, make, seed)):
        s = encode(p)
        if s not in seen:
            seen.add(s)
            uniq.append((i, p))
    uniq.sort(key=lambda ip: (-ip[1]["score"], ip[0]))
    pool = [p for _, p in uniq[:max(keep * 2, len(uniq) // 3)]]

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
    if want == 0:
        ordered = spread(pool)
    else:
        ordered = spread([p for p in pool if p["bias"] == want]) + spread([p for p in pool if p["bias"] != want])
    return ordered[:keep]


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
    """{card: [phrase lines]} for every .jsonl (only `src`, `piece` and `bars` kept)"""
    out = {}
    for fn in sorted(os.listdir(path)):
        if fn.endswith(".jsonl"):
            with open(os.path.join(path, fn), encoding="utf-8") as f:
                out[fn[:-6]] = [{k: v for k, v in json.loads(line).items() if k in ("src", "piece", "bars")} for line in f]
    return out
