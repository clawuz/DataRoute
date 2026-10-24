#!/usr/bin/env python3
"""
Fetch the approved "world" sounds for the next pack (staging only, nothing goes into globe/public):
  - Freesound (CC0 and CC BY): HQ previews of the candidates found by freesound_search.py
  - VCSL (CC0): single wav files from sgossner/VCSL (the repo is ~4 GB, so never cloned)
  python3 scripts/samples/fetch_world.py CANDIDATES.json [CANDIDATES2.json ...] OUT_DIR [--dry]
Writes OUT_DIR/freesound/*.mp3, OUT_DIR/vcsl/<inst>/*.wav and OUT_DIR/world-ledger.json (author, licence, page; CC BY rows
need a credit line in /credits.html). The candidate lists already hold the public HQ-preview links: no token is needed.
"""
import concurrent.futures as cf, json, os, re, sys, urllib.parse, urllib.request

ARGS = [a for a in sys.argv[1:] if a != "--dry"]
DRY = "--dry" in sys.argv
OUT = ARGS[-1]
CANDS = ARGS[:-1]

# ---- Freesound: instrument slug -> (name/tag regex, how many, melodic?) ---------------------------------------------
SPEC = {
    "santur": (r"sant", 10, True), "erhu": (r"erhu", 10, True), "koto": (r"\bkoto\b", 5, True),
    "kayageum": (r"kayageum", 8, True), "shakuhachi": (r"shakuhachi", 5, True), "tanpura": (r"tanpura", 6, True),
    "kalimba": (r"kalimba|mbira", 10, True), "steeldrum": (r"steel.?(tongue|drum|pan)|handpan", 10, True),
    "nylon_guitar": (r"nylon|classical guitar|spanish guitar|munich guitar", 10, True),
    "tinwhistle": (r"whistle", 6, True), "accordion": (r"accordion", 6, True), "panpipe": (r"pan.?pipe|panflute|pan flute", 8, True),
    "kaval": (r"kaval", 6, True), "duduk": (r"duduk|doudouk", 3, True),
    "tabla": (r"tabla|\bghe|dhin|tin stroke|duggi|\bna\b|\bte\b", 6, False), "djembe": (r"djembe", 5, False),
    "bass_guitar": (r"bass", 10, True), "upright_bass": (r"upright|stand.?up|double bass|contrabass|manthey", 8, True),
    "electric_clean": (r"guitar", 10, True), "electric_drive": (r"overdrive|distort|crunch|power chord|drive", 8, True),
    "rhodes": (r"rhodes|wurlitzer|\bEP\b|electric piano", 8, True),
    "drumkit": (r"kick|snare|hi.?hat|hihat|\btom\b|ride", 10, False),
    "bendir": (r"bendir|kudum|rebana|riq|\bdaf\b", 6, False), "bodhran": (r"frame drum|bodhran", 3, False),
}
NAME_ONLY = {"koto", "kayageum", "santur", "bass_guitar", "electric_clean", "acoustic_guitar", "electric_drive", "organ", "synth", "banjo"}
# a name that matches one of these is another instrument that merely shares the word
NOT = {"bass_guitar": r"upright|stand.?up|double|drum|kick|sub|808|dubstep|tanpura|synth", "electric_clean": r"bass|acoustic|nylon|ukulele|overdrive|distort|crunch|harp|8-string|jingle|noise|wave|twang|muted|munich|dist|reverb|iterativ",
       "acoustic_guitar": r"electric|bass|drum|kick|chord|slide|scratch|imitation|fret", "electric_drive": r"bass|violin|unnerve|sustained to chord",
       "organ": r"kalimba|pipe organ pedal", "synth": r"oud|standup|motif|upright|bass guitar|kalimba", "banjo": r"monochord|bender|scratch|texture", "drumkit": r"long hit"}  # tags on Freesound are loose: these must say so in the title
BAD_SYNTH = None  # set below: a synth is allowed to say "synth"
BAD = re.compile(r"celtic harp|wiggle|scarborough|comp short|tren de|rebotes|guitar sound|synth|loop|bpm|vst|kontakt|preset|\bfx\b|car sound|plugin|d-50|roland|morph|glitch|vocal|sing|song|beat|riff|remix|midi|toy|filtered|reverse|echo", re.I)
BAD_SYNTH = re.compile(BAD.pattern.replace("synth|", "").replace("morph|", ""), re.I)
NOTE = re.compile(r"(?<![A-Za-z])([A-G][#b]?)(-?\d)(?![0-9])")

def is_cc0(r):
    return r["license"].endswith("/zero/1.0/") or "publicdomain" in r["license"]

def pick_freesound():
    pool = {}
    for path in CANDS:
        for rs in json.load(open(path)).values():
            for r in rs:
                pool.setdefault(r["id"], r)
    chosen, used = [], set()
    for slug, (rx, n, melodic) in SPEC.items():
        rx = re.compile(rx, re.I)
        hay = lambda r: r["name"] if slug in NAME_ONLY else r["name"] + " " + " ".join(r["tags"])
        bad = BAD_SYNTH if slug == "synth" else BAD
        nx = re.compile(NOT[slug], re.I) if slug in NOT else None
        rows = [r for r in pool.values() if r["id"] not in used and rx.search(hay(r)) and not (nx and nx.search(r["name"]))
                and not bad.search(r["name"] + " " + " ".join(r["tags"])) and 0.2 <= r["duration"] <= (14 if melodic else 8)]
        # melodic: one sound per named pitch first, so the pack covers the keyboard; then the best rated
        rows.sort(key=lambda r: (not (melodic and NOTE.search(r["name"])), not is_cc0(r) and 0, -(r.get("avg_rating") or 0), -(r.get("num_ratings") or 0)))
        seen, take = set(), []
        for r in rows:
            m = NOTE.search(r["name"]) if melodic else None
            key = m.group(0) if m else r["id"]
            if key in seen:
                continue
            seen.add(key)
            take.append(r)
            if len(take) >= n:
                break
        for r in take:
            used.add(r["id"])
            chosen.append((slug, r))
    return chosen

