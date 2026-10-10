# Daily track pipeline (deactivated)

Each day a new composition of "A World of Music" can be generated from that day's traffic, reviewed, and promoted to
the site. **Everything below is built but switched off.** Nothing runs, nothing is requested by the site, no credits
are spent until the steps in "Activate" are done.

## How it works

```
GitHub Actions (daily-music, manual or scheduled)
  → scripts/music/daily.mjs
      1. fetch public/day.json, pick the day's genre (rotation in daily.config.json)
      2. scripts/generate-day-music.mjs      compose with ElevenLabs (8 windows from the day's traffic)
      3. scripts/music/transcribe.py         audio → notes (Spotify Basic Pitch)
      4. scripts/music/assign-notes.mjs      give every note to a route (pitch class, altitude, note length ↔ route length)
      5. upload to Firebase Storage          public/music/<date>/{track.mp3,notes.json,plan.json}
         and write public/music/candidate.json   ← a CANDIDATE, not live
  → review (listen), then PROMOTE:  daily.mjs --promote   copies candidate.json → public/music/latest.json
site (only when the flag is on): reads latest.json, plays that day's track; any failure → the bundled /music track
```

* The candidate step is the safety net: a bad day never reaches the site on its own.
* The site never calls ElevenLabs and holds no key.

## Files

| Path | Role |
|---|---|
| `scripts/music/daily.config.json` | `enabled` (false), genre rotation, model, bucket, day.json URL |
| `scripts/music/daily.mjs` | the orchestrator (`--dry-run`, default = generate candidate, `--promote`) |
| `scripts/music/package.json` | `firebase-admin` for the upload (installed only by the workflow) |
| `.github/workflows/daily-music.yml` | manual dispatch (dry-run / generate / promote); `schedule:` is commented out |
| `storage.rules` | read access for `public/music/**` (**not deployed yet**) |
| `globe/src/audio/daily-track.ts` | the site side: flag, pointer validation, fallback (dormant) |

## Why it is off

| Switch | Off state |
|---|---|
| `daily.config.json` → `enabled` | `false` (the script refuses; the workflow sets `DAILY_MUSIC_ENABLED=true` only after its own guard) |
| Workflow `schedule:` | commented out (no run happens by itself) |
| Repository variable `DAILY_MUSIC_ENABLED` | unset (a scheduled run would be skipped even if the cron were uncommented) |
| Site flag | off: `VITE_DAILY_MUSIC` not `1`, no `?daily=1`, no `localStorage["dataroute.dailyMusic"]="1"` (no network request is made) |
| Storage rules | the `public/music` read rule is in the file but not deployed |

## Activate (when you want it)

1. **Secrets** (GitHub → Settings → Secrets and variables → Actions): `ELEVENLABS_API_KEY`, and `GCP_SA_KEY` = the JSON of a
   service account with *Storage Object Admin* on the project's bucket (create it in the Google Cloud console; never commit it).
2. **Storage rules:** `firebase deploy --only storage --project omerkilavuz-9ad41` (lets the site read `public/music/**`).
3. **Try it by hand:** Actions → daily-music → Run workflow → `dry-run`, then `generate` (this spends ElevenLabs credits).
4. **Listen** to the candidate: download `public/music/<date>/track.mp3` from the bucket, or open the site with
   `?daily=1` after promoting to a test bucket path. Then run the workflow with `promote`.
5. **Site:** to use the daily track for everyone, build with `VITE_DAILY_MUSIC=1` (or set the localStorage key to test in one browser).
6. **Schedule:** uncomment `schedule:` in the workflow and set the repository variable `DAILY_MUSIC_ENABLED` to `true`.

## Cost and limits

* One composition = one ElevenLabs music generation (3 min) per day.
* The commercial-use terms of the ElevenLabs plan decide whether the track may be published on a public site: check before promoting.
* Notes are matched to routes of the day the track was composed for; `notes.json` carries the day's route-length quantiles so the live dispatch stays consistent.

## Roll back

* Stop publishing: leave `latest.json` as is, or delete `public/music/latest.json` (the site then uses the bundled track).
* Stop generating: comment the `schedule:` block / unset the variable / set `enabled` back to `false`.
