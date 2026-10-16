#!/usr/bin/env python3 -I
"""
Statistics (no melodies) from reference data, for the genre cards (docs/music-genre-cards.md).

  python3 -I scripts/music/analyze-refdata.py <refdata dir> <out.json>

<refdata dir> holds: symbtr/x/*/txt/*.txt (SymbTr, CC BY-NC-SA: only counts and patterns are written),
pdmx/PDMX.csv and pdmx/mid/... (PDMX, public domain / CC0). Standard library only.
"""
import csv, glob, json, os, random, struct, sys, collections

root, out = sys.argv[1], sys.argv[2]
csv.field_size_limit(10**9)
random.seed(7)


# ---------------------------------------------------------------- SymbTr: usuls and makams
def symbtr():
    usuls = collections.defaultdict(lambda: {"n": 0, "meter": collections.Counter(), "cells": collections.Counter()})
    makams = collections.defaultdict(lambda: {"n": 0, "pc": collections.Counter()})
    for f in glob.glob(os.path.join(root, "symbtr", "x", "*", "txt", "*.txt")):
        makam = os.path.basename(f).split("--")[0]
        rows = []
        with open(f, encoding="utf-8", errors="ignore") as fh:
            rd = csv.reader(fh, delimiter="\t")
            head = next(rd, None)
            for r in rd:
                if len(r) >= 13:
                    rows.append(r)
        if not rows:
            continue
        usul = rows[0][11].strip().lower() or "?"
        try:
            pay, payda = int(rows[0][6]), int(rows[0][7])
        except ValueError:
            continue
        meter = pay / payda if payda else 0
        if meter <= 0:
            continue
        u = usuls[usul]
        u["n"] += 1
        u["meter"][f"{pay}/{payda}"] += 1
        # measures: group the notes by floor(offset / meter); the figure = lengths in 1/16 whole notes, most common first
        bars = collections.defaultdict(list)
        pcs = collections.Counter()
        last = None
        for r in rows[1:]:
            try:
                kod = int(r[1])
                if kod == 51:
                    continue
                d = int(r[6]) / int(r[7])
                off = float(r[12])
                koma = int(r[4])
            except (ValueError, ZeroDivisionError):
                continue
            if kod != 9 and kod != 8:
                continue
            bars[int(off / meter + 1e-6)].append(round(d * 16))
            pcs[koma % 53] += d
            last = koma % 53
        for b in bars.values():
            if 2 <= len(b) <= 12 and sum(b) == round(meter * 16):
                u["cells"][tuple(b)] += 1
        if last is not None and pcs:
            m = makams[makam]
            m["n"] += 1
            tot = sum(pcs.values())
            for k, v in pcs.items():
                m["pc"][(k - last) % 53] += v / tot
    res_u = {}
    for k, v in sorted(usuls.items(), key=lambda kv: -kv[1]["n"])[:20]:
        res_u[k] = {
            "pieces": v["n"],
            "meter": v["meter"].most_common(1)[0][0],
            "cells16": [{"cell": list(c), "bars": n} for c, n in v["cells"].most_common(3)],
        }
    res_m = {}
    for k, v in sorted(makams.items(), key=lambda kv: -kv[1]["n"])[:20]:
        share = {pc: s / v["n"] for pc, s in v["pc"].items()}
        main = sorted(share.items(), key=lambda kv: -kv[1])[:9]
        res_m[k] = {
            "pieces": v["n"],
            # the pitch classes (in 53-koma units from the final note, and in semitones) that carry the music
            "degrees": sorted([{"koma": pc, "semitones": round(pc / 53 * 12, 2), "weight": round(w, 3)} for pc, w in main], key=lambda x: x["koma"]),
        }
    return {"usuls": res_u, "makams": res_m}


# ---------------------------------------------------------------- PDMX: tempo, meter, note lengths, instruments
def varlen(b, i):
    v = 0
    while True:
        c = b[i]
        i += 1
        v = (v << 7) | (c & 0x7F)
        if not c & 0x80:
            return v, i