# ---- VCSL ------------------------------------------------------------------------------------------------------------
VCSL = "https://raw.githubusercontent.com/sgossner/VCSL/master/"
def thin(files, k):
    """k files spread evenly over the sorted list"""
    if len(files) <= k:
        return files
    return [files[round(i * (len(files) - 1) / (k - 1))] for i in range(k)]

def pick_vcsl():
    tree = json.load(open("/tmp/vcsl_tree.json"))["tree"]
    def folder(name, sub="", rx=None, k=8, base=None):
        fs = sorted(t["path"] for t in tree if t["path"].lower().endswith(".wav") and f"/{name}/" in "/" + t["path"] + "/"
                    and (not sub or f"/{sub}/" in t["path"]) and (not rx or re.search(rx, t["path"])))
        seen, one = set(), []
        for p in fs:  # one file per pitch (the first velocity/round-robin that passed the filter)
            m = re.search(r"(?<![A-Za-z])([A-G]#?-?\d)(?![0-9])", os.path.basename(p))
            if m and m.group(1) in seen:
                continue
            seen.add(m.group(1) if m else p)
            one.append(p)
        return thin(one, k)
    sel = {
        "dantranh": folder("Dan Tranh", "Normal", r"/[A-G]#?\d_f_1\.wav$", 9),
        "psaltery": folder("Psaltery, Bowed and Plucked", "Pluck", None, 8),
        "folkharp": folder("Folk Harp", None, r"_Normal_[A-G]#?\d_v2_RR1\.wav$", 8),
        "kalimba_kenya": folder("Kalimba, Kenya", None, r"_vl3_rr2\.wav$", 8),
        "vibraphone": folder("Vibraphone", "Hard Mallets", r"_v2_rr1_Main\.wav$", 8),
        "darbuka": folder("Darbuka", None, r"_vl2_rr1\.wav$", 6),
        "steinway": folder("Grand Piano, Steinway B", "NoSus", r"_Close_[A-G]#?\d_vl3_rr1\.wav$", 10),
        "kawai_grand": folder("Grand Piano, Kawai", "Sustains", r"_sus_[A-G]#?\d_v3_rr1_Player\.wav$", 8),
        "yamaha_upright": folder("Upright Piano, Yamaha", "Sustains", r"_Sus_[A-G]#?\d_vl2_rr1\.wav$", 8),
        "knight_upright": folder("Upright Piano, Knight", "Sustains", r"Player_vl2_rr1_[A-G]#?\d\.wav$", 8),
        "harpsichord": folder("Harpsichord, English", "Sustains", r"_Sus_[A-G]#?\d_rr1\.wav$", 8),
        "renaissance_organ": folder("Renaissance Organ", None, r"8'/RenOrgan_8foot_Room_[A-G]#?\d_rr1\.wav$", 8),
        "tenor_sax": folder("Tenor Saxophone", "Non-Vibrato", r"_NV_Main_[A-G]#?\d_vl2_rr1\.wav$", 8),
        "harmonica": folder("Harmonica-Hohner-Special20-C", "Sustains", r"Special20_Normal_[A-G]#?\d\.wav$", 6),
        "framedrum": folder("Frame Drum", None, r"_rr1_Sum\.wav$", 8),
    }
    return [(slug, p) for slug, ps in sel.items() for p in ps]

def get(url, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst):
        with urllib.request.urlopen(url, timeout=90) as resp, open(dst, "wb") as f:
            f.write(resp.read())

def main():
    fs, vc = pick_freesound(), pick_vcsl()
    ledger = []
    print(f"Freesound: {len(fs)} sounds ({sum(not is_cc0(r) for _, r in fs)} CC BY); VCSL: {len(vc)} files")
    for slug, r in fs:
        print(f"  {slug:13} {r['id']:>7} {'CC0' if is_cc0(r) else 'BY ':3} {r['duration']:4.1f}s {r['name'][:40]}")
    for slug, p in vc:
        print(f"  {slug:13} VCSL {p.split('/',2)[2][:70]}")
    if DRY:
        return
    def job_fs(item):
        slug, r = item
        fn = f"{slug}_{r['id']}.mp3"
        get(r["previews"]["preview-hq-mp3"], os.path.join(OUT, "freesound", fn))
        return {"instrument": slug, "source": "freesound", "file": f"freesound/{fn}", "title": r["name"], "author": r["username"],
                "licence": "CC0 1.0" if is_cc0(r) else "CC BY", "licence_url": r["license"], "page": r["url"], "duration": r["duration"]}
    def job_vc(item):
        slug, p = item
        fn = os.path.basename(p)
        get(VCSL + urllib.parse.quote(p), os.path.join(OUT, "vcsl", slug, fn))
        return {"instrument": slug, "source": "VCSL", "file": f"vcsl/{slug}/{fn}", "title": fn, "author": "Versilian Studios (sgossner/VCSL)",
                "licence": "CC0 1.0", "licence_url": "https://creativecommons.org/publicdomain/zero/1.0/", "page": "https://github.com/sgossner/VCSL/blob/master/" + urllib.parse.quote(p)}
    with cf.ThreadPoolExecutor(6) as ex:
        ledger += list(ex.map(job_fs, fs)) + list(ex.map(job_vc, vc))
    json.dump(ledger, open(os.path.join(OUT, "world-ledger.json"), "w"), indent=1)
    print(len(ledger), "files;", sum(l["licence"] == "CC BY" for l in ledger), "need a credit line")

main()
