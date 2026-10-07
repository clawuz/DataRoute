#!/usr/bin/env node
// Prototype: turn the last 24 h of Turkish Airlines traffic into a 3-minute ElevenLabs composition.
//
//   node scripts/generate-day-music.mjs --dry-run            # print the plan, no API call, no key needed
//   ELEVENLABS_API_KEY=... node scripts/generate-day-music.mjs   # compose and save an mp3 + plan.json
//
// Options: --file <day.json>  --url <day.json url>  --program <classical|beethoven|baroque|romantic|impressionist|ottoman|jazz>
//          --model <music_v1|music_v2|music_v2_5>  --out <dir>  --seed <int>  --dry-run
//
// The key is read from ELEVENLABS_API_KEY or, if unset, from a git-ignored .env.local file (line: ELEVENLABS_API_KEY=...)
// that you create yourself; it is never printed or written anywhere by this script.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const DAY_URL = "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media";
const API = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";
const CHUNK_MS = 45_000; // 4 × 45 s = 3 minutes = 24 h of replay
const IST_OFFSET_H = 3;

/** Day program: a base style per weekday-ish index (descriptive style tags, no artist names). */
export const PROGRAMS = {
  classical: ["classical period chamber orchestra", "elegant Viennese classicism", "fortepiano and strings", "Alberti bass", "clear periodic phrases", "major key"],
  beethoven: ["early romantic symphonic", "heroic motifs", "driving string figures", "timpani accents", "developing themes", "minor to major arc"],
  baroque: ["baroque ensemble", "harpsichord continuo", "counterpoint", "ground bass ostinato", "strings and flute", "terraced dynamics"],
  romantic: ["romantic piano", "lyrical cantabile melody", "arpeggiated accompaniment", "warm strings", "rubato", "nocturne mood"],
  impressionist: ["impressionist", "soft piano", "color chords and extended harmony", "airy flute and harp", "slow and spacious", "dreamlike"],
  ottoman: ["Turkish classical music", "makam modal melody", "ney flute and oud", "kanun", "frame drum rhythm", "ornamented melody"],
  jazz: ["jazz fusion", "Fender Rhodes", "driving bass ostinato", "brass hits", "syncopated groove", "rich seventh and ninth chords"],
};
const ORDER = ["classical", "beethoven", "baroque", "romantic", "impressionist", "ottoman", "jazz"];

const REGION_HINTS = {
  ASI: ["pentatonic koto and shakuhachi colours"],
  MEA: ["oud and darbuka colours", "phrygian dominant touches"],
  AFR: ["kalimba and marimba polyrhythm"],
  AME: ["warm string section", "big open fifths"],
  EUR: ["piano and woodwind lines"],
  DOM: ["folk-like saz colours"],
};

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] === undefined ? true : process.argv[i + 1]) : def;
};

/** Pure: summarise a day.json into four 6-hour windows (chronological), their energy and regional mix. */
export function summarize(day) {
  const from = day.window.from;
  const span = 86400;
  const q = 6 * 3600;
  const chunks = Array.from({ length: 4 }, (_, i) => ({ start: from + i * q, end: from + (i + 1) * q, airborneHours: 0, regions: {}, to: {}, flights: 0 }));
  for (const f of day.flights) {
    if (!f.s || f.s.length === 0) continue;
    const t0 = f.dep + f.s[0][0];
    const t1 = f.dep + f.s[f.s.length - 1][0];
    chunks.forEach((c) => {
      const lo = Math.max(c.start, t0);
      const hi = Math.min(c.end, t1);
      if (hi > lo) {
        c.airborneHours += (hi - lo) / 3600;
        c.flights++;
        c.regions[f.region] = (c.regions[f.region] ?? 0) + (hi - lo);
        if (f.to) c.to[f.to] = (c.to[f.to] ?? 0) + 1;
      }
    });
  }
  // contrast: scale between the quietest and busiest window of THIS day so the arc is audible even when traffic is fairly flat
  const vals = chunks.map((c) => c.airborneHours / 6);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const norm = (v) => (hi - lo < 1e-6 ? 0.5 : (v - lo) / (hi - lo));
  return chunks.map((c) => {
    const localHour = (((c.start + 3 * 1800) / 3600 + IST_OFFSET_H) % 24 + 24) % 24; // middle of the window start +1.5 h, Istanbul time
    const label = localHour < 6 ? "night" : localHour < 12 ? "morning" : localHour < 18 ? "afternoon" : "evening";
    const total = Object.values(c.regions).reduce((a, b) => a + b, 0) || 1;
    const shares = Object.entries(c.regions).map(([r, v]) => [r, v / total]).sort((a, b) => b[1] - a[1]);
    const topTo = Object.entries(c.to).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    return { label, energy: norm(c.airborneHours / 6), shares, topTo, avgAirborne: c.airborneHours / 6, span };
  });
}

