"""PDMX (public-domain MuseScore scores; PDMX.csv metadata + mid.tar.gz) -> selected pieces -> bars of semitones above the tonic.

Selection (`select`): rows of the `subset:no_license_conflict` subset with a public-domain / CC0 licence, matched to cards by the rules
of cards-map.json (genres, tags, title words, composer names; tier 0 = a specific match, tier 1 = a broad genre fallback), at most
`cap` pieces per card (tier first, then PDMX's own deduplicated subset, then a stable SHA-1 order of the path), one piece per
normalised title per card.

Melody (`melody`): among the non-drum (track, channel) parts with at least 30% of the busiest part's notes, the one with the highest
median pitch (a quartet's cello or a piano's left hand can have the most notes; the tune is on top), reduced to its top line (skyline).
Key: the first key signature gives the relative major / minor pair, the duration-weighted pitch-class profile of all parts picks the
mode (Krumhansl-Kessler); no key signature: the best of the 24 keys. A key-signature change ends the piece (the degrees would move).
Bars: time-signature events are bar lines (the PDMX MIDI writes a pickup or any irregular measure as its own short time signature: a
time signature lasting less than two bars marks its bars invalid).
"""
from __future__ import annotations

import csv
import hashlib
import re
import sys
import unicodedata
from typing import Dict, List, Optional, Tuple

import common

MAJOR_P = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_P = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
LICENCES = ("publicdomain", "cc-zero")


class Skip(Exception):
    pass


# ---------------------------------------------------------------- selection


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return "" if s == "na" else s


def compile_rules(rules: List[dict]) -> List[dict]:
    out = []
    for r in rules:
        words = r.get("words", [])
        out.append({
            "card": r["card"], "tier": r.get("tier", 0),
            "genres": set(r.get("genres", [])), "tags": set(r.get("tags", [])), "not_tags": set(r.get("not_tags", [])),
            "words": re.compile(r"\b(" + "|".join(words) + r")") if words else None,
            "composers": re.compile(r"\b(" + "|".join(re.escape(norm(c)) for c in r["composers"]) + r")\b") if r.get("composers") else None,
        })
    return out


def match(row: dict, rules: List[dict]) -> List[Tuple[str, int]]:
    """[(card, tier)] with the best (lowest) tier per card, in rule order"""
    genres = set(norm(row.get("genres", "")).split("-")) - {""}
    tags = set(norm(row.get("tags", "")).split("-")) - {""}
    text = " ".join(norm(row.get(k, "")) for k in ("title", "song_name")) + " " + " ".join(sorted(tags))
    who = " ".join(norm(row.get(k, "")) for k in ("composer_name", "artist_name"))
    got: Dict[str, int] = {}
    for r in rules:
        if r["not_tags"] & tags:
            continue
        hit = (r["genres"] & genres) or (r["tags"] & tags) or (r["words"] and r["words"].search(text)) or \
            (r["composers"] and r["composers"].search(who))
        if hit and (r["card"] not in got or r["tier"] < got[r["card"]]):
            got[r["card"]] = r["tier"]
    return list(got.items())


