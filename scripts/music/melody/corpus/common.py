"""Shared pieces of the phrase-corpus ingest: the cards' scales (read from genres.ts), degree mapping, bar building, phrase windows,
and a small standard-library MIDI reader.

Spec: docs/superpowers/specs/2026-10-27-melody-trained-design.md, section "The phrase corpus".

A bar is a list of notes `[onset, value, dur]` with onset and duration as fractions of the bar (0..1). Ingestors build bars whose
values are pitches relative to the piece's tonic/karar (semitones, or 53-commas for SymbTr); `card_bars_*` turns them into **degrees of
the target card's scale** (0 = tonic, negative below), choosing the octave that puts most notes into [LOW, HIGH]; `windows` cuts
4-bar phrases (stride 2) and clips the degrees to [LOW, HIGH].
"""
from __future__ import annotations

import os
import re
import struct
from typing import Dict, List, Optional, Sequence, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
GENRES_TS = os.path.join(ROOT, "globe", "src", "personal", "genres.ts")

LOW, HIGH = -2, 9            # the degree range of the bank (idioms.json LOW; spans go up to 7, a little headroom above)
WINDOW, STRIDE = 4, 2        # four-bar phrases, every two bars
MIN_NOTES_PER_BAR = 3.0      # mean over the window
MAX_REST = 0.40              # share of the window's time without a sounding note
MAX_CLIPPED = 0.25           # a window with more notes than this outside [LOW, HIGH] is dropped instead of flattened
EPS = 1e-6

# 7-note source modes (semitones above the tonic) for the western sources (PDMX key signatures, ABC K: fields)
MODES: Dict[str, List[int]] = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "locrian": [0, 1, 3, 5, 6, 8, 10],
}
# the scale degree a chromatic (out-of-mode) pitch class belongs to, by the mode's third: in a major-third mode a raised tonic, a flat
# third, a raised fourth, a flat sixth and a flat seventh are altered degrees 1, 3, 4, 6, 7; in a minor-third mode a flat second, a major
# third, a raised fourth, a major sixth and the leading tone are altered degrees 2, 3, 4, 6, 7 (spelling is lost in MIDI: these are the
# common readings)
OUT_MAJOR = {1: 0, 3: 2, 5: 3, 6: 3, 8: 5, 10: 6, 11: 6}
OUT_MINOR = {1: 1, 2: 1, 4: 2, 6: 3, 8: 5, 9: 5, 11: 6}


# ---------------------------------------------------------------- cards


def load_cards(path: str = GENRES_TS) -> Dict[str, List[float]]:
    """{card id: scale in semitones} for the 52 BASE_CARDS of genres.ts (named scale constants or literal arrays)"""
    with open(path, encoding="utf-8") as f:
        src = f.read()
    consts = {m.group(1): [float(x) if "." in x else int(x) for x in re.findall(r"-?[\d.]+", m.group(2))]
              for m in re.finditer(r"^const ([A-Z_]+) = \[([^\]]*)\];", src, re.M)}
    start = src.index("const BASE_CARDS")
    end = src.index("\n];", start)
    cards: Dict[str, List[float]] = {}
    for m in re.finditer(r'\{ id: "([a-z]+)".*?\bscale: (\[[^\]]*\]|[A-Z_]+)', src[start:end]):
        s = m.group(2)
        if s.startswith("["):
            cards[m.group(1)] = [float(x) if "." in x else int(x) for x in re.findall(r"-?[\d.]+", s)]
        else:
            cards[m.group(1)] = list(consts[s])
    return cards


# ---------------------------------------------------------------- degrees


