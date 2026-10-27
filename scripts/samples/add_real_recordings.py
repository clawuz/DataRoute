#!/usr/bin/env python3
"""
Add the real recordings of bansuri, sarangi, zurna, sitar, ney and kemençe (Freesound previews, fetched by hand into
.corpora/samples-new/<group>/<id>.mp3 with .corpora/samples-new/ledger.json) to the staged world pack.
  .venv-music/bin/python scripts/samples/add_real_recordings.py .corpora/samples-new tmp-music-v1/pack-full
then export as usual (scripts/samples/export_world_pack.py) and rebuild docs/credits.html (make_credits.py).

Every file is read with pyin (librosa) and cut into notes where the pitch holds: a stretch of at least 0.25 s whose frames stay
within 40 cents of its median. Each note becomes a zone with its MEASURED pitch as the root. A file whose stable stretches are
not a single note (a strum of the sitar's sympathetic strings, a sound effect) gives no zone and is listed in the report.
Non-commercial (CC BY-NC) sounds are flagged `nc: true` in the ledger: a deploy that includes them needs the owner's explicit yes.
"""
import json, os, subprocess, sys
import librosa, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from prune_pack import credits, respread  # noqa: E402

SRC, PACK = sys.argv[1:3]
# fetch group -> (manifest name, kind, plausible MIDI range of the instrument's played notes)
GROUPS = {
    "bansuri": ("BANSURI", "sus", (55, 91)),
    "sarangi": ("SARANGI", "sus", (50, 86)),
    "zurna": ("ZURNA", "sus", (58, 93)),
    "sitar_nc": ("SITAR", "pluck", (48, 84)),
    "ney_nc": ("NEY_REAL", "sus", (50, 90)),
    "kemence_nc": ("KEMENCE_REAL", "sus", (55, 86)),
}
LICENCE = {  # deed url -> (ledger licence label, non-commercial)
    "creativecommons.org/publicdomain/zero/1.0": ("CC0 1.0", False),
    "creativecommons.org/licenses/by/3.0": ("CC BY", False),
    "creativecommons.org/licenses/by/4.0": ("CC BY", False),
    "creativecommons.org/licenses/by-nc/3.0": ("CC BY-NC", True),
    "creativecommons.org/licenses/by-nc/4.0": ("CC BY-NC", True),
}
SR, HOP = 22050, 256
MIN_SEC, STABLE = 0.25, 0.40  # a note: >= 0.25 s, every kept frame within 40 cents of the note's median
MAX_SEC = {"sus": 3.0, "pluck": 4.0}
MAX_ZONES = 6
MIN_HOLD = 0.4  # a zone of a sustained instrument: the note holds at least this long (shorter ones play the tune staccato)
LOOP_FROM = 0.2
FADE = 0.12

def deed(url):
    u = url.split("://", 1)[1].rstrip("/")
    if u not in LICENCE:
        sys.exit(f"unknown licence {url}")
    return LICENCE[u]

def track(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    f0, ok, _ = librosa.pyin(y, fmin=60, fmax=1600, sr=SR, frame_length=2048, hop_length=HOP)
    m = np.where(ok & ~np.isnan(f0), librosa.hz_to_midi(np.nan_to_num(f0, nan=100.0)), np.nan)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0][: len(m)]
    return y, m, rms

def stable(a):
    """[(i, j)] windows of `a` (indices, j inclusive) in which every frame is within STABLE semitones of the window's centre, longest first:
    the longest such window, then the same search on what is left on either side of it"""
    if len(a) < 2:
        return []
    best, bi = (0, -1), 0
    for i in range(len(a)):
        lo = hi = a[i]
        j = i
        while j + 1 < len(a) and max(hi, a[j + 1]) - min(lo, a[j + 1]) <= 2 * STABLE:
            j += 1
            lo, hi = min(lo, a[j]), max(hi, a[j])
        if j - i > best[1] - best[0]:
            best = (i, j)
    i, j = best
    if j <= i:
        return []
    return [(i, j)] + stable(a[:i]) + [(i2 + j + 1, j2 + j + 1) for i2, j2 in stable(a[j + 1:])]

