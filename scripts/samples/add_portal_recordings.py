#!/usr/bin/env python3
"""
Add the Black Sea kemençe and the tulum from the Turkish Music Portal (Türk Kültür Vakfı) to the staged world pack.
  .venv-music/bin/python scripts/samples/add_portal_recordings.py .corpora/samples-new/portal tmp-music-v1/pack-full
then export as usual (scripts/samples/export_world_pack.py) and rebuild docs/credits.html (make_credits.py).

RESTRICTED TERMS. The two recordings ("Kemençe Ses Örneği", "Tulum Ses Örneği") belong to Türk Kültür Vakfı. The portal's
"Telif Hakkı ve Gizlilik" page allows personal, non-commercial, educational or research use, forbids modifying the content and
asks for written permission for any other use. The owner of this project accepted that risk for the local pack; every file cut
here carries `restricted: true, nc: true, terms: ...` in the ledger, a mark on docs/credits.html, and must not be deployed without
the foundation's written permission.

Both recordings are tunes, not single notes, and both sound two pitches at once much of the time: the kemençe is bowed on two
strings a fourth apart (pyin then hears their common sub-harmonic, two octaves under the lower string) and the tulum's two pipes
often hold A4 under the melody. The notes are cut as in add_real_recordings.py (pyin, a stretch that holds within 40 cents), and
each stable stretch is classified:
  single  pyin's pitch lies in the instrument's range and most of the energy sits on its harmonics (80 %, or 50 % with no other
          note under it): one note, root = that pitch
  dyad    pyin's pitch lies below the range (a sub-harmonic) and the spectrum shows exactly two notes a fourth or a fifth apart:
          root = the UPPER (melody) note, measured frame by frame from its spectral peak. A dyad is used only where no single note covers that pitch, so the zones keep as many
          single notes as the material allows and the rest carry the instrument's own two-voice sound.
"""
import json, os, sys
import librosa, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from prune_pack import credits, respread  # noqa: E402
import add_real_recordings as R  # noqa: E402  (reads SRC, PACK from argv like this script)

SRC, PACK = sys.argv[1:3]
SOURCE = {
    "kemence": ("KEMENCE_KARADENIZ", "http://www.turkishmusicportal.org/tr/calgilar/turk-halk-muzigi-kemence", "Kemençe Ses Örneği", (60, 86)),
    "tulum": ("TULUM", "http://www.turkishmusicportal.org/tr/calgilar/turk-halk-muzigi-tulumlu-uflemeliler", "Tulum Ses Örneği", (60, 86)),
}
AUTHOR = "Türk Kültür Vakfı (Turkish Music Portal)"
LICENCE = "Restricted: Türk Kültür Vakfı terms"
TERMS_URL = "http://www.turkishmusicportal.org/tr/sayfa/telif-hakki-ve-gizlilik"
TERMS = ("Content owned by Türk Kültür Vakfı; personal non-commercial educational/research use only; the content must not be "
         "modified; any other use needs the foundation's written permission. Not to be deployed without that permission.")
MAX_ZONES = 6
MIN_HOLD = 0.4

def peaks(y, t0, t1, lo=250, hi=1100, floor_db=-15):
    """the spectral peaks (MIDI, parabolic-interpolated) of a stretch between lo and hi Hz, louder than floor_db under the loudest,
    with the 2nd and 3rd harmonics of a lower peak removed: the notes that sound"""
    seg = y[int(t0 * R.SR): int(t1 * R.SR)]
    n = 1 << 16
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=n))
    fr = np.fft.rfftfreq(n, 1 / R.SR)
    i0, i1 = np.searchsorted(fr, lo), np.searchsorted(fr, hi)
    s = S[i0:i1]
    top = s.max()
    out = []
    for i in range(2, len(s) - 2):
        if s[i] >= s[i - 1] and s[i] > s[i + 1] and s[i] >= top * 10 ** (floor_db / 20) and s[i] == s[max(0, i - 30): i + 31].max():
            a, b, c = np.log(s[i - 1:i + 2] + 1e-12)
            d = 0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c else 0.0
            out.append(float(librosa.hz_to_midi(fr[i0 + i] + d * (fr[1] - fr[0]))))
    notes = []
    for m in sorted(out):
        if any(abs(m - (k + 12 * np.log2(h))) < 0.45 for k in notes for h in (2, 3)):
            continue
        notes.append(m)
    return notes

def refine(y, t0, t1, guess):
    """the median, over 93 ms frames, of the spectral peak within 60 cents of `guess`: a long FFT over a whole stretch smears a note
    with vibrato or beating into two peaks, the frame-wise median does not"""
    n, hop = 4096, 512
    seg = y[int(t0 * R.SR): int(t1 * R.SR)]
    fr = np.fft.rfftfreq(1 << 15, 1 / R.SR)
    win = (fr > librosa.midi_to_hz(guess - 0.6)) & (fr < librosa.midi_to_hz(guess + 0.6))
    idx = np.where(win)[0]
    got = []
    for i in range(0, len(seg) - n, hop):
        S = np.abs(np.fft.rfft(seg[i:i + n] * np.hanning(n), n=1 << 15))
        k = idx[np.argmax(S[idx])]
        a, b, c = np.log(S[k - 1:k + 2] + 1e-12)
        d = 0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c else 0.0
        got.append(float(librosa.hz_to_midi(fr[k] + d * (fr[1] - fr[0]))))
    return float(np.median(got)) if got else guess

