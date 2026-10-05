# Plan 1 — THY Collector (Firebase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scheduled Firebase Cloud Function that polls OpenSky every 2 minutes for Turkish Airlines (`THY*`) aircraft, accumulates a rolling 24-hour flight log with altitude/position samples and routes, and publishes a public `day.json` — plus a deterministic fixture `day.json` for frontend development.

**Architecture:** Pure, unit-tested modules (`geo`, `regions`, `opensky` parsing, `tracker` state machine, `publish`) are composed by an orchestrator (`collect.ts`) that depends only on injected interfaces (`fetch`, `JsonStore`, `RouteCache`). `index.ts` wires real Firebase services (Cloud Storage, Firestore, Secret Manager) into the orchestrator. Tracker state lives in `state/tracker.json` (generation-conditional writes); public output in `public/day.json`.

**Tech Stack:** Node 22, TypeScript (ESM, `NodeNext`), firebase-functions v2 API (`onSchedule`, `defineSecret`), firebase-admin (Storage + Firestore), Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-05-thy-data-tunnel-design.md` (§4, §9, §10 Aşama 0, §11, §12)

## Global Constraints

- Callsign filter: `^THY[0-9A-Z]+$` (passenger + Turkish Cargo). AJet (`TKJ*`) is excluded.
- Poll interval: every 2 minutes. Function: `maxInstances: 1`, `timeoutSeconds: 90`, `memory: "512MiB"`, `region: "europe-west1"`, `retryCount: 0`.
- New-flight rules: aircraft takes off after being on ground, OR > 45 min (2700 s) since last contact, OR callsign changed.
- Flight closes (`arr` set) when seen `on_ground`, or after 45 min without contact (`arr` = last contact).
- Window: 24 h (86400 s). Flights with `arr < now − 86400` are pruned; samples older than the window are trimmed.
- Istanbul hub = `IST`, `SAW`. Istanbul reference point for bearings: `41.275°N, 28.752°E`.
- Regions: `DOM | EUR | MEA | AFR | ASI | AME | UNK`. `DOM` only if both endpoints are in `TR`.
- Route cache: Firestore `routes/{callsign}`, positive TTL 7 days, negative TTL 24 h. Max 40 route lookups per run.
- Samples in `day.json`: `[t − dep (s), altitude/100 ft (int), lat (4 dp), lon (4 dp)]`.
- `public/day.json`: gzip, `Cache-Control: public, max-age=60`, public read only for this path.
- Secrets: `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` in Secret Manager. Never commit credentials.
- Never fabricate metrics in `day.json` (no passenger counts etc.).

## File Structure

```
DataRoute/
  firebase.json                 functions + firestore + storage config
  .firebaserc                   project alias (created by `firebase use`)
  firestore.rules               deny all client access
  storage.rules                 public read only for public/day.json
  cors.json                     bucket CORS for browser fetch
  functions/
    package.json · tsconfig.json · vitest.config.ts
    src/
      day-schema.ts             all shared types (DayFile, Flight, TrackerState, …)
      geo.ts                    haversineKm, initialBearing, interpolateGreatCircle
      regions.ts                ISTANBUL, isIstanbul, countryToRegion, resolveEndpoint
      opensky.ts                fetchToken, fetchStates, parseThyStates
      routes.ts                 fetchRoute, lookupRoute, RouteCache, firestoreRouteCache
      tracker.ts                emptyState, step
      publish.ts                buildDayFile
      storage.ts                JsonStore, PreconditionFailed, gcsStore
      collect.ts                runCollect orchestrator
      probe.ts                  TEMPORARY Phase-0 probe (deleted in Task 4)
      index.ts                  onSchedule wiring
    test/
      *.test.ts                 one per module
      fixtures/opensky-states.json
    scripts/
      make-fixture.ts           writes ../web/public/fixture/day.json
```

---

### Task 0: Accounts & Firebase project (manual — the user does this)

These steps need the user's own accounts and payment method; the agent must not perform sign-ups, enter passwords, or enter payment details. The agent waits for the user to confirm each item.

- [ ] **Step 1: OpenSky API client**
  1. Create/log in to an account at https://opensky-network.org.
  2. Account page → "API Client" → create a client. Note the `client_id` and `client_secret`.
- [ ] **Step 2: Firebase project**
  1. https://console.firebase.google.com → Add project (e.g. `dataroute-thy`). Analytics not required.
  2. Upgrade to **Blaze** plan.
  3. Google Cloud console → Billing → Budgets & alerts → create a **$5/month** budget with email alerts at 50/90/100 %.
  4. Firebase console → Firestore → Create database, location `eur3 (europe-west)`, production mode.
  5. Firebase console → Storage → Get started, location `EUROPE-WEST1` (or the multi-region `EU`), production mode.
- [ ] **Step 3: CLI login (user runs in their terminal)**

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

- [ ] **Step 4: Confirm** — user tells the agent the Firebase project id. The agent records it only in `.firebaserc` (Task 1).

---

### Task 1: Scaffold `functions/`, shared types, geo math

**Files:**
- Create: `firebase.json`, `firestore.rules`, `storage.rules`, `cors.json`, `functions/package.json`, `functions/tsconfig.json`, `functions/vitest.config.ts`, `functions/src/day-schema.ts`, `functions/src/geo.ts`
- Modify: `.gitignore`
- Test: `functions/test/geo.test.ts`

**Interfaces:**
- Produces (`day-schema.ts`): `Region`, `Sample`, `Airport`, `RouteInfo`, `AircraftState`, `TrackedFlight`, `TrackerState`, `Flight`, `DayStatus`, `DayFile` (exact definitions below).
- Produces (`geo.ts`): `haversineKm(lat1, lon1, lat2, lon2): number`, `initialBearing(lat1, lon1, lat2, lon2): number` (0–360), `interpolateGreatCircle(lat1, lon1, lat2, lon2, f): [lat, lon]`.

- [ ] **Step 1: Project config files**

`firebase.json`:
```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "*.log", "test", "scripts"],
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ],
  "firestore": { "rules": "firestore.rules" },
  "storage": { "rules": "storage.rules" }
}
```

`firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

`storage.rules`:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /public/day.json {
      allow read: if true;
    }
  }
}
```

`cors.json`:
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Cache-Control"],
    "maxAgeSeconds": 3600
  }
]
```

Append to `.gitignore`:
```
functions/lib/
*.log
.firebase/
```

Write `.firebaserc` with the project id the user gave in Task 0 Step 4:
```json
{ "projects": { "default": "<PROJECT_ID_FROM_USER>" } }
```

- [ ] **Step 2: `functions/` package**

`functions/package.json`:
```json
{
  "name": "dataroute-functions",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "fixture": "tsx scripts/make-fixture.ts"
  }
}
```

Run:
```bash
cd functions && npm install firebase-admin firebase-functions && npm install -D typescript vitest tsx @types/node
```

`functions/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

`functions/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 3: Shared types**

`functions/src/day-schema.ts`:
```ts
// Shared types for the collector and (via `import type`) the web client.

export type Region = "DOM" | "EUR" | "MEA" | "AFR" | "ASI" | "AME" | "UNK";

/** [t (unix s, absolute in tracker / relative to dep in day.json), alt/100 ft, lat, lon] */
export type Sample = [number, number, number, number];

export interface Airport {
  iata: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lon: number;
}

export interface RouteInfo {
  origin: Airport;
  destination: Airport;
}

/** One THY aircraft from one OpenSky poll. */
export interface AircraftState {
  icao24: string;
  cs: string; // trimmed callsign, e.g. "THY1"
  t: number; // unix s (time_position, falling back to last_contact)
  lat: number;
  lon: number;
  alt100: number | null; // altitude / 100 ft, rounded
  onGround: boolean;
  gs: number | null; // ground speed, knots
  trk: number | null; // true track, degrees
}

export interface TrackedFlight {
  id: string; // `${icao24}-${dep}`
  icao24: string;
  cs: string;
  dep: number;
  arr: number | null;
  lastContact: number;
  samples: Sample[]; // absolute t
  now?: { gs: number; trk: number };
  /** undefined = not looked up yet, null = looked up, unknown */
  route?: RouteInfo | null;
}

export interface TrackerState {
  v: 1;
  collectingSince: number;
  lastSuccessAt: number;
  flights: TrackedFlight[];
}

export interface Flight {
  id: string;
  cs: string;
  tk: string;
  from?: string;
  to?: string;
  region: Region;
  bearing: number;
  dep: number;
  arr: number | null;
  s: Sample[]; // t relative to dep
  now?: { gs: number; trk: number };
}

export interface DayStatus {
  state: "ok" | "delayed";
  lastSuccessAt: number;
  error?: string;
}

export interface DayFile {
  v: 1;
  generatedAt: number;
  collectingSince: number;
  status: DayStatus;
  window: { from: number; to: number };
  stats: {
    airborne: number;
    flights24h: number;
    destinations: number;
    countries: number;
    km24h: number;
  };
  flights: Flight[];
}
```

- [ ] **Step 4: Write the failing geo test**

`functions/test/geo.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { haversineKm, initialBearing, interpolateGreatCircle } from "../src/geo.js";

describe("geo", () => {
  it("haversine IST→JFK ≈ 8027 km", () => {
    expect(haversineKm(41.2613, 28.742, 40.6398, -73.7789)).toBeCloseTo(8027.1, 0);
  });

  it("bearings from Istanbul", () => {
    expect(initialBearing(41.275, 28.752, 40.6398, -73.7789)).toBeCloseTo(308.9, 1); // JFK
    expect(initialBearing(41.275, 28.752, 35.765, 140.386)).toBeCloseTo(49.8, 1); // NRT
    expect(initialBearing(41.275, 28.752, -26.139, 28.246)).toBeCloseTo(180.5, 1); // JNB
  });

  it("cardinal bearings", () => {
    expect(initialBearing(0, 0, 10, 0)).toBeCloseTo(0, 6);
    expect(initialBearing(0, 0, 0, 10)).toBeCloseTo(90, 6);
  });

  it("great-circle interpolation", () => {
    const [lat, lon] = interpolateGreatCircle(0, 0, 0, 90, 0.5);
    expect(lat).toBeCloseTo(0, 6);
    expect(lon).toBeCloseTo(45, 6);
    expect(interpolateGreatCircle(10, 20, 10, 20, 0.3)).toEqual([10, 20]);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `cd functions && npx vitest run test/geo.test.ts`
Expected: FAIL — cannot resolve `../src/geo.js`.

- [ ] **Step 6: Implement `geo.ts`**

`functions/src/geo.ts`:
```ts
const R = 6371.0088; // mean Earth radius, km
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial great-circle bearing, degrees clockwise from north, in [0, 360). */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = rad(lat1);
  const φ2 = rad(lat2);
  const Δλ = rad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point at fraction f ∈ [0,1] along the great circle from (lat1,lon1) to (lat2,lon2). */
export function interpolateGreatCircle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  f: number,
): [number, number] {
  const δ = haversineKm(lat1, lon1, lat2, lon2) / R;
  if (δ < 1e-9) return [lat1, lon1];
  const φ1 = rad(lat1);
  const λ1 = rad(lon1);
  const φ2 = rad(lat2);
  const λ2 = rad(lon2);
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))];
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: 4 tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add firebase.json .firebaserc firestore.rules storage.rules cors.json .gitignore functions/package.json functions/package-lock.json functions/tsconfig.json functions/vitest.config.ts functions/src functions/test
git commit -m "feat(functions): scaffold collector, shared schema, geo math"
```

---

### Task 2: Regions & Istanbul endpoint resolution

**Files:**
- Create: `functions/src/regions.ts`
- Test: `functions/test/regions.test.ts`

**Interfaces:**
- Consumes: `initialBearing` (Task 1), `Airport`, `RouteInfo`, `Region`.
- Produces: `ISTANBUL: { lat: number; lon: number }`, `isIstanbul(iata: string): boolean`, `countryToRegion(iso2: string): Region`, `resolveEndpoint(route: RouteInfo): { other: Airport; region: Region; bearing: number }`.

- [ ] **Step 1: Write the failing test**

`functions/test/regions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { countryToRegion, isIstanbul, resolveEndpoint } from "../src/regions.js";
import type { Airport } from "../src/day-schema.js";

const IST: Airport = { iata: "IST", country: "TR", lat: 41.2613, lon: 28.742 };
const SAW: Airport = { iata: "SAW", country: "TR", lat: 40.8986, lon: 29.3092 };
const ESB: Airport = { iata: "ESB", country: "TR", lat: 40.128, lon: 32.995 };
const ADB: Airport = { iata: "ADB", country: "TR", lat: 38.292, lon: 27.157 };
const JFK: Airport = { iata: "JFK", country: "US", lat: 40.6398, lon: -73.7789 };
const FRA: Airport = { iata: "FRA", country: "DE", lat: 50.033, lon: 8.571 };

