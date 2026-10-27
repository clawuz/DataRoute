"""The melody grammar: four-bar hook phrases made by one FORM per tradition (spec docs/superpowers/specs/2026-10-27-melody-bank-design.md).

A phrase is four bars of `hits` scale degrees (index into the card's scale, as idiom.ts's walk uses them; `None` = a rest). Every form
builds its bars from a MOTIF and a few operators (repeat, sequence, invert, truncate, answer, ornament, rest), so that material comes back
and is developed instead of wandering like a random walk. The last slot of each bar is the cadence of the card's idiom (the same contract
as `phraseMotifs`), a bar never ends on a rest, and the first slot of the phrase always sounds.

Deterministic: every phrase draws from random.Random(seed) with a seed made by SHA-256 of (card id, hits, index, base seed); Python's
hash() is never used (it is salted per process).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
from typing import Dict, List, Optional

HERE = os.path.dirname(os.path.abspath(__file__))
IDIOMS_JSON = os.path.join(HERE, "idioms.json")

FORMS = ("seyir", "cyclic", "period", "raga", "song", "riff", "arch", "ostinato", "horon")

# One form per card, all 52 ids of genres.ts BASE_CARDS. The table of the spec, plus two judgements for the cards the spec does not
# name: flamenco is a descending Phrygian line that comes home on the tonic (the seyir shape: the falseta falls to the cadence), salsa is
# a montuno/guajeo, a repeated syncopated figure (the riff shape).
FORM_OF: Dict[str, str] = {
    # makam and maqam: dwell on the dominant, climb, then descend to the karar
    "anatolian": "seyir", "icanadolu": "seyir", "mevlevi": "seyir", "arabic": "seyir", "khaleeji": "seyir", "maghrebi": "seyir",
    "persian": "seyir", "zeybek": "seyir", "akdeniz": "seyir", "flamenco": "seyir",
    # the Black Sea horon: a zigzag motif repeated exactly, a tight range, a held final (the region's SymbTr tunes)
    "karadeniz": "horon",
    # dance cycles: a two-note cell turning over and over
    "dogu": "cyclic", "karsilama": "cyclic", "greek": "cyclic", "caucasus": "cyclic", "centralasia": "cyclic",
    "celtic": "cyclic", "mariachi": "cyclic", "slavic": "cyclic",
    # antecedent and consequent
    "classical": "period", "baroque": "period", "romantic": "period", "italian": "period", "russian": "period", "chanson": "period",
    "fado": "period", "spguitar": "period", "cinematic": "period", "calm": "period", "nordic": "period", "tango": "period",
    # alap-like ascent to the high tonic
    "hindustani": "raga",
    # AABA song
    "bollywood": "song", "pop": "song", "dance": "song", "epic": "song", "country": "song", "cumbia": "song", "samba": "song",
    "bossa": "song",
    # chord-tone riffs
    "funk": "riff", "rnb": "riff", "afrobeat": "riff", "jazz": "riff", "salsa": "riff",
    # one arch over the phrase
    "eastasia": "arch", "chinese": "arch", "thai": "arch", "andean": "arch",
    # one breathing cell
    "gamelan": "ostinato", "westafrica": "ostinato", "eastafrica": "ostinato",
}

# the forms whose range is narrower than the idiom's
SPAN_CAP = {"cyclic": 5, "ostinato": 4, "horon": 4}
# the largest move onto a bar's cadence from the note just before it (a breath before the cadence frees it)
APPROACH = {"seyir": 1, "raga": 1, "cyclic": 2, "period": 2, "song": 2, "riff": 2, "arch": 2, "ostinato": 2, "horon": 2}
# probability of a neighbour note before an accented slot (by form; a few cards differ)
ORNAMENT = {"seyir": 0.2, "cyclic": 0.08, "period": 0.1, "raga": 0.25, "song": 0.05, "riff": 0.0, "arch": 0.1, "ostinato": 0.0, "horon": 0.0}
ORNAMENT_OF_CARD = {"celtic": 0.18, "baroque": 0.2, "mevlevi": 0.3, "persian": 0.25, "chinese": 0.15}


def _load_idioms():
    with open(IDIOMS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return data["LOW"], data["DEFAULT"], data["cards"]


LOW, DEFAULT_IDIOM, IDIOM_OF = _load_idioms()

_CADENCE_OF_BIAS = {-1: [2, 0, 2, 0], 0: [2, 0, 2, 4], 1: [2, 2, 4, 4]}


def form_of(card_id: str) -> str:
    return FORM_OF.get(card_id, "period")


def idiom_of(card_id: str) -> dict:
    if card_id in IDIOM_OF:
        return IDIOM_OF[card_id]
    i = dict(DEFAULT_IDIOM)
    i["cadence"] = list(_CADENCE_OF_BIAS[i["bias"]])
    return i


def stable_seed(*parts) -> int:
    h = hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big")


# ---------------------------------------------------------------- small helpers

def _cl(d: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, d))


def _round(x: float) -> int:
    """round half away from zero (Python's round() is banker's rounding)"""
    return int(math.floor(x + 0.5)) if x >= 0 else -int(math.floor(-x + 0.5))


def _sign(x: float) -> int:
    return (x > 0) - (x < 0)


def _mean(bar) -> float:
    xs = [d for d in bar if d is not None]
    return sum(xs) / len(xs)


def _last(bar, default=0):
    return next((d for d in reversed(bar) if d is not None), default)


def strong_slots(h: int) -> List[int]:
    """the accented slots of a bar of h hits: the downbeat, and the middle from four hits on"""
    return [0, h // 2] if h >= 4 else [0]


def toward(a: int, b: int, n: int, last_gap: int = 1, rng: Optional[random.Random] = None,
           lo: int = -99, hi: int = 99) -> List[int]:
    """n degrees walking from a (not included) to b (the last one), the move onto b at most last_gap.
    Without rng: even steps (a slow line holds notes). With rng, a short distance over many slots becomes a scale turn instead of a
    held note: the line first moves away from the goal (or overshoots it) by up to three steps and comes back, holding the turning
    note for the slots left over (inside [lo, hi])."""
    if n <= 0:
        return []
    if n == 1:
        return [b]
    gap = b - a
    slack = n - abs(gap)
    if rng is not None and slack >= 2:
        e = min(3, slack // 2)
        over = rng.random() < 0.5
        d = (_sign(gap) if over else -_sign(gap)) or rng.choice((-1, 1))
        turn_at = (b if over else a) + d * e
        if not lo <= turn_at <= hi:
            d, over = -d, not over
            turn_at = (b if over else a) + d * e
        if lo <= turn_at <= hi:
            line = _steps(a, turn_at) + _steps(turn_at, b)
            hold = n - len(line)
            k = abs(turn_at - a) - 1  # the index of the turning note
            return line[: k + 1] + [line[k]] * hold + line[k + 1:]
    pen = b - _sign(gap) * min(abs(gap), last_gap)
    pts = [_round(a + (pen - a) * (i / (n - 1))) for i in range(1, n)]
    return pts + [b]


def _steps(a: int, b: int) -> List[int]:
    """the scale from a (not included) to b (included), one step at a time"""
    s = _sign(b - a)
    return [a + s * i for i in range(1, abs(b - a) + 1)]


def seq(bar: List[Optional[int]], k: int) -> List[Optional[int]]:
    """sequence: the same figure k scale steps higher (lower when negative)"""
    return [None if d is None else d + k for d in bar]


def invert(bar: List[Optional[int]]) -> List[Optional[int]]:
    """mirror the figure around its first note"""
    first = next(d for d in bar if d is not None)
    return [None if d is None else 2 * first - d for d in bar]


def add_rests(bar: List[Optional[int]], rng: random.Random, p: float, slots, allow_double: bool = False) -> None:
    """rest(p): some of the given slots fall silent (never the first or last slot; never two rests in a row unless allowed)"""
    h = len(bar)
    for j in slots:
        if j <= 0 or j >= h - 1 or bar[j] is None:
            continue
        if not allow_double and (bar[j - 1] is None or (j + 1 < h and bar[j + 1] is None)):
            continue
        if rng.random() < p:
            bar[j] = None


def ornament(bar: List[Optional[int]], rng: random.Random, p: float, hi: int) -> None:
    """a neighbour note (from above, else from below) on the off-slot before an accented slot or before the cadence; only where the
    note before it can reach the neighbour by a step or a third"""
    h = len(bar)
    strong = set(strong_slots(h))
    targets = sorted(set([i for i in strong if i >= 2] + ([h - 1] if h >= 3 else [])))
    for i in targets:
        j = i - 1
        if j <= 0 or j in strong or bar[i] is None or bar[j] is None or bar[j - 1] is None:
            continue
        if rng.random() < p:
            for nb in (bar[i] + 1, bar[i] - 1):
                if LOW <= nb <= hi and abs(bar[j - 1] - nb) <= 2:
                    bar[j] = nb
                    break


def _fit(fig: List[int], lo: int, hi: int) -> List[int]:
    """move a figure as a whole into [lo, hi] (a transposition keeps its shape), then clamp what still sticks out"""
    if not fig:
        return fig
    if max(fig) > hi:
        fig = [d - (max(fig) - hi) for d in fig]
    if min(fig) < lo:
        fig = [d + (lo - min(fig)) for d in fig]
    return [_cl(d, lo, hi) for d in fig]


def phrase_bias(b) -> int:
    """the net direction: the sign of (mean of the last bar - mean of the first bar), level within half a degree"""
    d = _mean(b[3]) - _mean(b[0])
    return 0 if abs(d) < 0.5 else _sign(d)


def reuses_material(b) -> bool:
    """some bar repeats at least half of another bar's slots (before the cadence), as is, transposed or inverted"""
    h = len(b[0])
    if h <= 2:
        return True
    n = h - 1
    for i in range(4):
        for j in range(i + 1, 4):
            cands = [b[j][:n]]
            if any(d is not None for d in b[j][:n]):
                cands.append(invert(b[j][:n]))
            for cand in cands:
                for off in (0, 1, -1):  # the figure may come back a slot earlier or later (a breath moved it)
                    a_ = b[i][:n][off:] if off > 0 else b[i][:n]
                    c_ = cand if off >= 0 else cand[-off:]
                    for t in range(-4, 5):
                        same = sum(1 for x, y in zip(a_, c_)
                                   if (x is None and y is None) or (x is not None and y is not None and x == y + t))
                        if same * 2 >= n:
                            return True
    # or, inside a bar, a figure followed (right away or after a breath) by its sequence: three notes, or two a leap apart
    for bar in b:
        for k in (3, 2):
            for gap in (0, 1):
                for j in range(0, len(bar) - 2 * k - gap + 1):
                    x, y = bar[j:j + k], bar[j + k + gap:j + 2 * k + gap]
                    if None in x or None in y:
                        continue
                    ix = tuple(x[q + 1] - x[q] for q in range(k - 1))
                    iy = tuple(y[q + 1] - y[q] for q in range(k - 1))
                    if ix == iy and (k == 3 and any(ix) or k == 2 and abs(ix[0]) >= 2):
                        return True
    return False


