# AI version of a personal piece

The personal site (`worldofmusic-tk.web.app`) composes every piece in the browser. The **AI VERSION** button asks a Cloud
Function (`composePersonal`) for an ElevenLabs-composed track of the same character. It is **dormant** until the endpoint is
set for the site build and the function is deployed.

## What is asked for
Not the places — only the *character*: mode (visited / wish), the one to three regions the piece mostly goes through, and a
size bucket (S ≤ 3 destinations, M ≤ 8, L more). At most 2 × 63 × 3 different tracks can exist, so the cache (the bucket,
`public/personal/<key>.mp3`) is shared by everybody and the cost is bounded.

## Limits (functions/src/personal-music.ts)
- **100 new tracks per UTC day** (`DAILY_CAP`), counted in Firestore `personalMusicDaily/<day>`.
- **2 new tracks per visitor per day** (`PER_VISITOR_CAP`), the visitor being a hash of the IP with the day (`personalMusicVisitors/<day>_<hash>`).
- **Attempts per address:** at most 10 requests an hour and 30 a day (`ATTEMPTS_PER_HOUR`, `ATTEMPTS_PER_DAY`), every request counted — cached, malformed or failed ones too. Over the limit the answer is `429 rate`. The counters (`personalMusicRate`) hold only a hash of the address and the day.
- A cached track is always served, even when a cap is reached.
- Kill switch: deploy with the param `PERSONAL_MUSIC_ENABLED=false` (uncached requests answer `off`).
- A failed composition gives its claim back.

## Switching it on (the owner runs these; the key is never pasted anywhere)
1. Put the key in the project's Secret Manager. With the key in `.env.local` as `ELEVENLABS_API_KEY=...`:
   ```bash
   grep -E '^ELEVENLABS_API_KEY=' .env.local | cut -d= -f2- | tr -d '"' | firebase functions:secrets:set ELEVENLABS_API_KEY --data-file=- --project omerkilavuz-9ad41
   ```
2. Deploy the function and the storage rule:
   ```bash
   firebase deploy --only functions:composePersonal,storage --project omerkilavuz-9ad41
   ```
3. Build the site with the endpoint (the URL the deploy prints for `composePersonal`) and deploy hosting:
   ```bash
   VITE_PERSONAL_AI_URL=https://europe-west1-omerkilavuz-9ad41.cloudfunctions.net/composePersonal npm --prefix globe run build:personal
   firebase deploy --only hosting:personal --project omerkilavuz-9ad41
   ```
   (`npm run build:personal` reads `VITE_PERSONAL_AI_URL` from the environment.)

Changing the key later: repeat step 1 with the new key (a new secret version), then `firebase deploy --only functions:composePersonal`.
