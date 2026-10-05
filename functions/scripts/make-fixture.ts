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
    const dayStart = Math.floor(now / 86400) * 86400;
    let dep = dayStart + h * 3600 + Math.floor(rnd() * 3600);
    while (dep + dur < now - 86400) dep += 86400;
    while (dep > now) dep -= 86400; // wrap into the window so every hour of the last 24h is populated

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
