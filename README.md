# DataRoute — THY 24H Data Tunnel

## Data pipeline (`functions/`)

A Cloud Function (`collect`, europe-west1) runs every 2 minutes:

1. Loads the Turkish-registered airliner fleet (`TC-` + airliner type) from the open-source
   [tar1090-db](https://github.com/wiedehopf/tar1090-db), cached weekly in `state/fleet.json`.
2. Queries live positions for that fleet from [adsb.fi](https://adsb.fi) open data
   (100 aircraft per request, 1 request/second) and keeps `THY*` callsigns.
3. Segments flights, keeps a rolling 24 h log (`state/tracker.json`), resolves routes via
   [adsbdb](https://www.adsbdb.com) (cached in Firestore `routes/`).
4. Publishes `public/day.json`:
   https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media

Switch provider (e.g. to airplanes.live once access is approved): set the `ADSB_PROVIDER`
param to `airplaneslive` in `functions/.env` and redeploy.

Logs: `firebase functions:log --only collect`

Data attribution: live aircraft data © [adsb.fi](https://adsb.fi) (personal, non-commercial use);
routes from adsbdb; fleet from tar1090-db.

## Development

    cd functions && npm test        # unit tests
    cd functions && npm run fixture # regenerate web/public/fixture/day.json

## Web installation (`web/`)

Live: https://omerkilavuz-9ad41.web.app — append `?data=fixture` for the synthetic 24 h dataset, `?debug=1` for FPS / quality.

    cd web && npm install && npm run dev     # http://localhost:5173/?data=fixture
    cd web && npm test                        # unit tests
    firebase deploy --only hosting            # builds web/ and deploys

Keys: Space pause · ← / → scrub one hour · H hide HUD · F fullscreen. Mouse: hover a ribbon for details, click to pin.

The TK fonts are licensed and are **not** in this repository: `npm run fonts` copies them from `../font`
(present only on the author's machine); without them the HUD falls back to system fonts.
Note: the deployed site (Firebase Hosting) does serve these five woff2 files, copied into `web/dist` at build time; they are licensed for this installation only and must not be redistributed.
