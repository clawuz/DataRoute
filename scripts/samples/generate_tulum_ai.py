#!/usr/bin/env python3
"""
Try to make a Black Sea tulum with ElevenLabs (no open recording exists): a few scale runs, cut into notes like the makam scales,
and added to the pack as TULUM_AI. Reads ELEVENLABS_API_KEY from .env.local (never printed); skips clips that already exist.
  .venv-music/bin/python scripts/samples/generate_tulum_ai.py CLIP_DIR PACK_DIR [--go]
Without --go only the plan and the credit estimate are printed.
"""
import json, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np  # noqa: E402
from build_extra_pack import segments, cut  # noqa: E402
from prune_pack import credits, respread  # noqa: E402

CLIPS, PACK = sys.argv[1:3]
GO = "--go" in sys.argv
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
KEY = next(m.group(1).strip().strip("\"'") for l in open(os.path.join(ROOT, ".env.local")) if (m := re.match(r"^ELEVENLABS_API_KEY=(.*)$", l.strip())))

BASE = "Karadeniz tulum, the Turkish Black Sea goatskin bagpipe, solo, unaccompanied, nasal reedy double-reed chanter with a steady drone, dry close recording, no reverb, no other instruments"
SFX = [  # (file, prompt, seconds)
    ("sfx_scale_a", f"{BASE}. Plays a slow ascending scale, each note held about one second, then descends.", 12),
    ("sfx_scale_b", f"{BASE}. Plays seven separate long notes one after another, each with a short pause between, clear steady pitch.", 12),
    ("sfx_scale_c", f"{BASE}. Plays a slow Black Sea horon melody in a narrow range, long sustained notes.", 12),
]
MUSIC = [("music_scale", f"{BASE}. A slow ascending and descending scale, long steady notes.", 20)]

def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"xi-api-key": KEY, "Content-Type": "application/json"})
    for attempt in range(1, 5):
        try:
            return urllib.request.urlopen(req, timeout=300).read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(attempt * 15); continue
            raise SystemExit(f"ElevenLabs {e.code}: {e.read()[:200]!r}")
    raise SystemExit("still busy")

def make():
    os.makedirs(CLIPS, exist_ok=True)
    out = []
    for name, prompt, sec in SFX:
        dst = os.path.join(CLIPS, name + ".mp3")
        if not os.path.exists(dst):
            print(f"+ {name} ({sec}s, ~{sec * 40} credits)")
            if GO:
                open(dst, "wb").write(post("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {"text": prompt, "duration_seconds": sec, "prompt_influence": 0.8}))
        out.append(dst)
    for name, prompt, sec in MUSIC:
        dst = os.path.join(CLIPS, name + ".mp3")
        if not os.path.exists(dst):
            print(f"+ {name} (music, {sec}s)")
            if GO:
                open(dst, "wb").write(post("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {"prompt": prompt, "music_length_ms": sec * 1000, "model_id": "music_v1"}))
        out.append(dst)
    return [p for p in out if os.path.exists(p)]

def main():
    clips = make()
    if not GO:
        print("dry run: add --go"); return
    man = json.load(open(os.path.join(PACK, "manifest.json")))
    led = [l for l in json.load(open(os.path.join(PACK, "ledger.json"))) if l["instrument"] != "TULUM_AI"]
    zones = []
    for clip in clips:
        found = segments(clip)
        print(f"{os.path.basename(clip):18} {len(found)} steady notes: {[round(r, 1) for _, _, r in found]}")
        for t0, t1, root in sorted(found, key=lambda s: -(s[1] - s[0])):
            if any(abs(z["root"] - root) < 0.5 for z in zones):
                continue
            rel = f"tulum_ai/{os.path.splitext(os.path.basename(clip))[0]}_{int(t0 * 100):05d}.mp3"
            cut(clip, os.path.join(PACK, rel), t0, t1)
            zones.append({"root": root, "file": rel})
            led.append({"instrument": "TULUM_AI", "file": rel, "source": "https://elevenlabs.io", "author": "ElevenLabs (generated for this project)", "licence": "generated", "title": os.path.basename(clip)})
    if zones:
        man["instruments"]["TULUM_AI"] = {"zones": respread(zones), "release": 0.4}
    json.dump(man, open(os.path.join(PACK, "manifest.json"), "w"), indent=1)
    json.dump(led, open(os.path.join(PACK, "ledger.json"), "w"), indent=1)
    print(f"TULUM_AI: {len(zones)} notes", credits(PACK))

main()