def notes(m, rms):
    """[(t0, t1, root)]: runs of voiced, loud frames (gaps of 3 frames bridged, split where the pitch jumps by more than half a
    semitone between frames), cut into windows that hold within STABLE semitones for at least MIN_SEC; root = the window's median"""
    t = lambda i: i * HOP / SR
    loud = rms > 0.1 * rms.max()  # -20 dB under the loudest moment: tails and breaths are not notes
    runs, cur, gap = [], [], 0
    for i, x in enumerate(m):
        if np.isnan(x) or not loud[i]:
            gap += 1
            if gap > 3 and cur:
                runs.append(cur); cur = []
            continue
        gap = 0
        if cur and abs(x - m[cur[-1]]) > 0.5:
            runs.append(cur); cur = []
        cur.append(i)
    if cur:
        runs.append(cur)
    out = []
    for run in runs:
        a = m[run]
        for i, j in stable(list(a)):
            if t(run[j]) - t(run[i]) >= MIN_SEC:
                out.append((t(run[i]), t(run[j]), float(np.median(a[i:j + 1]))))
    return sorted(out)

def harmonic(y, t0, t1, root):
    """the share of the spectrum's energy (60 Hz to 4 kHz) that sits on the harmonics of `root`, and whether the fundamental or the
    octave is audible at all (a strum of several strings has energy everywhere and often no fundamental under the pitch heard)"""
    seg = y[int(t0 * SR): int(t1 * SR)]
    if len(seg) < 512:
        return 0.0, False
    n = 1 << 15
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=n)) ** 2
    fr = np.fft.rfftfreq(n, 1 / SR)
    band = (fr > 60) & (fr < 4000)
    f0 = librosa.midi_to_hz(root)
    k = np.round(fr / f0)
    on = band & (k >= 1) & (np.abs(fr - k * f0) < f0 * 0.03)
    share = float(S[on].sum() / max(S[band].sum(), 1e-12))
    low = band & (k <= 2) & on
    audible = float(S[low].max() if low.any() else 0.0) > 0.01 * float(S[band].max())
    return share, audible

def cut(src, dst, t0, length):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    f = min(FADE, length / 3)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t0:.3f}", "-i", src, "-t", f"{length:.3f}", "-ac", "1", "-ar", "44100",
                    "-af", f"highpass=f=30,loudnorm=I=-26:TP=-3:LRA=11,afade=t=in:d=0.02,afade=t=out:st={length - f:.3f}:d={f:.3f}",
                    "-c:a", "libmp3lame", "-b:a", "80k", dst], check=True)

