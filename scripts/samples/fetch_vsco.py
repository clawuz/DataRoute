#!/usr/bin/env python3
"""
Fetch a chosen subset of the VSCO 2 Community Edition (CC0) as single files — never the 2.3 GB repository.
  python3 scripts/samples/fetch_vsco.py OUT_DIR [--dry]
It writes OUT_DIR/<path as in the repo> and OUT_DIR/selection.json (what was taken, with sizes).
"""
import json, re, sys, urllib.parse, urllib.request, os, concurrent.futures as cf

REPO = "sgossner/VSCO-2-CE"
TREE = f"https://api.github.com/repos/{REPO}/git/trees/master?recursive=1"
RAW = f"https://raw.githubusercontent.com/{REPO}/master/"
NOTE = re.compile(r"_([A-G]#?)(\d)(?=[_.])")
SEMI = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}

# folder -> (articulation folder or "" , how many notes)
SUSTAINED = {
    "Strings/Violin Section": ("susVib", 8), "Strings/Viola Section": ("susvib", 8), "Strings/Cello Section": ("susvib", 8),
    "Strings/Solo Contrabass": ("SusVib", 7), "Woodwinds/Flute": ("susvib", 8), "Woodwinds/Oboe": ("Vib", 8),
    "Woodwinds/Clarinet": ("susLong", 8), "Woodwinds/Bassoon": ("sus", 8), "Woodwinds/Piccolo": ("Sus", 5),
    "Brass/F Horn": ("sus", 8), "Brass/Trumpet": ("sus", 8), "Brass/Tenor Trombone": ("sus", 8), "Brass/Tuba": ("sus", 7),
}
PIZZ = {"Strings/Violin Section": "Pizz", "Strings/Viola Section": "pizz", "Strings/Cello Section": "pizzT", "Strings/Solo Contrabass": "Pizz"}
ONE_SHOTS = [  # exact files under Percussion/
    "Timpani/Timpani1_Hit_v3_rr1_Sum.wav", "Timpani/Timpani2_Hit_v3_rr1_Sum.wav", "Timpani/Timpani3_Hit_v3_rr1_Sum.wav",
    "Timpani/Timpani4_Hit_v3_rr1_Sum.wav", "cymbal-crash1_mf_rr1.wav", "BDrumNewhit_v5_rr1_Sum.wav", "Snare2-HitSN_v5_rr1_Sum.wav",
    "Triangle3-HitM_v1_rr1_Sum.wav", "Tamb1-Hit_v1_rr1_Sum.wav", "gongHit_mf.wav",
    # hand drums: the darbuka's dum / tek / ka
    "Tumba-HitN_v3_rr1_Sum.wav", "Quinto-HitN_v2_rr1_Sum.wav", "Quinto-Tap1_v1_rr1_Sum.wav", "Conga-HitN_v2_rr1_Sum.wav", "Conga-Tap1_v1_rr1_Sum.wav",
]
WHOLE = ["Percussion/Glock", "Percussion/Xylo", "Percussion/Marimba"]


def midi(path):
    m = NOTE.search(path)
    return (int(m.group(2)) + 1) * 12 + SEMI[m.group(1)] if m else None


def spread(files, n):
    """one file per note (first velocity layer / round robin), then `n` notes spread over the range"""
    by = {}
    for t in sorted(files, key=lambda t: t["path"]):
        k = midi(t["path"])
        if k is not None and k not in by:
            by[k] = t
    ks = sorted(by)
    if len(ks) <= n:
        return [by[k] for k in ks]
    idx = sorted({round(i * (len(ks) - 1) / (n - 1)) for i in range(n)})
    return [by[ks[i]] for i in idx]


def main():
    out = sys.argv[1]
    dry = "--dry" in sys.argv
    tree = json.load(urllib.request.urlopen(urllib.request.Request(TREE, headers={"User-Agent": "dataroute-sample-fetch"})))
    blobs = [t for t in tree["tree"] if t["type"] == "blob" and t["path"].lower().endswith(".wav")]
    pick = []
    for folder, (art, n) in SUSTAINED.items():
        pick += spread([t for t in blobs if t["path"].startswith(f"{folder}/{art}/")], n)
    for folder, art in PIZZ.items():
        pick += spread([t for t in blobs if t["path"].startswith(f"{folder}/{art}/")], 6)
    pick += spread([t for t in blobs if t["path"].startswith("Strings/Harp/")], 12)
    for folder in WHOLE:
        pick += [t for t in blobs if t["path"].startswith(folder + "/")]
    want = {f"Percussion/{p}" for p in ONE_SHOTS}
    pick += [t for t in blobs if t["path"] in want]
    seen, uniq = set(), []
    for t in pick:
        if t["path"] not in seen:
            seen.add(t["path"])
            uniq.append(t)
    total = sum(t["size"] for t in uniq)
    print(f"{len(uniq)} files, {total/1e6:.0f} MB")
    os.makedirs(out, exist_ok=True)
    json.dump([{"path": t["path"], "size": t["size"]} for t in uniq], open(os.path.join(out, "selection.json"), "w"), indent=1)
    if dry:
        return

    def get(t):
        dst = os.path.join(out, t["path"])
        if os.path.exists(dst) and os.path.getsize(dst) == t["size"]:
            return 0
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        url = RAW + urllib.parse.quote(t["path"])
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "dataroute-sample-fetch"})) as r, open(dst, "wb") as f:
            f.write(r.read())
        return t["size"]

    done = 0
    with cf.ThreadPoolExecutor(6) as ex:
        for i, n in enumerate(ex.map(get, uniq), 1):
            done += n
            if i % 25 == 0:
                print(f"  {i}/{len(uniq)}", flush=True)
    print("done", f"{done/1e6:.0f} MB downloaded")


main()
