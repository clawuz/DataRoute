#!/usr/bin/env python3
"""
Export the staged world pack to the site:
  globe/public/samples/world/{manifest.json, <instrument>/*.mp3}
  globe/src/audio/world-pack.ts            (names, synth stand-ins, playable ranges, NSynth families)
  docs/music-pack-world-ledger.json        (who made every file, under which licence)
  python3 scripts/samples/export_world_pack.py tmp-music-v1/pack-full globe/public/samples/world globe/src/audio/world-pack.ts docs/music-pack-world-ledger.json
Re-run it after changing the staged pack (prune_pack.py): it rebuilds the folder from scratch.
"""
import json, os, re, shutil, sys

PACK, PUB, TS, LEDGER_OUT = sys.argv[1:5]
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
LITE = os.path.join(ROOT, "globe", "public", "samples", "lite", "manifest.json")
RENAME = {"ORGAN": "RENORGAN"}  # "ORGAN" is a synthesised voice of the site and must not be shadowed

# the synthesised voice that plays while a sample has not arrived (names of the Instrument union in globe/src/audio/theory.ts)
STAND_IN = [
    (r"^(BASSGUITAR|UPRIGHTBASS|NS_BASS_EL_\d+)$", "BASS"),
    (r"^(RENORGAN|NS_ORGAN_EL_\d+)$", "ORGAN"),
    (r"^(RHODES|NS_EKEYS_\d+)$", "EP"),
    (r"^(STEINWAY|KAWAI|UPRIGHTPNO|KNIGHTPNO|HARPSICHORD|NS_KEYS_AC_\d+)$", "PNO"),
    (r"^(NYLONGUITAR|EGUITAR|NS_GUITAR_(AC|EL)_\d+)$", "GUITAR"),
    (r"^(ACCORDION|HARMONICA|TENORSAX|BAGPIPE)$", "CLA"),
    (r"^(ERHU|KEMENCE_MAKAM)$", "VIOLIN"),
    (r"^(SHAKUHACHI|TINWHISTLE|PANPIPE)$", "FLUTE"),
    (r"^(NEY_MAKAM|KAVAL|DUDUK)$", "NEY"),
    (r"^(SANTUR|KAYAGEUM|KOTO|DANTRANH|PSALTERY)$", "KANUN"),
    (r"^(BAGLAMA_MAKAM|BAGLAMA_EXTRA|TANPURA)$", "SAZ"),
    (r"^FOLKHARP$", "HARP"),
    (r"^(KALIMBA|MBIRA)$", "AFR"),
    (r"^(STEELDRUM|VIBES)$", "EUR"),
    (r"^BAGPIPE_DRONE$", "STR"),
    (r"^(TABLA|BENDIR|FRAMEDRUM|FRAMEDRUM_FS|DARBUKA_VCSL)$", "DARBUKA"),
    (r"^DJEMBE$", "TOM"),
    (r"^DRUMKIT$", "SNARE"),
]
FAMILY = re.compile(r"^NS_(GUITAR_AC|GUITAR_EL|EKEYS|KEYS_AC|ORGAN_EL|BASS_EL)_\d+$")
SEMITONES_AROUND = 6  # notes further than this from every recorded zone are folded by octaves (compose.ts)

def stand_in(name):
    for rx, synth in STAND_IN:
        if re.match(rx, name):
            return synth
    sys.exit(f"no synth stand-in for {name}: add it to STAND_IN")

# the licence deed of every file: the Freesound fetch ledger records it per sound (joined by the sound's page); the makam
# fetch did not, so its CC BY pages are listed here (checked on freesound.org, 2026-10-24); NSynth is CC BY 4.0
FETCH_LEDGER = os.path.join(ROOT, "tmp-music-v1", "world-fetch", "world-ledger.json")
MAKAM_BY = {f"https://freesound.org/people/ajaysm/sounds/{i}/": "https://creativecommons.org/licenses/by/4.0/" for i in (194637, 194638, 194639, 194700)}
CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
NSYNTH_URL = "https://creativecommons.org/licenses/by/4.0/"

