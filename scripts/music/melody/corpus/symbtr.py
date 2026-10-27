"""SymbTr (Turkish makam scores, txt format) -> bars of commas above the karar -> bars of card degrees.

The txt columns: Sira Kod Nota53 NotaAE Koma53 KomaAE Pay Payda Ms LNS Bas Soz1 Offset (code_explanations.xlsx):
- Kod 51 (usl) = usul / usul change: Pay/Payda is the length of the usul cycle (in whole notes), Soz1 its name; it takes no time;
- Kod 8 (crp, çarpma) = a grace note without duration: skipped; Kod 53/54/55 = phrase / geçki marks without duration: skipped;
- Kod 35 (oot) = "repeat the previous measure" (one file): the piece is skipped, its timing cannot be read from the rows;
- every other row with Pay > 0 is a note (Koma53 = pitch in 53-commas) or a rest (Nota53 "Es", Koma53 -1), lasting Pay/Payda;
- Offset = the running time in usul MEASURES at the end of the row (a cycle of 10/4 counts 1.0 per 2.5 whole notes; usul rows sit on
  whole numbers): checked against our exact Fraction sum (`offset_ok`), so the bar grid anchored at the usul rows is the score's.

A bar = one usul cycle starting at the usul row; a cycle longer than two whole notes (devr-i kebir 28/4, muhammes 32/4, zencir
120/4...) is split into the fewest equal sub-bars of at most two whole notes whose count divides Pay; an usul with no such split marks
its bars invalid. The karar = the last sounding note of the piece; pitches are commas above it.
"""
from __future__ import annotations

import json
import os
from fractions import Fraction
from typing import Dict, List, Optional, Tuple

import common

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, "makam-cards.json")
MAX_BAR = Fraction(2)  # whole notes


class Skip(Exception):
    pass


def sub_bars(pay: int, payda: int) -> Optional[int]:
    if Fraction(pay, payda) <= MAX_BAR:
        return 1
    for d in range(2, pay):
        if pay % d == 0 and Fraction(pay // d, payda) <= MAX_BAR:
            return d
    return None


def parse_text(text: str) -> dict:
    lines = text.splitlines()
    if not lines or not lines[0].startswith("Sira"):
        raise Skip("no header")
    t = Fraction(0)
    notes: List[Tuple[Fraction, Fraction, int]] = []
    segments: List[Tuple[Fraction, Fraction, bool]] = []  # (anchor, bar length, valid)
    mism = 0
    m_t, m_off, m_cyc = Fraction(0), 0.0, Fraction(1)  # the measure count at the last usul row
    for ln in lines[1:]:
        c = ln.split("\t")
        if len(c) < 13:
            continue
        try:
            kod, koma, pay, payda = int(c[1]), int(c[4] or 0), int(c[6] or 0), int(c[7] or 0)
        except ValueError:
            continue
        if kod == 35:
            raise Skip("repeat-measure code (Kod 35)")
        if kod == 51:
            if pay > 0 and payda > 0:
                k = sub_bars(pay, payda)
                L = Fraction(pay, payda) / (k or 1)
                if segments and segments[-1][0] == t:
                    segments.pop()
                segments.append((t, L, k is not None))
                try:
                    m_off = float(c[12])
                except ValueError:
                    m_off = 0.0
                m_t, m_cyc = t, Fraction(pay, payda)
            continue
        if pay <= 0 or payda <= 0:
            continue
        d = Fraction(pay, payda)
        if c[2].strip() != "Es" and koma > 0:
            notes.append((t, d, koma))
        t += d
        try:
            if abs(float(c[12]) - (m_off + float((t - m_t) / m_cyc))) > 2e-3:
                mism += 1
        except ValueError:
            pass
    if not notes:
        raise Skip("no notes")
    if not segments:
        raise Skip("no usul row")
    karar = notes[-1][2]
    rel = [(float(o), float(d), k - karar) for o, d, k in notes]
    grid: List[Tuple[float, float]] = []
    bars: List[Optional[list]] = []
    for si, (anchor, L, ok) in enumerate(segments):
        seg_end = segments[si + 1][0] if si + 1 < len(segments) else t
        g = []
        s = anchor
        while s < seg_end:
            g.append((float(s), float(L)))
            s += L
        b = common.split_bars(rel, g, float(seg_end))
        if not ok:
            b = [None] * len(b)
        grid += g
        bars += b
    return {"karar": karar, "grid": grid, "bars": bars, "offset_ok": mism == 0, "length": float(t)}


def card_bars(p: dict, scale) -> List[Optional[list]]:
    """commas above the karar -> degrees of the card's scale (nearest, octave-extended), the octave that fits [LOW, HIGH] best"""
    deg = common.shift_bars(p["bars"], lambda c: common.comma_degree(c, scale))
    k = common.best_octave([n[1] for b in deg if b for n in b], len(scale))
    return common.shift_bars(deg, lambda d: d + k)


def load_table(path: str = TABLE) -> dict:
    with open(path, encoding="utf-8") as f:
        t = json.load(f)
    t["_makam"] = {m: name for name, fam in t["families"].items() for m in fam["makams"]}
    return t


RANK = {"makam": 0, "form": 1, "region": 2}


def cards_of(filename: str, table: dict) -> List[Tuple[str, str]]:
    """file name makam--form--usul--title--composer.txt -> [(card, via)] in a stable order; via = region / form / makam"""
    parts = os.path.basename(filename)[:-4].split("--") if filename.endswith(".txt") else filename.split("--")
    makam, form = parts[0], parts[1] if len(parts) > 1 else ""
    place = parts[4] if len(parts) > 4 else ""
    if form in table["skip_forms"]:
        return []
    out: Dict[str, str] = {}

    def add(cards, via):
        for c in cards:
            if c not in out or RANK[via] > RANK[out[c]]:
                out[c] = via

    region = table["regions"].get(place) or table["regions"].get(place.split("-")[0])
    if form in table["forms"]:
        add(table["forms"][form]["cards"], "form")
    fam = table["_makam"].get(makam)
    fam_cards = table["families"][fam]["cards"] if fam else table["default"]["cards"]
    if form in table["folk_forms"]:
        if region:
            add(region["cards"], "region")
        else:
            add(fam_cards, "makam")
    else:
        add(fam_cards, "makam")
    return list(out.items())


def pieces(txt_dir: str, table: dict, stats: dict):
    """yields (name, parsed, [(card, via)]) for every usable file, sorted by name; counts skips in stats"""
    for name in sorted(os.listdir(txt_dir)):
        if not name.endswith(".txt"):
            continue
        cards = cards_of(name, table)
        if not cards:
            stats["skipped: form not used (seyir/etüd/örnek)"] = stats.get("skipped: form not used (seyir/etüd/örnek)", 0) + 1
            continue
        try:
            with open(os.path.join(txt_dir, name), encoding="utf-8") as f:
                p = parse_text(f.read())
        except Skip as e:
            key = f"skipped: {e}"
            stats[key] = stats.get(key, 0) + 1
            continue
        if not p["offset_ok"]:
            stats["note: Offset column disagrees (timing from Pay/Payda used)"] = stats.get(
                "note: Offset column disagrees (timing from Pay/Payda used)", 0) + 1
        yield name, p, cards