class _Ctx:
    def __init__(self, card_id: str, hits: int, rng: random.Random):
        self.card = card_id
        self.form = form_of(card_id)
        self.idiom = idiom_of(card_id)
        self.h = hits
        self.S = min(self.idiom["span"], SPAN_CAP.get(self.form, 99))
        self.cad = list(self.idiom["cadence"])
        self.rng = rng
        self.bias = self.idiom["bias"]
        # the direction of this phrase: the card's own when it has one, else drawn (the bank then holds rising and falling phrases)
        self.dir = self.bias if self.bias != 0 else rng.choice((-1, 0, 1))
        self.orn = ORNAMENT_OF_CARD.get(card_id, ORNAMENT[self.form])
        self.rep = self.idiom["repeat"]
        self.step = self.idiom["step"]
        self.leaps = list(self.idiom["leaps"])

    def start(self, lo: int, hi: int, fallback: int) -> int:
        ok = [s for s in self.idiom["start"] if lo <= s <= hi]
        return self.rng.choice(ok) if ok else fallback

    def pen_range(self, cads, gap=2):
        """degrees that approach every one of the cadences within gap"""
        lo, hi = max(cads) - gap, min(cads) + gap
        return list(range(lo, hi + 1)) if lo <= hi else [_round(sum(cads) / len(cads))]


