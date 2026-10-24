#!/usr/bin/env python3
"""
Remove instruments or single notes from the world pack and rebuild the CC BY credit list.
  python3 scripts/samples/prune_pack.py PACK_DIR --instrument EGUITAR_DRIVE --zone EGUITAR:81.4
    --instrument NAME   drop the whole instrument (manifest entry, files, ledger rows)
    --zone NAME:ROOT    drop the zone of NAME whose root is nearest to ROOT (within 0.5 semitone), then re-spread the remaining zones
"""
import json, os, shutil, sys

def credits(pack):
    used = json.load(open(os.path.join(pack, "ledger.json")))
    by = {}
    for u in used:
        if u["licence"] == "CC BY":
            by.setdefault(u["author"], []).append(u)
    with open(os.path.join(pack, "credits-ccby.md"), "w") as f:
        f.write("# CC BY credits for the world pack (add to /credits.html)\n\nEvery other file is CC0 1.0 (Freesound CC0 sounds, VCSL by Versilian Studios).\n\n")
        for a, us in sorted(by.items(), key=lambda x: x[0].lower()):
            if a.startswith("Google"):
                f.write(f"- **{a}** (CC BY 4.0): the NSynth data set, https://magenta.tensorflow.org/datasets/nsynth — {len(us)} notes\n")
            else:
                f.write(f"- **{a}** (Freesound, CC BY): " + "; ".join(f"[{u['title']}]({u['source']})" for u in us[:12]) + ("; …" if len(us) > 12 else "") + "\n")
    return len(used), len(by)

def respread(zones):
    zones = sorted(zones, key=lambda z: z["root"])
    for i, z in enumerate(zones):
        z["lo"] = 0 if i == 0 else int((zones[i - 1]["root"] + z["root"]) // 2) + 1
        z["hi"] = 127 if i == len(zones) - 1 else max(z["lo"], int((z["root"] + zones[i + 1]["root"]) // 2))
    return zones

def main():
    pack = sys.argv[1]
    args = sys.argv[2:]
    man = json.load(open(os.path.join(pack, "manifest.json")))
    led = json.load(open(os.path.join(pack, "ledger.json")))
    gone = []
    for i, a in enumerate(args):
        if a == "--instrument":
            name = args[i + 1]
            inst = man["instruments"].pop(name)
            gone += [z["file"] for z in inst["zones"]]
        elif a == "--zone":
            name, root = args[i + 1].split(":")
            zs = man["instruments"][name]["zones"]
            z = min(zs, key=lambda z: abs(z["root"] - float(root)))
            if abs(z["root"] - float(root)) > 0.5:
                sys.exit(f"no zone near {root} in {name} (nearest {z['root']})")
            zs.remove(z)
            gone.append(z["file"])
            man["instruments"][name]["zones"] = respread(zs)
            print(f"removed {name} zone {z['root']} ({z['file']})")
    for f in gone:
        try:
            os.remove(os.path.join(pack, f))
        except FileNotFoundError:
            pass
    led = [l for l in led if l["file"] not in set(gone)]
    for d in {os.path.dirname(f) for f in gone}:
        if os.path.isdir(os.path.join(pack, d)) and not os.listdir(os.path.join(pack, d)):
            os.rmdir(os.path.join(pack, d))
    json.dump(man, open(os.path.join(pack, "manifest.json"), "w"), indent=1)
    json.dump(led, open(os.path.join(pack, "ledger.json"), "w"), indent=1)
    n, a = credits(pack)
    print(f"{len(gone)} files removed; {n} files left, {a} CC BY authors/sources")

if __name__ == "__main__":
    main()
