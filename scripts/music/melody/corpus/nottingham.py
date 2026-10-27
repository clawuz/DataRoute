"""Nottingham Music Database (ABC_cleaned/*.abc) -> tunes -> bars of semitones above the tonic of the K: field.

A small ABC reader for the subset these books use: header fields X T M L K, inline fields ([K:..], [M:..], [L:..] and field lines
between music lines), notes with accidentals (^ ^^ _ __ =, carried to the end of the bar), octave marks (, '), lengths (2, 3/2, /2, /,
//), broken rhythm (> < >>), tuplets ((3 (2 (4 and (p:q:r), ties (-), chords [..] (the top note), rests z x (Z: a multi-bar rest makes the
bar invalid), and ignores chord symbols "..", decorations !..! +..+ ~ . H T u v, grace notes {..}, slurs, endings [1 [2, comments %.
Bars are the written bars (repeats are not expanded); a bar is kept only when its length equals the meter (a pickup, an ending's
half bar and a final half bar are None). A K: change inside a tune starts a new piece (the tonic moves).
"""
from __future__ import annotations

import re
from fractions import Fraction
from typing import Dict, List, Optional, Tuple

import common

NAT = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
LETTERS = "CDEFGAB"
MODE_WORDS = {"": "major", "maj": "major", "ion": "major", "m": "minor", "min": "minor", "aeo": "minor", "dor": "dorian",
              "phr": "phrygian", "lyd": "lydian", "mix": "mixolydian", "loc": "locrian"}


def parse_key(k: str) -> Tuple[int, str]:
    m = re.match(r"\s*([A-Ga-g])([#b]?)\s*([A-Za-z]*)", k)
    if not m:
        return 0, "major"
    letter = m.group(1).upper()
    pc = (NAT[letter] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)) % 12
    w = m.group(3).lower()
    mode = MODE_WORDS.get("m" if w == "m" else w[:3], "major")
    return pc, mode


def key_accidentals(k: str) -> Dict[str, int]:
    """letter -> semitone alteration of the key signature"""
    m = re.match(r"\s*([A-Ga-g])", k)
    tonic, mode = parse_key(k)
    li = LETTERS.index(m.group(1).upper()) if m else 0
    out = {}
    for i, iv in enumerate(common.MODES[mode]):
        L = LETTERS[(li + i) % 7]
        out[L] = ((tonic + iv - NAT[L] + 6) % 12) - 6
    return out


def parse_meter(s: str) -> Fraction:
    s = s.strip()
    if s.startswith("C|"):
        return Fraction(2, 2)
    if s.startswith("C"):
        return Fraction(4, 4)
    m = re.match(r"(\d+)\s*/\s*(\d+)", s)
    return Fraction(int(m.group(1)), int(m.group(2))) if m else Fraction(4, 4)


def parse_len(s: str) -> Fraction:
    m = re.match(r"(\d+)\s*/\s*(\d+)", s.strip())
    return Fraction(int(m.group(1)), int(m.group(2))) if m else Fraction(1, 8)


NOTE = re.compile(r"(\^\^|\^|__|_|=)?([A-Ga-gzxZ])([,']*)(\d*)(/*)(\d*)")


def _length(num: str, slashes: str, den: str) -> Fraction:
    f = Fraction(int(num)) if num else Fraction(1)
    if slashes:
        if den:
            f /= int(den)
        else:
            f /= 2 ** len(slashes)
    return f


