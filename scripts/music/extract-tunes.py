#!/usr/bin/env python3 -I
"""
Finds the melody of well-known public-domain tunes in the PDMX corpus by consensus: every public-domain transcription of a
title is parsed, its top line is written as intervals from the tonic and beats, and the transcription that the others
agree with most (the medoid) is the candidate. Several agreeing transcriptions = a checked tune.

  python3 -I scripts/music/extract-tunes.py <refdata dir> <out.json> "title one" "title two" ...

Standard library only. Output has, per title, the candidate notes [semitones above the tonic, beats], the mode from the
key signature, how many transcriptions were found and how many agree.
"""
import csv, collections, json, os, struct, sys

root, out, titles = sys.argv[1], sys.argv[2], sys.argv[3:]
csv.field_size_limit(10**9)


def varlen(b, i):
    v = 0
    while True:
        c = b[i]
        i += 1
        v = (v << 7) | (c & 0x7F)
        if not c & 0x80:
            return v, i


def parse(path):
    b = open(path, "rb").read()
    if b[:4] != b"MThd":
        return None
    _, ntr, div = struct.unpack(">HHH", b[8:14])
    if div & 0x8000:
        return None
    i = 14
    key = None
    ts = None
    tracks = []
    for _ in range(ntr):
        if b[i:i + 4] != b"MTrk":
            break
        ln = struct.unpack(">I", b[i + 4:i + 8])[0]
        j, end, t, run = i + 8, i + 8 + ln, 0, 0
        on, notes = {}, []
        while j < end:
            dt, j = varlen(b, j)
            t += dt
            st = b[j]
            if st == 0xFF:
                typ = b[j + 1]
                l, j2 = varlen(b, j + 2)
                if typ == 0x58 and l >= 2 and ts is None:
                    ts = (b[j2], 2 ** b[j2 + 1])
                if typ == 0x59 and key is None and l == 2:
                    key = (struct.unpack("b", b[j2:j2 + 1])[0], b[j2 + 1])
                j = j2 + l
                continue
            if st in (0xF0, 0xF7):
                l, j = varlen(b, j + 1)
                j += l
                continue
            if st & 0x80:
                run = st
                j += 1
            kind, ch = run & 0xF0, run & 0x0F
            if kind in (0x80, 0x90):
                k, vel = b[j], b[j + 1]
                j += 2
                if kind == 0x90 and vel > 0:
                    on[(ch, k)] = t
                elif (ch, k) in on:
                    notes.append((on.pop((ch, k)), t, k, ch))
            elif kind in (0xC0, 0xD0):
                j += 1
            else:
                j += 2
        i = end
        tracks.append(notes)
    return div, key, tracks, ts


def melody(parsed):
    div, key, tracks, ts = parsed
    cand = [t for t in tracks if len([n for n in t if n[3] != 9]) >= 12]
    if not cand:
        return None
    # the melody track: the one whose notes are highest on average and mostly one at a time
    def score(t):
        p = [n[2] for n in t]
        return sum(p) / len(p)
    t = max(cand, key=score)
    ons = collections.defaultdict(list)
    for a, e, k, _ in t:
        ons[a].append((k, e))
    seq = []
    for a in sorted(ons):
        k, e = max(ons[a])
        seq.append((a / div, (e - a) / div, k))
    return seq, key, ts


def tonic_pc(key):
    if key is None:
        return None, None
    sf, mi = key
    major = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]  # pc of the major tonic for sf = 0..11 (sharps)
    pc = (sf * 7) % 12 if sf >= 0 else (sf * 7) % 12
    pc = pc % 12
    if mi:
        pc = (pc + 9) % 12
    return pc, "minor" if mi else "major"


def quant(x):
    return round(x * 4) / 4 if x > 0 else 0.25


def encode(seq, tpc, ts, take=70):
    if len(seq) < 8:
        return None
    bpb = (ts[0] * 4 / ts[1]) if ts else 4
    seq = seq[:take]
    base = seq[0][2]
    notes, total = [], 0.0
    for k, (a, d, p) in enumerate(seq):
        nxt = seq[k + 1][0] if k + 1 < len(seq) else a + max(d, 0.25)
        ioi = nxt - a
        beats = max(0.25, round(ioi * 4) / 4)
        notes.append([p - base, beats])
        total += beats
    return notes, ((base - tpc) % 12 if tpc is not None else None), bpb


def dist(a, b):
    # edit distance on the interval sequences, durations ignored
    x = [n[0] for n in a]
    y = [n[0] for n in b]
    m, n = len(x), len(y)
    d = list(range(n + 1))
    for i in range(1, m + 1):
        prev, d[0] = d[0], i
        for j in range(1, n + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (0 if x[i - 1] == y[j - 1] else 1))
            prev, d[j] = d[j], cur
    return d[n]


rows = []
with open(os.path.join(root, "pdmx", "PDMX.csv"), encoding="utf-8") as fh:
    for r in csv.DictReader(fh):
        if r["license_conflict"] == "True" or r["subset:all_valid"] != "True":
            continue
        if r["license"] not in ("publicdomain", "cc-zero"):
            continue
        rows.append(r)

result = {}
for title in titles:
    tl = title.lower()
    found = []
    for r in rows:
        name = ((r["song_name"] or "") + " " + (r["title"] or "")).lower()
        if tl not in name:
            continue
        p = os.path.join(root, "pdmx", "mid", r["mid"].replace("./mid/", "mid/"))
        try:
            pm = parse(p)
            if not pm:
                continue
            mel = melody(pm)
            if not mel:
                continue
            seq, key, ts = mel
            tpc, mode = tonic_pc(key)
            enc = encode(seq, tpc, ts)
            if not enc:
                continue
            found.append({"notes": enc[0], "tonic_offset": enc[1], "mode": mode, "bpb": enc[2], "name": r["song_name"]})
        except Exception:
            continue
    if not found:
        result[title] = {"found": 0}
        continue
    # the medoid on the first 16 intervals
    heads = [f["notes"][:16] for f in found]
    best, bs = 0, 1e9
    for i, h in enumerate(heads):
        s = sum(dist(h, g) for g in heads)
        if s < bs:
            best, bs = i, s
    agree = sum(1 for g in heads if dist(heads[best], g) <= 2)
    f = found[best]
    result[title] = {"found": len(found), "agree": agree, "mode": f["mode"], "tonic_offset": f["tonic_offset"], "bpb": f["bpb"], "name": f["name"], "notes": f["notes"]}

json.dump(result, open(out, "w"), ensure_ascii=False, indent=1)
for t, v in result.items():
    print(t, v.get("found"), v.get("agree"), v.get("mode"), v.get("tonic_offset"))