describe("regions", () => {
  it("isIstanbul", () => {
    expect(isIstanbul("IST")).toBe(true);
    expect(isIstanbul("SAW")).toBe(true);
    expect(isIstanbul("ESB")).toBe(false);
  });

  it("countryToRegion", () => {
    expect(countryToRegion("TR")).toBe("DOM");
    expect(countryToRegion("GB")).toBe("EUR");
    expect(countryToRegion("AZ")).toBe("EUR");
    expect(countryToRegion("AE")).toBe("MEA");
    expect(countryToRegion("EG")).toBe("AFR");
    expect(countryToRegion("JP")).toBe("ASI");
    expect(countryToRegion("AU")).toBe("ASI");
    expect(countryToRegion("BR")).toBe("AME");
    expect(countryToRegion("ZZ")).toBe("UNK");
  });

  it("outbound: other end is destination", () => {
    const r = resolveEndpoint({ origin: IST, destination: JFK });
    expect(r.other.iata).toBe("JFK");
    expect(r.region).toBe("AME");
    expect(r.bearing).toBeCloseTo(308.9, 1);
  });

  it("inbound: other end is origin", () => {
    const r = resolveEndpoint({ origin: JFK, destination: SAW });
    expect(r.other.iata).toBe("JFK");
    expect(r.region).toBe("AME");
  });

  it("domestic", () => {
    expect(resolveEndpoint({ origin: IST, destination: ESB }).region).toBe("DOM");
    expect(resolveEndpoint({ origin: IST, destination: ESB }).other.iata).toBe("ESB");
  });

  it("non-Istanbul international picks the foreign end", () => {
    const r = resolveEndpoint({ origin: FRA, destination: ADB });
    expect(r.other.iata).toBe("FRA");
    expect(r.region).toBe("EUR");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/regions.test.ts`
Expected: FAIL — cannot resolve `../src/regions.js`.

- [ ] **Step 3: Implement `regions.ts`**

`functions/src/regions.ts`:
```ts
import type { Airport, Region, RouteInfo } from "./day-schema.js";
import { initialBearing } from "./geo.js";

export const ISTANBUL = { lat: 41.275, lon: 28.752 };

const HUB = new Set(["IST", "SAW"]);
export const isIstanbul = (iata: string) => HUB.has(iata);

const TABLE: Record<Exclude<Region, "DOM" | "UNK">, string> = {
  EUR: "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA GE AM AZ",
  MEA: "AE BH IQ IR IL JO KW LB OM PS QA SA SY YE",
  AFR: "DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW",
  ASI: "AF BD BT BN KH CN HK MO IN ID JP KZ KG LA MY MV MN MM NP KP KR PK PH SG LK TW TJ TH TL TM UZ VN AU NZ FJ PG",
  AME: "US CA MX GT BZ SV HN NI CR PA CU DO HT JM BS BB TT AR BO BR CL CO EC GY PY PE SR UY VE PR",
};

const BY_COUNTRY = new Map<string, Region>();
for (const [region, list] of Object.entries(TABLE)) {
  for (const iso of list.split(" ")) BY_COUNTRY.set(iso, region as Region);
}

export function countryToRegion(iso2: string): Region {
  if (iso2 === "TR") return "DOM";
  return BY_COUNTRY.get(iso2) ?? "UNK";
}

/** The end of the route that is "out in the world" as seen from Istanbul. */
function pickOther({ origin, destination }: RouteInfo): Airport {
  if (isIstanbul(origin.iata)) return destination;
  if (isIstanbul(destination.iata)) return origin;
  if (destination.country === "TR" && origin.country !== "TR") return origin;
  return destination;
}

export function resolveEndpoint(route: RouteInfo): { other: Airport; region: Region; bearing: number } {
  const other = pickOther(route);
  const domestic = route.origin.country === "TR" && route.destination.country === "TR";
  return {
    other,
    region: domestic ? "DOM" : countryToRegion(other.country),
    bearing: initialBearing(ISTANBUL.lat, ISTANBUL.lon, other.lat, other.lon),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd functions && npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/regions.ts functions/test/regions.test.ts
git commit -m "feat(functions): region mapping and Istanbul endpoint resolution"
```

---

### Task 3: OpenSky client & state parsing

**Files:**
- Create: `functions/src/opensky.ts`, `functions/test/fixtures/opensky-states.json`
- Test: `functions/test/opensky.test.ts`

**Interfaces:**
- Consumes: `AircraftState`.
- Produces: `type FetchFn = typeof fetch`, `TOKEN_URL`, `STATES_URL`, `fetchToken(f: FetchFn, clientId: string, clientSecret: string): Promise<string>`, `fetchStates(f: FetchFn, token: string): Promise<unknown>`, `parseThyStates(json: unknown): AircraftState[]`.

OpenSky state vector indices: 0 icao24, 1 callsign (space-padded), 3 time_position, 4 last_contact, 5 longitude, 6 latitude, 7 baro_altitude (m), 8 on_ground, 9 velocity (m/s), 10 true_track, 13 geo_altitude (m).

- [ ] **Step 1: Fixture (shape copied from a real response, values edited)**

`functions/test/fixtures/opensky-states.json`:
```json
{
  "time": 1791204398,
  "states": [
    ["4baa01", "THY1    ", "Turkey", 1791204398, 1791204398, 25.1, 44.2, 11277.6, false, 250.0, 308.5, 0.0, null, 11582.4, "1000", false, 0],
    ["4baa02", "THY7KC  ", "Turkey", null, 1791204390, 28.75, 41.26, null, true, 5.0, 90.0, null, null, null, "2000", false, 0],
    ["4baa03", "THY2020 ", "Turkey", 1791204380, 1791204398, 30.0, 40.0, null, false, 200.0, null, 5.0, null, 3048.0, "3000", false, 0],
    ["4bd8cf", "TKJ8VB  ", "Turkey", 1791204396, 1791204396, 29.2487, 40.8649, 289.56, false, 74.09, 64.5, -4.23, null, 403.86, "7132", false, 0],
    ["4bc8d4", "PGT71HQ ", "Turkey", 1791204398, 1791204398, 27.4625, 41.2709, 8328.66, false, 234.78, 137.04, -8.13, null, 8641.08, "4507", false, 0],
    ["4baa04", "THY55   ", "Turkey", 1791204398, 1791204398, null, null, 9000, false, 230.0, 10.0, 0.0, null, null, "4000", false, 0],
    ["4baa05", null, "Turkey", 1791204398, 1791204398, 20.0, 40.0, 9000, false, 230.0, 10.0, 0.0, null, null, "5000", false, 0]
  ]
}
```

- [ ] **Step 2: Write the failing test**

`functions/test/opensky.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/opensky-states.json" with { type: "json" };
import { STATES_URL, TOKEN_URL, fetchStates, fetchToken, parseThyStates } from "../src/opensky.js";

describe("parseThyStates", () => {
  const out = parseThyStates(fixture);

  it("keeps only THY aircraft with a position", () => {
    expect(out.map((a) => a.cs)).toEqual(["THY1", "THY7KC", "THY2020"]);
  });

  it("converts units", () => {
    const thy1 = out[0];
    expect(thy1).toEqual({
      icao24: "4baa01",
      cs: "THY1",
      t: 1791204398,
      lat: 44.2,
      lon: 25.1,
      alt100: 370, // 11277.6 m = 37000 ft
      onGround: false,
      gs: 486, // 250 m/s
      trk: 308.5,
    });
  });

  it("falls back to last_contact and geo_altitude; nulls stay null", () => {
    expect(out[1].t).toBe(1791204390);
    expect(out[1].alt100).toBeNull();
    expect(out[1].onGround).toBe(true);
    expect(out[2].alt100).toBe(100); // geo 3048 m
    expect(out[2].trk).toBeNull();
  });

  it("handles null states", () => {
    expect(parseThyStates({ time: 1, states: null })).toEqual([]);
  });
});

describe("http", () => {
  it("fetchToken posts client credentials", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }));
    await expect(fetchToken(f as unknown as typeof fetch, "id", "sec")).resolves.toBe("tok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    expect(String(init.body)).toBe("grant_type=client_credentials&client_id=id&client_secret=sec");
  });

  it("fetchStates sends bearer token and throws on HTTP errors", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    await fetchStates(ok as unknown as typeof fetch, "tok");
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(STATES_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    const bad = vi.fn(async () => new Response("", { status: 429 }));
    await expect(fetchStates(bad as unknown as typeof fetch, "tok")).rejects.toThrow("opensky states 429");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd functions && npx vitest run test/opensky.test.ts`
Expected: FAIL — cannot resolve `../src/opensky.js`.

- [ ] **Step 4: Implement `opensky.ts`**

`functions/src/opensky.ts`:
```ts
import type { AircraftState } from "./day-schema.js";

export type FetchFn = typeof fetch;

export const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
export const STATES_URL = "https://opensky-network.org/api/states/all";

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.943844;
const THY = /^THY[0-9A-Z]+$/;

export async function fetchToken(f: FetchFn, clientId: string, clientSecret: string): Promise<string> {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`opensky token ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function fetchStates(f: FetchFn, token: string): Promise<unknown> {
  const res = await f(STATES_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`opensky states ${res.status}`);
  return res.json();
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function parseThyStates(json: unknown): AircraftState[] {
  const states = ((json as { states?: unknown[][] | null }).states ?? []) as unknown[][];
  const out: AircraftState[] = [];
  for (const s of states) {
    const cs = typeof s[1] === "string" ? s[1].trim() : "";
    if (!THY.test(cs)) continue;
    const lon = num(s[5]);
    const lat = num(s[6]);
    if (lat === null || lon === null) continue;
    const altM = num(s[7]) ?? num(s[13]);
    const vel = num(s[9]);
    out.push({
      icao24: String(s[0]),
      cs,
      t: num(s[3]) ?? (num(s[4]) as number),
      lat,
      lon,
      alt100: altM === null ? null : Math.max(0, Math.round((altM * M_TO_FT) / 100)),
      onGround: s[8] === true,
      gs: vel === null ? null : Math.round(vel * MS_TO_KT),
      trk: num(s[10]),
    });
  }
  return out;
}
```

- [ ] **Step 5: Run tests**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS. (If the JSON import attribute errors under tsc, add `"resolveJsonModule": true` to `tsconfig.json` — the test folder is not in `include`, so tsc should not see it.)

- [ ] **Step 6: Commit**

```bash
git add functions/src/opensky.ts functions/test/opensky.test.ts functions/test/fixtures
git commit -m "feat(functions): OpenSky OAuth client and THY state parsing"
```

---

### Task 4: Phase 0 — verify OpenSky is reachable from Cloud Functions (GATE)

If this fails, STOP and report to the user; the spec says to revisit the hosting decision (e.g. a small VPS proxy).

**Files:**
- Create (temporary): `functions/src/probe.ts`, `functions/src/index.ts`

**Interfaces:**
- Consumes: `fetchToken`, `fetchStates`, `parseThyStates`.

- [ ] **Step 1: Store secrets (user runs; the agent never sees the secret values)**

```bash
firebase functions:secrets:set OPENSKY_CLIENT_ID
```

```bash
firebase functions:secrets:set OPENSKY_CLIENT_SECRET
```

- [ ] **Step 2: Temporary probe function**

`functions/src/probe.ts`:
```ts
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { fetchStates, fetchToken, parseThyStates } from "./opensky.js";

const ID = defineSecret("OPENSKY_CLIENT_ID");
const SECRET = defineSecret("OPENSKY_CLIENT_SECRET");

export const probe = onRequest({ region: "europe-west1", secrets: [ID, SECRET] }, async (_req, res) => {
  const started = Date.now();
  try {
    const token = await fetchToken(fetch, ID.value(), SECRET.value());
    const json = await fetchStates(fetch, token);
    const thy = parseThyStates(json);
    res.json({ ok: true, ms: Date.now() - started, thy: thy.length, sample: thy.slice(0, 3) });
  } catch (e) {
    res.status(502).json({ ok: false, ms: Date.now() - started, error: String(e) });
  }
});
```

`functions/src/index.ts`:
```ts
export { probe } from "./probe.js";
```

- [ ] **Step 3: Deploy and call**

```bash
firebase deploy --only functions:probe
```

Then call the URL printed by the deploy (format `https://europe-west1-<project>.cloudfunctions.net/probe`):
```bash
curl -s https://europe-west1-<PROJECT_ID>.cloudfunctions.net/probe
```

Expected: `{"ok":true,"ms":<under 30000>,"thy":<roughly 150–450>,...}`. Report `thy` and `ms` to the user.
If `ok:false` or a timeout: STOP, report the error text to the user, do not continue.

- [ ] **Step 4: Remove the probe**

```bash
firebase functions:delete probe --region europe-west1 --force
```

Delete `functions/src/probe.ts`; set `functions/src/index.ts` to:
```ts
export {};
```

- [ ] **Step 5: Commit**

```bash
git add functions/src/index.ts
git commit -m "chore(functions): phase 0 OpenSky reachability verified"
```

(Record the measured `thy` count and latency in the commit body.)

---

### Task 5: Route lookup with cache

**Files:**
- Create: `functions/src/routes.ts`
- Test: `functions/test/routes.test.ts`

**Interfaces:**
- Consumes: `FetchFn` (Task 3), `RouteInfo`, `Airport`.
- Produces: `ADSBDB_URL`, `ROUTE_TTL = 604800`, `NEG_TTL = 86400`, `interface RouteCacheEntry { route: RouteInfo | null; fetchedAt: number }`, `interface RouteCache { get(cs: string): Promise<RouteCacheEntry | null>; set(cs: string, e: RouteCacheEntry): Promise<void> }`, `fetchRoute(f, cs): Promise<RouteInfo | null>`, `lookupRoute(cs, cache, f, now): Promise<RouteInfo | null>`, `firestoreRouteCache(db: Firestore): RouteCache`.

- [ ] **Step 1: Write the failing test**

`functions/test/routes.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { ADSBDB_URL, fetchRoute, lookupRoute, type RouteCache, type RouteCacheEntry } from "../src/routes.js";

const THY1 = {
  response: {
    flightroute: {
      callsign: "THY1",
      origin: { country_iso_name: "TR", iata_code: "IST", latitude: 41.261297, longitude: 28.741951 },
      destination: { country_iso_name: "US", iata_code: "JFK", latitude: 40.639801, longitude: -73.7789 },
    },
  },
};

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

function memCache(init: Record<string, RouteCacheEntry> = {}): RouteCache & { data: Record<string, RouteCacheEntry> } {
  const data = { ...init };
  return { data, get: async (cs) => data[cs] ?? null, set: async (cs, e) => void (data[cs] = e) };
}

describe("fetchRoute", () => {
  it("maps adsbdb response", async () => {
    const f = respond(200, THY1);
    await expect(fetchRoute(f as unknown as typeof fetch, "THY1")).resolves.toEqual({
      origin: { iata: "IST", country: "TR", lat: 41.261297, lon: 28.741951 },
      destination: { iata: "JFK", country: "US", lat: 40.639801, lon: -73.7789 },
    });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(`${ADSBDB_URL}THY1`);
  });

  it("404 → null, 500 → throws", async () => {
    await expect(fetchRoute(respond(404, { response: "unknown callsign" }) as unknown as typeof fetch, "THYX")).resolves.toBeNull();
    await expect(fetchRoute(respond(500, {}) as unknown as typeof fetch, "THYX")).rejects.toThrow("adsbdb 500");
  });
});

describe("lookupRoute", () => {
  const now = 1_000_000;

  it("uses a fresh positive cache entry without fetching", async () => {
    const cached = {
      origin: { iata: "IST", country: "TR", lat: 41.26, lon: 28.74 },
      destination: { iata: "JFK", country: "US", lat: 40.64, lon: -73.78 },
    };
    const cache = memCache({ THY1: { route: cached, fetchedAt: now - 3600 } });
    const f = vi.fn();
    await expect(lookupRoute("THY1", cache, f as unknown as typeof fetch, now)).resolves.toEqual(cached);
    expect(f).not.toHaveBeenCalled();
  });

  it("refetches an expired negative entry and stores the result", async () => {
    const cache = memCache({ THY1: { route: null, fetchedAt: now - 86400 - 1 } });
    const f = respond(200, THY1);
    const r = await lookupRoute("THY1", cache, f as unknown as typeof fetch, now);
    expect(r?.destination.iata).toBe("JFK");
    expect(cache.data.THY1.fetchedAt).toBe(now);
  });

  it("keeps a fresh negative entry", async () => {
    const cache = memCache({ THYX: { route: null, fetchedAt: now - 100 } });
    const f = vi.fn();
    await expect(lookupRoute("THYX", cache, f as unknown as typeof fetch, now)).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/routes.test.ts`
Expected: FAIL — cannot resolve `../src/routes.js`.

- [ ] **Step 3: Implement `routes.ts`**

`functions/src/routes.ts`:
```ts
import type { Firestore } from "firebase-admin/firestore";
import type { Airport, RouteInfo } from "./day-schema.js";
import type { FetchFn } from "./opensky.js";

export const ADSBDB_URL = "https://api.adsbdb.com/v0/callsign/";
export const ROUTE_TTL = 7 * 86400;
export const NEG_TTL = 86400;

export interface RouteCacheEntry {
  route: RouteInfo | null;
  fetchedAt: number;
}

export interface RouteCache {
  get(cs: string): Promise<RouteCacheEntry | null>;
  set(cs: string, entry: RouteCacheEntry): Promise<void>;
}

interface AdsbdbAirport {
  iata_code: string;
  country_iso_name: string;
  latitude: number;
  longitude: number;
}

const toAirport = (a: AdsbdbAirport): Airport => ({
  iata: a.iata_code,
  country: a.country_iso_name,
  lat: a.latitude,
  lon: a.longitude,
});

export async function fetchRoute(f: FetchFn, cs: string): Promise<RouteInfo | null> {
  const res = await f(ADSBDB_URL + encodeURIComponent(cs));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`adsbdb ${res.status}`);
  const json = (await res.json()) as {
    response?: { flightroute?: { origin?: AdsbdbAirport; destination?: AdsbdbAirport } };
  };
  const fr = json.response?.flightroute;
  if (!fr?.origin || !fr.destination) return null;
  return { origin: toAirport(fr.origin), destination: toAirport(fr.destination) };
}

export async function lookupRoute(
  cs: string,
  cache: RouteCache,
  f: FetchFn,
  now: number,
): Promise<RouteInfo | null> {
  const hit = await cache.get(cs);
  if (hit && now - hit.fetchedAt < (hit.route ? ROUTE_TTL : NEG_TTL)) return hit.route;
  const route = await fetchRoute(f, cs);
  await cache.set(cs, { route, fetchedAt: now });
  return route;
}

export function firestoreRouteCache(db: Firestore): RouteCache {
  const col = db.collection("routes");
  return {
    async get(cs) {
      const snap = await col.doc(cs).get();
      return snap.exists ? (snap.data() as RouteCacheEntry) : null;
    },
    async set(cs, entry) {
      await col.doc(cs).set(entry);
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/routes.ts functions/test/routes.test.ts
git commit -m "feat(functions): adsbdb route lookup with Firestore cache"
```

---

### Task 6: Tracker state machine

**Files:**
- Create: `functions/src/tracker.ts`
- Test: `functions/test/tracker.test.ts`

**Interfaces:**
- Consumes: `AircraftState`, `TrackerState`, `TrackedFlight`.
- Produces: `GAP = 2700`, `WINDOW = 86400`, `emptyState(now: number): TrackerState`, `step(prev: TrackerState, aircraft: AircraftState[], now: number): TrackerState` (pure; never mutates `prev`; sets `lastSuccessAt = now`).

- [ ] **Step 1: Write the failing test**

`functions/test/tracker.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { AircraftState, TrackerState } from "../src/day-schema.js";
import { GAP, WINDOW, emptyState, step } from "../src/tracker.js";

const T0 = 1_800_000_000;
const ac = (o: Partial<AircraftState> = {}): AircraftState => ({
  icao24: "abc123",
  cs: "THY1",
  t: T0,
  lat: 41,
  lon: 29,
  alt100: 100,
  onGround: false,
  gs: 300,
  trk: 300,
  ...o,
});

describe("tracker.step", () => {
  it("opens a flight for an airborne aircraft", () => {
    const s = step(emptyState(T0), [ac()], T0);
    expect(s.flights).toHaveLength(1);
    expect(s.flights[0]).toMatchObject({ id: `abc123-${T0}`, cs: "THY1", dep: T0, arr: null, lastContact: T0 });
    expect(s.flights[0].samples).toEqual([[T0, 100, 41, 29]]);
    expect(s.flights[0].now).toEqual({ gs: 300, trk: 300 });
    expect(s.lastSuccessAt).toBe(T0);
  });

  it("ignores aircraft on ground with no open flight", () => {
    expect(step(emptyState(T0), [ac({ onGround: true })], T0).flights).toHaveLength(0);
  });

  it("appends samples, rounds coords, reuses previous altitude when null", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 120, alt100: null, lat: 41.123456, lon: 29.987654 })], T0 + 120);
    expect(s.flights[0].samples[1]).toEqual([T0 + 120, 100, 41.1235, 29.9877]);
  });

  it("skips non-advancing timestamps", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac()], T0 + 120);
    expect(s.flights[0].samples).toHaveLength(1);
  });

  it("closes on landing", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 600, onGround: true })], T0 + 600);
    expect(s.flights[0].arr).toBe(T0 + 600);
    expect(s.flights[0].now).toBeUndefined();
  });

  it("starts a new flight after landing and taking off again", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 600, onGround: true })], T0 + 600);
    s = step(s, [ac({ t: T0 + 3600 })], T0 + 3600);
    expect(s.flights.map((f) => f.arr)).toEqual([T0 + 600, null]);
  });

  it("starts a new flight when the callsign changes", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + 120, cs: "THY2" })], T0 + 120);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0].arr).toBe(T0);
    expect(s.flights[1].cs).toBe("THY2");
  });

  it("starts a new flight after a contact gap > 45 min", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [ac({ t: T0 + GAP + 1 })], T0 + GAP + 1);
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0].arr).toBe(T0);
  });

  it("closes unseen flights after the gap", () => {
    let s = step(emptyState(T0), [ac()], T0);
    s = step(s, [], T0 + GAP);
    expect(s.flights[0].arr).toBeNull();
    s = step(s, [], T0 + GAP + 1);
    expect(s.flights[0].arr).toBe(T0);
  });

  it("prunes flights that landed before the window and trims old samples", () => {
    const late = T0 + 700 + WINDOW - 60;
    const prev: TrackerState = {
      v: 1,
      collectingSince: T0,
      lastSuccessAt: late,
      flights: [
        { id: "a", icao24: "a", cs: "THY1", dep: T0, arr: T0 + 600, lastContact: T0 + 600, samples: [[T0, 100, 41, 29]] },
        { id: "b", icao24: "b", cs: "THY9", dep: T0 + 700, arr: null, lastContact: late, samples: [[T0 + 700, 100, 41, 29], [late, 100, 41, 29]] },
      ],
    };
    const now = T0 + 701 + WINDOW; // cutoff = T0 + 701
    const s = step(prev, [], now);
    // THY1 landed at T0+600 < cutoff → pruned. THY9 is still open (last contact 61 s ago) and keeps only the in-window sample.
    expect(s.flights.map((f) => f.cs)).toEqual(["THY9"]);
    expect(s.flights[0].arr).toBeNull();
    expect(s.flights[0].dep).toBe(T0 + 700);
    expect(s.flights[0].samples).toEqual([[late, 100, 41, 29]]);
  });

  it("does not mutate the previous state", () => {
    const a = step(emptyState(T0), [ac()], T0);
    const snapshot = JSON.stringify(a);
    step(a, [ac({ t: T0 + 120 })], T0 + 120);
    expect(JSON.stringify(a)).toBe(snapshot);
  });

  it("preserves collectingSince and route", () => {
    const prev: TrackerState = step(emptyState(T0 - 50), [ac()], T0);
    prev.flights[0].route = null;
    const s = step(prev, [ac({ t: T0 + 120 })], T0 + 120);
    expect(s.collectingSince).toBe(T0 - 50);
    expect(s.flights[0].route).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/tracker.test.ts`
Expected: FAIL — cannot resolve `../src/tracker.js`.

- [ ] **Step 3: Implement `tracker.ts`**

`functions/src/tracker.ts`:
```ts
import type { AircraftState, TrackedFlight, TrackerState } from "./day-schema.js";

export const GAP = 45 * 60;
export const WINDOW = 86400;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function emptyState(now: number): TrackerState {
  return { v: 1, collectingSince: now, lastSuccessAt: 0, flights: [] };
}

export function step(prev: TrackerState, aircraft: AircraftState[], now: number): TrackerState {
  const flights: TrackedFlight[] = prev.flights.map((f) => ({ ...f, samples: [...f.samples] }));
  const open = new Map<string, TrackedFlight>();
  for (const f of flights) if (f.arr === null) open.set(f.icao24, f);

  const close = (f: TrackedFlight, at: number) => {
    f.arr = at;
    delete f.now;
    open.delete(f.icao24);
  };

  for (const a of aircraft) {
    let f = open.get(a.icao24);
    if (f && (f.cs !== a.cs || a.t - f.lastContact > GAP)) {
      close(f, f.lastContact);
      f = undefined;
    }
    if (a.onGround) {
      if (f) close(f, a.t);
      continue;
    }
    if (!f) {
      f = { id: `${a.icao24}-${a.t}`, icao24: a.icao24, cs: a.cs, dep: a.t, arr: null, lastContact: a.t, samples: [] };
      flights.push(f);
      open.set(a.icao24, f);
    }
    const last = f.samples[f.samples.length - 1];
    if (!last || a.t > last[0]) {
      f.samples.push([a.t, a.alt100 ?? last?.[1] ?? 0, round4(a.lat), round4(a.lon)]);
    }
    f.lastContact = Math.max(f.lastContact, a.t);
    f.now = { gs: a.gs ?? 0, trk: a.trk ?? 0 };
  }

  for (const f of [...open.values()]) {
    if (now - f.lastContact > GAP) close(f, f.lastContact);
  }

  const cutoff = now - WINDOW;
  const kept = flights.filter((f) => f.arr === null || f.arr >= cutoff);
  for (const f of kept) {
    const i = f.samples.findIndex((s) => s[0] >= cutoff);
    if (i > 0) f.samples.splice(0, i);
    else if (i === -1 && f.samples.length > 1) f.samples.splice(0, f.samples.length - 1);
  }

  return { v: 1, collectingSince: prev.collectingSince, lastSuccessAt: now, flights: kept };
}
```

- [ ] **Step 4: Run tests**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tracker.ts functions/test/tracker.test.ts
git commit -m "feat(functions): flight segmentation and 24h window tracker"
```

---

### Task 7: Build `day.json`

**Files:**
- Create: `functions/src/publish.ts`
- Test: `functions/test/publish.test.ts`

**Interfaces:**
- Consumes: `resolveEndpoint` (Task 2), `haversineKm`, `initialBearing` (Task 1), `TrackerState`, `DayFile`, `DayStatus`.
- Produces: `buildDayFile(state: TrackerState, now: number, status: DayStatus): DayFile`.

Rules: `tk` = callsign with `THY` → `TK`. Bearing: route → endpoint bearing; no route → `now.trk`; else bearing first→last sample; else 0. Rounded to 0.1°. `now` emitted only for airborne flights. `destinations`/`countries` count distinct `other` endpoints among routed flights. `km24h` = rounded sum of haversine between consecutive samples.

- [ ] **Step 1: Write the failing test**

`functions/test/publish.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { RouteInfo, TrackerState } from "../src/day-schema.js";
import { buildDayFile } from "../src/publish.js";

const NOW = 1_800_000_000;
const IST = { iata: "IST", country: "TR", lat: 41.2613, lon: 28.742 };
const JFK = { iata: "JFK", country: "US", lat: 40.6398, lon: -73.7789 };
const LHR = { iata: "LHR", country: "GB", lat: 51.47, lon: -0.454 };
const toJFK: RouteInfo = { origin: IST, destination: JFK };
const fromLHR: RouteInfo = { origin: LHR, destination: IST };

const state: TrackerState = {
  v: 1,
  collectingSince: NOW - 7200,
  lastSuccessAt: NOW,
  flights: [
    {
      id: "a-1", icao24: "a", cs: "THY1", dep: NOW - 3600, arr: null, lastContact: NOW,
      samples: [[NOW - 3600, 0, 0, 0], [NOW, 370, 0, 1]],
      now: { gs: 480, trk: 300 }, route: toJFK,
    },
    {
      id: "b-1", icao24: "b", cs: "THY2", dep: NOW - 7000, arr: NOW - 100, lastContact: NOW - 100,
      samples: [[NOW - 7000, 350, 1, 0], [NOW - 100, 10, 2, 0]],
      route: fromLHR,
    },
    {
      id: "c-1", icao24: "c", cs: "THY3", dep: NOW - 600, arr: null, lastContact: NOW,
      samples: [[NOW - 600, 50, 41, 29]], now: { gs: 250, trk: 123.456 }, route: null,
    },
  ],
};

describe("buildDayFile", () => {
  const day = buildDayFile(state, NOW, { state: "ok", lastSuccessAt: NOW });

  it("header", () => {
    expect(day).toMatchObject({
      v: 1, generatedAt: NOW, collectingSince: NOW - 7200,
      status: { state: "ok", lastSuccessAt: NOW },
      window: { from: NOW - 86400, to: NOW },
    });
  });

  it("flight mapping", () => {
    const [a, b, c] = day.flights;
    expect(a).toMatchObject({ id: "a-1", cs: "THY1", tk: "TK1", from: "IST", to: "JFK", region: "AME", bearing: 308.9, dep: NOW - 3600, arr: null, now: { gs: 480, trk: 300 } });
    expect(a.s).toEqual([[0, 0, 0, 0], [3600, 370, 0, 1]]);
    expect(b).toMatchObject({ tk: "TK2", from: "LHR", to: "IST", region: "EUR" });
    expect(b.now).toBeUndefined();
    expect(c).toMatchObject({ region: "UNK", bearing: 123.5 });
    expect(c.from).toBeUndefined();
  });

  it("stats", () => {
    expect(day.stats.airborne).toBe(2);
    expect(day.stats.flights24h).toBe(3);
    expect(day.stats.destinations).toBe(2); // JFK, LHR
    expect(day.stats.countries).toBe(2); // US, GB
    expect(day.stats.km24h).toBe(222); // 111.2 km (1° lon @ equator) + 111.2 km (1° lat)
  });

  it("passes through delayed status", () => {
    const d = buildDayFile(state, NOW, { state: "delayed", lastSuccessAt: NOW - 600, error: "x" });
    expect(d.status).toEqual({ state: "delayed", lastSuccessAt: NOW - 600, error: "x" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/publish.test.ts`
Expected: FAIL — cannot resolve `../src/publish.js`.

- [ ] **Step 3: Implement `publish.ts`**

`functions/src/publish.ts`:
```ts
import type { DayFile, DayStatus, Flight, TrackedFlight, TrackerState } from "./day-schema.js";
import { haversineKm, initialBearing } from "./geo.js";
import { resolveEndpoint } from "./regions.js";
import { WINDOW } from "./tracker.js";

const round1 = (v: number) => Math.round(v * 10) / 10;

function fallbackBearing(f: TrackedFlight): number {
  if (f.now) return f.now.trk;
  const first = f.samples[0];
  const last = f.samples[f.samples.length - 1];
  if (first && last && first !== last) return initialBearing(first[2], first[3], last[2], last[3]);
  return 0;
}

function toFlight(f: TrackedFlight): Flight {
  const ep = f.route ? resolveEndpoint(f.route) : null;
  const out: Flight = {
    id: f.id,
    cs: f.cs,
    tk: f.cs.replace(/^THY/, "TK"),
    from: f.route?.origin.iata,
    to: f.route?.destination.iata,
    region: ep?.region ?? "UNK",
    bearing: round1(ep ? ep.bearing : fallbackBearing(f)),
    dep: f.dep,
    arr: f.arr,
    s: f.samples.map(([t, alt, lat, lon]) => [t - f.dep, alt, lat, lon]),
  };
  if (f.arr === null && f.now) out.now = f.now;
  return out;
}

export function buildDayFile(state: TrackerState, now: number, status: DayStatus): DayFile {
  const destinations = new Set<string>();
  const countries = new Set<string>();
  let km = 0;
  for (const f of state.flights) {
    if (f.route) {
      const { other } = resolveEndpoint(f.route);
      destinations.add(other.iata);
      countries.add(other.country);
    }
    for (let i = 1; i < f.samples.length; i++) {
      const [, , la1, lo1] = f.samples[i - 1];
      const [, , la2, lo2] = f.samples[i];
      km += haversineKm(la1, lo1, la2, lo2);
    }
  }
  return {
    v: 1,
    generatedAt: now,
    collectingSince: state.collectingSince,
    status,
    window: { from: now - WINDOW, to: now },
    stats: {
      airborne: state.flights.filter((f) => f.arr === null).length,
      flights24h: state.flights.length,
      destinations: destinations.size,
      countries: countries.size,
      km24h: Math.round(km),
    },
    flights: state.flights.map(toFlight),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/publish.ts functions/test/publish.test.ts
git commit -m "feat(functions): build public day.json with stats"
```

---

### Task 8: Storage adapter & collect orchestrator

**Files:**
- Create: `functions/src/storage.ts`, `functions/src/collect.ts`
- Test: `functions/test/collect.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `storage.ts`: `interface JsonStore { read<T>(path: string): Promise<{ data: T; generation: number } | null>; write(path: string, data: unknown, opts?: { ifGeneration?: number; cacheControl?: string }): Promise<void> }`, `class PreconditionFailed extends Error`, `gcsStore(bucket: Bucket): JsonStore`.
  - `collect.ts`: `TRACKER_PATH = "state/tracker.json"`, `DAY_PATH = "public/day.json"`, `DAY_CACHE = "public, max-age=60"`, `MAX_ROUTE_LOOKUPS = 40`, `interface CollectDeps { fetch: FetchFn; now: () => number; store: JsonStore; routes: RouteCache; creds: { id: string; secret: string }; log: (msg: string, extra?: Record<string, unknown>) => void }`, `runCollect(d: CollectDeps): Promise<"ok" | "delayed" | "conflict">`.

- [ ] **Step 1: Write the failing test**

`functions/test/collect.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { DayFile, TrackerState } from "../src/day-schema.js";
import { DAY_PATH, TRACKER_PATH, runCollect, type CollectDeps } from "../src/collect.js";
import { PreconditionFailed, type JsonStore } from "../src/storage.js";
import type { RouteCache, RouteCacheEntry } from "../src/routes.js";

const NOW = 1_800_000_000;

function memStore(): JsonStore & { files: Map<string, { data: unknown; generation: number; cacheControl?: string }> } {
  const files = new Map<string, { data: unknown; generation: number; cacheControl?: string }>();
  return {
    files,
    async read<T>(path: string) {
      const f = files.get(path);
      return f ? { data: structuredClone(f.data) as T, generation: f.generation } : null;
    },
    async write(path, data, opts = {}) {
      const cur = files.get(path);
      if (opts.ifGeneration !== undefined && (cur?.generation ?? 0) !== opts.ifGeneration) throw new PreconditionFailed(path);
      files.set(path, { data: structuredClone(data), generation: (cur?.generation ?? 0) + 1, cacheControl: opts.cacheControl });
    },
  };
}

const memRoutes = (): RouteCache => {
  const m = new Map<string, RouteCacheEntry>();
  return { get: async (cs) => m.get(cs) ?? null, set: async (cs, e) => void m.set(cs, e) };
};

const statesBody = {
  time: NOW,
  states: [["abc123", "THY1    ", "Turkey", NOW, NOW, 25.1, 44.2, 11277.6, false, 250, 308.5, 0, null, null, "1", false, 0]],
};
const routeBody = {
  response: {
    flightroute: {
      origin: { country_iso_name: "TR", iata_code: "IST", latitude: 41.26, longitude: 28.74 },
      destination: { country_iso_name: "US", iata_code: "JFK", latitude: 40.64, longitude: -73.78 },
    },
  },
};

function fakeFetch(opts: { statesStatus?: number } = {}) {
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("openid-connect/token")) return new Response(JSON.stringify({ access_token: "t" }));
    if (url.includes("/states/all")) return new Response(JSON.stringify(statesBody), { status: opts.statesStatus ?? 200 });
    if (url.includes("adsbdb")) return new Response(JSON.stringify(routeBody));
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
}

const deps = (over: Partial<CollectDeps> = {}): CollectDeps => ({
  fetch: fakeFetch(),
  now: () => NOW,
  store: memStore(),
  routes: memRoutes(),
  creds: { id: "id", secret: "s" },
  log: () => {},
  ...over,
});

describe("runCollect", () => {
  it("first run creates tracker and day.json with routes", async () => {
    const d = deps();
    await expect(runCollect(d)).resolves.toBe("ok");
    const store = d.store as ReturnType<typeof memStore>;
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.collectingSince).toBe(NOW);
    expect(tracker.flights[0].route?.destination.iata).toBe("JFK");
    const day = store.files.get(DAY_PATH)!;
    expect(day.cacheControl).toBe("public, max-age=60");
    expect((day.data as DayFile).flights[0]).toMatchObject({ tk: "TK1", region: "AME" });
    expect((day.data as DayFile).status.state).toBe("ok");
  });

  it("OpenSky failure publishes delayed status and keeps tracker untouched", async () => {
    const store = memStore();
    await runCollect(deps({ store }));
    const gen = store.files.get(TRACKER_PATH)!.generation;
    await expect(runCollect(deps({ store, fetch: fakeFetch({ statesStatus: 429 }), now: () => NOW + 120 }))).resolves.toBe("delayed");
    expect(store.files.get(TRACKER_PATH)!.generation).toBe(gen);
    const day = store.files.get(DAY_PATH)!.data as DayFile;
    expect(day.status).toEqual({ state: "delayed", lastSuccessAt: NOW, error: "Error: opensky states 429" });
    expect(day.flights).toHaveLength(1);
  });

  it("tracker write conflict skips publishing", async () => {
    const store = memStore();
    const racing: JsonStore = {
      read: store.read,
      async write(path, data, opts) {
        if (path === TRACKER_PATH) throw new PreconditionFailed(path);
        return store.write(path, data, opts);
      },
    };
    await expect(runCollect(deps({ store: racing }))).resolves.toBe("conflict");
    expect(store.files.has(DAY_PATH)).toBe(false);
  });

  it("route lookup failure leaves route undefined for retry", async () => {
    const f = (async (input: string | URL) => {
      if (String(input).includes("adsbdb")) return new Response("", { status: 500 });
      return fakeFetch()(input);
    }) as typeof fetch;
    const store = memStore();
    await runCollect(deps({ store, fetch: f }));
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.flights[0].route).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/collect.test.ts`
Expected: FAIL — cannot resolve `../src/collect.js`.

- [ ] **Step 3: Implement `storage.ts`**

`functions/src/storage.ts`:
```ts
import type { getStorage } from "firebase-admin/storage";

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

export interface JsonStore {
  read<T>(path: string): Promise<{ data: T; generation: number } | null>;
  write(path: string, data: unknown, opts?: { ifGeneration?: number; cacheControl?: string }): Promise<void>;
}

export class PreconditionFailed extends Error {}

const code = (e: unknown) => (e as { code?: number }).code;

export function gcsStore(bucket: Bucket): JsonStore {
  return {
    async read<T>(path: string) {
      try {
        const [meta] = await bucket.file(path).getMetadata();
        const generation = Number(meta.generation);
        const [buf] = await bucket.file(path, { generation }).download();
        return { data: JSON.parse(buf.toString("utf8")) as T, generation };
      } catch (e) {
        if (code(e) === 404) return null;
        throw e;
      }
    },
    async write(path, data, opts = {}) {
      try {
        await bucket.file(path).save(JSON.stringify(data), {
          gzip: true,
          contentType: "application/json",
          metadata: { cacheControl: opts.cacheControl ?? "no-store" },
          ...(opts.ifGeneration !== undefined
            ? { preconditionOpts: { ifGenerationMatch: opts.ifGeneration } }
            : {}),
        });
      } catch (e) {
        if (code(e) === 412) throw new PreconditionFailed(path);
        throw e;
      }
    },
  };
}
```

- [ ] **Step 4: Implement `collect.ts`**

`functions/src/collect.ts`:
```ts
import type { AircraftState, TrackerState } from "./day-schema.js";
import { fetchStates, fetchToken, parseThyStates, type FetchFn } from "./opensky.js";
import { buildDayFile } from "./publish.js";
import { lookupRoute, type RouteCache } from "./routes.js";
import { PreconditionFailed, type JsonStore } from "./storage.js";
import { emptyState, step } from "./tracker.js";

export const TRACKER_PATH = "state/tracker.json";
export const DAY_PATH = "public/day.json";
export const DAY_CACHE = "public, max-age=60";
export const MAX_ROUTE_LOOKUPS = 40;

export interface CollectDeps {
  fetch: FetchFn;
  now: () => number;
  store: JsonStore;
  routes: RouteCache;
  creds: { id: string; secret: string };
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

async function resolveRoutes(state: TrackerState, d: CollectDeps, now: number) {
  let lookups = 0;
  for (const f of state.flights) {
    if (f.route !== undefined) continue;
    if (lookups++ >= MAX_ROUTE_LOOKUPS) break;
    try {
      f.route = await lookupRoute(f.cs, d.routes, d.fetch, now);
    } catch (e) {
      d.log("route lookup failed", { cs: f.cs, error: String(e) });
    }
  }
}

export async function runCollect(d: CollectDeps): Promise<"ok" | "delayed" | "conflict"> {
  const now = d.now();
  const current = await d.store.read<TrackerState>(TRACKER_PATH);
  const prev = current?.data ?? emptyState(now);

  let aircraft: AircraftState[];
  try {
    const token = await fetchToken(d.fetch, d.creds.id, d.creds.secret);
    aircraft = parseThyStates(await fetchStates(d.fetch, token));
  } catch (e) {
    const error = String(e);
    d.log("opensky failed", { error });
    const day = buildDayFile(prev, now, { state: "delayed", lastSuccessAt: prev.lastSuccessAt, error });
    await d.store.write(DAY_PATH, day, { cacheControl: DAY_CACHE });
    return "delayed";
  }

  const next = step(prev, aircraft, now);
  await resolveRoutes(next, d, now);

  try {
    await d.store.write(TRACKER_PATH, next, { ifGeneration: current?.generation ?? 0 });
  } catch (e) {
    if (e instanceof PreconditionFailed) {
      d.log("tracker write conflict, skipping run");
      return "conflict";
    }
    throw e;
  }

  await d.store.write(DAY_PATH, buildDayFile(next, now, { state: "ok", lastSuccessAt: now }), {
    cacheControl: DAY_CACHE,
  });
  d.log("collect ok", {
    aircraft: aircraft.length,
    flights: next.flights.length,
    unknownRoutes: next.flights.filter((f) => f.route === null).length,
    pendingRoutes: next.flights.filter((f) => f.route === undefined).length,
  });
  return "ok";
}
```

- [ ] **Step 5: Run tests**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/storage.ts functions/src/collect.ts functions/test/collect.test.ts
git commit -m "feat(functions): GCS JSON store and collect orchestrator"
```

---

### Task 9: Scheduled function, deploy, live verification

**Files:**
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `runCollect`, `gcsStore`, `firestoreRouteCache`.

- [ ] **Step 1: Wire the scheduled function**

`functions/src/index.ts`:
```ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runCollect } from "./collect.js";
import { firestoreRouteCache } from "./routes.js";
import { gcsStore } from "./storage.js";

initializeApp();

const OPENSKY_CLIENT_ID = defineSecret("OPENSKY_CLIENT_ID");
const OPENSKY_CLIENT_SECRET = defineSecret("OPENSKY_CLIENT_SECRET");

export const collect = onSchedule(
  {
    schedule: "every 2 minutes",
    region: "europe-west1",
    timeoutSeconds: 90,
    memory: "512MiB",
    maxInstances: 1,
    retryCount: 0,
    secrets: [OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET],
  },
  async () => {
    const result = await runCollect({
      fetch,
      now: () => Math.floor(Date.now() / 1000),
      store: gcsStore(getStorage().bucket()),
      routes: firestoreRouteCache(getFirestore()),
      creds: { id: OPENSKY_CLIENT_ID.value(), secret: OPENSKY_CLIENT_SECRET.value() },
      log: (msg, extra) => logger.info(msg, extra),
    });
    logger.info("collect finished", { result });
  },
);
```

- [ ] **Step 2: Build**

Run: `cd functions && npm run build && npx vitest run`
Expected: `lib/index.js` emitted, all tests PASS.

- [ ] **Step 3: Deploy rules and function**

```bash
firebase deploy --only functions:collect,firestore:rules,storage
```

Expected: deploy succeeds; Cloud Scheduler job created for `collect`.

- [ ] **Step 4: Bucket CORS**

Find the default bucket name in Firebase console → Storage (e.g. `<project>.firebasestorage.app`), then:
```bash
gcloud storage buckets update gs://<BUCKET> --cors-file=cors.json
```

- [ ] **Step 5: Artifact Registry cleanup policy (keeps image storage in the free tier)**

```bash
firebase functions:artifacts:setpolicy --location europe-west1 --days 3 --force
```

If the CLI reports an unknown command, update it (`npm install -g firebase-tools@latest`) and retry.

- [ ] **Step 6: Verify live output after ≥ 2 scheduler runs (~5 min)**

```bash
firebase functions:log --only collect
```

Expected: `collect ok` entries with `aircraft` ≈ 150–450.

```bash
curl -s "https://firebasestorage.googleapis.com/v0/b/<BUCKET>/o/public%2Fday.json?alt=media" | head -c 600
```

Expected: JSON starting with `{"v":1,"generatedAt":...,"status":{"state":"ok"...`. Also check the header:
```bash
curl -sI "https://firebasestorage.googleapis.com/v0/b/<BUCKET>/o/public%2Fday.json?alt=media" | grep -i -E "cache-control|access-control"
```
Expected: `cache-control: public, max-age=60`.

Confirm `state/tracker.json` is NOT publicly readable:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://firebasestorage.googleapis.com/v0/b/<BUCKET>/o/state%2Ftracker.json?alt=media"
```
Expected: `403`.

- [ ] **Step 7: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat(functions): scheduled collector every 2 minutes"
```

Record the bucket name and public `day.json` URL in `README.md` (create it with a short "Data pipeline" section: what the function does, the URL, how to view logs) and commit it in this step.

---

### Task 10: Deterministic fixture `day.json` for frontend development

Synthetic but realistic: real THY destinations with correct coordinates, departures weighted by a hub "bank" profile, great-circle paths, climb/cruise/descent altitude profile, 120 s sampling. Built through the real `buildDayFile` so the schema can never drift.

**Files:**
- Create: `functions/scripts/make-fixture.ts`
- Output: `web/public/fixture/day.json`
- Test: `functions/test/fixture.test.ts`

**Interfaces:**
- Consumes: `buildDayFile`, `interpolateGreatCircle`, `haversineKm`, `TrackerState`, `TrackedFlight`, `Airport`.
- Produces: `makeFixture(now: number, seed?: number): DayFile` (exported for the test); running the script writes the file.

- [ ] **Step 1: Write the failing test**

`functions/test/fixture.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeFixture } from "../scripts/make-fixture.js";

describe("makeFixture", () => {
  const NOW = 1_800_000_000;
  const day = makeFixture(NOW, 42);

  it("is deterministic", () => {
    expect(JSON.stringify(makeFixture(NOW, 42))).toBe(JSON.stringify(day));
  });

  it("has a realistic volume and mix", () => {
    expect(day.stats.flights24h).toBeGreaterThan(1500);
    expect(day.stats.flights24h).toBeLessThan(2300);
    expect(day.stats.airborne).toBeGreaterThan(150);
    expect(day.stats.airborne).toBeLessThan(600);
    const regions = new Set(day.flights.map((f) => f.region));
    for (const r of ["DOM", "EUR", "MEA", "AFR", "ASI", "AME"]) expect(regions.has(r as never)).toBe(true);
  });

  it("samples stay in the window and below FL420", () => {
    for (const f of day.flights) {
      for (const [dt, alt] of f.s) {
        expect(f.dep + dt).toBeLessThanOrEqual(NOW);
        expect(f.dep + dt).toBeGreaterThanOrEqual(NOW - 86400);
        expect(alt).toBeLessThanOrEqual(420);
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/fixture.test.ts`
Expected: FAIL — cannot resolve `../scripts/make-fixture.js`.

- [ ] **Step 3: Implement the generator**

`functions/scripts/make-fixture.ts`:
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Airport, DayFile, Sample, TrackedFlight, TrackerState } from "../src/day-schema.js";
import { haversineKm, interpolateGreatCircle } from "../src/geo.js";
import { buildDayFile } from "../src/publish.js";

const IST: Airport = { iata: "IST", country: "TR", lat: 41.2613, lon: 28.742 };

// [iata, country, lat, lon, relative daily frequency]
const DESTS: [string, string, number, number, number][] = [
  ["ESB", "TR", 40.128, 32.995, 10], ["ADB", "TR", 38.292, 27.157, 9], ["AYT", "TR", 36.899, 30.8, 8],
  ["TZX", "TR", 40.995, 39.79, 5], ["DIY", "TR", 37.894, 40.201, 4],
  ["LHR", "GB", 51.47, -0.454, 6], ["CDG", "FR", 49.01, 2.548, 5], ["FRA", "DE", 50.033, 8.571, 6],
  ["AMS", "NL", 52.31, 4.768, 4], ["FCO", "IT", 41.8, 12.239, 4], ["MAD", "ES", 40.472, -3.561, 3],
  ["MUC", "DE", 48.354, 11.786, 4], ["VIE", "AT", 48.11, 16.57, 3], ["ATH", "GR", 37.936, 23.947, 3],
  ["SVO", "RU", 55.973, 37.415, 4], ["ARN", "SE", 59.652, 17.919, 2], ["TBS", "GE", 41.669, 44.955, 3],
  ["GYD", "AZ", 40.467, 50.047, 3],
  ["DXB", "AE", 25.253, 55.365, 4], ["DOH", "QA", 25.273, 51.608, 3], ["RUH", "SA", 24.958, 46.699, 3],
  ["JED", "SA", 21.68, 39.157, 3], ["TLV", "IL", 32.011, 34.887, 3], ["AMM", "JO", 31.723, 35.993, 2],
  ["BGW", "IQ", 33.263, 44.235, 2], ["IKA", "IR", 35.416, 51.152, 3], ["KWI", "KW", 29.227, 47.969, 2],
  ["CAI", "EG", 30.122, 31.406, 3], ["ADD", "ET", 8.978, 38.799, 1], ["NBO", "KE", -1.319, 36.928, 1],
  ["LOS", "NG", 6.577, 3.321, 1], ["JNB", "ZA", -26.139, 28.246, 1], ["CMN", "MA", 33.368, -7.59, 2],
  ["ALG", "DZ", 36.691, 3.215, 2], ["DAR", "TZ", -6.878, 39.203, 1],
  ["JFK", "US", 40.64, -73.779, 2], ["ORD", "US", 41.979, -87.905, 1], ["LAX", "US", 33.943, -118.408, 1],
  ["MIA", "US", 25.796, -80.287, 1], ["IAD", "US", 38.953, -77.456, 1], ["YYZ", "CA", 43.677, -79.631, 1],
  ["GRU", "BR", -23.436, -46.473, 1], ["EZE", "AR", -34.822, -58.536, 0.5], ["BOG", "CO", 4.702, -74.147, 0.5],
  ["MEX", "MX", 19.436, -99.072, 0.5],
  ["NRT", "JP", 35.765, 140.386, 1], ["ICN", "KR", 37.46, 126.441, 1], ["PEK", "CN", 40.08, 116.585, 1],
  ["PVG", "CN", 31.144, 121.808, 1], ["HKG", "HK", 22.308, 113.918, 1], ["SIN", "SG", 1.364, 103.991, 1],
  ["BKK", "TH", 13.69, 100.75, 1], ["DEL", "IN", 28.556, 77.1, 1], ["BOM", "IN", 19.089, 72.868, 1],
  ["KUL", "MY", 2.746, 101.71, 1], ["CGK", "ID", -6.126, 106.656, 0.5], ["TAS", "UZ", 41.258, 69.281, 2],
  ["ALA", "KZ", 43.352, 77.04, 1], ["SYD", "AU", -33.946, 151.177, 0.5], ["MNL", "PH", 14.508, 121.02, 0.5],
  ["KHI", "PK", 24.907, 67.161, 1],
];

// Hub bank profile: relative departures per UTC hour.
const HOURLY = [3, 2, 1.5, 2, 4, 6, 7, 6, 5, 5, 6, 6, 5, 5, 6, 7, 7, 6, 6, 6, 7, 6, 5, 4];

const TARGET_FLIGHTS = 1900;
const STEP = 120;
const KMH = 830;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: T[], weight: (x: T) => number, r: number): T {
  const total = items.reduce((s, x) => s + weight(x), 0);
  let acc = r * total;
  for (const x of items) {
    acc -= weight(x);
    if (acc <= 0) return x;
  }
  return items[items.length - 1];
}

export function makeFixture(now: number, seed = 1): DayFile {
  const rnd = mulberry32(seed);
  const flights: TrackedFlight[] = [];
  const hours = HOURLY.map((w, h) => ({ h, w }));

  for (let n = 0; n < TARGET_FLIGHTS; n++) {
    const [iata, country, lat, lon] = pickWeighted(DESTS, (d) => d[4], rnd());
    const other: Airport = { iata, country, lat, lon };
    const outbound = rnd() < 0.5;
    const origin = outbound ? IST : other;
    const destination = outbound ? other : IST;

    const km = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
    const dur = Math.round((km / KMH + 0.4) * 3600);
    const cruise = km < 1000 ? 330 : km < 3000 ? 370 : 390 + Math.round(rnd() * 20);

    // Departure: weighted hour of day, spread over [now − 86400 − dur, now].
    const { h } = pickWeighted(hours, (x) => x.w, rnd());
    const dayStart = Math.floor((now - 86400) / 86400) * 86400;
    let dep = dayStart + h * 3600 + Math.floor(rnd() * 3600);
    while (dep + dur < now - 86400) dep += 86400;
    if (dep > now) continue;

    const climb = 22 * 60;
    const descent = 28 * 60;
    const samples: Sample[] = [];
    for (let t = dep; t <= Math.min(dep + dur, now); t += STEP) {
      if (t < now - 86400) continue;
      const e = t - dep;
      const f = e / dur;
      const alt = Math.round(cruise * Math.max(0, Math.min(1, e / climb, (dur - e) / descent)));
      const [la, lo] = interpolateGreatCircle(origin.lat, origin.lon, destination.lat, destination.lon, f);
      samples.push([t, alt, Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4]);
    }
    if (samples.length === 0) continue;

    const airborne = dep + dur > now;
    const last = samples[samples.length - 1];
    const icao24 = Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0");
    flights.push({
      id: `${icao24}-${dep}`,
      icao24,
      cs: `THY${1 + Math.floor(rnd() * 2999)}`,
      dep,
      arr: airborne ? null : dep + dur,
      lastContact: last[0],
      samples,
      route: { origin, destination },
      ...(airborne ? { now: { gs: Math.round(440 + rnd() * 60), trk: Math.round(rnd() * 3600) / 10 } } : {}),
    });
  }

  flights.sort((a, b) => a.dep - b.dep);
  const state: TrackerState = { v: 1, collectingSince: now - 86400, lastSuccessAt: now, flights };
  return buildDayFile(state, now, { state: "ok", lastSuccessAt: now });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/public/fixture/day.json");
  const day = makeFixture(Math.floor(Date.now() / 1000), 42);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(day));
  console.log(`wrote ${out}: ${day.stats.flights24h} flights, ${day.stats.airborne} airborne`);
}
```

- [ ] **Step 4: Run tests**

Run: `cd functions && npx vitest run`
Expected: all PASS. If the volume assertions fail, adjust only `TARGET_FLIGHTS` (the dropped `dep > now` draws reduce the count) and re-run.

- [ ] **Step 5: Generate the fixture**

Run: `cd functions && npm run fixture`
Expected: `wrote .../web/public/fixture/day.json: ~1900 flights, ~300 airborne`. Check size: `ls -lh ../web/public/fixture/day.json` (expect a few MB raw; gzip on hosting).

- [ ] **Step 6: Commit**

```bash
git add functions/scripts/make-fixture.ts functions/test/fixture.test.ts web/public/fixture/day.json
git commit -m "feat(functions): deterministic fixture day.json for web development"
```

---

## Next plans

- **Plan 2 — Web Phase 1:** Vite + React + TS + Three.js app reading `day.json` (live or `?data=fixture`): tunnel pass, ribbons, bloom, picking, HUD, `REPLAY ⇄ LIVE` cycle, input handling, adaptive quality, Firebase Hosting.
- **Plan 3 — Web Phase 2:** globe pass, land mask, morph, `EXIT / GLOBAL / DIVE`.

---

## Amendment A — Data source switch to adsb.fi (2026-10-05)

**Why:** Task 4 (Phase 0) failed. From Cloud Functions `europe-west1`, `opensky-network.org` and `auth.opensky-network.org` time out (`UND_ERR_CONNECT_TIMEOUT`), while adsbdb works. The same credentials work from the user's machine. OpenSky blocks Google Cloud IPs. The user chose a community ADS-B aggregator. Verified from Cloud Functions: `https://opendata.adsb.fi/api/v2/hex/<a,b,…>` → 200 in 151 ms; `tar1090-db` `aircraft.csv.gz` → 200. airplanes.live has the same v2 API but returns 403 until access is approved by email, so the client is provider-agnostic.

**Superseded:** Task 3's `opensky.ts` is replaced by `adsb.ts` (A1) and removed in A3. Task 4 is closed (findings above). Task 9 is replaced by Task A4. Already-done Firebase setup: Firestore `(default)` in `eur3`; default bucket `omerkilavuz-9ad41.firebasestorage.app` (EUROPE-WEST1); project budget alert exists (100 TRY); `.firebaserc` → `omerkilavuz-9ad41`.

**Amended Global Constraints (replace the OpenSky/secret lines above):**
- Provider: ADSBexchange-v2 compatible `GET {baseUrl}/v2/hex/{hex,hex,…}`. Default `adsbfi` = `{ name: "adsb.fi", url: "https://adsb.fi", baseUrl: "https://opendata.adsb.fi/api" }`; alternative `airplaneslive` = `{ name: "airplanes.live", url: "https://airplanes.live", baseUrl: "https://api.airplanes.live" }`. Selected by the string param `ADSB_PROVIDER` (default `adsbfi`).
- Fleet: hexes of aircraft whose registration starts with `TC-` and whose ICAO type is in the airliner set (below), from `https://raw.githubusercontent.com/wiedehopf/tar1090-db/csv/aircraft.csv.gz` (rows `hex;registration;type;…`), cached at `state/fleet.json`, refreshed every 7 days; on refresh failure use the stale list.
- Query in chunks of 100 hexes, 1100 ms between requests (adsb.fi limit 1 req/s).
- Callsign filter unchanged: `^THY[0-9A-Z]+$`.
- `alt_baro === "ground"` ⇒ on ground. Altitude: `alt_baro` (number) else `alt_geom`, in feet → `/100` rounded. Sample time `t = round(now_s − seen_pos)` (fallback `seen`, then 0), where `now_s = response.now / 1000`.
- `day.json` gains `source: { name: string; url: string }` (HUD attribution; adsb.fi terms require citing adsb.fi with a link). Fixture uses `{ name: "synthetic fixture", url: "" }`.
- No secrets are needed any more.

Airliner ICAO type set (exact):
```
A19N A20N A21N A319 A320 A321 A332 A333 A338 A339 A359 A35K A306 A310 B37M B38M B39M B3XM B737 B738 B739 B744 B748 B752 B763 B772 B77L B77W B788 B789 B78X E190 E195 E290 E295 CRJ9 AT76
```

---

### Task A1: Provider-agnostic ADS-B v2 client

**Files:**
- Create: `functions/src/adsb.ts`, `functions/test/fixtures/adsb-v2.json`
- Modify: `functions/src/routes.ts` (only the `FetchFn` import line)
- Test: `functions/test/adsb.test.ts`

**Interfaces:**
- Consumes: `AircraftState` (day-schema).
- Produces: `type FetchFn = typeof fetch`, `interface AdsbProvider { name: string; url: string; baseUrl: string }`, `PROVIDERS: { adsbfi: AdsbProvider; airplaneslive: AdsbProvider }`, `CHUNK = 100`, `SPACING_MS = 1100`, `parseV2(json: unknown): AircraftState[]`, `fetchAircraft(f: FetchFn, provider: AdsbProvider, hexes: string[], sleep: (ms: number) => Promise<void>): Promise<AircraftState[]>`.

- [ ] **Step 1: Fixture**

`functions/test/fixtures/adsb-v2.json`:
```json
{
  "now": 1791208214001,
  "total": 6,
  "msg": "No error",
  "ac": [
    { "hex": "4baa53", "flight": "THY2JE  ", "r": "TC-JRS", "t": "A321", "lat": 53.054535, "lon": 16.67099, "alt_baro": 32975, "alt_geom": 34100, "gs": 475.5, "track": 142.26, "seen_pos": 0.0, "seen": 0.0 },
    { "hex": "4baa89", "flight": "THY7KC  ", "lat": 41.26, "lon": 28.75, "alt_baro": "ground", "gs": 5.2, "track": 90, "seen_pos": 3.2, "seen": 1.0 },
    { "hex": "4baa8b", "flight": "THY2020 ", "lat": 40.0, "lon": 30.0, "alt_geom": 10000, "gs": 300, "seen_pos": 12.6, "seen": 2.0 },
    { "hex": "4bd8cf", "flight": "TKJ8VB  ", "lat": 40.86, "lon": 29.25, "alt_baro": 950, "gs": 74, "track": 64.5, "seen_pos": 0.5 },
    { "hex": "4baa79", "flight": "THY55   ", "alt_baro": 9000, "gs": 230, "track": 10, "seen": 0.3 },
    { "hex": "4baa86", "lat": 40.0, "lon": 20.0, "alt_baro": 9000, "gs": 230, "track": 10, "seen_pos": 0.2 }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`functions/test/adsb.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/adsb-v2.json" with { type: "json" };
import { CHUNK, PROVIDERS, SPACING_MS, fetchAircraft, parseV2 } from "../src/adsb.js";

describe("parseV2", () => {
  const out = parseV2(fixture);

  it("keeps only THY aircraft with a position", () => {
    expect(out.map((a) => a.cs)).toEqual(["THY2JE", "THY7KC", "THY2020"]);
  });

  it("maps fields and units", () => {
    expect(out[0]).toEqual({
      icao24: "4baa53",
      cs: "THY2JE",
      t: 1791208214,
      lat: 53.054535,
      lon: 16.67099,
      alt100: 330,
      onGround: false,
      gs: 476,
      trk: 142.26,
    });
  });

  it("ground, geometric altitude fallback, seen_pos age, missing track", () => {
    expect(out[1]).toMatchObject({ onGround: true, alt100: 0, t: 1791208211, gs: 5, trk: 90 });
    expect(out[2]).toMatchObject({ onGround: false, alt100: 100, t: 1791208201, trk: null });
  });

  it("handles empty / null ac", () => {
    expect(parseV2({ now: 1, ac: null })).toEqual([]);
    expect(parseV2({ now: 1 })).toEqual([]);
  });
});

describe("fetchAircraft", () => {
  const hexes = Array.from({ length: 250 }, (_, i) => i.toString(16).padStart(6, "0"));

  it("queries in chunks with spacing and merges results", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(fixture)));
    const sleep = vi.fn(async () => {});
    const out = await fetchAircraft(f as unknown as typeof fetch, PROVIDERS.adsbfi, hexes, sleep);
    const urls = f.mock.calls.map((c) => String((c as unknown as [string])[0]));
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe(`https://opendata.adsb.fi/api/v2/hex/${hexes.slice(0, CHUNK).join(",")}`);
    expect(urls[2]).toBe(`https://opendata.adsb.fi/api/v2/hex/${hexes.slice(200).join(",")}`);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(SPACING_MS);
    expect(out.map((a) => a.cs)).toEqual(["THY2JE", "THY7KC", "THY2020"]); // deduplicated by icao24
  });

  it("uses the airplanes.live base URL", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ now: 1, ac: [] })));
    await fetchAircraft(f as unknown as typeof fetch, PROVIDERS.airplaneslive, ["4baa53"], async () => {});
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toBe("https://api.airplanes.live/v2/hex/4baa53");
  });

  it("throws with the provider name on HTTP errors", async () => {
    const f = vi.fn(async () => new Response("", { status: 429 }));
    await expect(fetchAircraft(f as unknown as typeof fetch, PROVIDERS.adsbfi, ["4baa53"], async () => {})).rejects.toThrow("adsb.fi 429");
  });

  it("does nothing for an empty fleet", async () => {
    const f = vi.fn();
    await expect(fetchAircraft(f as unknown as typeof fetch, PROVIDERS.adsbfi, [], async () => {})).resolves.toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd functions && npx vitest run test/adsb.test.ts`
Expected: FAIL — cannot resolve `../src/adsb.js`.

- [ ] **Step 4: Implement `adsb.ts`**

`functions/src/adsb.ts`:
```ts
import type { AircraftState } from "./day-schema.js";

export type FetchFn = typeof fetch;

export interface AdsbProvider {
  name: string; // attribution name shown in the HUD
  url: string; // attribution link
  baseUrl: string; // ADSBexchange-v2 compatible API root
}

export const PROVIDERS = {
  adsbfi: { name: "adsb.fi", url: "https://adsb.fi", baseUrl: "https://opendata.adsb.fi/api" },
  airplaneslive: { name: "airplanes.live", url: "https://airplanes.live", baseUrl: "https://api.airplanes.live" },
} satisfies Record<string, AdsbProvider>;

export const CHUNK = 100;
export const SPACING_MS = 1100;

const THY = /^THY[0-9A-Z]+$/;
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

interface V2Aircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  seen_pos?: number;
  seen?: number;
}

export function parseV2(json: unknown): AircraftState[] {
  const body = json as { now?: number; ac?: V2Aircraft[] | null };
  const nowS = (num(body.now) ?? 0) / 1000;
  const out: AircraftState[] = [];
  for (const a of body.ac ?? []) {
    const cs = (a.flight ?? "").trim();
    if (!THY.test(cs)) continue;
    const lat = num(a.lat);
    const lon = num(a.lon);
    if (lat === null || lon === null || !a.hex) continue;
    const onGround = a.alt_baro === "ground";
    const altFt = onGround ? 0 : (num(a.alt_baro) ?? num(a.alt_geom));
    const gs = num(a.gs);
    out.push({
      icao24: a.hex.toLowerCase(),
      cs,
      t: Math.round(nowS - (num(a.seen_pos) ?? num(a.seen) ?? 0)),
      lat,
      lon,
      alt100: altFt === null ? null : Math.max(0, Math.round(altFt / 100)),
      onGround,
      gs: gs === null ? null : Math.round(gs),
      trk: num(a.track),
    });
  }
  return out;
}

export async function fetchAircraft(
  f: FetchFn,
  provider: AdsbProvider,
  hexes: string[],
  sleep: (ms: number) => Promise<void>,
): Promise<AircraftState[]> {
  const byHex = new Map<string, AircraftState>();
  for (let i = 0; i < hexes.length; i += CHUNK) {
    if (i > 0) await sleep(SPACING_MS);
    const res = await f(`${provider.baseUrl}/v2/hex/${hexes.slice(i, i + CHUNK).join(",")}`);
    if (!res.ok) throw new Error(`${provider.name} ${res.status}`);
    for (const a of parseV2(await res.json())) byHex.set(a.icao24, a);
  }
  return [...byHex.values()];
}
```

- [ ] **Step 5: Point `routes.ts` at the new `FetchFn`**

In `functions/src/routes.ts` replace the line
```ts
import type { FetchFn } from "./opensky.js";
```
with
```ts
import type { FetchFn } from "./adsb.js";
```

- [ ] **Step 6: Run tests**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS (the old OpenSky tests still pass; they are removed in A3).

- [ ] **Step 7: Commit**

```bash
git add functions/src/adsb.ts functions/src/routes.ts functions/test/adsb.test.ts functions/test/fixtures/adsb-v2.json
git commit -m "feat(functions): provider-agnostic ADS-B v2 client (adsb.fi / airplanes.live)"
```

---

### Task A2: THY fleet list from tar1090-db

**Files:**
- Create: `functions/src/fleet.ts`
- Test: `functions/test/fleet.test.ts`

**Interfaces:**
- Consumes: `FetchFn` (A1), `JsonStore` (Task 8).
- Produces: `FLEET_DB_URL`, `FLEET_PATH = "state/fleet.json"`, `FLEET_TTL = 604800`, `AIRLINER_TYPES: Set<string>`, `interface Fleet { fetchedAt: number; hexes: string[] }`, `parseFleetCsv(csv: string): string[]` (lower-case, unique, sorted), `fetchFleet(f: FetchFn): Promise<string[]>`, `loadFleet(store: JsonStore, f: FetchFn, now: number, log: (msg: string, extra?: Record<string, unknown>) => void): Promise<string[]>`.

- [ ] **Step 1: Write the failing test**

`functions/test/fleet.test.ts`:
```ts
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { FLEET_DB_URL, FLEET_PATH, FLEET_TTL, fetchFleet, loadFleet, parseFleetCsv, type Fleet } from "../src/fleet.js";
import type { JsonStore } from "../src/storage.js";

const CSV = [
  "4BAA53;TC-JRS;A321;00;;;;",
  "4BB141;TC-LJA;B77W;00;;;;",
  "4B801A;TC-J60;BTB2;10;;;;",
  "43A8F4;TC-JGT;B738;00;;;Miscode - TURKEY;",
  "3C6444;D-AIBA;A319;00;;;;",
  "4BAA53;TC-JRS;A321;00;;;;",
  "",
].join("\n");

function memStore(init?: Fleet) {
  const files = new Map<string, unknown>(init ? [[FLEET_PATH, init]] : []);
  const store: JsonStore = {
    async read<T>(path: string) {
      return files.has(path) ? { data: structuredClone(files.get(path)) as T, generation: 1 } : null;
    },
    async write(path, data) {
      files.set(path, structuredClone(data));
    },
  };
  return { store, files };
}

describe("parseFleetCsv", () => {
  it("keeps TC- airliners, lower-cased, unique, sorted", () => {
    expect(parseFleetCsv(CSV)).toEqual(["43a8f4", "4baa53", "4bb141"]);
  });
});

describe("fetchFleet", () => {
  it("downloads and gunzips the CSV", async () => {
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    await expect(fetchFleet(f as unknown as typeof fetch)).resolves.toEqual(["43a8f4", "4baa53", "4bb141"]);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(FLEET_DB_URL);
  });

  it("accepts an already-decompressed body", async () => {
    const f = vi.fn(async () => new Response(CSV));
    await expect(fetchFleet(f as unknown as typeof fetch)).resolves.toHaveLength(3);
  });

  it("throws on HTTP errors", async () => {
    const f = vi.fn(async () => new Response("", { status: 503 }));
    await expect(fetchFleet(f as unknown as typeof fetch)).rejects.toThrow("fleet db 503");
  });
});

describe("loadFleet", () => {
  const NOW = 1_800_000_000;
  const log = () => {};

  it("returns a fresh cached list without downloading", async () => {
    const { store } = memStore({ fetchedAt: NOW - 3600, hexes: ["aaaaaa"] });
    const f = vi.fn();
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).resolves.toEqual(["aaaaaa"]);
    expect(f).not.toHaveBeenCalled();
  });

  it("refreshes an expired list and stores it", async () => {
    const { store, files } = memStore({ fetchedAt: NOW - FLEET_TTL - 1, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response(gzipSync(CSV)));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).resolves.toHaveLength(3);
    expect(files.get(FLEET_PATH)).toEqual({ fetchedAt: NOW, hexes: ["43a8f4", "4baa53", "4bb141"] });
  });

  it("falls back to the stale list when the refresh fails", async () => {
    const { store } = memStore({ fetchedAt: NOW - FLEET_TTL - 1, hexes: ["aaaaaa"] });
    const f = vi.fn(async () => new Response("", { status: 503 }));
    const logged = vi.fn();
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, logged)).resolves.toEqual(["aaaaaa"]);
    expect(logged).toHaveBeenCalledWith("fleet refresh failed, using stale list", { error: "Error: fleet db 503" });
  });

  it("throws when there is no list at all", async () => {
    const { store } = memStore();
    const f = vi.fn(async () => new Response("", { status: 503 }));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).rejects.toThrow("fleet db 503");
  });

  it("treats an empty download as a failure", async () => {
    const { store } = memStore();
    const f = vi.fn(async () => new Response(gzipSync("3C6444;D-AIBA;A319;00;;;;\n")));
    await expect(loadFleet(store, f as unknown as typeof fetch, NOW, log)).rejects.toThrow("fleet db empty");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && npx vitest run test/fleet.test.ts`
Expected: FAIL — cannot resolve `../src/fleet.js`.

- [ ] **Step 3: Implement `fleet.ts`**

`functions/src/fleet.ts`:
```ts
import { gunzipSync } from "node:zlib";
import type { FetchFn } from "./adsb.js";
import type { JsonStore } from "./storage.js";

export const FLEET_DB_URL = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/csv/aircraft.csv.gz";
export const FLEET_PATH = "state/fleet.json";
export const FLEET_TTL = 7 * 86400;

export const AIRLINER_TYPES = new Set(
  "A19N A20N A21N A319 A320 A321 A332 A333 A338 A339 A359 A35K A306 A310 B37M B38M B39M B3XM B737 B738 B739 B744 B748 B752 B763 B772 B77L B77W B788 B789 B78X E190 E195 E290 E295 CRJ9 AT76".split(" "),
);

export interface Fleet {
  fetchedAt: number;
  hexes: string[];
}

/** tar1090-db rows: `hex;registration;icaoType;flags;…`. Keeps Turkish-registered airliners. */
export function parseFleetCsv(csv: string): string[] {
  const hexes = new Set<string>();
  for (const line of csv.split("\n")) {
    const [hex, reg, type] = line.split(";");
    if (hex && reg?.startsWith("TC-") && AIRLINER_TYPES.has(type)) hexes.add(hex.toLowerCase());
  }
  return [...hexes].sort();
}

export async function fetchFleet(f: FetchFn): Promise<string[]> {
  const res = await f(FLEET_DB_URL);
  if (!res.ok) throw new Error(`fleet db ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const gzipped = buf[0] === 0x1f && buf[1] === 0x8b;
  return parseFleetCsv((gzipped ? gunzipSync(buf) : buf).toString("utf8"));
}

export async function loadFleet(
  store: JsonStore,
  f: FetchFn,
  now: number,
  log: (msg: string, extra?: Record<string, unknown>) => void,
): Promise<string[]> {
  const cached = await store.read<Fleet>(FLEET_PATH);
  if (cached && now - cached.data.fetchedAt < FLEET_TTL && cached.data.hexes.length > 0) {
    return cached.data.hexes;
  }
  try {
    const hexes = await fetchFleet(f);
    if (hexes.length === 0) throw new Error("fleet db empty");
    await store.write(FLEET_PATH, { fetchedAt: now, hexes } satisfies Fleet);
    return hexes;
  } catch (e) {
    if (cached && cached.data.hexes.length > 0) {
      log("fleet refresh failed, using stale list", { error: String(e) });
      return cached.data.hexes;
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd functions && npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/fleet.ts functions/test/fleet.test.ts
git commit -m "feat(functions): THY fleet hex list from tar1090-db with weekly cache"
```

---

### Task A3: Switch the orchestrator to fleet + adsb, add `source` to `day.json`, remove OpenSky

**Files:**
- Modify: `functions/src/day-schema.ts`, `functions/src/publish.ts`, `functions/src/collect.ts`, `functions/scripts/make-fixture.ts`, `functions/test/publish.test.ts`, `functions/test/collect.test.ts`
- Delete: `functions/src/opensky.ts`, `functions/test/opensky.test.ts`, `functions/test/fixtures/opensky-states.json`
- Regenerate: `web/public/fixture/day.json`

**Interfaces:**
- Consumes: `fetchAircraft`, `AdsbProvider`, `FetchFn` (A1); `loadFleet` (A2).
- Produces:
  - `DayFile.source: { name: string; url: string }` (also `export type DaySource = DayFile["source"]` in day-schema).
  - `buildDayFile(state: TrackerState, now: number, status: DayStatus, source: DaySource): DayFile`.
  - `CollectDeps` = `{ fetch: FetchFn; now: () => number; sleep: (ms: number) => Promise<void>; store: JsonStore; routes: RouteCache; provider: AdsbProvider; log: (msg: string, extra?: Record<string, unknown>) => void }` (the `creds` field is removed).

- [ ] **Step 1: Schema**

In `functions/src/day-schema.ts`, inside `interface DayFile`, after the `status: DayStatus;` line add:
```ts
  source: { name: string; url: string };
```
and at the end of the file add:
```ts
export type DaySource = DayFile["source"];
```

- [ ] **Step 2: Update publish test (failing)**

In `functions/test/publish.test.ts`:
- change the import line `import type { RouteInfo, TrackerState } from "../src/day-schema.js";` to `import type { DaySource, RouteInfo, TrackerState } from "../src/day-schema.js";`
- add after the `const NOW = …` line: `const SRC: DaySource = { name: "adsb.fi", url: "https://adsb.fi" };`
- change `buildDayFile(state, NOW, { state: "ok", lastSuccessAt: NOW })` to `buildDayFile(state, NOW, { state: "ok", lastSuccessAt: NOW }, SRC)`
- change `buildDayFile(state, NOW, { state: "delayed", lastSuccessAt: NOW - 600, error: "x" })` to `buildDayFile(state, NOW, { state: "delayed", lastSuccessAt: NOW - 600, error: "x" }, SRC)`
- in the `"header"` test's `toMatchObject({...})`, add the property `source: { name: "adsb.fi", url: "https://adsb.fi" },`

- [ ] **Step 3: Replace `functions/test/collect.test.ts` entirely (failing)**

```ts
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../src/adsb.js";
import type { DayFile, TrackerState } from "../src/day-schema.js";
import { DAY_PATH, TRACKER_PATH, runCollect, type CollectDeps } from "../src/collect.js";
import { FLEET_PATH } from "../src/fleet.js";
import { PreconditionFailed, type JsonStore } from "../src/storage.js";
import type { RouteCache, RouteCacheEntry } from "../src/routes.js";

const NOW = 1_800_000_000;

function memStore(): JsonStore & { files: Map<string, { data: unknown; generation: number; cacheControl?: string }> } {
  const files = new Map<string, { data: unknown; generation: number; cacheControl?: string }>();
  return {
    files,
    async read<T>(path: string) {
      const f = files.get(path);
      return f ? { data: structuredClone(f.data) as T, generation: f.generation } : null;
    },
    async write(path, data, opts = {}) {
      const cur = files.get(path);
      if (opts.ifGeneration !== undefined && (cur?.generation ?? 0) !== opts.ifGeneration) throw new PreconditionFailed(path);
      files.set(path, { data: structuredClone(data), generation: (cur?.generation ?? 0) + 1, cacheControl: opts.cacheControl });
    },
  };
}

const memRoutes = (): RouteCache => {
  const m = new Map<string, RouteCacheEntry>();
  return { get: async (cs) => m.get(cs) ?? null, set: async (cs, e) => void m.set(cs, e) };
};

const fleetCsv = "ABC123;TC-JJA;A321;00;;;;\n";
const hexBody = {
  now: NOW * 1000,
  ac: [{ hex: "abc123", flight: "THY1    ", lat: 44.2, lon: 25.1, alt_baro: 37000, gs: 486, track: 308.5, seen_pos: 0 }],
};
const routeBody = {
  response: {
    flightroute: {
      origin: { country_iso_name: "TR", iata_code: "IST", latitude: 41.26, longitude: 28.74 },
      destination: { country_iso_name: "US", iata_code: "JFK", latitude: 40.64, longitude: -73.78 },
    },
  },
};

function fakeFetch(opts: { hexStatus?: number; fleetStatus?: number; routeStatus?: number } = {}) {
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("tar1090-db")) return new Response(gzipSync(fleetCsv), { status: opts.fleetStatus ?? 200 });
    if (url.includes("adsbdb")) return new Response(JSON.stringify(routeBody), { status: opts.routeStatus ?? 200 });
    if (url.includes("/v2/hex/")) return new Response(JSON.stringify(hexBody), { status: opts.hexStatus ?? 200 });
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
}

const deps = (over: Partial<CollectDeps> = {}): CollectDeps => ({
  fetch: fakeFetch(),
  now: () => NOW,
  sleep: async () => {},
  store: memStore(),
  routes: memRoutes(),
  provider: PROVIDERS.adsbfi,
  log: () => {},
  ...over,
});

describe("runCollect", () => {
  it("first run caches the fleet, creates tracker and day.json with routes and source", async () => {
    const d = deps();
    await expect(runCollect(d)).resolves.toBe("ok");
    const store = d.store as ReturnType<typeof memStore>;
    expect((store.files.get(FLEET_PATH)!.data as { hexes: string[] }).hexes).toEqual(["abc123"]);
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.collectingSince).toBe(NOW);
    expect(tracker.flights[0]).toMatchObject({ cs: "THY1", samples: [[NOW, 370, 44.2, 25.1]] });
    expect(tracker.flights[0].route?.destination.iata).toBe("JFK");
    const day = store.files.get(DAY_PATH)!;
    expect(day.cacheControl).toBe("public, max-age=60");
    const file = day.data as DayFile;
    expect(file.flights[0]).toMatchObject({ tk: "TK1", region: "AME" });
    expect(file.status.state).toBe("ok");
    expect(file.source).toEqual({ name: "adsb.fi", url: "https://adsb.fi" });
  });

  it("provider failure publishes delayed status and keeps tracker untouched", async () => {
    const store = memStore();
    await runCollect(deps({ store }));
    const gen = store.files.get(TRACKER_PATH)!.generation;
    await expect(runCollect(deps({ store, fetch: fakeFetch({ hexStatus: 429 }), now: () => NOW + 120 }))).resolves.toBe("delayed");
    expect(store.files.get(TRACKER_PATH)!.generation).toBe(gen);
    const day = store.files.get(DAY_PATH)!.data as DayFile;
    expect(day.status).toEqual({ state: "delayed", lastSuccessAt: NOW, error: "Error: adsb.fi 429" });
    expect(day.flights).toHaveLength(1);
  });

  it("fleet failure with no cached fleet publishes delayed status", async () => {
    const store = memStore();
    await expect(runCollect(deps({ store, fetch: fakeFetch({ fleetStatus: 503 }) }))).resolves.toBe("delayed");
    expect((store.files.get(DAY_PATH)!.data as DayFile).status).toMatchObject({ state: "delayed", error: "Error: fleet db 503" });
    expect(store.files.has(TRACKER_PATH)).toBe(false);
  });

  it("tracker write conflict skips publishing", async () => {
    const store = memStore();
    const racing: JsonStore = {
      read: store.read,
      async write(path, data, opts) {
        if (path === TRACKER_PATH) throw new PreconditionFailed(path);
        return store.write(path, data, opts);
      },
    };
    await expect(runCollect(deps({ store: racing }))).resolves.toBe("conflict");
    expect(store.files.has(DAY_PATH)).toBe(false);
  });

  it("route lookup failure leaves route undefined for retry", async () => {
    const store = memStore();
    await runCollect(deps({ store, fetch: fakeFetch({ routeStatus: 500 }) }));
    const tracker = store.files.get(TRACKER_PATH)!.data as TrackerState;
    expect(tracker.flights[0].route).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `cd functions && npx vitest run test/publish.test.ts test/collect.test.ts`
Expected: FAIL (publish header lacks `source`; collect imports `PROVIDERS`/`FLEET_PATH` but `runCollect` still uses OpenSky and `creds`).

- [ ] **Step 5: Update `publish.ts`**

In `functions/src/publish.ts`:
- change the first import to `import type { DayFile, DaySource, DayStatus, Flight, TrackedFlight, TrackerState } from "./day-schema.js";`
- change the signature to `export function buildDayFile(state: TrackerState, now: number, status: DayStatus, source: DaySource): DayFile {`
- in the returned object, after `status,` add `source,`

- [ ] **Step 6: Replace `functions/src/collect.ts` entirely**

```ts
import { fetchAircraft, type AdsbProvider, type FetchFn } from "./adsb.js";
import type { AircraftState, TrackerState } from "./day-schema.js";
import { loadFleet } from "./fleet.js";
import { buildDayFile } from "./publish.js";
import { lookupRoute, type RouteCache } from "./routes.js";
import { PreconditionFailed, type JsonStore } from "./storage.js";
import { emptyState, step } from "./tracker.js";

export const TRACKER_PATH = "state/tracker.json";
export const DAY_PATH = "public/day.json";
export const DAY_CACHE = "public, max-age=60";
export const MAX_ROUTE_LOOKUPS = 40;

export interface CollectDeps {
  fetch: FetchFn;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  store: JsonStore;
  routes: RouteCache;
  provider: AdsbProvider;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

async function resolveRoutes(state: TrackerState, d: CollectDeps, now: number) {
  let lookups = 0;
  for (const f of state.flights) {
    if (f.route !== undefined) continue;
    if (lookups++ >= MAX_ROUTE_LOOKUPS) break;
    try {
      f.route = await lookupRoute(f.cs, d.routes, d.fetch, now);
    } catch (e) {
      d.log("route lookup failed", { cs: f.cs, error: String(e) });
    }
  }
}

export async function runCollect(d: CollectDeps): Promise<"ok" | "delayed" | "conflict"> {
  const now = d.now();
  const source = { name: d.provider.name, url: d.provider.url };
  const current = await d.store.read<TrackerState>(TRACKER_PATH);
  const prev = current?.data ?? emptyState(now);

  let aircraft: AircraftState[];
  let fleetSize: number;
  try {
    const fleet = await loadFleet(d.store, d.fetch, now, d.log);
    fleetSize = fleet.length;
    aircraft = await fetchAircraft(d.fetch, d.provider, fleet, d.sleep);
  } catch (e) {
    const error = String(e);
    d.log("live data failed", { error });
    const day = buildDayFile(prev, now, { state: "delayed", lastSuccessAt: prev.lastSuccessAt, error }, source);
    await d.store.write(DAY_PATH, day, { cacheControl: DAY_CACHE });
    return "delayed";
  }

  const next = step(prev, aircraft, now);
  await resolveRoutes(next, d, now);

  try {
    await d.store.write(TRACKER_PATH, next, { ifGeneration: current?.generation ?? 0 });
  } catch (e) {
    if (e instanceof PreconditionFailed) {
      d.log("tracker write conflict, skipping run");
      return "conflict";
    }
    throw e;
  }

  await d.store.write(DAY_PATH, buildDayFile(next, now, { state: "ok", lastSuccessAt: now }, source), {
    cacheControl: DAY_CACHE,
  });
  d.log("collect ok", {
    fleet: fleetSize,
    aircraft: aircraft.length,
    flights: next.flights.length,
    unknownRoutes: next.flights.filter((f) => f.route === null).length,
    pendingRoutes: next.flights.filter((f) => f.route === undefined).length,
  });
  return "ok";
}
```

- [ ] **Step 7: Fixture source**

In `functions/scripts/make-fixture.ts` change
```ts
  return buildDayFile(state, now, { state: "ok", lastSuccessAt: now });
```
to
```ts
  return buildDayFile(state, now, { state: "ok", lastSuccessAt: now }, { name: "synthetic fixture", url: "" });
```

- [ ] **Step 8: Remove OpenSky**

```bash
git rm functions/src/opensky.ts functions/test/opensky.test.ts functions/test/fixtures/opensky-states.json
```
Then confirm nothing references it: `grep -rn "opensky" functions/src functions/test functions/scripts` → no output.

- [ ] **Step 9: Run tests, typecheck, regenerate fixture**

Run: `cd functions && npx vitest run && npx tsc --noEmit && npm run fixture`
Expected: all PASS; fixture written (`… flights, … airborne`). Verify: `node -e "const d=require('../web/public/fixture/day.json');console.log(d.source)"` → `{ name: 'synthetic fixture', url: '' }`.

- [ ] **Step 10: Commit**

```bash
git add -A functions/src functions/test functions/scripts web/public/fixture/day.json
git commit -m "feat(functions): collect from adsb.fi fleet query; day.json source attribution; drop OpenSky"
```

---

### Task A4: Scheduled function wiring, deploy, live verification (replaces Task 9)

**Files:**
- Modify: `functions/src/index.ts` (currently `export {};`, untracked — add it in this task)
- Create: `README.md`

**Interfaces:**
- Consumes: `runCollect`, `CollectDeps` (A3), `PROVIDERS` (A1), `gcsStore` (Task 8), `firestoreRouteCache` (Task 5).

- [ ] **Step 1: Wire the scheduled function**

`functions/src/index.ts`:
```ts
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";
import { defineString } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { PROVIDERS } from "./adsb.js";
import { runCollect } from "./collect.js";
import { firestoreRouteCache } from "./routes.js";
import { gcsStore } from "./storage.js";

initializeApp();

const ADSB_PROVIDER = defineString("ADSB_PROVIDER", { default: "adsbfi" });

export const collect = onSchedule(
  {
    schedule: "every 2 minutes",
    region: "europe-west1",
    timeoutSeconds: 90,
    memory: "512MiB",
    maxInstances: 1,
    retryCount: 0,
  },
  async () => {
    const key = ADSB_PROVIDER.value() as keyof typeof PROVIDERS;
    const provider = PROVIDERS[key];
    if (!provider) throw new Error(`unknown ADSB_PROVIDER "${key}"`);
    const result = await runCollect({
      fetch,
      now: () => Math.floor(Date.now() / 1000),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      store: gcsStore(getStorage().bucket()),
      routes: firestoreRouteCache(getFirestore()),
      provider,
      log: (msg, extra) => logger.info(msg, extra),
    });
    logger.info("collect finished", { result, provider: provider.name });
  },
);
```

- [ ] **Step 2: Build and test**

Run: `cd functions && npm run build && npx vitest run`
Expected: `lib/index.js` emitted, all tests PASS.

- [ ] **Step 3: Deploy**

```bash
firebase deploy --only functions:collect,firestore:rules,storage --project omerkilavuz-9ad41 --non-interactive --force
```
Expected: deploy completes; a Cloud Scheduler job for `collect` exists. (`--force` also creates the Artifact Registry cleanup policy.) If the CLI prompts for `ADSB_PROVIDER`, accept the default `adsbfi`.

- [ ] **Step 4: Bucket CORS**

```bash
gcloud storage buckets update gs://omerkilavuz-9ad41.firebasestorage.app --cors-file=cors.json --project omerkilavuz-9ad41
```

- [ ] **Step 5: Verify live output after ≥ 2 scheduler runs (~5 min)**

```bash
firebase functions:log --only collect --project omerkilavuz-9ad41 | tail -20
```
Expected: `collect ok` with `fleet` ≈ 1000 and `aircraft` > 50.

```bash
curl -s "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media" | head -c 400
```
Expected: starts with `{"v":1,"generatedAt":…,"status":{"state":"ok"…},"source":{"name":"adsb.fi","url":"https://adsb.fi"}`.

```bash
curl -sI "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media" | grep -i -E "cache-control"
```
Expected: `cache-control: public, max-age=60`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/state%2Ftracker.json?alt=media"
```
Expected: `403`.

- [ ] **Step 6: README**

`README.md`:
```markdown
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
```

- [ ] **Step 7: Commit**

```bash
git add functions/src/index.ts README.md
git commit -m "feat(functions): scheduled adsb.fi collector every 2 minutes"
```
