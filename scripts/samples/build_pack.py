#!/usr/bin/env python3
"""
Turn the fetched VSCO 2 CE files into the "lite" pack: mono MP3, trimmed, level-matched, plus manifest.json.
  python3 scripts/samples/build_pack.py SRC_DIR OUT_DIR
Needs ffmpeg/ffprobe. Source licence: CC0 1.0 (VSCO 2 Community Edition, Versilian Studios).
"""
import json, math, os, re, struct, subprocess, sys

SRC, OUT = sys.argv[1], sys.argv[2]
FS = sys.argv[3] if len(sys.argv) > 3 else None  # fetched Freesound sounds (fetch_freesound.py)
SEMI = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
NOTE = re.compile(r"_([A-G]#?)(\d)(?=[_.])")
SUS_LEN = 3.0
LOOP = [0.9, 2.4]

# manifest instrument -> (folder/prefix inside SRC, kind)   kind: sus | pizz | oneshot | notes (named pitches) | pitched-by-ear
SPEC = {
    "VIOLIN": ("Strings/Violin Section/susVib/", "sus"),
    "VIOLA": ("Strings/Viola Section/susvib/", "sus"),
    "STR": ("Strings/Viola Section/susvib/", "sus"),
    "CELLO": ("Strings/Cello Section/susvib/", "sus"),
    "BASS": ("Strings/Solo Contrabass/SusVib/", "sus"),
    "VIOLIN_PIZZ": ("Strings/Violin Section/Pizz/", "pizz"),
    "VIOLA_PIZZ": ("Strings/Viola Section/pizz/", "pizz"),
    "CELLO_PIZZ": ("Strings/Cello Section/pizzT/", "pizz"),
    "BASS_PIZZ": ("Strings/Solo Contrabass/Pizz/", "pizz"),
    "HARP": ("Strings/Harp/", "harp"),
    "FLUTE": ("Woodwinds/Flute/susvib/", "sus"),
    "OBOE": ("Woodwinds/Oboe/Vib/", "sus"),
    "CLA": ("Woodwinds/Clarinet/susLong/", "sus"),
    "BSN": ("Woodwinds/Bassoon/sus/", "sus"),
    "PICC": ("Woodwinds/Piccolo/Sus/", "sus"),
    "HORN": ("Brass/F Horn/sus/", "sus"),
    "BRASS": ("Brass/F Horn/sus/", "sus"),
    "TPT": ("Brass/Trumpet/sus/", "sus"),
    "TBN": ("Brass/Tenor Trombone/sus/", "sus"),
    "TUBA": ("Brass/Tuba/sus/", "sus"),
    "GLOCK": ("Percussion/Glock/", "bell"),
    "XYLO": ("Percussion/Xylo/", "bell"),
    "MARIMBA": ("Percussion/Marimba/", "bell"),
}
UNPITCHED = {
    "CRASH": "Percussion/cymbal-crash1_mf_rr1.wav",
    "KICK": "Percussion/BDrumNewhit_v5_rr1_Sum.wav",
    "SNARE": "Percussion/Snare2-HitSN_v5_rr1_Sum.wav",
    "TRI": "Percussion/Triangle3-HitM_v1_rr1_Sum.wav",
    "TAMB": "Percussion/Tamb1-Hit_v1_rr1_Sum.wav",
    "GONG": "Percussion/gongHit_mf.wav",
}
TIMPANI = [f"Percussion/Timpani/Timpani{i}_Hit_v3_rr1_Sum.wav" for i in (1, 2, 3, 4)]


def midi(name):
    m = NOTE.search(name)
    return (int(m.group(2)) + 1) * 12 + SEMI[m.group(1)] if m else None


def dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(r.stdout.strip())


def encode(src, dst, limit):
    d = dur(src)
    keep = min(d, limit)
    af = ["highpass=f=30", "loudnorm=I=-26:TP=-3:LRA=11"]
    if keep < d - 0.01 or keep > 0.6:
        f = min(0.35, keep / 3)
        af.append(f"afade=t=out:st={keep - f:.3f}:d={f:.3f}")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-t", f"{keep:.3f}", "-ac", "1", "-ar", "44100", "-af", ",".join(af), "-c:a", "libmp3lame", "-b:a", "80k", dst], check=True)
    return keep