def norm(u):
    u = u.strip().replace("http://", "https://", 1)
    return u if u.endswith("/") else u + "/"

def licence_urls():
    out = dict(MAKAM_BY)
    for r in json.load(open(FETCH_LEDGER)):
        if r.get("page") and r.get("licence_url"):
            out[norm(r["page"])] = norm(r["licence_url"])
    return out

def licence_url(row, urls):
    if row["author"].startswith("Google"):
        return NSYNTH_URL
    got = urls.get(norm(row["source"])) if row["source"].startswith("http") else None
    if got:
        return got
    if row["licence"].startswith("CC0"):
        return CC0_URL
    sys.exit(f"no licence deed known for {row['source']} ({row['licence']}): add it to MAKAM_BY or the fetch ledger")

def hz(midi):
    return round(440 * 2 ** ((midi - 69) / 12), 1)

def main():
    man = json.load(open(os.path.join(PACK, "manifest.json")))
    ledger = json.load(open(os.path.join(PACK, "ledger.json")))
    lite = set(json.load(open(LITE))["instruments"])
    insts = {RENAME.get(k, k): v for k, v in man["instruments"].items()}
    clash = sorted(set(insts) & lite)
    if clash:
        sys.exit(f"names also in the lite pack: {clash}")
    shutil.rmtree(PUB, ignore_errors=True)
    files = set()
    for name, inst in insts.items():
        for z in inst["zones"]:
            src, dst = os.path.join(PACK, z["file"]), os.path.join(PUB, z["file"])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
            files.add(z["file"])
    json.dump({"name": "World pack (CC0 and CC BY)", "instruments": insts}, open(os.path.join(PUB, "manifest.json"), "w"), indent=1)
    renamed_from = {v: k for k, v in RENAME.items()}
    urls = licence_urls()
    rows = []
    for l in ledger:
        if l["file"] in files:
            rows.append({**l, "instrument": RENAME.get(l["instrument"], l["instrument"]), "licence_url": licence_url(l, urls)})
    json.dump(rows, open(LEDGER_OUT, "w"), indent=1)

    names = sorted(insts)
    families = {}
    for n in names:
        m = FAMILY.match(n)
        if m:
            families.setdefault(m.group(1), []).append(n)
    lines = [
        "// Generated by scripts/samples/export_world_pack.py — do not edit by hand.",
        'import type { Instrument } from "./theory";',
        "",
        "/** the instruments of the world pack (public/samples/world/manifest.json) */",
        "export const WORLD_INSTRUMENTS = " + json.dumps(names) + " as const;",
        "export type WorldInstrument = (typeof WORLD_INSTRUMENTS)[number];",
        "",
        "/** the synthesised voice that plays while a recording has not arrived */",
        "export const WORLD_STAND_IN: Record<WorldInstrument, Instrument> = {",
        *[f'  {n}: "{stand_in(n)}",' for n in names],
        "};",
        "",
        f"/** playable range (Hz, floor and ceiling): {SEMITONES_AROUND} semitones around the recorded zones; drums have none */",
        "export const WORLD_RANGE: Partial<Record<WorldInstrument, readonly [number, number]>> = {",
    ]
    for n in names:
        if insts[n].get("unpitched"):
            continue
        roots = [z["root"] for z in insts[n]["zones"]]
        lines.append(f"  {n}: [{hz(min(roots) - SEMITONES_AROUND)}, {hz(max(roots) + SEMITONES_AROUND)}],")
    lines += [
        "};",
        "",
        "/** NSynth variants: a card names the family, the route hash picks one of its instruments */",
        "export const WORLD_FAMILIES = {",
        *[f"  {k}: {json.dumps(v)} as readonly WorldInstrument[]," for k, v in sorted(families.items())],
        "} as const satisfies Record<string, readonly WorldInstrument[]>;",
        "export type WorldFamily = keyof typeof WORLD_FAMILIES;",
        "",
    ]
    open(TS, "w").write("\n".join(lines))
    print(f"{len(names)} instruments, {len(files)} files, {len(families)} families; renamed {renamed_from or '-'}")

main()