def nearest_degree(semi: float, scale: Sequence[float]) -> int:
    """the degree (octave-extended index into `scale`) nearest to `semi` semitones above the tonic; a tie goes to the lower degree"""
    n = len(scale)
    octv = int(semi // 12)
    best, bd = 0, 1e9
    for o in (octv - 1, octv, octv + 1):
        for i, s in enumerate(scale):
            d = abs(semi - (s + 12 * o))
            deg = o * n + i
            if d < bd - EPS or (abs(d - bd) <= EPS and deg < best):
                best, bd = deg, d
    return best


def comma_degree(commas: float, scale: Sequence[float]) -> int:
    """SymbTr: a pitch in 53-commas above the karar -> the nearest degree of the card's scale (card semitones x 53/12 = commas)"""
    return nearest_degree(commas * 12.0 / 53.0, scale)


def diatonic_degree(semi: int, mode: Sequence[int]) -> int:
    """a pitch (semitones above the tonic, any octave) -> its degree in a 7-note mode; chromatic notes by OUT_MAJOR / OUT_MINOR"""
    octv, pc = divmod(int(round(semi)), 12)
    if pc in mode:
        i = list(mode).index(pc)
    else:
        table = OUT_MAJOR if mode[2] == 4 else OUT_MINOR
        i = table.get(pc)
        if i is None:  # an exotic mode: the nearest
            return nearest_degree(semi, mode)
    return octv * 7 + i


def to_card(src_degree: int, mode: Sequence[int], card_scale: Sequence[float]) -> int:
    """a degree of a 7-note source mode -> a degree of the card: a 7-note card keeps the diatonic index (a major tune on a minor card
    becomes its parallel-minor line, as the site renders `scale` and `scaleWish` from the same degrees); another size takes the nearest
    card note to the source pitch"""
    if len(card_scale) == 7:
        return src_degree
    octv, i = divmod(src_degree, 7)
    return nearest_degree(mode[i] + 12 * octv, card_scale)


def best_octave(degrees: Sequence[int], n: int) -> int:
    """the shift (a multiple of the scale size n, |shift| <= 2 octaves) that puts most degrees into [LOW, HIGH]; ties: the smaller shift,
    then the lower"""
    best, bc = 0, -1
    for k in (0, -1, 1, -2, 2):
        c = sum(1 for d in degrees if LOW <= d + k * n <= HIGH)
        if c > bc:
            best, bc = k * n, c
    return best


def shift_bars(bars: List[Optional[list]], f) -> List[Optional[list]]:
    return [None if b is None else [[o, f(v), d] for o, v, d in b] for b in bars]


def card_bars_diatonic(piece: dict, card_scale: Sequence[float]) -> List[Optional[list]]:
    """western piece (bars of semitones above the tonic, `mode`) -> bars of card degrees"""
    mode = MODES[piece["mode"]]
    src = shift_bars(piece["bars"], lambda s: diatonic_degree(s, mode))
    allv = [n[1] for b in src if b for n in b]
    k = best_octave(allv, 7)
    return shift_bars(src, lambda d: to_card(d + k, mode, card_scale))


# ---------------------------------------------------------------- bars and windows


def _r(x: float) -> float:
    return round(x + 0.0, 4)


def split_bars(notes: Sequence[Tuple[float, float, object]], grid: Sequence[Tuple[float, float]], end: float) -> List[Optional[list]]:
    """notes (onset, dur, value) in absolute time + the bar grid [(start, length)] -> per bar [[onset, value, dur]] in fractions of the
    bar. A note crossing a bar line is split (the next bar starts with the held pitch). A bar that does not end by `end` is None."""
    out: List[Optional[list]] = []
    notes = sorted(notes, key=lambda n: (n[0], n[1]))
    j0 = 0
    for start, length in grid:
        stop = start + length
        if stop > end + EPS:
            out.append(None)
            continue
        bar = []
        while j0 < len(notes) and notes[j0][0] + notes[j0][1] <= start + EPS:
            j0 += 1
        j = j0
        while j < len(notes) and notes[j][0] < stop - EPS:
            on, du, v = notes[j]
            a, b = max(on, start), min(on + du, stop)
            if b - a > EPS:
                bar.append([_r((a - start) / length), v, _r((b - a) / length)])
            j += 1
        out.append(bar)
    return out


def windows(bars: Sequence[Optional[list]]) -> List[dict]:
    """four-bar windows aligned to bar starts (stride 2) over runs of valid bars, kept when the mean is >= 3 notes per bar, the rest time
    is <= 40% and at most a quarter of the notes needed clipping into [LOW, HIGH]; degrees are clipped"""
    out = []
    for s in range(0, len(bars) - WINDOW + 1, STRIDE):
        w = bars[s:s + WINDOW]
        if any(b is None for b in w):
            continue
        n = sum(len(b) for b in w)
        if n < MIN_NOTES_PER_BAR * WINDOW:
            continue
        sounding = sum(d for b in w for _, _, d in b)
        if 1 - sounding / WINDOW > MAX_REST + EPS:
            continue
        clipped = sum(1 for b in w for _, v, _ in b if not LOW <= v <= HIGH)
        if clipped > MAX_CLIPPED * n + EPS:
            continue
        out.append({"start": s, "bars": [[[o, min(HIGH, max(LOW, int(v))), d] for o, v, d in b] for b in w]})
    return out


# ---------------------------------------------------------------- MIDI (standard library)


def _vlq(data: bytes, i: int) -> Tuple[int, int]:
    v = 0
    while True:
        c = data[i]
        i += 1
        v = (v << 7) | (c & 0x7F)
        if not c & 0x80:
            return v, i


def parse_midi(data: bytes) -> dict:
    """{tpq, notes: [(track, channel, start, end, pitch)], timesig: [(tick, num, den)], keysig: [(tick, sharps, minor)]};
    SMPTE time division is not supported (ValueError)"""
    if data[:4] != b"MThd":
        raise ValueError("not a MIDI file")
    hl, = struct.unpack(">I", data[4:8])
    fmt, ntr, div = struct.unpack(">HHH", data[8:14])
    if div & 0x8000:
        raise ValueError("SMPTE division")
    i = 8 + hl
    notes, ts, ks = [], [], []
    for t in range(ntr):
        if data[i:i + 4] != b"MTrk":
            break
        ln, = struct.unpack(">I", data[i + 4:i + 8])
        j, stop = i + 8, i + 8 + ln
        i = stop
        tick, status = 0, 0
        on: Dict[Tuple[int, int], List[int]] = {}
        while j < stop:
            dt, j = _vlq(data, j)
            tick += dt
            b = data[j]
            if b == 0xFF:
                typ = data[j + 1]
                ml, j = _vlq(data, j + 2)
                body = data[j:j + ml]
                j += ml
                if typ == 0x58 and ml >= 2:
                    ts.append((tick, body[0], 2 ** body[1]))
                elif typ == 0x59 and ml >= 2:
                    ks.append((tick, struct.unpack("b", body[:1])[0], body[1]))
                elif typ == 0x2F:
                    break
                continue
            if b in (0xF0, 0xF7):
                ml, j = _vlq(data, j + 1)
                j += ml
                continue
            if b & 0x80:
                status = b
                j += 1
            hi, ch = status & 0xF0, status & 0x0F
            if hi in (0xC0, 0xD0):
                j += 1
                continue
            d1, d2 = data[j], data[j + 1]
            j += 2
            if hi == 0x90 and d2 > 0:
                on.setdefault((ch, d1), []).append(tick)
            elif hi == 0x80 or (hi == 0x90 and d2 == 0):
                st = on.get((ch, d1))
                if st:
                    s0 = st.pop(0)
                    if tick > s0:
                        notes.append((t, ch, s0, tick, d1))
    ts.sort(key=lambda x: x[0])
    ks.sort(key=lambda x: x[0])
    return {"tpq": div, "notes": notes, "timesig": ts, "keysig": ks, "format": fmt}
