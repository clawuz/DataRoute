#!/usr/bin/env python3
"""
Measures the real pitch of the generated instrument samples (the model often lands an octave or more
off) and prints a table of wanted vs heard. With --rename, files are renamed to the note actually
heard (<inst>_<heard>.mp3, "_c" suffix kept off), so the manifest roots can be trusted.
  .venv-music/bin/python scripts/samples/measure-instrument-samples.py [--only=zurna,cura] [--rename]
"""
import glob, os, re, sys
import librosa, numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "tmp-music-v1", "instrument-samples")
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
ONLY = next((a.split("=")[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
RENAME = "--rename" in sys.argv

def name_to_midi(n):
    m = re.fullmatch(r"([A-G]#?)(-?\d)", n)
    return NAMES.index(m.group(1)) + 12 * (int(m.group(2)) + 1) if m else None

for inst in sorted(os.listdir(ROOT)):
    if inst.startswith(".") or (ONLY and inst not in ONLY):
        continue
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, inst, f"{inst}_*.mp3"))):
        want = re.search(r"_([^_]+)\.mp3$", f).group(1)
        want_m = name_to_midi(want)
        if want_m is None:  # unpitched hit
            continue
        y, sr = librosa.load(f, sr=22050)
        f0, _, _ = librosa.pyin(y, fmin=60, fmax=1400, sr=sr)
        f0 = f0[~np.isnan(f0)]
        if len(f0) < 3:
            out.append(f"{want}:?")
            continue
        m = int(round(librosa.hz_to_midi(np.median(f0))))
        heard = f"{NAMES[m % 12]}{m // 12 - 1}"
        out.append(f"{want}→{heard}({m - want_m:+d})")
        if RENAME and heard != want:
            dest = os.path.join(ROOT, inst, f"{inst}_{heard}.mp3")
            if os.path.exists(dest):
                dest = dest.replace(".mp3", f"_from{want}.mp3")
            os.rename(f, dest)
    if out:
        print(inst.ljust(8), "  ".join(out))
