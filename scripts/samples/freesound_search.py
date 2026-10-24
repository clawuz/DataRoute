#!/usr/bin/env python3
"""
List Freesound candidates (CC0 / CC-BY only) for the Turkish / Middle-Eastern instruments. Nothing is downloaded.
  python3 scripts/samples/freesound_search.py [OUT.json]
The token is read from FREESOUND_API_KEY (or the .env.local line of that name) and never printed.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

def token():
    t = os.environ.get("FREESOUND_API_KEY")
    if t:
        return t
    for line in open(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local")):
        m = re.match(r"^(FREESOUND_API_KEY)=(.*)$", line.strip())
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
    "zurna": ["zurna", "zurna note", "mizmar", "shawm"],
    "kaval": ["kaval", "kaval flute", "shepherd flute"],
    "tulum": ["tulum", "tulum bagpipe", "gaida"],
    "cura": ["cura", "cura saz", "baglama cura", "tanbur"],
    "def": ["def frame drum", "daf", "bendir", "riq", "kudum"],
    "duduk": ["duduk", "duduk note", "mey"],
    "kemence": ["kemence", "kemenche", "rebab", "kamancheh"],
}
# `world` set: one family of queries per genre card (hindustani, eastasia, gamelan, westafrica, ...)
WORLD = {
    "sitar": ["sitar", "sitar note", "sitar pluck"], "tabla": ["tabla", "tabla hit", "tabla stroke"], "tanpura": ["tanpura", "tambura"],
    "koto": ["koto", "koto note"], "shakuhachi": ["shakuhachi", "shakuhachi note"], "shamisen": ["shamisen"], "erhu": ["erhu", "erhu note"],
    "guzheng": ["guzheng", "guzheng note", "gu zheng", "zheng"], "pipa": ["pipa", "pipa note"],
    "gamelan": ["gamelan", "gamelan gong", "saron", "bonang", "gender"],
    "kora": ["kora", "kora note"], "djembe": ["djembe", "djembe bass", "djembe slap"],
    "mbira": ["mbira", "kalimba", "thumb piano"],
    "guitar_nylon": ["nylon guitar note", "classical guitar single note", "spanish guitar note"], "flamenco": ["flamenco guitar", "palmas", "cajon flamenco"],
    "bandoneon": ["bandoneon", "bandoneon note"], "accordion": ["accordion note", "accordion single note"],
    "tinwhistle": ["tin whistle", "irish whistle", "tin whistle note"], "bodhran": ["bodhran"], "fiddle": ["fiddle note", "irish fiddle"],
    "uilleann": ["uilleann pipes", "bagpipe note", "bagpipes"],
    "kantele": ["kantele", "nyckelharpa"], "balalaika": ["balalaika", "balalaika note"], "cimbalom": ["cimbalom", "hammered dulcimer"],
    "dombra": ["dombra", "komuz", "rubab"],
    "tar": ["tar persian", "setar", "santur", "santoor"], "tombak": ["tombak", "zarb", "dohol"],
    "charango": ["charango", "quena", "pan flute", "panpipes"], "steeldrum": ["steel drum", "steelpan", "handpan"],
    "bouzouki": ["bouzouki", "saz greek", "mandolin note", "oud"],
    "cuatro": ["cuatro", "vihuela", "tres cubano", "ukulele note"], "clave": ["claves", "guiro", "maracas", "cowbell latin"],
}
# `west` set: guitars, basses, keys and the rest of the Western band
WEST = {
    "acoustic_guitar": ["acoustic guitar note", "steel string guitar note", "acoustic guitar single note", "acoustic guitar pluck"],
    "electric_clean": ["electric guitar clean note", "clean electric guitar single note", "electric guitar pluck", "stratocaster note"],
    "electric_drive": ["overdriven guitar note", "distortion guitar note", "electric guitar power chord", "crunch guitar note"],
    "jazz_guitar": ["jazz guitar note", "hollow body guitar note", "archtop guitar"],
    "guitar_harmonics": ["guitar harmonics", "guitar muted", "palm muted guitar"],
    "bass_guitar": ["bass guitar note", "electric bass note", "fender bass single note", "finger bass note", "slap bass"],
    "upright_bass": ["upright bass note", "double bass pizzicato note", "acoustic bass note"],
    "grand_piano": ["grand piano note", "piano single note", "steinway note", "piano C4"],
    "upright_piano": ["upright piano note", "felt piano note", "soft piano note", "honky tonk piano"],
    "rhodes": ["rhodes note", "electric piano note", "fender rhodes", "wurlitzer note"],
    "organ": ["hammond organ note", "church organ note", "pipe organ note", "organ chord"],
    "clavinet": ["clavinet", "harpsichord note", "celesta note", "toy piano"],
    "banjo": ["banjo note", "banjo pluck", "mandolin note", "ukulele note"],
    "harmonica": ["harmonica note", "blues harp note", "melodica note"],
    "sax": ["saxophone note", "alto sax note", "tenor sax note", "soprano sax note"],
    "synth": ["synth pad note", "analog synth note", "moog bass note", "synth pluck note"],
    "drumkit": ["drum kit kick", "snare hit", "hihat closed", "tom hit", "ride cymbal"],
    "vibes_bells": ["vibraphone note", "celesta", "tubular bells note", "music box note"],
}
# `gaps` set: what the packs still lack (second try, wider queries)
GAPS = {
    "sitar": ["sitar", "sitar pluck", "sitar string", "sitar drone", "indian sitar note", "sitar raga"],
    "shamisen": ["shamisen", "tsugaru shamisen", "japanese lute", "biwa"],
    "pipa": ["pipa", "chinese lute", "liuqin", "ruan", "yueqin"],
    "zurna": ["zurna", "zurna turkish", "mizmar", "shehnai", "shawm", "rhaita", "suona"],
    "ney": ["ney", "ney flute", "nay", "kaval ney", "arabic flute", "bansuri"],
    "cura_baglama": ["cura", "baglama", "bağlama", "saz", "tambur", "tanbur", "long neck lute"],
    "tulum": ["tulum", "gaida", "bagpipe", "zampogna", "musette", "duda"],
    "kantele_dombra": ["kantele", "dombra", "komuz", "rubab", "dutar", "tanbur", "zither"],
    "acoustic_steel": ["steel string guitar", "acoustic guitar strum", "acoustic guitar open", "martin guitar", "folk guitar", "acoustic guitar harmonics"],
    "hammond": ["hammond", "hammond b3", "drawbar organ", "leslie organ", "farfisa", "vox organ"],
    "wurlitzer": ["wurlitzer", "wurli", "electric piano wurlitzer", "dx7", "fm electric piano"],
    "mandolin": ["mandolin", "mandolin tremolo", "bouzouki", "balalaika", "domra", "cumbus"],
    "kemence": ["kemence", "kemençe", "kemenche", "lyra", "rebab", "gadulka", "sarangi", "kamancheh"],
    "kanun_qanun": ["kanun", "qanun", "qanun pluck", "psaltery", "autoharp", "zither pluck", "santoor"],
}
FIELDS = "id,name,username,license,duration,avg_rating,num_ratings,tags,description,previews,url"

def search(q, ln):
    p = {"query": q, "filter": f'license:("Creative Commons 0" OR "Attribution") duration:[0.2 TO {ln}]',
         "sort": "rating_desc", "page_size": 30, "fields": FIELDS, "token": TOKEN}
    u = "https://freesound.org/apiv2/search/text/?" + urllib.parse.urlencode(p)
    for wait in (0, 20, 40, 60):  # Freesound allows ~60 requests a minute: pace, and back off on 429
        time.sleep(wait or 1.1)
        try:
            return json.load(urllib.request.urlopen(u, timeout=30))["results"]
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
    raise SystemExit("Freesound keeps answering 429")

def main():
    out = {}
    for inst, qs in (GAPS if "gaps" in sys.argv else WEST if "west" in sys.argv else WORLD if "world" in sys.argv else QUERIES).items():
        seen = {}
        for q in qs:
            for r in search(q, 12):
                seen.setdefault(r["id"], r)
        out[inst] = sorted(seen.values(), key=lambda r: (-(r.get("avg_rating") or 0), -(r.get("num_ratings") or 0)))
    path = next((a for a in sys.argv[1:] if a not in ("world", "west", "gaps")), None) or "freesound_candidates.json"
    json.dump(out, open(path, "w"), indent=1)
    for inst, rs in out.items():
        print(f"\n## {inst}: {len(rs)} candidates")
        for r in rs[:12]:
            lic = "CC0" if "Zero" in r["license"] or "publicdomain" in r["license"] or r["license"].endswith("/zero/1.0/") else "CC-BY"
            print(f"  {r['id']:>8} {lic:5} {r['duration']:5.1f}s ★{(r.get('avg_rating') or 0):.1f}({r.get('num_ratings')}) {r['username'][:18]:18} {r['name'][:46]:46} [{', '.join(r['tags'][:5])}]")

main()