def main():
    rows = json.load(open(os.path.join(SRC, "ledger.json")))
    man = json.load(open(os.path.join(PACK, "manifest.json")))
    led = json.load(open(os.path.join(PACK, "ledger.json")))
    names = {v[0] for v in GROUPS.values()}
    for n in names:  # re-runnable: the earlier result of this script is replaced
        old = man["instruments"].pop(n, None)
        for z in (old or {}).get("zones", []):
            try:
                os.remove(os.path.join(PACK, z["file"]))
            except FileNotFoundError:
                pass
    led = [l for l in led if l["instrument"] not in names]
    report = {"instruments": {}, "unused": [], "segments": []}
    by = {}
    for r in rows:
        by.setdefault(r["group"], []).append(r)
    for group, (name, kind, (lo, hi)) in GROUPS.items():
        cands = []
        for r in by.get(group, []):
            src = os.path.join(SRC, group, os.path.basename(r["file"]))
            y, m, rms = track(src)
            found = notes(m, rms)
            good, why = [], []
            for t0, t1, root in found:
                share, audible = harmonic(y, t0, t1, root)
                row = {"file": r["file"], "t0": round(t0, 2), "t1": round(t1, 2), "root": round(root, 2), "harmonic": round(share, 2)}
                if not lo <= root <= hi:
                    row["why"] = f"pitch {root:.1f} is outside the {name} range {lo}-{hi} (a sub-harmonic of several strings)"
                elif not audible or share < 0.5:
                    row["why"] = f"not one note: {share:.0%} of the energy on its harmonics, fundamental audible: {audible}"
                report["segments"].append(row)
                (why if "why" in row else good).append(row)
            if kind == "pluck":
                # a plucked note is its onset and ring: one note per file, from the first stable stretch, cut from the attack
                good = good[:1]
            else:
                for g in good:
                    if g["t1"] - g["t0"] < MIN_HOLD:
                        g["skipped"] = f"shorter than {MIN_HOLD} s: too short to hold a note of the tune"
                good = [g for g in good if "skipped" not in g]
            if not good:
                report["unused"].append({"file": r["file"], "id": r["id"], "instrument": name,
                                         "why": why[0]["why"] if why else f"no note that holds within {STABLE * 100:.0f} cents for {MIN_HOLD if kind == 'sus' else MIN_SEC} s (a phrase, a tremolo, a glide or noise)"})
            for g in good:
                cands.append((r, src, g))
        zones = []
        for r, src, g in sorted(cands, key=lambda c: -(c[2]["t1"] - c[2]["t0"])):
            if any(abs(z["root"] - g["root"]) < 1.0 for z in zones) or len(zones) >= MAX_ZONES:
                g["skipped"] = "same pitch (within a semitone) as a longer note" if len(zones) < MAX_ZONES else "enough zones"
                continue
            t0 = max(0.0, g["t0"] - (0.06 if kind == "pluck" else 0.0))
            length = round(min(g["t1"] - t0 + (2.0 if kind == "pluck" else 0.0), MAX_SEC[kind]), 3)
            rel = f"{name.lower()}/{r['id']}_{int(g['t0'] * 100):04d}.mp3"
            cut(src, os.path.join(PACK, rel), t0, length)
            label, nc = deed(r["license"])
            z = {"root": g["root"], "file": rel}
            end = round(length - FADE - 0.05, 2)
            if kind == "sus" and end - LOOP_FROM >= 0.4:  # its own loop: at least 0.4 s of the steady part, before the fade
                z["loop"] = [LOOP_FROM, end]
            zones.append(z)
            row = {"instrument": name, "file": rel, "source": r["url"], "author": r["author"], "licence": label,
                   "title": f"{r['name']} ({g['t0']:.1f}s)", "licence_url": r["license"].replace("http://", "https://", 1).rstrip("/") + "/"}
            if nc:
                row["nc"] = True
            led.append(row)
            g["zone"] = rel
            g["seconds"] = length
        for r in by.get(group, []):
            if not any(g[2]["file"] == r["file"] and "zone" in g[2] for g in cands) and not any(u["file"] == r["file"] for u in report["unused"]):
                report["unused"].append({"file": r["file"], "id": r["id"], "instrument": name, "why": "its notes are already covered by longer notes of other files"})
        if not zones:
            report["instruments"][name] = {"zones": 0}
            print(f"{name:13} no zone")
            continue
        inst = {"zones": respread(zones), "release": 0.5 if kind == "pluck" else 0.4}
        if kind == "sus":
            inst["sustained"] = True
        man["instruments"][name] = inst
        report["instruments"][name] = {"zones": len(zones), "roots": [z["root"] for z in inst["zones"]], "loops": [z.get("loop") for z in inst["zones"]], "thin": len(zones) < 3}
        print(f"{name:13} {len(zones)} zones  " + "  ".join(f"{z['root']}[{z['lo']}-{z['hi']}]{' loop' if 'loop' in z else ''}" for z in inst["zones"]))
    for u in report["unused"]:
        print(f"  unused {u['file']}: {u['why']}")
    json.dump(man, open(os.path.join(PACK, "manifest.json"), "w"), indent=1)
    json.dump(led, open(os.path.join(PACK, "ledger.json"), "w"), indent=1)
    json.dump(report, open(os.path.join(PACK, "report-real.json"), "w"), indent=1)
    credits(PACK)

if __name__ == "__main__":
    main()
