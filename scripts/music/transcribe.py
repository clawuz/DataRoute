#!/usr/bin/env python3
"""Audio -> notes: transcribe a generated day-music mp3 with Spotify's Basic Pitch.
usage: .venv-music/bin/python scripts/music/transcribe.py tmp-music/day-music-<date>-<genre>.mp3 [out.json]
Writes {"duration": s, "notes": [{"t": start s, "d": length s, "p": midi pitch, "v": 0..1 loudness}]}"""
import json, sys
from basic_pitch.inference import predict

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0] + ".notes.json"
_, _, events = predict(src, onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=90, minimum_frequency=55, maximum_frequency=2100)
notes = sorted(({"t": round(float(s), 3), "d": round(float(e - s), 3), "p": int(p), "v": round(float(a), 2)} for s, e, p, a, _ in events), key=lambda n: n["t"])
dur = max((n["t"] + n["d"] for n in notes), default=0)
json.dump({"source": src.split("/")[-1], "duration": round(dur, 2), "notes": notes}, open(out, "w"), separators=(",", ":"))
print(f"{len(notes)} notes over {dur:.0f}s -> {out}")