def select(csv_path: str, rules: Optional[List[dict]] = None, cap: int = 600, limit_rows: Optional[int] = None,
           stats: Optional[dict] = None) -> Dict[str, dict]:
    """{mid path (./mid/...): {license, title, cards: [(card, tier)]}}"""
    import json
    import os
    if rules is None:
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "cards-map.json"), encoding="utf-8") as f:
            rules = json.load(f)["pdmx"]["rules"]
    crules = compile_rules(rules)
    csv.field_size_limit(sys.maxsize)
    cand: Dict[str, list] = {}
    info: Dict[str, dict] = {}
    st = stats if stats is not None else {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for i, row in enumerate(csv.DictReader(f)):
            if limit_rows and i >= limit_rows:
                break
            st["rows"] = st.get("rows", 0) + 1
            if row.get("subset:no_license_conflict") != "True" or row.get("license") not in LICENCES:
                st["rows outside the licence-clean subset"] = st.get("rows outside the licence-clean subset", 0) + 1
                continue
            mid = row.get("mid", "")
            if not mid.startswith("./mid/"):
                continue
            m = match(row, crules)
            if not m:
                continue
            title = re.sub(r"[^a-z0-9]+", " ", norm(row.get("song_name") or row.get("title"))).strip()
            dedup = row.get("subset:deduplicated") == "True"
            info[mid] = {"license": row["license"], "title": title, "cards": []}
            h = hashlib.sha1(mid.encode()).hexdigest()
            for card, tier in m:
                cand.setdefault(card, []).append((tier, 0 if dedup else 1, h, mid, title))
    for card in sorted(cand):
        seen = set()
        n = 0
        for tier, _, _, mid, title in sorted(cand[card]):
            if n >= cap:
                break
            if title and title in seen:
                continue
            seen.add(title)
            info[mid]["cards"].append((card, tier))
            n += 1
    return {k: v for k, v in sorted(info.items()) if v["cards"]}


# ---------------------------------------------------------------- melody and key


def melody(m: dict) -> List[Tuple[int, int, int]]:
    parts: Dict[Tuple[int, int], list] = {}
    for tr, ch, s, e, p in m["notes"]:
        if ch == 9:
            continue
        parts.setdefault((tr, ch), []).append((s, e, p))
    if not parts:
        return []
    most = max(len(v) for v in parts.values())

    def med(v):
        ps = sorted(p for _, _, p in v)
        return ps[len(ps) // 2]

    key = max((k for k, v in parts.items() if len(v) >= 0.3 * most), key=lambda k: (med(parts[k]), len(parts[k]), -k[0], -k[1]))
    notes = sorted(parts[key])
    out = []
    i = 0
    while i < len(notes):
        j = i
        top = notes[i]
        while j < len(notes) and notes[j][0] == notes[i][0]:
            if notes[j][2] > top[2]:
                top = notes[j]
            j += 1
        out.append(top)
        i = j
    sky = []
    for k, (s, e, p) in enumerate(out):
        if k + 1 < len(out):
            e = min(e, out[k + 1][0])
        if e > s:
            sky.append((s, e, p))
    return sky


def _corr(hist, prof, tonic):
    n = 12
    x = [hist[(tonic + i) % 12] for i in range(n)]
    mx, my = sum(x) / n, sum(prof) / n
    num = sum((a - mx) * (b - my) for a, b in zip(x, prof))
    den = (sum((a - mx) ** 2 for a in x) * sum((b - my) ** 2 for b in prof)) ** 0.5
    return num / den if den else 0.0


def key_of(m: dict, end: Optional[int] = None) -> Tuple[int, str]:
    hist = [0.0] * 12
    for _, ch, s, e, p in m["notes"]:
        if ch == 9 or (end is not None and s >= end):
            continue
        hist[p % 12] += e - s
    if m["keysig"]:
        sf = m["keysig"][0][1]
        maj = (sf * 7) % 12
        cands = [(maj, "major"), ((maj + 9) % 12, "minor")]
    else:
        cands = [(t, md) for t in range(12) for md in ("major", "minor")]
    return max(cands, key=lambda c: (_corr(hist, MAJOR_P if c[1] == "major" else MINOR_P, c[0]), c[1] == "major", -c[0]))


def piece_from_midi(data: bytes) -> dict:
    try:
        m = common.parse_midi(data)
    except (ValueError, IndexError, struct_error()) as e:
        raise Skip(f"unreadable MIDI ({type(e).__name__})")
    mel = melody(m)
    if len(mel) < 8:
        raise Skip("melody shorter than 8 notes")
    tpq = m["tpq"]
    end = mel[-1][1]
    ks = m["keysig"]
    if ks:
        first = ks[0][1:]
        for t, sf, mi in ks[1:]:
            if (sf, mi) != first and t > 0:
                end = min(end, t)
                break
    tonic, mode = key_of(m, end)
    # time signatures are bar lines: the PDMX MIDI writes every irregular measure (a pickup, a short cadence bar) as its own time
    # signature, so the grid needs no pickup guessing; a time signature that lasts less than two bars is such a measure: not a bar
    byt: Dict[int, Tuple[int, int]] = {}
    for t, n, d in m["timesig"]:
        if t < end and n > 0:
            byt[t] = (n, d)
    ts: List[Tuple[int, int, int]] = []
    for t in sorted(byt):
        if not ts or ts[-1][1:] != byt[t]:
            ts.append((t,) + byt[t])
    if not ts:
        ts = [(0, 4, 4)]
    if ts[0][0] > 0:
        ts.insert(0, (0, ts[0][1], ts[0][2]))
    grid: List[Tuple[float, float]] = []
    irregular: List[bool] = []
    for i, (t, n, d) in enumerate(ts):
        L = tpq * 4 * n / d
        stop = ts[i + 1][0] if i + 1 < len(ts) else end
        seg = []
        s = float(t)
        while s < stop - 1e-6:
            seg.append((s, L))
            s += L
        short = i + 1 < len(ts) and stop - t < 2 * L - 1e-6
        grid += seg
        irregular += [short] * len(seg)
    ref = 60 + tonic
    notes = [(float(s), float(e - s), p - ref) for s, e, p in mel if s < end]
    bars = common.split_bars(notes, grid, float(end))
    for i, (s, L) in enumerate(grid):
        nxt = grid[i + 1][0] if i + 1 < len(grid) else None
        if irregular[i] or (nxt is not None and nxt - s < L - 1e-6):
            bars[i] = None
    return {"tonic": tonic, "mode": mode, "bars": bars, "tpq": tpq}


def struct_error():
    import struct
    return struct.error
