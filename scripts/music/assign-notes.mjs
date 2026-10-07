#!/usr/bin/env node
// Notes -> routes: give every transcribed note to the flight that "plays" it.
//   node scripts/music/assign-notes.mjs tmp-music/day-music-<date>-<genre>.notes.json [day.json|url] [out.json] [--bundle globe/public/music]
//   --bundle writes the compact notes.json (+ the day's hourly airborne curve) and copies the mp3 next to it for the site.
//
// Replay clock: music second t  <->  day time  window.from + t / duration * 86400.
// Each route owns a stable pitch class (hash of "FROM-TO") and each flight a register that follows its altitude, so a route
// keeps coming back on "its" notes and climbing flights sound higher. A note goes to the airborne flight whose pitch class and
// register fit best (with a short rest per flight so one flight cannot hog the line) — the same route plays the same colour.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const DAY_URL = "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media";
const REST_S = 1.2; // a flight does not play again within this many music seconds
const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const routeHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
};
export const pcOf = (route) => routeHash(route) % 12;
const pcDist = (a, b) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };

/** altitude (ft) at day time T by linear interpolation of the flight's samples ([offset s, flight level (hundreds of ft), lat, lon]); null if not airborne */
export function altitudeAt(f, T) {
  const s = f.s;
  if (!s || s.length === 0) return null;
  const r = T - f.dep;
  if (r < s[0][0] || r > s[s.length - 1][0]) return null;
  let i = 0;
  while (i < s.length - 2 && s[i + 1][0] <= r) i++;
  const a = s[i], b = s[i + 1] ?? s[i];
  const k = b[0] === a[0] ? 0 : (r - a[0]) / (b[0] - a[0]);
  return (a[1] + (b[1] - a[1]) * k) * 100; // samples carry the flight level (hundreds of feet)
}

/** pure: assign notes ({t,d,p,v}) to flights of a day.json; returns notes with {flight,route,from,to,alt} added */
export function assignNotes(notes, day, duration) {
  const span = day.window.to - day.window.from;
  const flights = day.flights.filter((f) => f.s && f.s.length > 0 && f.from && f.to);
  const lastPlayed = new Map();
  const out = [];
  for (const n of notes) {
    const T = day.window.from + (n.t / duration) * span;
    let best = null;
    for (const f of flights) {
      if (T < f.dep + f.s[0][0] || T > f.dep + f.s[f.s.length - 1][0]) continue;
      if (n.t - (lastPlayed.get(f.id) ?? -1e9) < REST_S) continue;
      const alt = altitudeAt(f, T);
      if (alt == null) continue;
      const route = `${f.from}-${f.to}`;
      // register follows altitude: ground ≈ MIDI 48, cruise (40 000 ft) ≈ MIDI 84
      const regP = 48 + Math.min(alt, 41000) / 41000 * 36;
      const score = pcDist(pcOf(route), n.p % 12) * 1.0 + Math.abs(regP - n.p) / 12 * 0.6;
      if (!best || score < best.score) best = { f, route, alt, score };
    }
    if (best) {
      lastPlayed.set(best.f.id, n.t);
      out.push({ ...n, flight: best.f.id, route: best.route, from: best.f.from, to: best.f.to, alt: Math.round(best.alt), fit: Number(best.score.toFixed(2)) });
    } else out.push({ ...n, flight: null });
  }
  return out;
}

async function main() {
  const bi = process.argv.indexOf("--bundle");
  const bundleDir = bi >= 0 ? process.argv[bi + 1] : null;
  const [notesFile, dayArg, outArg] = process.argv.slice(2).filter((a, i, all) => a !== "--bundle" && all[i - 1] !== "--bundle");
  if (!notesFile) { console.error("usage: assign-notes.mjs <x.notes.json> [day.json|url] [out.json]"); process.exit(1); }
  const { notes, duration, source } = JSON.parse(await readFile(notesFile, "utf8"));
  const raw = dayArg && !/^https?:/.test(dayArg) ? await readFile(dayArg, "utf8") : await (await fetch(dayArg ?? DAY_URL)).text();
  const day = JSON.parse(raw);
  const assigned = assignNotes(notes, day, Math.max(duration, 180));
  const out = outArg ?? notesFile.replace(/\.notes\.json$/, ".assigned.json");
  await writeFile(out, JSON.stringify({ source, duration: Math.max(duration, 180), window: day.window, notes: assigned }));
  if (bundleDir) {
    const ck = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const notesOut = assigned.filter((n) => n.flight).map((n) => ({ t: n.t, d: n.d, p: n.p, v: n.v, k: ck(n.from, n.to), from: n.from, to: n.to, alt: n.alt }));
    await mkdir(bundleDir, { recursive: true });
    await writeFile(`${bundleDir}/notes.json`, JSON.stringify({ duration: Math.max(duration, 180), source, notes: notesOut }));
    await copyFile(notesFile.replace(/\.notes\.json$/, ".mp3"), `${bundleDir}/track.mp3`);
    console.log(`bundled ${notesOut.length} notes + track.mp3 -> ${bundleDir}`);
  }
  const ok = assigned.filter((n) => n.flight);
  const routes = new Set(ok.map((n) => n.route));
  console.log(`${ok.length}/${assigned.length} notes assigned · ${routes.size} distinct routes · mean fit ${(ok.reduce((a, n) => a + n.fit, 0) / ok.length).toFixed(2)} -> ${out}`);
  const per = new Map();
  for (const n of ok) per.set(n.route, (per.get(n.route) ?? 0) + 1);
  [...per].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([r, c]) => console.log(`  ${r.padEnd(8)} ${c} notes · colour ${PC_NAMES[pcOf(r)]}`));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
