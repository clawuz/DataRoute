#!/usr/bin/env python3
"""
Fetch the approved Freesound sounds (HQ previews, small) and a ledger of who made them and under which licence.
  python3 scripts/samples/fetch_freesound.py OUT_DIR
Token: FREESOUND_API_KEY or the 40-character value in .env.local (never printed).
"""
import json, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")

def token():
    t = os.environ.get("FREESOUND_API_KEY")
    if t:
        return t
    for line in open(os.path.join(ROOT, ".env.local")):
        m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
        if m and len(m.group(2).strip("\"'")) == 40:
            return m.group(2).strip().strip("\"'")
    sys.exit("no Freesound token")

TOKEN = token()
F = "id,name,username,license,duration,previews,url,tags"
LIC = 'license:("Creative Commons 0" OR "Attribution")'

def api(path, **p):
    p["token"] = TOKEN
    return json.load(urllib.request.urlopen("https://freesound.org/apiv2/" + path + "?" + urllib.parse.urlencode(p), timeout=40))

def by_user(user, query=""):
    return api("search/text/", query=query, filter=f'username:"{user}" {LIC}', page_size=100, fields=F)["results"]

def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    want = {}
    for r in by_user("fcerim", "Baglama"):
        want[r["id"]] = ("SAZ", r)
    for r in by_user("hammondman", "oud"):
        want[r["id"]] = ("OUD", r)
    for r in by_user("tarane468", "Oud Motif"):
        if "Oud Motif" in r["name"]:
            want[r["id"]] = ("OUD_MOTIF", r)
    for sid, inst in [(328744, "NEY"), (252806, "DARBUKA")]:
        r = api(f"sounds/{sid}/", fields=F)
        want[r["id"]] = (inst, r)
    ledger = []
    for sid, (inst, r) in sorted(want.items()):
        lic = "CC0 1.0" if "zero" in r["license"] else "CC BY"
        url = r["previews"]["preview-hq-mp3"]
        fn = f"{inst}_{sid}.mp3"
        dst = os.path.join(out, fn)
        if not os.path.exists(dst):
            with urllib.request.urlopen(url, timeout=60) as resp, open(dst, "wb") as f:
                f.write(resp.read())
        ledger.append({"instrument": inst, "id": sid, "file": fn, "name": r["name"], "author": r["username"], "licence": lic, "licence_url": r["license"], "page": r["url"], "duration": r["duration"]})
    json.dump(ledger, open(os.path.join(out, "freesound-ledger.json"), "w"), indent=1)
    print(len(ledger), "files;", sum(1 for l in ledger if l["licence"] == "CC BY"), "need credit")

main()
