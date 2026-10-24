#!/usr/bin/env python3
"""
Second batch for the world pack, appended to the pack that build_world_pack.py made:
  1. NSynth (Google Magenta, CC BY 4.0): guitars, electric keyboards, organs, basses. The pitch is a label of the data set.
  2. Makam scale runs (CompMusic recordings by ajaysm, CC BY) cut into single notes: ney, kemençe, bağlama.
  3. The bağlama notes of fcerim (CC0) that the lite pack does not use yet.
  .venv-music/bin/python scripts/samples/build_extra_pack.py NSYNTH_TEST_DIR MAKAM_FETCH_DIR PACK_DIR
"""
import json, os, re, subprocess, sys
import librosa, numpy as np
from build_world_pack import encode, measure, rms, zones_for, LIMIT, duration  # noqa: E402

NS, MK, PACK = (sys.argv[1:4] + [None] * 3)[:3]  # generate_tulum_ai.py imports segments()/cut() from here
NS_PAGE = "https://magenta.tensorflow.org/datasets/nsynth"
FAMILIES = {("guitar", "acoustic"): ("GUITAR_AC", "pluck"), ("guitar", "electronic"): ("GUITAR_EL", "pluck"),
            ("keyboard", "electronic"): ("EKEYS", "pluck"), ("keyboard", "acoustic"): ("KEYS_AC", "pluck"),
            ("organ", "electronic"): ("ORGAN_EL", "sus"), ("bass", "electronic"): ("BASS_EL", "pluck")}

def nsynth(manifest, used, report):
    ex = json.load(open(os.path.join(NS, "examples.json")))
    by = {}
    for note, v in ex.items():
        k = (v["instrument_family_str"], v["instrument_source_str"])
        if k in FAMILIES:
            by.setdefault(v["instrument_str"], []).append((note, v))
    for inst, rows in sorted(by.items()):
        short, kind = FAMILIES[(rows[0][1]["instrument_family_str"], rows[0][1]["instrument_source_str"])]
        name = f"NS_{short}_{inst.rsplit('_', 1)[1]}"
        per = {}
        for note, v in rows:  # one file per pitch: the velocity closest to 75
            best = per.get(v["pitch"])
            if best is None or abs(v["velocity"] - 75) < abs(best[1]["velocity"] - 75):
                per[v["pitch"]] = (note, v)
        pitches = sorted(per)
        if len(pitches) < 5:
            report["dropped"].append({"file": inst, "why": f"only {len(pitches)} pitches in the NSynth test set"})
            continue
        step = max(1, len(pitches) / 10)
        pick = [pitches[int(i * step)] for i in range(min(10, len(pitches)))]
        items = []
        for p in pick:
            note, v = per[p]
            rel = f"{name.lower()}/{note}.mp3"
            keep = encode(os.path.join(NS, "audio", note + ".wav"), os.path.join(PACK, rel), LIMIT[kind])
            items.append({"root": p, "file": rel, "len": keep})
            used.append({"instrument": name, "file": rel, "source": NS_PAGE, "author": "Google Inc. (Magenta NSynth)", "licence": "CC BY",
                         "title": f"{note} ({', '.join(v['qualities_str']) or 'no tags'})"})
        inst_def = {"zones": zones_for(items), "release": 0.5 if kind == "pluck" else 0.4}
        if kind == "sus":
            inst_def.update({"sustained": True, "loop": [0.9, 2.4]})
        manifest["instruments"][name] = inst_def
        print(f"{name:22} {len(items):2} notes  {min(pitches)}–{max(pitches)}")

def segments(path):
    """notes of a scale run: [(t0, t1, root)] where the pitch holds steady for >= 0.3 s"""
    y, sr = librosa.load(path, sr=22050, mono=True)
    hop = 256
    f0, ok, _ = librosa.pyin(y, fmin=70, fmax=1300, sr=sr, frame_length=2048, hop_length=hop)
    m = np.where(ok & ~np.isnan(f0), librosa.hz_to_midi(np.nan_to_num(f0, nan=100.0)), np.nan)
    t = lambda i: i * hop / sr
    segs, start, buf, gap = [], None, [], 0
    for i, x in enumerate(m):
        if np.isnan(x):
            gap += 1
            if gap > 3 and start is not None:
                segs.append((start, i - gap, buf)); start, buf = None, []
            continue
        gap = 0
        if start is not None and abs(x - np.median(buf)) > 0.6:
            segs.append((start, i - 1, buf)); start, buf = None, []
        if start is None:
            start = i
        buf.append(x)
    if start is not None:
        segs.append((start, len(m) - 1, buf))
    out = []
    for a, b, buf in segs:
        if t(b) - t(a) >= 0.3 and np.std(buf) < 0.35:
            out.append((t(a), t(b), float(np.median(buf))))
    return out

