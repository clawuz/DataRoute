#!/usr/bin/env bash
# Whole pipeline for the site's track: compose (ElevenLabs, uses credits) -> transcribe notes -> give notes to routes -> bundle into globe/public/music.
#   scripts/music/make-track.sh [genre]      (default: symphonic; key from .env.local)
set -euo pipefail
cd "$(dirname "$0")/../.."
genre="${1:-symphonic}"
unset NODE_TLS_REJECT_UNAUTHORIZED
curl -s "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media" -o tmp-music/day.json 2>/dev/null || { mkdir -p tmp-music; curl -s "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media" -o tmp-music/day.json; }
node scripts/generate-day-music.mjs --genres "$genre" --file tmp-music/day.json
date_iso=$(node -e 'const d=require("./tmp-music/day.json");console.log(new Date(d.generatedAt*1000).toISOString().slice(0,10))')
base="tmp-music/day-music-${date_iso}-${genre}"
.venv-music/bin/python scripts/music/transcribe.py "${base}.mp3" 2>&1 | tail -1
node scripts/music/assign-notes.mjs "${base}.notes.json" tmp-music/day.json --bundle globe/public/music
echo "done: globe/public/music/{track.mp3,notes.json} updated — run the app (REPLAY, key M) to listen"
