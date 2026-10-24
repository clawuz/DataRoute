#!/usr/bin/env python3
"""
Add the Highland bagpipe chanter notes and the drone (IowaSpaceWizard on Freesound, CC0) to the world pack.
  .venv-music/bin/python scripts/samples/add_bagpipe.py FETCH_DIR PACK_DIR
The recordings are 31 s with the drones sounding under the chanter, so the pitch is measured only above 330 Hz (the chanter),
and the steady part from 2 s on is cut out and looped by the sampler.
"""
import json, os, re, subprocess, sys, urllib.request
import librosa, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from prune_pack import credits, respread  # noqa: E402

FETCH, PACK = sys.argv[1:3]
IDS = {527276: "Low A", 527269: "B", 527268: "C", 527275: "D", 527274: "E", 527273: "F", 527272: "High A"}
DRONE = 527270

def token():
    for line in open(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")):
        m = re.match(r"^FREESOUND_API_KEY=(.*)$", line.strip())
        if m:
            return m.group(1).strip().strip("\"'")
    sys.exit("no Freesound token")

def sound(sid):
    url = f"https://freesound.org/apiv2/sounds/{sid}/?fields=id,name,username,license,url,previews,duration&token={token()}"
    return json.load(urllib.request.urlopen(url, timeout=40))

def get(r):
    os.makedirs(FETCH, exist_ok=True)
    dst = os.path.join(FETCH, f"bagpipe_{r['id']}.mp3")
    if not os.path.exists(dst):
        with urllib.request.urlopen(r["previews"]["preview-hq-mp3"], timeout=60) as resp:
            open(dst, "wb").write(resp.read())
    return dst

def chanter_pitch(path):
    """the chanter's pitch: the most common pitch among the voiced frames above 330 Hz (the drones sit lower), and how much of the note it holds"""
    y, sr = librosa.load(path, sr=22050, mono=True, offset=3.0, duration=12.0)
    f0, ok, _ = librosa.pyin(y, fmin=330, fmax=1100, sr=sr, frame_length=4096)
    f0 = f0[ok & ~np.isnan(f0)]
    if len(f0) < 20:
        return None, 1.0
    m = librosa.hz_to_midi(f0)
    hist, edges = np.histogram(m, bins=np.arange(m.min() - 0.1, m.max() + 0.3, 0.2))
    centre = edges[np.argmax(hist)] + 0.1
    near = m[np.abs(m - centre) < 0.4]
    return float(np.median(near)), 1.0 - len(near) / len(m)  # second value: share of frames that are NOT on the main pitch

def cut(src, dst, start, length):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    f = 0.3
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-i", src, "-t", str(length), "-ac", "1", "-ar", "44100",
                    "-af", f"highpass=f=30,loudnorm=I=-26:TP=-3:LRA=11,afade=t=in:d=0.05,afade=t=out:st={length - f}:d={f}",
                    "-c:a", "libmp3lame", "-b:a", "80k", dst], check=True)

def main():
    man = json.load(open(os.path.join(PACK, "manifest.json")))
    led = json.load(open(os.path.join(PACK, "ledger.json")))
    led = [l for l in led if not l["instrument"].startswith("BAGPIPE")]
    zones = []
    for sid, label in IDS.items():
        r = sound(sid)
        src = get(r)
        root, spread = chanter_pitch(src)
        if root is None or spread > 0.5:
            print(f"  {label:7} dropped (off-pitch share {spread:.2f})")
            continue
        if label == "High A" and zones:
            low = min(z["root"] for z in zones)
            if abs(root - low) < 0.7:  # pyin took the sub-harmonic: the high A is an octave above the low A
                root += 12
                print(f"  {label:7} was heard an octave low, set to {root:.2f}")
        rel = f"bagpipe/chanter_{sid}.mp3"
        cut(src, os.path.join(PACK, rel), 2.0, 3.6)
        zones.append({"root": round(root, 2), "file": rel})
        led.append({"instrument": "BAGPIPE", "file": rel, "source": r["url"], "author": r["username"], "licence": "CC0 1.0", "title": r["name"]})
        print(f"  {label:7} root {root:.2f}  off-pitch {spread:.2f}")
    if zones:
        man["instruments"]["BAGPIPE"] = {"zones": respread(zones), "release": 0.35, "sustained": True, "loop": [0.7, 3.2]}
    r = sound(DRONE)
    src = get(r)
    y, sr = librosa.load(src, sr=22050, mono=True, offset=3.0, duration=6.0)
    f0, ok, _ = librosa.pyin(y, fmin=60, fmax=400, sr=sr, frame_length=4096)
    f0 = f0[ok & ~np.isnan(f0)]
    root = float(np.median(librosa.hz_to_midi(f0))) if len(f0) > 10 else 57.0
    rel = "bagpipe_drone/drone_527270.mp3"
    cut(src, os.path.join(PACK, rel), 3.0, 6.0)
    man["instruments"]["BAGPIPE_DRONE"] = {"zones": [{"root": round(root, 2), "lo": 0, "hi": 127, "file": rel}], "release": 0.5, "sustained": True, "loop": [1.0, 5.5], "maxShift": 3}
    led.append({"instrument": "BAGPIPE_DRONE", "file": rel, "source": r["url"], "author": r["username"], "licence": "CC0 1.0", "title": r["name"]})
    print(f"  drone   root {root:.2f}")
    json.dump(man, open(os.path.join(PACK, "manifest.json"), "w"), indent=1)
    json.dump(led, open(os.path.join(PACK, "ledger.json"), "w"), indent=1)
    print(credits(PACK))

main()