def parse_midi(path):
    b = open(path, "rb").read()
    if b[:4] != b"MThd":
        return None
    fmt, ntr, div = struct.unpack(">HHH", b[8:14])
    if div & 0x8000:
        return None
    i = 14
    tempo, ts, progs, notes = None, None, collections.Counter(), []
    for _ in range(ntr):
        if b[i:i + 4] != b"MTrk":
            break
        ln = struct.unpack(">I", b[i + 4:i + 8])[0]
        j, end, t, run = i + 8, i + 8 + ln, 0, 0
        on = {}
        prog_by_ch = {}
        while j < end:
            dt, j = varlen(b, j)
            t += dt
            st = b[j]
            if st == 0xFF:
                typ = b[j + 1]
                l, j2 = varlen(b, j + 2)
                data = b[j2:j2 + l]
                if typ == 0x51 and tempo is None and l == 3:
                    tempo = 60_000_000 / int.from_bytes(data, "big")
                if typ == 0x58 and ts is None and l >= 2:
                    ts = f"{data[0]}/{2 ** data[1]}"
                j = j2 + l
                continue
            if st in (0xF0, 0xF7):
                l, j = varlen(b, j + 1)
                j += l
                continue
            if st & 0x80:
                run = st
                j += 1
            ch = run & 0x0F
            kind = run & 0xF0
            if kind in (0x80, 0x90):
                key, vel = b[j], b[j + 1]
                j += 2
                if kind == 0x90 and vel > 0:
                    on[key] = t
                    notes.append([t, None, key, ch])
                else:
                    pass
            elif kind == 0xC0:
                prog_by_ch[ch] = b[j]
                progs[prog_by_ch[ch] // 8] += 1
                j += 1
            elif kind == 0xD0:
                j += 1
            else:
                j += 2
        i = end
    return {"div": div, "tempo": tempo, "ts": ts, "progs": progs, "onsets": sorted(n[0] for n in notes if n[3] != 9)}


GM = ["piano", "chromatic perc", "organ", "guitar", "bass", "strings", "ensemble", "brass", "reed", "pipe", "synth lead", "synth pad", "synth fx", "ethnic", "percussive", "sfx"]


def pdmx():
    rows = collections.defaultdict(list)
    with open(os.path.join(root, "pdmx", "PDMX.csv"), encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["license_conflict"] == "True" or r["subset:all_valid"] != "True":
                continue
            g = (r["genres"] or "NA").split("-")[0]
            rows[g].append(r)
    res = {}
    for genre in ["classical", "folk", "soundtrack", "pop", "jazz", "electronic", "worldmusic", "rbfunksoul", "newage"]:
        pick = random.sample(rows[genre], min(300, len(rows[genre])))
        tempos, tss, progs, lens, cells = [], collections.Counter(), collections.Counter(), collections.Counter(), collections.Counter()
        gaps = collections.Counter()
        for r in pick:
            p = os.path.join(root, "pdmx", "mid", r["mid"].replace("./mid/", "mid/"))
            if not os.path.exists(p):
                p = os.path.join(root, "pdmx", r["mid"].lstrip("./"))
            try:
                m = parse_midi(p)
            except Exception:
                continue
            if not m or not m["onsets"]:
                continue
            if m["tempo"]:
                tempos.append(m["tempo"])
            tss[m["ts"] or "4/4"] += 1
            for k, v in m["progs"].items():
                progs[GM[k]] += v
            on = m["onsets"]
            beat = m["div"]
            # distinct onset times: the gaps between them, in beats, are the rhythm's grammar
            u = sorted(set(on))
            for a, b2 in zip(u, u[1:]):
                g = (b2 - a) / beat
                for q in (0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4):
                    if abs(g - q) < 0.06 * q + 0.02:
                        gaps[q] += 1
                        break
            # the figure of a bar (4/4 only): onsets on an eighth grid
            if (m["ts"] or "4/4") == "4/4":
                bars = collections.defaultdict(set)
                for t in u:
                    s = round(t / beat * 2)
                    if abs(t / beat * 2 - s) < 0.12:
                        bars[s // 8].add(s % 8)
                for bset in bars.values():
                    if 2 <= len(bset) <= 8:
                        cells["".join("x" if k in bset else "." for k in range(8))] += 1
        tempos.sort()
        n = len(tempos)
        tot = sum(gaps.values()) or 1
        res[genre] = {
            "pieces": len(pick),
            "tempo_bpm": {"p10": round(tempos[n // 10]), "median": round(tempos[n // 2]), "p90": round(tempos[n * 9 // 10])} if n > 10 else None,
            "time_signatures": tss.most_common(4),
            "instrument_families": [(k, v) for k, v in progs.most_common(6)],
            "onset_gap_beats_share": {str(k): round(v / tot, 3) for k, v in sorted(gaps.items())},
            "top_bar_figures_8ths": cells.most_common(8),
        }
    return res


stats = {"symbtr": symbtr(), "pdmx": pdmx()}
json.dump(stats, open(out, "w"), ensure_ascii=False, indent=1)
print("written", out)