# ---------------------------------------------------------------- the forms

def _hover(rng: random.Random, m: int, rep: float) -> List[int]:
    """a small motif that dwells around its first note: steps of one and repeats, never more than one degree away"""
    out = [0]
    while len(out) < m:
        last = out[-1]
        if rng.random() < rep:
            out.append(last)
            continue
        out.append(rng.choice([x for x in (last - 1, last + 1) if -1 <= x <= 1]))
    if m >= 3 and all(x == 0 for x in out):
        out[1] = rng.choice((-1, 1))
    return out


def form_seyir(c: _Ctx):
    """makam seyir: bar 1 dwells on the dominant with a small motif (and a breath), bar 2 takes the motif a step or two higher into the
    upper register and comes down to its cadence, bar 3 descends with the motif lowered or inverted (a breath), bar 4 brings the motif
    to the karar step by step"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    dom = c.start(2, min(4, S - 1), min(3, S - 1))
    m1 = (h + 1) // 2 if h >= 3 else 1
    M = _hover(rng, m1, max(c.rep, 0.2))
    head1 = _fit([dom + x for x in M], LOW, S - 1)
    bar1 = [min(d, S - 1) for d in head1 + toward(head1[-1], cad[0], h - m1, 1, rng, LOW, S - 1)]
    top1 = max(bar1)
    # bar 2: the sequence, its first note a step or two above bar 1's, its highest note above bar 1's highest
    m2 = h // 2 if h >= 4 else 1
    peak = rng.randint(min(S, max(top1 + 1, 4)), S) if top1 < S else S
    k = max(1, peak - max(head1[:m2]))
    head2 = _fit([d + k for d in head1[:m2]], LOW, S)
    if max(head2) <= top1:
        head2[-1] = min(S, top1 + 1)
    peak = max(head2)
    bar2 = head2 + toward(head2[-1], cad[1], h - m2, 1 if h >= 5 else 2, rng, LOW, S)
    # bar 3: the descent, the motif lowered from bar 2 or inverted from below the peak
    if rng.random() < 0.5:
        head3 = seq(head2, -rng.choice((1, 2)))
    else:
        head3 = [min(x, peak - 1) for x in invert([peak - 1 + x for x in M[:m2]])]
    head3 = [_cl(x, LOW, S) for x in head3]
    bar3 = head3 + toward(head3[-1], cad[2], h - len(head3), 1, rng, LOW, peak - 1)
    # bar 4: the motif low, then step by step to the karar
    m4 = max(1, min(m1, h - 2)) if h >= 3 else 1
    base4 = rng.choice((cad[2], cad[2] + 1, dom - 1))
    head4 = [_cl(base4 + x, LOW, S) for x in M[:m4]]
    bar4 = head4 + toward(head4[-1], cad[3], h - m4, 1, rng, LOW, S - 1)
    bars = [bar1, bar2, bar3, bar4]
    if h >= 4:
        add_rests(bar1, rng, 0.25, range(m1, h - 1))
        add_rests(bar3, rng, 0.25, range(len(head3), h - 1))
        ornament(bar1, rng, c.orn, top1)
        for bar in bars[1:]:
            ornament(bar, rng, c.orn, S)
        # the ornaments must not lift bar 1 to the peak of bar 2
        top1 = max(d for d in bar1 if d is not None)
        if max(d for d in bar2 if d is not None) <= top1:
            bar2[0] = min(S, top1 + 1)
    return bars


def form_cyclic(c: _Ctx):
    """a two-note cell turning over (repeated or sequenced within the bar): bars 1-2 the same, bar 3 a step lower, bar 4 the cell led
    to the cadence; almost no rests"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    x = c.start(LOW, S, min(2, S))
    ivs = [1, -1, -1, 1] + [l * s for l in c.leaps if l <= 2 for s in (1, -1)]
    iv = 0 if rng.random() < 0.3 else rng.choice(ivs)
    # a repeated-note pair must move from pair to pair (4 4 3 3 2 2), else the bar would be one note
    t = rng.choice((-1, -1, 1) if iv == 0 else (-1, -1, 0, 0, 1))
    pens = c.pen_range(cad[:3] if h >= 3 else cad, 2)

    def turn(x0: int, tt: int, n: int) -> List[int]:
        npairs = (n + 1) // 2
        lo, hi = min(0, iv), max(0, iv)
        fits = lambda u: LOW <= x0 + lo + min(0, (npairs - 1) * u) and x0 + hi + max(0, (npairs - 1) * u) <= S  # noqa: E731
        if not fits(tt):
            tt = -tt if fits(-tt) and iv == 0 else (0 if iv != 0 else tt)
        out: List[int] = []
        j = 0
        while len(out) < n:
            out.append(x0 + j * tt)
            if len(out) < n:
                out.append(x0 + j * tt + iv)
            j += 1
        return [_cl(d, LOW, S) for d in out]

    body: List[Optional[int]] = list(turn(x, t, h - 1))
    if h >= 2 and body[-1] not in pens:
        body[-1] = min(pens, key=lambda p: abs(p - body[-1]))
    if h >= 5:
        add_rests(body, rng, 0.03, range(1, h - 2))
        for i in [i for i in strong_slots(h) if 2 <= i < h - 1]:
            if body[i] is not None and body[i - 1] is not None and rng.random() < c.orn:
                body[i - 1] = body[i] + 1 if body[i] + 1 <= S else body[i] - 1
    bar1 = body + [cad[0]]
    bar2 = body + [cad[1]]
    bar3 = seq(body, -1) + [cad[2]]
    # bar 4: the same cell from a start chosen so that the turning leads to the cadence
    # (within a third of the cadence; then the way this phrase goes: a falling phrase sits lower than bar 1, a rising one higher)
    best = None
    for x4, t4 in [(x + dx, tt) for dx in (0, c.dir, 2 * c.dir, -1, 1) for tt in (t, -1, 0, 1) if tt != 0 or iv != 0]:
        b4 = turn(x4, t4, h - 1)
        gap = abs(b4[-1] - cad[3]) if b4 else 0
        way = phrase_bias([bar1, [], [], b4 + [cad[3]]]) if b4 else 0
        score = (gap > 2, way != c.dir, gap)
        if best is None or score < best[0]:
            best = (score, b4)
    bar4 = best[1] + [cad[3]]
    return [bar1, bar2, bar3, bar4]


