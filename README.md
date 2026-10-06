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

### Switching provider

`ADSB_PROVIDER` (in `functions/.env`) accepts `adsbfi` (default), `airplaneslive` and `opensky`.
`opensky` is prepared but inactive: it uses the OpenSky Network REST API with OAuth2 client
credentials (`/api/states/all?icao24=...`, 100 aircraft per request, 1.1 s spacing; the bearer token
is cached in memory until ~1 min before expiry). To enable it:

1. `firebase functions:secrets:set OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET` (API client from your
   OpenSky account page).
2. Set `ADSB_PROVIDER=opensky` in `functions/.env` and redeploy. The secrets are only bound when this
   value is set at deploy time, so the default deployment needs none.

Caveats: OpenSky previously blocked Google Cloud IPs (undocumented; not re-tested), so it may fail
from Cloud Functions. Authenticated accounts get roughly 4000 API credits/day; each request costs
credits, so budget about (requests per run x runs per day) against that. Attribution switches to
"OpenSky Network" automatically.

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

## Globe (`globe/`)

Live: https://dataroute-tk.web.app — real-time rotating Earth with every THY flight as a curved arc
(faint planned route + bright observed track; gaps in ADS-B coverage stay faint). `?data=fixture` for the
synthetic dataset, `?debug=1` for FPS / quality.

    cd globe && npm install && npm run dev     # http://localhost:5174/?data=fixture
    cd globe && npm test
    firebase deploy --only hosting:globe       # builds globe/ and deploys

Keys: Space pause · R replay ⇄ live · ← / → one hour · H hide HUD · F fullscreen · T auto-tour on/off.
Click an arc (or let the tour pick one) to FOLLOW it: the camera flows along the flight in real time with its true altitude, speed, heading and vertical speed (2-minute averages; gaps are `NO DATA`, extrapolated heads `EXTRAPOLATED`).
While following: Space pause · ← / → ±5 min · [ / ] speed ×60…×960 · Esc / G back to the globe.
Drag to rotate, hover an arc for details.

`globe/` reuses `web/src` (data, cycle, HUD) through the `@web/*` alias; the tunnel build in `web/` is unchanged
(`firebase deploy --only hosting:tunnel`). Earth imagery: NASA Earth Observatory (see `NOTICE`).