def pitch_of(path):
    """fundamental of a drum by autocorrelation (timpani), as a MIDI number"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-t", "1.2", "-f", "f32le", "-"], capture_output=True).stdout
    xs = struct.unpack("<%df" % (len(raw) // 4), raw)[1200:5600]  # 0.15 s .. 0.7 s
    best, lag_best = -1e9, 0
    for lag in range(int(8000 / 190), int(8000 / 60)):  # 60..190 Hz
        c = sum(xs[i] * xs[i + lag] for i in range(0, len(xs) - lag, 2))
        if c > best:
            best, lag_best = c, lag
    f = 8000 / lag_best
    return round(69 + 12 * math.log2(f / 440))


def zones_for(files):
    """files: [(root, relfile)] -> zones with ranges that meet halfway between neighbours"""
    files = sorted(files)
    out = []
    for i, (root, rel) in enumerate(files):
        lo = 0 if i == 0 else (files[i - 1][0] + root) // 2 + 1
        hi = 127 if i == len(files) - 1 else (root + files[i + 1][0]) // 2
        out.append({"root": root, "lo": lo, "hi": hi, "file": rel})
    return out



def pitch_fs(path, lo=60.0, hi=800.0, start=0.12, length=0.5):
    """fundamental (Hz) by normalised autocorrelation on a steady slice; None when unclear"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-t", f"{start + length:.2f}", "-f", "f32le", "-"], capture_output=True).stdout
    xs = struct.unpack("<%df" % (len(raw) // 4), raw)
    xs = xs[int(start * 8000):]
    if len(xs) < 800:
        return None
    mean = sum(xs) / len(xs)
    xs = [x - mean for x in xs]
    e0 = sum(x * x for x in xs) or 1e-9
    best, bl = 0.0, 0
    for lag in range(int(8000 / hi), min(int(8000 / lo), len(xs) // 2)):
        c = sum(xs[i] * xs[i + lag] for i in range(0, len(xs) - lag)) / e0
        if c > best:
            best, bl = c, lag
    if best < 0.35 or bl == 0:
        return None
    return 8000 / bl


def onsets(path, seconds=2.0):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "8000", "-t", f"{seconds}", "-f", "f32le", "-"], capture_output=True).stdout
    xs = struct.unpack("<%df" % (len(raw) // 4), raw)
    fr = 160  # 20 ms
    en = [math.sqrt(sum(x * x for x in xs[i:i + fr]) / fr) for i in range(0, len(xs) - fr, fr)]
    n, last = 0, -10
    for i in range(2, len(en)):
        if en[i] > 1.6 * max(en[i - 1], en[i - 2], 1e-4) and en[i] > 0.15 * max(en) and i - last > 6:
            n += 1
            last = i
    return n


def midi_of_hz(f):
    return 69 + 12 * math.log2(f / 440)


def build_freesound(man, ledger_fs):
    led = json.load(open(os.path.join(FS, "freesound-ledger.json")))
    by = {}
    for r in led:
        by.setdefault(r["instrument"], []).append(r)

    def enc(r, slug, limit):
        src = os.path.join(FS, r["file"])
        rel = f"{slug}/{r['instrument'].lower()}_{r['id']}.mp3"
        encode(src, os.path.join(OUT, rel), limit)
        ledger_fs.append({"instrument": slug.upper(), "file": rel, "source": r["page"], "author": r["author"], "licence": r["licence"], "title": r["name"]})
        return rel

    def zones_from(rows, limit, slug, lo=60.0, hi=800.0, one_onset=False):
        got = {}
        for r in rows:
            path = os.path.join(FS, r["file"])
            if one_onset and onsets(path, 1.6) > 1:
                continue
            f = pitch_fs(path, lo, hi)
            if not f:
                continue
            m = midi_of_hz(f)
            k = round(m)
            if k not in got or abs(m - k) < abs(got[k][0] - k):
                got[k] = (m, r)
        zs = []
        ks = sorted(got)
        for i, k in enumerate(ks):
            m, r = got[k]
            lo_ = 0 if i == 0 else (ks[i - 1] + k) // 2 + 1
            hi_ = 127 if i == len(ks) - 1 else (k + ks[i + 1]) // 2
            zs.append({"root": round(m, 2), "lo": lo_, "hi": hi_, "file": enc(r, slug, limit)})
        return zs

    saz = zones_from(by.get("SAZ", []), 2.4, "saz", 80, 700)
    if len(saz) >= 6:
        man["instruments"]["SAZ"] = {"zones": saz, "release": 0.45, "gain": 1.3, "maxShift": 7}
    oud = zones_from(by.get("OUD", []) + by.get("OUD_MOTIF", []), 2.4, "oud", 50, 400, one_onset=True)
    if len(oud) >= 3:
        man["instruments"]["OUD"] = {"zones": oud, "release": 0.5, "gain": 1.5, "maxShift": 7}
    ney = zones_from(by.get("NEY", []), 3.0, "ney", 180, 1200)
    if ney:
        man["instruments"]["NEY"] = {"zones": ney, "sustained": True, "release": 0.4, "gain": 1.6, "loop": [0.9, 2.2], "maxShift": 6}
    dk = by.get("DARBUKA", [])
    if dk and "DARBUKA" in man["instruments"]:
        rel = enc(dk[0], "darbuka", 1.3)
        zs = man["instruments"]["DARBUKA"]["zones"]
        for z in zs:
            if z.get("vel", [0, 0])[0] >= 0.72:
                z["file"] = rel  # the open dum, from a real darbuka
    return man


def main():
    man = {"name": "VSCO 2 Community Edition (CC0), lite", "instruments": {}}
    ledger = []
    cache = {}

    def make(inst, srcrel, limit, slug):
        key = (srcrel, limit)
        if key not in cache:
            rel = f"{slug}/{os.path.splitext(os.path.basename(srcrel))[0].replace('#', 's').replace(' ', '_')}.mp3"  # no # (a URL fragment) in names
            encode(os.path.join(SRC, srcrel), os.path.join(OUT, rel), limit)
            cache[key] = rel
            ledger.append({"instrument": inst, "file": rel, "source": f"sgossner/VSCO-2-CE/{srcrel}", "licence": "CC0 1.0"})
        return cache[key]

    for inst, (prefix, kind) in SPEC.items():
        files = []
        for root_dir, _, names in os.walk(os.path.join(SRC, prefix)):
            for nm in names:
                if nm.endswith(".wav"):
                    full = os.path.join(root_dir, nm)
                    files.append(os.path.relpath(full, SRC))
        by = {}
        for rel in sorted(files):
            m = midi(rel)
            if m is not None and m not in by:
                by[m] = rel
        limit = {"sus": SUS_LEN, "pizz": 1.6, "harp": 3.2, "bell": 3.0}[kind]
        slug = inst.lower()
        zs = [(m, make(inst, rel, limit, slug)) for m, rel in by.items()]
        entry = {"zones": zones_for(zs)}
        if kind == "sus":
            entry.update({"sustained": True, "release": 0.4, "loop": LOOP})
        elif kind == "pizz":
            entry.update({"release": 0.3})
        else:
            entry.update({"release": 0.5})
        man["instruments"][inst] = entry

    for inst, rel in UNPITCHED.items():
        f = make(inst, rel, 3.5, "perc")
        man["instruments"][inst] = {"zones": [{"root": 60, "lo": 0, "hi": 127, "file": f}], "unpitched": True, "release": 0.3}

    # darbuka: dum (deep), tek (open), ka (finger tap) by how hard it is struck — velocity layers, unpitched
    dk = [("Percussion/Quinto-Tap1_v1_rr1_Sum.wav", 0.0, 0.42), ("Percussion/Quinto-HitN_v2_rr1_Sum.wav", 0.42, 0.72), ("Percussion/Tumba-HitN_v3_rr1_Sum.wav", 0.72, 1.0)]
    if all(os.path.exists(os.path.join(SRC, r)) for r, _, _ in dk):
        zs = []
        for rel, lo, hi in dk:
            zs.append({"root": 60, "lo": 0, "hi": 127, "file": make("DARBUKA", rel, 1.8, "darbuka"), "vel": [lo, hi]})
        man["instruments"]["DARBUKA"] = {"zones": zs, "unpitched": True, "release": 0.25}
    # def / bendir stand-in: the conga heel + tap, unpitched
    cg = [("Percussion/Conga-Tap1_v1_rr1_Sum.wav", 0.0, 0.5), ("Percussion/Conga-HitN_v2_rr1_Sum.wav", 0.5, 1.0)]
    if all(os.path.exists(os.path.join(SRC, r)) for r, _, _ in cg):
        man["instruments"]["CONGA"] = {"zones": [{"root": 60, "lo": 0, "hi": 127, "file": make("CONGA", r, 1.8, "darbuka"), "vel": [a, b]} for r, a, b in cg], "unpitched": True, "release": 0.25}

    # Turkish / Middle-Eastern voices, made from real recordings: detuned copies, a bend, a filter, a vibrato
    man["instruments"]["KANUN"] = {"use": "HARP", "zones": [], "layers": [{"detune": -9, "gain": 0.55}, {"detune": 0, "gain": 0.8}, {"detune": 9, "gain": 0.55}],
                                   "filter": {"type": "highpass", "freq": 280, "q": 0.7}, "release": 0.4, "gain": 0.5}
    man["instruments"]["SAZ"] = {"use": "VIOLA_PIZZ", "zones": [], "layers": [{"detune": -6, "gain": 0.6}, {"detune": 6, "gain": 0.6}, {"detune": 1200, "gain": 0.16}],
                                 "filter": {"type": "peaking", "freq": 1300, "q": 0.9, "gain": 7}, "glide": {"semitones": 1.2, "sec": 0.07}, "release": 0.4, "gain": 1.6}
    man["instruments"]["OUD"] = {"use": "CELLO_PIZZ", "zones": [], "layers": [{"detune": 0, "gain": 0.8}, {"detune": -5, "gain": 0.4}, {"detune": 1200, "gain": 0.3}],
                                 "filter": {"type": "lowpass", "freq": 3000, "q": 0.7}, "glide": {"semitones": 0.8, "sec": 0.05}, "release": 0.4, "gain": 1.7}
    man["instruments"]["NEY"] = {"use": "FLUTE", "zones": [], "sustained": True, "layers": [{"detune": 0, "gain": 0.9}, {"detune": 4, "gain": 0.25}],
                                 "filter": {"type": "lowpass", "freq": 3400, "q": 0.6}, "vibrato": {"rate": 4.6, "cents": 26, "after": 0.35}, "release": 0.4, "gain": 2.8, "loop": LOOP}

    tz = []
    for rel in TIMPANI:
        if os.path.exists(os.path.join(SRC, rel)):
            tz.append((pitch_of(os.path.join(SRC, rel)), make("TIMP", rel, 3.0, "timp")))
    if tz:
        man["instruments"]["TIMP"] = {"zones": zones_for(tz), "release": 0.5}

    ledger_fs = []
    if FS and os.path.exists(os.path.join(FS, "freesound-ledger.json")):
        build_freesound(man, ledger_fs)
        json.dump(ledger_fs, open(os.environ.get("LEDGER_FS", "docs/music-pack-freesound-ledger.json"), "w"), indent=1)
    json.dump(man, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    json.dump(ledger, open(os.environ.get("LEDGER", "docs/music-pack-lite-ledger.json"), "w"), indent=1)  # not shipped with the pack
    size = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(OUT) for f in fs if f.endswith(".mp3"))
    print(f"{len(ledger)} files, {size/1e6:.1f} MB, instruments: {', '.join(man['instruments'])}")


main()