def _gapfill(c: _Ctx, s: int, m: int) -> List[int]:
    """a classical motif with one leap: a leap filled by steps the other way, or steps answered by a leap back"""
    rng, S = c.rng, c.S
    L = rng.choice(c.leaps)
    out = [s]
    if m == 1:
        return out
    if rng.random() < 0.55:
        up = 1 if s + L <= S else -1
        out.append(s + up * L)
        while len(out) < m:
            out.append(out[-1] if rng.random() < c.rep else out[-1] - up)
    else:
        up = 1 if s + m <= S else -1
        n_steps = max(1, m - 2)
        while len(out) < 1 + n_steps:
            out.append(out[-1] if rng.random() < c.rep else out[-1] + up)
        while len(out) < m:
            out.append(out[-1] - up * L if len(out) == 1 + n_steps else out[-1] + up)
    return [_cl(d, LOW, S) for d in out]


def form_period(c: _Ctx):
    """antecedent (motif, then its sequence, a breath at the end of bar 2) and consequent (the motif again, then a liquidated ending)"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    if h == 1:
        return [[cad[0]], [cad[1]], [cad[2]], [cad[3]]]
    tango = c.card == "tango"
    m = (h + 1) // 2
    s = c.start(LOW, S - 1, 2)
    M = _gapfill(c, s, m)
    tail = h - m
    bar1 = M + toward(M[-1], cad[0], tail, 2, rng, LOW, S)
    k2 = rng.choice({1: (1, 2), -1: (-1, -2), 0: (1, -1, 2)}[c.dir])
    head2 = _fit([d + k2 for d in M], LOW, S)
    bar2 = head2 + toward(head2[-1], cad[1], tail, 2, rng, LOW, S)
    bar3 = M + toward(M[-1], cad[2], tail, 2, rng, LOW, S)
    if bar3 == bar1 and tail >= 3:
        bar3 = M + toward(M[-1], cad[2], tail, 1, None)
    m4 = max(1, m // 2)
    k4 = c.dir if rng.random() < 0.6 else 0
    head4 = _fit([d + k4 for d in M[:m4]], LOW, S)
    bar4 = head4 + toward(head4[-1], cad[3], h - m4, 1, rng, LOW, S)
    bars: List[List[Optional[int]]] = [bar1, bar2, bar3, bar4]
    if tango:
        # the dotted marcato: the note before an accent repeats it
        for bar in bars:
            for i in strong_slots(h):
                if i >= 2 and i < h - 1 and bar[i] is not None:
                    bar[i - 1] = bar[i]
    elif h >= 5 and rng.random() < 0.5:
        bar2[h - 2] = None
    if h >= 4:
        ornament(bar2, rng, c.orn, S)
        ornament(bar4, rng, c.orn, S)
    return bars


def form_raga(c: _Ctx):
    """alap-like: bar 1 rises slowly from the low register with held notes, bar 2 climbs to the dominant, bar 3 reaches the high
    tonic and holds it, bar 4 comes down step by step; a breath at the end of bars 1-3"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    if h == 1:
        return [[cad[0]], [cad[1]], [cad[2]], [cad[3]]]
    low = rng.choices((0, -1, -2), (0.5, 0.3, 0.2))[0]
    top = rng.choice(list(range(5, S + 1)) + ([S] if S >= 7 else [])) if S >= 5 else S
    dom = min(4, top - 1)
    # bar 1: slow rise, every note held for a slot or two, a dip below now and then (kan)
    body1 = [low]
    while len(body1) < h - 1:
        last = body1[-1]
        r = rng.random()
        if r < max(c.rep, 0.35):
            body1.append(last)
        elif r < 0.5 and last > LOW and len(body1) >= 2 and body1[-2] == last:
            body1.append(last - 1)
        else:
            body1.append(min(1, last + 1))
    bar1: List[Optional[int]] = body1 + [cad[0]]
    # bar 2: from the cadence of bar 1 up to the dominant, hold, back to the cadence
    up = max(1, (h - 1) * 2 // 3)
    bar2: List[Optional[int]] = [min(d, top - 1) for d in toward(cad[0], dom, up, 1) + toward(dom, cad[1], h - up, 1, rng, LOW, top - 1)]
    if max(d for d in bar2 if d is not None) < dom:
        bar2[0] = dom
    # bar 3: the high tonic, held
    a = max(1, (h - 1) // 2)
    body3 = (toward(dom, top, a, 1) + [top] * (1 if h < 5 else 2))[: h - 1]
    bar3: List[Optional[int]] = body3 + toward(body3[-1], cad[2], h - len(body3), 1, None)
    if top not in bar3:
        bar3[0] = top
    # bar 4: the descent mirrors the ascent of bar 2 (aroh answered by avaroh): bar 2 upside down, hung from below the top
    mirror = invert(bar2[: h - 1])
    shift = (top - 1) - mirror[0]
    bar4: List[Optional[int]] = [_cl(d + shift, LOW, top - 1) for d in mirror] + [cad[3]]
    bars = [bar1, bar2, bar3, bar4]
    if h >= 4:
        for k in range(3):
            add_rests(bars[k], rng, 0.35, [h - 2])
        for bar in (bar2, bar4):
            ornament(bar, rng, c.orn, top - 1)
    return bars


def _hook(c: _Ctx, s: int, n: int) -> List[int]:
    """a catchy one-bar figure: a two- or three-note cell, then the cell again or a step away, with repeated notes"""
    rng, S = c.rng, c.S
    k = 2 if n <= 4 or rng.random() < 0.5 else 3
    cell = [0]
    while len(cell) < k:
        r = rng.random()
        if r < max(c.rep, 0.2):
            cell.append(cell[-1])
        elif r < max(c.rep, 0.2) + c.step * 0.7:
            cell.append(cell[-1] + rng.choice((1, -1)))
        else:
            cell.append(cell[-1] + rng.choice(c.leaps) * rng.choice((1, -1)))
    if all(x == 0 for x in cell):
        cell[-1] = rng.choice((1, -1, 2))

    def build(t: int) -> List[int]:
        out: List[int] = []
        rep = 0
        while len(out) < n:
            for x in cell:
                if len(out) < n:
                    out.append(s + x + rep * t)
            rep += 1
        return out

    ts = [t for t in rng.sample((0, 0, 1, -1, 2), 5)]
    out = next((build(t) for t in ts if max(build(t)) - min(build(t)) <= 4), build(0))
    # a hook lives in the middle of the range: room above it for the contrasting bar
    return _fit(out, LOW, max(LOW + 2, S - 2))


def form_song(c: _Ctx):
    """AABA: a one-bar hook twice, a contrasting bar (higher, the hook inverted), the hook again to the cadence; syncopated rests"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    if h == 1:
        return [[cad[0]], [cad[1]], [cad[2]], [cad[3]]]
    s = c.start(LOW, S - 3, 2)
    H: List[Optional[int]] = list(_hook(c, s, h - 1))
    pens = c.pen_range(cad[:2], 2)
    if h >= 3 and H[-1] not in pens:
        H[-1] = min(pens, key=lambda p: abs(p - H[-1]))
    if h >= 4:
        add_rests(H, rng, 0.2, [j for j in range(1, h - 2) if j not in strong_slots(h)])
    bar1 = H + [cad[0]]
    bar2 = H + [cad[1]]
    # B: the hook upside down, lifted above it (or, when the inversion does not fit above, the hook itself a third higher)
    inv = invert(H)
    lift = rng.choice((2, 3))
    B = [None if d is None else d + lift for d in inv]
    notes = [d for d in B if d is not None]
    if max(notes) > S:
        B = [None if d is None else d - (max(notes) - S) for d in B]
    higher = lambda X: _mean(X + [cad[2]]) >= _mean(bar1) + 0.5  # noqa: E731
    if not higher(B) or min(d for d in B if d is not None) < LOW:
        B = [None if d is None else _cl(d + 2, LOW, S) for d in H]
    if not higher(B):
        B = [None if d is None else _cl(d + 3, LOW, S) for d in H]
    if B[0] is not None and B[0] - cad[1] > 5:  # the bridge enters within a sixth of the cadence before it
        B = [None if d is None else d - (B[0] - cad[1] - 5) for d in B]
    if h >= 3 and B[-1] is not None and abs(B[-1] - cad[2]) > 2:
        B[-1] = cad[2] + 2 * _sign(B[-1] - cad[2])
    bar3 = B + [cad[2]]
    # A again: the hook's first half, moved a little the way the phrase goes, then to the cadence
    m4 = max(1, h // 2)
    k4 = c.dir if rng.random() < 0.6 else 0
    head4 = [None if d is None else _cl(d + k4, LOW, S) for d in H[:m4]]
    if head4[0] is None:
        head4[0] = s
    bar4 = head4 + toward(_last(head4, s), cad[3], h - m4, 2, rng, LOW, S)
    if h >= 4:
        ornament(bar4, rng, c.orn, S)
    return [bar1, bar2, bar3, bar4]


def form_riff(c: _Ctx):
    """a one-bar riff of chord tones (0, 2, 4) with a passing note, syncopated by rests, played twice, answered a step higher, then a
    turnaround to the cadence; jazz approaches every accent from a step below"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    if h == 1:
        return [[cad[0]], [cad[1]], [cad[2]], [cad[3]]]
    jazz = c.card == "jazz"
    chord = [d for d in (0, 2, 4) if d <= S]
    root = c.start(0, 4, 0)
    if root not in chord:
        root = chord[0]
    body: List[Optional[int]] = [root]
    passed = False
    while len(body) < h - 1:
        last = body[-1]
        if last not in chord and len(body) >= 2:  # a passing note goes on to the next chord tone
            body.append(last + (1 if body[-2] < last else -1))
            continue
        r = rng.random()
        if r < c.rep:
            body.append(last)
        elif not passed and r < c.rep + 0.3:
            body.append(last + rng.choice([x for x in (1, -1) if 0 <= last + 2 * x <= max(chord)] or [1]))
            passed = True
        else:
            body.append(rng.choice([x for x in chord if x != last] or chord))
    body = [_cl(d, LOW, S) for d in body]
    pens = c.pen_range(cad[:2], 2)
    if h >= 3 and body[-1] not in pens:
        body[-1] = rng.choice([p for p in pens if 0 <= p <= S] or pens)
    if h >= 4:
        add_rests(body, rng, 0.35, [j for j in range(1, h - 2) if j not in strong_slots(h)])
        mid = h // 2
        if mid < h - 2 and body[mid - 1] is not None and rng.random() < 0.3:
            body[mid] = None  # the accent anticipated: the note before the beat, silence on it
    if jazz:
        for i in strong_slots(h):
            if i >= 2 and i < h - 1 and body[i] is not None and body[i - 1] is not None:
                body[i - 1] = body[i] - 1
    bar1 = body + [cad[0]]
    bar2 = body + [cad[1]]
    bar3 = seq(body, 1) + [cad[2]]
    # turnaround: from a chord tone to the cadence (a turn on the way), a few rests
    a = rng.choice(chord)
    bar4: List[Optional[int]] = ([a] + toward(a, cad[3], h - 1, 1, rng, 0, S))[:h]
    if h >= 4:
        add_rests(bar4, rng, 0.2, range(1, h - 2))
    if jazz:
        for i in strong_slots(h) + [h - 1]:
            if i >= 2 and bar4[i] is not None and bar4[i - 1] is not None:
                bar4[i - 1] = bar4[i] - 1
    return [bar1, bar2, bar3, bar4]


def form_arch(c: _Ctx):
    """one arch over four bars: a short pentatonic cell (steps of one, leaps of two) placed higher and higher, the peak in bar 2 or 3,
    then lower and lower; rests between the cells"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    if h == 1:
        return [[cad[0]], [cad[1]], [cad[2]], [cad[3]]]
    base = c.start(LOW, max(LOW, S - 3), 0)
    peak = rng.randint(min(S, max(base + 2, max(cad))), S)
    k = 2 if h <= 5 or rng.random() < 0.5 else 3
    C = [0]
    while len(C) < k:
        nxt = C[-1] + rng.choice((1, 1, 2, -1, -2))
        if max(C + [nxt]) - min(C + [nxt]) > 3:  # a cell spans a fourth at most
            nxt = C[-1] - _sign(nxt - C[-1])
        C.append(nxt)
    if C[-1] == 0:
        C[-1] = 1
    # the level of each bar: rising to the peak (bar 2 or 3), then falling
    pk = rng.choice((1, 2)) if c.dir >= 0 else 1
    top_level = peak - max(C)
    levels = []
    for b in range(4):
        if b < pk:
            levels.append(base + (top_level - base) * b // pk)
        elif b == pk:
            levels.append(top_level)
        else:
            levels.append(top_level - (b - pk) * rng.choice((1, 2)))
    bars = []
    for b in range(4):
        # a bar starts within a fifth of the cadence before it; the peak bar climbs from there to the top level
        lv = levels[b] if b == 0 else min(levels[b], cad[b - 1] + 4)
        if b > pk:
            lv = max(lv, cad[b] - 3)  # the fall stays within reach of the bar's cadence
        body: List[Optional[int]] = []
        step = 0
        # rising up to the peak bar; after it falling, or rising into a high cadence
        dirn = 1 if b <= pk else (-1 if cad[b] <= lv + max(C) else 1)
        ceiling = top_level if b == pk else top_level - 1
        while len(body) < h - 1:
            for x in C:
                if len(body) < h - 1:
                    body.append(_cl(lv + step + x, LOW, S))
            # the cells climb to the top level in the peak bar and stay below it elsewhere; they never fall under the floor
            nxt = step + dirn
            if not (lv + nxt > ceiling and dirn > 0) and lv + nxt + min(C) >= LOW:
                step = nxt
            if len(body) < h - 2 and rng.random() < 0.3:
                body.append(None)  # a breath between the cells
        if b == pk and peak not in body:
            room = sorted((j for j, d in enumerate(body) if d is not None and (j <= h - 4 or h < 4)), key=lambda j: -body[j])
            near = lambda j: all(abs(peak - n) <= 4 for n in body[max(0, j - 1):j + 2] if n is not None)  # noqa: E731
            idx = next((j for j in room if near(j)), None)
            if idx is not None:
                body[idx] = peak
        bar = body + [cad[b]]
        if h >= 3 and bar[h - 2] is not None and abs(bar[h - 2] - cad[b]) > 2:
            bar[h - 2] = cad[b] + _sign(bar[h - 2] - cad[b]) * 2
        bars.append(bar)
    # the peak lives in bar 2 or 3: bars 1 and 4 stay below it
    top = max(d for d in bars[pk] if d is not None)
    for b in (0, 3):
        bars[b] = [None if d is None else (d if j == h - 1 else min(d, top - 1)) for j, d in enumerate(bars[b])]
    if h >= 4:
        for b, bar in enumerate(bars):
            if b != pk:  # (an ornament must not overwrite the peak)
                ornament(bar, rng, c.orn, top - 1)
    return bars


def form_ostinato(c: _Ctx):
    """one cell in every bar; each repeat changes a single slot (the cell breathes); a tiny range"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    if h == 1:
        return [[cad[0]], [cad[1]], [cad[2]], [cad[3]]]
    lo, hi = 0, min(S, 4)
    s = c.start(lo, hi, 2)
    moves = [1, -1, 1, -1] + [l * d for l in c.leaps if l <= 3 for d in (1, -1)]
    cell: List[Optional[int]] = [s]
    while len(cell) < h - 1:
        last = cell[-1]
        nxt = last if rng.random() < c.rep else last + rng.choice(moves)
        if nxt < lo or nxt > hi:
            nxt = last - (nxt - last)
        cell.append(_cl(nxt, lo, hi))
    pens = [p for p in c.pen_range(cad, 2) if lo <= p <= hi] or [2]
    if h >= 3 and cell[-1] not in pens:
        cell[-1] = min(pens, key=lambda p: abs(p - cell[-1]))
    if h >= 4:
        add_rests(cell, rng, 0.15, range(1, h - 2))

    def breathe(src: List[Optional[int]]) -> List[Optional[int]]:
        out = list(src)
        slots = list(range(1, h - 2))
        if not slots:
            return out
        j = rng.choice(slots)
        if out[j] is None:
            out[j] = out[j - 1] if out[j - 1] is not None else s
        elif rng.random() < 0.3 and out[j - 1] is not None and out[j + 1] is not None:
            out[j] = None
        else:
            out[j] = _cl(out[j] + rng.choice((1, -1)), lo, hi)
        return out

    bar1 = cell + [cad[0]]
    bar2 = breathe(cell) + [cad[1]]
    bar3 = (breathe(cell) if rng.random() < 0.3 else list(cell)) + [cad[2]]
    bar4 = breathe(cell) + [cad[3]]
    return [bar1, bar2, bar3, bar4]


def form_horon(c: _Ctx):
    """the Black Sea horon (the SymbTr tunes of Trabzon, Rize, Ordu, Giresun, Artvin): bar 1 a zigzag between two or three neighbouring
    degrees (a and a+1, sometimes a third a / a+2; at most one note doubled or one step to a third degree), no rests; bar 2 the SAME bar
    up to its cadence; bar 3 the motif a degree lower, or its head answered with another zigzag; bar 4 the head of the motif, then a
    stepwise descent to the cadence, which is held (the last two slots equal)"""
    h, S, cad, rng = c.h, c.S, c.cad, c.rng
    n = h - 1
    pens = [p for p in c.pen_range(cad[:2], 2) if 0 <= p <= S]   # the body's last note reaches both cadences: bar 2 stays a copy
    a = c.start(0, S - 1, 2)
    b = a + 2 if a + 2 <= S and rng.random() < 0.25 else a + 1
    body = [a if k % 2 == 0 else b for k in range(n + 1)]
    r = rng.random()
    if n >= 3 and r < 0.45:
        k = rng.randrange(0, n - 1)        # one note doubled (4 4 3 4 3 ...): the zigzag goes on after it
        body = body[:k + 1] + body[k:]
    elif n >= 4 and r < 0.75 and b == a + 1:
        k = rng.randrange(1, n - 1)        # one step out to a third neighbouring degree
        alt = body[k] + 1 if body[k] == b else body[k] - 1
        if 0 <= alt <= S:
            body[k] = alt
    body = body[:n]
    if body[-1] not in pens:
        prev = body[-2] if n >= 2 else body[-1]
        body[-1] = prev - 1 if prev - 1 in pens else max(p for p in pens if p <= body[-1])
    bar1 = body + [cad[0]]
    bar2 = body + [cad[1]]
    # bar 3: the motif a degree lower, or the head of the motif answered by the zigzag a step away
    if min(body) >= 1 and rng.random() < 0.6:
        body3 = seq(body, -1)
    else:
        m = max(1, (n + 1) // 2)
        lo3 = a - 1 if a >= 1 else a + 1
        tail = [lo3 + 1 if k % 2 == 0 else lo3 for k in range(n - m)]
        body3 = body[:m] + tail
        if body3 == body and n - m >= 1:
            body3[-1] = body3[-1] - 1 if body3[-1] >= 1 else body3[-1] + 1
    bar3 = body3 + [cad[2]]
    # bar 4: the head of the motif, then down by steps to the cadence, held
    c3 = cad[3]
    line: List[int] = []
    for k in range(min(n, h - 2), -1, -1):
        line = body[:k] + list(range(body[k - 1] - 1, c3, -1)) if k > 0 else list(range(min(S, c3 + h - 2), c3, -1))
        if len(line) + 2 <= h:
            break
    bar4 = line + [c3] * (h - len(line))
    return [bar1, bar2, bar3, bar4]


BUILDERS = {
    "seyir": form_seyir, "cyclic": form_cyclic, "period": form_period, "raga": form_raga,
    "song": form_song, "riff": form_riff, "arch": form_arch, "ostinato": form_ostinato, "horon": form_horon,
}


# ---------------------------------------------------------------- the generator

def _finalize(c: _Ctx, bars) -> dict:
    h, S, cad = c.h, c.S, c.cad
    out = []
    for k, bar in enumerate(bars):
        bar = list(bar)[:h]
        assert len(bar) == h, (c.card, c.form, h, k, bar)
        bar = [None if d is None else _cl(int(d), LOW, S) for d in bar]
        bar[-1] = cad[k]
        if h >= 2 and bar[h - 2] is not None:
            g = bar[h - 2] - cad[k]
            gap = APPROACH[c.form] if h >= 4 else 2
            if abs(g) > gap:
                bar[h - 2] = cad[k] + _sign(g) * gap
        if c.form != "riff":  # no two rests in a row (the riff may)
            for j in range(1, h - 1):
                if bar[j] is None and bar[j - 1] is None:
                    bar[j] = bar[j + 1]
        out.append(bar)
    if out[0][0] is None:
        out[0][0] = next(d for d in out[0] if d is not None)
    used = [d for bar in out for d in bar if d is not None]
    return {"b": out, "c": list(cad), "f": c.form, "s": out[0][0], "span": max(used), "bias": phrase_bias(out)}


def make_phrase(card_id: str, hits: int, rng: random.Random) -> dict:
    c = _Ctx(card_id, hits, rng)
    bars = [[x] for x in c.cad] if hits == 1 else BUILDERS[c.form](c)
    return _finalize(c, bars)


def generate(card_id: str, hits: int, n: int, seed: int) -> List[dict]:
    """n phrases of a card for bars of `hits` slots; phrase i draws from random.Random(stable_seed(card, hits, i, seed))"""
    return [make_phrase(card_id, hits, random.Random(stable_seed(card_id, hits, i, seed))) for i in range(n)]


def contour_key(p: dict):
    """(form, start, contour): the rounded mean of every bar and the up/down shape of the first bar"""
    b = p["b"]
    means = tuple(_round(_mean(bar)) for bar in b)
    line = [d for d in b[0] if d is not None]
    shape = tuple(_sign(y - x) for x, y in zip(line, line[1:]))
    return (p["f"], p["s"], means, shape)


def _spread(pool: List[dict]) -> List[dict]:
    """order phrases so that every prefix is as diverse as possible: round robin over the (start degree, direction) pairs, and inside
    each pair over the (form, start, contour) combinations, each in order of first appearance"""
    by_start: Dict[tuple, Dict[tuple, List[dict]]] = {}
    for p in pool:
        by_start.setdefault((p["s"], p["bias"]), {}).setdefault(contour_key(p), []).append(p)
    # inside one pair: one phrase per combination, then the second of each, ...
    lanes: List[List[dict]] = []
    for combos in by_start.values():
        lane: List[dict] = []
        depth = 0
        while any(len(v) > depth for v in combos.values()):
            lane.extend(v[depth] for v in combos.values() if len(v) > depth)
            depth += 1
        lanes.append(lane)
    out: List[dict] = []
    depth = 0
    while any(len(l) > depth for l in lanes):
        out.extend(l[depth] for l in lanes if len(l) > depth)
        depth += 1
    return out


def bank_entry(card_id: str, hits: int, keep: int = 96, make: int = 400, seed: int = 0) -> List[dict]:
    """make `make` phrases, drop exact duplicates, and keep `keep` of them spread over as many start degrees and (form, start,
    contour) combinations as possible (any prefix of the list is the most diverse choice of its size); a card with a direction keeps
    the phrases of that direction first"""
    want = idiom_of(card_id)["bias"]
    seen = set()
    uniq = []
    for p in generate(card_id, hits, make, seed):
        key = json.dumps(p["b"])
        if key not in seen:
            seen.add(key)
            uniq.append(p)
    if want == 0:
        ordered = _spread(uniq)
    else:
        ordered = _spread([p for p in uniq if p["bias"] == want]) + _spread([p for p in uniq if p["bias"] != want])
    return ordered[:keep]