/** Pure: build the ElevenLabs composition plan (chunks) from the summary and a program. */
export function buildPlan(summary, program, dateIso) {
  const base = PROGRAMS[program];
  const dyn = (e) => (e < 0.25 ? ["very soft", "sparse", "slow tempo", "70 BPM", "intimate"] : e < 0.55 ? ["gentle", "building", "moderate tempo", "90 BPM", "flowing"] : e < 0.8 ? ["energetic", "full ensemble", "lively tempo", "108 BPM", "driving"] : ["powerful", "tutti", "fast tempo", "120 BPM", "triumphant"]);
  const chunks = summary.map((s, i) => {
    const regionHints = s.shares.filter(([, v]) => v >= 0.14).slice(0, 2).flatMap(([r]) => REGION_HINTS[r] ?? []);
    const name = `${s.label[0].toUpperCase()}${s.label.slice(1)}`;
    return {
      text: `[${name}]`,
      duration_ms: CHUNK_MS,
      positive_styles: [...(i === 0 ? base : base.slice(0, 3)), ...dyn(s.energy), ...regionHints, "instrumental"],
      negative_styles: ["vocals", "lyrics", "singing", "choir words", "electronic dance drop"],
      context_adherence: "high",
    };
  });
  return { chunks, meta: { date: dateIso, program, sections: summary.map((s) => ({ label: s.label, energy: Number(s.energy.toFixed(2)), avgAirborne: Math.round(s.avgAirborne), topDestinations: s.topTo })) } };
}

export function programFor(dateIso, forced) {
  if (forced && PROGRAMS[forced]) return forced;
  const d = Math.floor(Date.parse(dateIso) / 86400000);
  return ORDER[((d % 7) + 7) % 7];
}

async function main() {
  const dryRun = !!arg("dry-run", false);
  const file = arg("file", null);
  const url = arg("url", DAY_URL);
  const raw = file ? await readFile(file, "utf8") : await (await fetch(url)).text();
  const day = JSON.parse(raw);
  const dateIso = new Date(day.generatedAt * 1000).toISOString().slice(0, 10);
  const summary = summarize(day);
  const program = programFor(dateIso, arg("program", null));
  const plan = buildPlan(summary, program, dateIso);

  console.log(`Day ${dateIso} · program "${program}" · ${day.flights.length} flights`);
  summary.forEach((s, i) => console.log(`  ${i + 1}. ${s.label.padEnd(9)} energy ${s.energy.toFixed(2)}  avg airborne ${Math.round(s.avgAirborne)}  top: ${s.topTo.join(", ")}`));
  if (dryRun) {
    console.log("\nPlan (dry run, nothing sent):");
    console.log(JSON.stringify({ composition_plan: { chunks: plan.chunks }, model_id: arg("model", "music_v2_5") }, null, 2));
    return;
  }
  let key = process.env.ELEVENLABS_API_KEY;
  if (!key && existsSync(".env.local")) {
    const m = (await readFile(".env.local", "utf8")).match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s#]+)/m);
    if (m) key = m[1];
  }
  if (!key) {
    console.error("\nSet ELEVENLABS_API_KEY in your environment or in a .env.local file (never paste it into chat). Use --dry-run to see the plan without it.");
    process.exit(1);
  }
  const body = { composition_plan: { chunks: plan.chunks }, model_id: arg("model", "music_v2_5") };
  const seed = arg("seed", null);
  if (seed && seed !== true) body.seed = Number(seed);
  console.log("\nComposing (this can take a minute)…");
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": key }, body: JSON.stringify(body) });
  if (!res.ok) {
    console.error(`ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 600)}`);
    process.exit(1);
  }
  const out = String(arg("out", "tmp-music"));
  await mkdir(out, { recursive: true });
  const base = join(out, `day-music-${dateIso}-${program}`);
  await writeFile(`${base}.mp3`, Buffer.from(await res.arrayBuffer()));
  await writeFile(`${base}.plan.json`, JSON.stringify(plan, null, 2));
  console.log(`Saved ${base}.mp3 and ${base}.plan.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
