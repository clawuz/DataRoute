#!/usr/bin/env python3
"""
List Freesound candidates (CC0 / CC-BY only) for the Turkish / Middle-Eastern instruments. Nothing is downloaded.
  python3 scripts/samples/freesound_search.py [OUT.json]
The token is read from FREESOUND_API_KEY (or the .env.local line of that name) and never printed.
"""
import json, os, re, sys, urllib.parse, urllib.request

def token():
    t = os.environ.get("FREESOUND_API_KEY")
    if t:
        return t
    for line in open(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")):
        m = re.match(r"^(FREESOUND_API_KEY|ELEVENLABS_API_KEY)=(.*)$", line.strip())
        if m and len(m.group(2).strip('"\'')) == 40:  # a Freesound token is 40 characters
            return m.group(2).strip().strip('"\'')
    sys.exit("no Freesound token found")

TOKEN = token()
QUERIES = {
    "oud": ["oud", "oud single note", "oud pluck"],
    "saz": ["saz", "baglama", "bağlama", "saz note"],
    "kanun": ["kanun", "qanun", "qanun note"],
    "ney": ["ney", "ney flute", "ney note"],
    "darbuka": ["darbuka", "doumbek", "derbake", "darbouka"],
}
FIELDS = "id,name,username,license,duration,avg_rating,num_ratings,tags,description,previews,url"

def search(q, ln):
    p = {"query": q, "filter": f'license:("Creative Commons 0" OR "Attribution") duration:[0.2 TO {ln}]',
         "sort": "rating_desc", "page_size": 30, "fields": FIELDS, "token": TOKEN}
    u = "https://freesound.org/apiv2/search/text/?" + urllib.parse.urlencode(p)
    return json.load(urllib.request.urlopen(u, timeout=30))["results"]

def main():
    out = {}
    for inst, qs in QUERIES.items():
        seen = {}
        for q in qs:
            for r in search(q, 12):
                seen.setdefault(r["id"], r)
        out[inst] = sorted(seen.values(), key=lambda r: (-(r.get("avg_rating") or 0), -(r.get("num_ratings") or 0)))
    path = sys.argv[1] if len(sys.argv) > 1 else "freesound_candidates.json"
    json.dump(out, open(path, "w"), indent=1)
    for inst, rs in out.items():
        print(f"\n## {inst}: {len(rs)} candidates")
        for r in rs[:12]:
            lic = "CC0" if "Zero" in r["license"] or "publicdomain" in r["license"] or r["license"].endswith("/zero/1.0/") else "CC-BY"
            print(f"  {r['id']:>8} {lic:5} {r['duration']:5.1f}s ★{(r.get('avg_rating') or 0):.1f}({r.get('num_ratings')}) {r['username'][:18]:18} {r['name'][:46]:46} [{', '.join(r['tags'][:5])}]")

main()