def cut(src, dst, t0, t1):
    length = min(t1 - t0 + 0.25, 3.0)
    f = min(0.3, length / 3)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0, t0 - 0.03):.3f}", "-i", src, "-t", f"{length:.3f}", "-ac", "1", "-ar", "44100",
                    "-af", f"highpass=f=30,loudnorm=I=-26:TP=-3:LRA=11,afade=t=in:d=0.02,afade=t=out:st={length - f:.3f}:d={f:.3f}",
                    "-c:a", "libmp3lame", "-b:a", "80k", dst], check=True)
    return length

def makam(manifest, used, report):
    led = {l["id"]: l for l in json.load(open(os.path.join(MK, "ledger.json")))}
    # recording -> manifest instrument (what the recording says it is played on)
    plan = [(194637, "NEY_MAKAM"), (194639, "KEMENCE_MAKAM"), (194700, "KEMENCE_MAKAM"), (194638, "BAGLAMA_MAKAM")]
    for sid, name in plan:
        l = led[sid]
        src = os.path.join(MK, l["file"])
        found = segments(src)
        items = manifest["instruments"].get(name, {}).get("zones", [])
        for t0, t1, root in sorted(found, key=lambda s: -(s[1] - s[0])):
            if any(abs(z["root"] - root) < 0.5 for z in items):
                continue
            rel = f"{name.lower()}/{sid}_{int(t0 * 100):05d}.mp3"
            cut(src, os.path.join(PACK, rel), t0, t1)
            items.append({"root": root, "file": rel})
            used.append({"instrument": name, "file": rel, "source": l["page"], "author": l["author"], "licence": l["licence"], "title": f"{l['title']} ({t0:.1f}s)"})
        print(f"{name:16} from {l['title'][:26]:26} {len(found):2} notes found")
        if items:
            manifest["instruments"][name] = {"zones": zones_for(items), "release": 0.4}

def fcerim(manifest, used, report):
    led = [l for l in json.load(open(os.path.join(MK, "ledger.json"))) if l["group"] == "fcerim"]
    items = []
    for l in led:
        src = os.path.join(MK, l["file"])
        med, spread, n = measure(src)
        if med is None or spread > 1.0:
            report["dropped"].append({"file": l["file"], "why": f"no steady pitch ({spread:.1f})"}); continue
        if any(abs(z["root"] - med) < 0.4 for z in items):
            continue
        rel = f"baglama_extra/{l['file']}"
        encode(src, os.path.join(PACK, rel), LIMIT["pluck"])
        items.append({"root": med, "file": rel})
        used.append({"instrument": "BAGLAMA_EXTRA", "file": rel, "source": l["page"], "author": l["author"], "licence": l["licence"], "title": l["title"]})
    if items:
        manifest["instruments"]["BAGLAMA_EXTRA"] = {"zones": zones_for(items), "release": 0.5}
    print(f"{'BAGLAMA_EXTRA':16} {len(items)} notes (of {len(led)})")

def main():
    manifest = json.load(open(os.path.join(PACK, "manifest.json")))
    used = json.load(open(os.path.join(PACK, "ledger.json")))
    report = json.load(open(os.path.join(PACK, "report.json")))
    nsynth(manifest, used, report)
    makam(manifest, used, report)
    fcerim(manifest, used, report)
    json.dump(manifest, open(os.path.join(PACK, "manifest.json"), "w"), indent=1)
    json.dump(used, open(os.path.join(PACK, "ledger.json"), "w"), indent=1)
    json.dump(report, open(os.path.join(PACK, "report.json"), "w"), indent=1)
    by = {}
    for u in used:
        if u["licence"] == "CC BY":
            by.setdefault(u["author"], []).append(u)
    with open(os.path.join(PACK, "credits-ccby.md"), "w") as f:
        f.write("# CC BY credits for the world pack (add to /credits.html)\n\nEvery other file is CC0 1.0 (Freesound CC0 sounds, VCSL by Versilian Studios).\n\n")
        for a, us in sorted(by.items(), key=lambda x: x[0].lower()):
            if a.startswith("Google"):
                f.write(f"- **{a}** (CC BY 4.0): the NSynth data set, {NS_PAGE} — {len(us)} notes\n")
            else:
                f.write(f"- **{a}** (Freesound, CC BY): " + "; ".join(f"[{u['title']}]({u['source']})" for u in us[:12]) + ("; …" if len(us) > 12 else "") + "\n")
    print(f"\n{len(used)} files in pack, {len(by)} CC BY authors/sources")

if __name__ == "__main__":
    main()