class _Tune:
    def __init__(self, tid: str, meter: Fraction, unit: Fraction, key: str):
        self.tid = tid
        self.meter, self.unit = meter, unit
        self.pieces: List[dict] = []
        self.set_key(key)

    def set_key(self, key: str):
        tonic, mode = parse_key(key)
        self.keyacc = key_accidentals(key)
        self.cur = {"id": self.tid if not self.pieces else f"{self.tid} ({len(self.pieces) + 1})", "tonic": tonic, "mode": mode,
                    "bars": []}
        self.pieces.append(self.cur)
        self.bar: List[list] = []   # [onset, semi or None, dur] in whole notes
        self.t = Fraction(0)
        self.bar_meter = self.meter
        self.invalid = False
        self.acc: Dict[Tuple[str, int], int] = {}
        self.last_note: Optional[list] = None
        self.tie = False

    def close_bar(self):
        if not self.bar and self.t == 0 and not self.invalid:
            return
        L = self.bar_meter
        if self.invalid or self.t != L:
            self.cur["bars"].append(None)
        else:
            self.cur["bars"].append([[common._r(float(o / L)), s, common._r(float(d / L))] for o, s, d in self.bar if s is not None])
        self.bar, self.t, self.acc, self.invalid = [], Fraction(0), {}, False
        self.bar_meter = self.meter
        self.last_note = None if not self.tie else self.last_note

    def add(self, semi: Optional[int], dur: Fraction):
        if semi is not None and self.tie and self.last_note is not None and self.last_note[1] == semi:
            if any(x is self.last_note for x in self.bar):
                self.last_note[2] += dur
                self.t += dur
                self.tie = False
                return
        self.tie = False
        n = [self.t, semi, dur]
        self.bar.append(n)
        self.t += dur
        self.last_note = n if semi is not None else None


def parse_book(text: str) -> List[dict]:
    """every tune of an ABC book -> [{id, tonic, mode, bars}] (a tune with a key change gives one entry per key)"""
    out: List[dict] = []
    for chunk in re.split(r"(?m)^X:", text)[1:]:
        lines = chunk.split("\n")
        tid = "X:" + lines[0].strip()
        meter, unit, key, title = Fraction(4, 4), None, None, ""
        body_start = len(lines)
        for i, ln in enumerate(lines[1:], 1):
            m = re.match(r"([A-Za-z]):(.*)", ln)
            if not m:
                continue
            f, v = m.group(1), m.group(2)
            if f == "T" and not title:
                title = v.strip()
            elif f == "M":
                meter = parse_meter(v)
            elif f == "L":
                unit = parse_len(v)
            elif f == "K":
                key = v
                body_start = i + 1
                break
        if key is None:
            continue
        if unit is None:
            unit = Fraction(1, 16) if meter < Fraction(3, 4) else Fraction(1, 8)
        tune = _Tune(f"{tid} {title}".strip(), meter, unit, key)
        _body(tune, lines[body_start:])
        tune.close_bar()
        out.extend(p for p in tune.pieces if p["bars"])
    return out


def _field(tune: _Tune, f: str, v: str):
    if f == "M":
        tune.meter = parse_meter(v)
        if tune.t == 0:
            tune.bar_meter = tune.meter
    elif f == "L":
        tune.unit = parse_len(v)
    elif f == "K":
        tune.close_bar()
        tune.set_key(v)


def _body(tune: _Tune, lines: List[str]):
    for ln in lines:
        ln = ln.split("%", 1)[0].rstrip()
        m = re.match(r"([A-Za-z]):(.*)", ln)
        if m:
            _field(tune, m.group(1), m.group(2))
            continue
        _music(tune, ln)


