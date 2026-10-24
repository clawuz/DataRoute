#!/usr/bin/env python3
"""
Turn the fetched "world" sounds (fetch_world.py) into a pack of the same shape as the lite one: mono MP3, trimmed,
level-matched, one zone per recording with the pitch MEASURED (not trusted from the file name), plus manifest.json,
a ledger and the credit lines for the CC BY files. Files whose pitch can't be trusted are dropped and listed in report.json.
  .venv-music/bin/python scripts/samples/build_world_pack.py FETCH_DIR OUT_DIR
Needs ffmpeg and librosa. Nothing is written into globe/public: copy the pack in by hand once it has been listened to.
"""
import json, os, re, subprocess, sys
import librosa, numpy as np

SRC, OUT = (sys.argv[1:3] + [None, None])[:2]  # build_extra_pack.py imports the helpers below
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
SEMI = {n: i for i, n in enumerate(NAMES)}
FLAT = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#", "Cb": "B", "Fb": "E"}

# fetch slug -> (manifest name, kind)   sus = held notes (looped) | pluck = rings out | drum = unpitched hits
KINDS = {
    "erhu": ("ERHU", "sus"), "shakuhachi": ("SHAKUHACHI", "sus"), "kaval": ("KAVAL", "sus"), "duduk": ("DUDUK", "sus"),
    "tinwhistle": ("TINWHISTLE", "sus"), "accordion": ("ACCORDION", "sus"), "panpipe": ("PANPIPE", "sus"),
    "renaissance_organ": ("ORGAN", "sus"), "tenor_sax": ("TENORSAX", "sus"), "harmonica": ("HARMONICA", "sus"),
    "santur": ("SANTUR", "pluck"), "kayageum": ("KAYAGEUM", "pluck"), "koto": ("KOTO", "pluck"), "dantranh": ("DANTRANH", "pluck"),
    "psaltery": ("PSALTERY", "pluck"), "folkharp": ("FOLKHARP", "pluck"), "kalimba": ("KALIMBA", "pluck"),
    "kalimba_kenya": ("MBIRA", "pluck"), "steeldrum": ("STEELDRUM", "pluck"), "nylon_guitar": ("NYLONGUITAR", "pluck"),
    "bass_guitar": ("BASSGUITAR", "pluck"), "upright_bass": ("UPRIGHTBASS", "pluck"), "electric_clean": ("EGUITAR", "pluck"),
    "electric_drive": ("EGUITAR_DRIVE", "pluck"), "rhodes": ("RHODES", "pluck"), "vibraphone": ("VIBES", "pluck"),
    "steinway": ("STEINWAY", "pluck"), "kawai_grand": ("KAWAI", "pluck"), "yamaha_upright": ("UPRIGHTPNO", "pluck"),
    "knight_upright": ("KNIGHTPNO", "pluck"), "harpsichord": ("HARPSICHORD", "pluck"), "tanpura": ("TANPURA", "pluck"),
    "tabla": ("TABLA", "drum"), "djembe": ("DJEMBE", "drum"), "bendir": ("BENDIR", "drum"), "bodhran": ("FRAMEDRUM_FS", "drum"),
    "framedrum": ("FRAMEDRUM", "drum"), "darbuka": ("DARBUKA_VCSL", "drum"), "drumkit": ("DRUMKIT", "drum"),
}
# playable range (MIDI) of instruments whose measured pitch is easily an octave off (pyin finds a sub-harmonic)
RANGE = {"nylon_guitar": (40, 88), "bass_guitar": (28, 67), "upright_bass": (28, 67), "electric_clean": (40, 88), "electric_drive": (40, 88),
         "tinwhistle": (62, 98), "duduk": (52, 85), "tenor_sax": (44, 81), "harmonica": (48, 96), "rhodes": (28, 100), "panpipe": (48, 98)}
LIMIT = {"sus": 3.0, "pluck": 4.0, "drum": 1.6}
NOTE_RE = re.compile(r"(?<![A-Za-z])([A-G][#b]?)(-?\d)(?![0-9])")

def name_midi(fn):
    """the pitch written in a file name, as a MIDI number (C4 = 60), or None"""
    for m in NOTE_RE.finditer(os.path.basename(fn)):
        n = FLAT.get(m.group(1), m.group(1))
        if n in SEMI:
            return (int(m.group(2)) + 1) * 12 + SEMI[n]
    return None

def measure(path):
    """(median MIDI as float, spread in semitones, voiced frames) over the first 3 s, or (None, ..) when unpitched/unclear"""
    y, sr = librosa.load(path, sr=22050, mono=True, duration=3.0)
    if len(y) < sr * 0.2:
        return None, 99.0, 0
    f0, ok, _ = librosa.pyin(y, fmin=30, fmax=2100, sr=sr, frame_length=4096)
    f0 = f0[ok & ~np.isnan(f0)] if ok is not None else f0[~np.isnan(f0)]
    if len(f0) < 5:
        return None, 99.0, len(f0)
    m = librosa.hz_to_midi(f0)
    med = float(np.median(m))
    keep = m[np.abs(m - med) < 6]  # ignore octave-error frames when judging the spread
    return med, float(np.std(keep)), len(f0)

def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(r.stdout.strip())

def encode(src, dst, limit):
    d = duration(src)
    keep = min(d, limit)
    af = ["highpass=f=30", "loudnorm=I=-26:TP=-3:LRA=11"]
    f = min(0.35, keep / 3)
    af.append(f"afade=t=out:st={keep - f:.3f}:d={f:.3f}")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-t", f"{keep:.3f}", "-ac", "1", "-ar", "44100", "-af", ",".join(af), "-c:a", "libmp3lame", "-b:a", "80k", dst], check=True)
    return keep