def segments(name, path, lo, hi):
    y, m, rms = R.track(path)
    rows = []
    for t0, t1, root in R.notes(m, rms):
        if t1 - t0 < MIN_HOLD:
            continue
        share, audible = R.harmonic(y, t0, t1, root)
        ps = peaks(y, t0, t1)
        row = {"t0": round(t0, 2), "t1": round(t1, 2), "pyin": round(root, 2), "harmonic": round(share, 2), "peaks": [round(p, 2) for p in ps]}
        others = [p for p in ps if abs(p - root) > 0.45]
        if lo <= root <= hi and audible and (share >= 0.8 or (share >= 0.5 and not [p for p in others if p < root])):
            row.update(kind="single", root=round(root, 2))
        elif root < lo and len(ps) == 2 and 4.5 <= ps[1] - ps[0] <= 7.5 and lo <= ps[1] <= hi:
            # a fourth or a fifth (pyin hears their common sub-harmonic): the upper note is the melody
            row.update(kind="dyad", root=round(refine(y, t0, t1, ps[1]), 2), lower=round(refine(y, t0, t1, ps[0]), 2))
        else:
            row.update(kind="none", why="neither one note nor a clean two-note sound (a slide, an ornament or more than two pitches)")
        rows.append(row)
    return rows

def main():
    man = json.load(open(os.path.join(PACK, "manifest.json")))
    led = json.load(open(os.path.join(PACK, "ledger.json")))
    names = {v[0] for v in SOURCE.values()}
    for n in names:  # re-runnable
        for z in (man["instruments"].pop(n, None) or {}).get("zones", []):
            try:
                os.remove(os.path.join(PACK, z["file"]))
            except FileNotFoundError:
                pass
    led = [l for l in led if l["instrument"] not in names]
    report = {}
    for key, (name, page, title, (lo, hi)) in SOURCE.items():
        src = os.path.join(SRC, f"{key}.mp3")
        rows = segments(name, src, lo, hi)
        zones = []
        # single notes first (longest first), then dyads where no single note lies within a semitone
        order = sorted([r for r in rows if r["kind"] == "single"], key=lambda r: r["t0"] - r["t1"]) + \
                sorted([r for r in rows if r["kind"] == "dyad"], key=lambda r: r["t0"] - r["t1"])
        for r in order:
            if any(abs(z["root"] - r["root"]) < 1.0 for z in zones) or len(zones) >= MAX_ZONES:
                r["skipped"] = "same pitch (within a semitone) as a zone already taken" if len(zones) < MAX_ZONES else "enough zones"
                continue
            length = round(min(r["t1"] - r["t0"], R.MAX_SEC["sus"]), 3)
            rel = f"{name.lower()}/portal_{int(r['t0'] * 100):05d}.mp3"
            R.cut(src, os.path.join(PACK, rel), r["t0"], length)
            z = {"root": r["root"], "file": rel}
            end = round(length - R.FADE - 0.05, 2)
            if end - R.LOOP_FROM >= 0.4:
                z["loop"] = [R.LOOP_FROM, end]
            zones.append(z)
            what = "one note" if r["kind"] == "single" else f"two notes, melody on top (lower {r['lower']})"
            led.append({"instrument": name, "file": rel, "source": page, "author": AUTHOR, "licence": LICENCE,
                        "title": f"{title} ({r['t0']:.1f}s, {what})", "licence_url": TERMS_URL, "nc": True, "restricted": True, "terms": TERMS})
            r["zone"], r["seconds"] = rel, length
        if len(zones) < 4:
            print(f"WARNING {name}: only {len(zones)} zones")
        man["instruments"][name] = {"zones": respread(zones), "release": 0.4, "sustained": True}
        report[name] = {"segments": rows, "zones": man["instruments"][name]["zones"]}
        print(f"{name:18} {len(zones)} zones  " + "  ".join(f"{z['root']}[{z['lo']}-{z['hi']}]{' loop' if 'loop' in z else ''}" for z in man["instruments"][name]["zones"]))
        for r in rows:
            print(f"   {r['t0']:7.2f}-{r['t1']:7.2f} {r['kind']:6} {r.get('root', r['pyin'])}{'  -> ' + r['zone'] if 'zone' in r else ''}{'  (' + r['skipped'] + ')' if 'skipped' in r else ''}")
    json.dump(man, open(os.path.join(PACK, "manifest.json"), "w"), indent=1)
    json.dump(led, open(os.path.join(PACK, "ledger.json"), "w"), indent=1)
    json.dump(report, open(os.path.join(PACK, "report-portal.json"), "w"), indent=1)
    credits(PACK)

if __name__ == "__main__":
    main()