def _music(tune: _Tune, s: str):
    i, n = 0, len(s)
    broken = None      # factor for the next note
    tup: List = []     # [remaining, factor]
    while i < n:
        c = s[i]
        if c == '"':
            j = s.find('"', i + 1)
            i = n if j < 0 else j + 1
            continue
        if c in "!+":
            j = s.find(c, i + 1)
            i = n if j < 0 else j + 1
            continue
        if c == "{":
            j = s.find("}", i + 1)
            i = n if j < 0 else j + 1
            continue
        if c == "[" and i + 2 < n and s[i + 1].isalpha() and s[i + 2] == ":":
            j = s.find("]", i)
            j = n if j < 0 else j
            _field(tune, s[i + 1], s[i + 3:j])
            i = j + 1
            continue
        if c == "[" and i + 1 < n and s[i + 1].isdigit():
            i += 2
            continue
        if c in "|:" or (c == "[" and i + 1 < n and s[i + 1] == "|"):
            j = i
            while j < n and (s[j] in "|:]" or (s[j] == "[" and j + 1 < n and (s[j + 1].isdigit() or s[j + 1] == "|"))):
                j += 1
            while j < n and s[j].isdigit():  # |1 :|2 endings
                j += 1
            tune.close_bar()
            i = j
            continue
        if c == "(":
            m = re.match(r"\((\d)(?::(\d)?)?(?::(\d))?", s[i:])
            if m:
                p = int(m.group(1))
                q = int(m.group(2)) if m.group(2) else {2: 3, 3: 2, 4: 3, 6: 2}.get(p, 2)
                r = int(m.group(3)) if m.group(3) else p
                tup = [r, Fraction(q, p)]
                i += m.end()
            else:
                i += 1
            continue
        if c == ">" or c == "<":
            j = i
            while j < n and s[j] == c:
                j += 1
            k = j - i
            short = Fraction(1, 2 ** k)
            long_ = 2 - short
            if tune.bar:
                prev = tune.bar[-1]
                old = prev[2]
                newd = old * (long_ if c == ">" else short)
                prev[2] = newd
                tune.t += newd - old
            broken = short if c == ">" else long_
            i = j
            continue
        if c == "-":
            tune.tie = True
            i += 1
            continue
        if c == "[":
            j = s.find("]", i)
            j = n if j < 0 else j
            notes = list(NOTE.finditer(s[i + 1:j]))
            m2 = re.match(r"(\d*)(/*)(\d*)", s[j + 1:])
            if notes:
                pit = [_pitch(tune, nm) for nm in notes]
                d = _length(notes[0].group(4), notes[0].group(5), notes[0].group(6)) * \
                    _length(m2.group(1), m2.group(2), m2.group(3)) * tune.unit
                d, broken, tup = _mods(d, broken, tup)
                ps = [p for p in pit if p is not None]
                tune.add(max(ps) if ps else None, d)
            i = j + 1 + (m2.end() if m2 else 0)
            continue
        m = NOTE.match(s, i)
        if m:
            if m.group(2) == "Z":
                tune.invalid = True
                i = m.end()
                continue
            d = _length(m.group(4), m.group(5), m.group(6)) * tune.unit
            d, broken, tup = _mods(d, broken, tup)
            tune.add(_pitch(tune, m), d)
            i = m.end()
            continue
        i += 1


def _mods(d: Fraction, broken, tup):
    if broken is not None:
        d *= broken
        broken = None
    if tup and tup[0] > 0:
        d *= tup[1]
        tup[0] -= 1
        if tup[0] == 0:
            tup = []
    return d, broken, tup


def _pitch(tune: _Tune, m) -> Optional[int]:
    acc, letter, octs = m.group(1), m.group(2), m.group(3)
    if letter in "zx":
        return None
    L = letter.upper()
    octave = 4 if letter.isupper() else 5
    octave += octs.count("'") - octs.count(",")
    if acc:
        a = {"^": 1, "^^": 2, "_": -1, "__": -2, "=": 0}[acc]
        tune.acc[(L, octave)] = a
    a = tune.acc.get((L, octave), tune.keyacc.get(L, 0))
    midi = 12 * (octave + 1) + NAT[L] + a
    return midi - (60 + tune.cur["tonic"])


def pieces(abc_dir: str, books: Dict[str, dict], stats: dict):
    """yields (book, tune) for the books named in cards-map.json, in file order"""
    import os
    for name in sorted(os.listdir(abc_dir)):
        if not name.endswith(".abc"):
            continue
        book = name[:-4]
        with open(os.path.join(abc_dir, name), encoding="latin-1") as f:
            tunes = parse_book(f.read())
        if book not in books or not books[book]["cards"]:
            stats[f"skipped book {book} (not mapped)"] = len(tunes)
            continue
        for t in tunes:
            yield book, t