def rms(path):
    y, _ = librosa.load(path, sr=22050, mono=True, duration=1.0)
    return float(np.sqrt(np.mean(y * y))) if len(y) else 0.0

def zones_for(items):
    items = sorted(items, key=lambda z: z["root"])
    out = []
    for i, z in enumerate(items):
        lo = 0 if i == 0 else int((items[i - 1]["root"] + z["root"]) // 2) + 1
        hi = 127 if i == len(items) - 1 else int((z["root"] + items[i + 1]["root"]) // 2)
        out.append({"root": round(z["root"], 2), "lo": lo, "hi": max(lo, hi), "file": z["file"]})
    return out

def main():
    ledger = json.load(open(os.path.join(SRC, "world-ledger.json")))
    by = {}
    for row in ledger:
        if row["instrument"] in KINDS:
            by.setdefault(row["instrument"], []).append(row)
    manifest = {"name": "World additions (CC0 and CC BY), full", "instruments": {}}
    report, used = {"dropped": [], "octave_fixed": [], "instruments": {}}, []
    for slug, rows in by.items():
        mname, kind = KINDS[slug]
        cands = []
        for r in rows:
            src = os.path.join(SRC, r["file"])
            fn = os.path.splitext(os.path.basename(r["file"]))[0]
            safe = re.sub(r"[^A-Za-z0-9_#.-]+", "_", fn).replace("#", "s")
            rel = f"{mname.lower()}/{safe}.mp3"
            if kind == "drum":
                cands.append({"row": r, "src": src, "rel": rel, "rms": rms(src)})
                continue
            med, spread, n = measure(src)
            named = name_midi(fn)
            if med is None or spread > 1.6:
                report["dropped"].append({"file": r["file"], "why": "no steady pitch (a phrase, a noise or unclear)", "spread": round(spread, 2)})
                continue
            root = med
            if named is not None:
                diff = med - named
                if abs(diff) <= 1.0:
                    root = med                                      # name and ear agree: keep the measured, in-tune value
                elif abs(diff - 12 * round(diff / 12)) <= 1.0:
                    root = named + (med - round(med))               # right note, other octave: trust the name, keep the tuning
                    report["octave_fixed"].append({"file": r["file"], "named": named, "heard": round(med, 1)})
                else:
                    report["dropped"].append({"file": r["file"], "why": f"name says {named}, ear says {med:.1f}"})
                    continue
            lo_hi = RANGE.get(slug)
            if lo_hi and not lo_hi[0] <= root <= lo_hi[1]:
                moved = root
                while moved < lo_hi[0]:
                    moved += 12
                while moved > lo_hi[1]:
                    moved -= 12
                if lo_hi[0] <= moved <= lo_hi[1] and abs(moved - root) <= 24:
                    report.setdefault("range_fixed", []).append({"file": r["file"], "heard": round(root, 1), "set": round(moved, 1)})
                    root = moved
                else:
                    report["dropped"].append({"file": r["file"], "why": f"{root:.1f} is outside the range of {slug}"})
                    continue
            if any(abs(c["root"] - root) < 0.5 for c in cands):
                report["dropped"].append({"file": r["file"], "why": "same pitch as another file"})
                continue
            cands.append({"row": r, "src": src, "rel": rel, "root": root})
        if not cands:
            continue
        kept = []
        for c in cands:
            keep = encode(c["src"], os.path.join(OUT, c["rel"]), LIMIT[kind])
            c["len"] = keep
            kept.append(c)
            r = c["row"]
            used.append({"instrument": mname, "file": c["rel"], "source": r["page"], "author": r["author"], "licence": r["licence"], "title": r["title"]})
        if kind == "drum":
            kept.sort(key=lambda c: c["rms"])
            k = len(kept)
            zs = [{"root": 60, "lo": 0, "hi": 127, "file": c["rel"], "vel": [round(i / k, 2), round((i + 1) / k, 2)]} for i, c in enumerate(kept)]
            inst = {"zones": zs, "unpitched": True, "release": 0.25}
        else:
            inst = {"zones": zones_for([{"root": c["root"], "file": c["rel"]} for c in kept]), "release": 0.5 if kind == "pluck" else 0.4}
            if kind == "sus" and np.median([c["len"] for c in kept]) >= 2.5:
                inst.update({"sustained": True, "loop": [0.9, 2.4]})
        manifest["instruments"][mname] = inst
        report["instruments"][mname] = {"kept": len(kept), "of": len(rows), "roots": sorted(round(z["root"]) for z in inst["zones"])}
        print(f"{mname:14} {len(kept):2}/{len(rows):2} files" + ("" if kind == "drum" else f"  roots {report['instruments'][mname]['roots']}"))
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    json.dump(used, open(os.path.join(OUT, "ledger.json"), "w"), indent=1)
    json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
    by_author = {}
    for u in used:
        if u["licence"] == "CC BY":
            by_author.setdefault(u["author"], []).append(u)
    with open(os.path.join(OUT, "credits-ccby.md"), "w") as f:
        f.write("# CC BY credits for the world pack (add to /credits.html)\n\nEvery other file is CC0 1.0 (Freesound CC0 sounds, VCSL by Versilian Studios).\n\n")
        for a, us in sorted(by_author.items(), key=lambda x: x[0].lower()):
            f.write(f"- **{a}** (Freesound, CC BY): " + "; ".join(f"[{u['title']}]({u['source']})" for u in us) + "\n")
    print(f"\n{len(used)} files in pack, {len(report['dropped'])} dropped, {len(report['octave_fixed'])} octave-fixed, {len(by_author)} CC BY authors")

if __name__ == "__main__":
    main()
