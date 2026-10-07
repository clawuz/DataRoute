#!/usr/bin/env node
// Prototype: turn the last 24 h of Turkish Airlines traffic into ElevenLabs compositions — several ALTERNATIVES,
// each in a different genre family (classical, jazz, rock, electronic, ambient, hip-hop, world, folk …).
//
//   node scripts/generate-day-music.mjs --list                       # genre catalogue
//   node scripts/generate-day-music.mjs --dry-run                    # 3 alternatives, plans only (no API call, no key)
//   node scripts/generate-day-music.mjs --count 5                    # 5 alternatives from 5 different families
//   node scripts/generate-day-music.mjs --genres synthwave,flamenco  # your own picks
//
// The key is read from ELEVENLABS_API_KEY or, if unset, from a git-ignored .env.local file
// (line: ELEVENLABS_API_KEY=...) that you create yourself; it is never printed or written by this script.
// Every generation costs credits on your ElevenLabs plan: --count defaults to 3.
//
// Options: --file <day.json>  --url <day.json url>  --model <music_v1|music_v2|music_v2_5>  --out <dir>  --seed <int>
//          --count <n>  --genres <id,id>  --list  --dry-run  --json (print full plans)

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DAY_URL = "https://firebasestorage.googleapis.com/v0/b/omerkilavuz-9ad41.firebasestorage.app/o/public%2Fday.json?alt=media";
const API = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";
const CHUNK_MS = 45_000; // 4 × 45 s = 3 minutes = 24 h of replay
const IST_OFFSET_H = 3;

/** Genre catalogue: descriptive style tags only (no artist names), a tempo range the day's energy moves through. */
export const GENRES = [
  // classical
  { id: "baroque", family: "classical", bpm: [64, 110], tags: ["baroque ensemble", "harpsichord continuo", "counterpoint", "ground bass ostinato", "strings and flute"] },
  { id: "classical-period", family: "classical", bpm: [72, 128], tags: ["classical period chamber orchestra", "elegant Viennese classicism", "fortepiano and strings", "Alberti bass", "clear periodic phrases"] },
  { id: "romantic-piano", family: "classical", bpm: [56, 100], tags: ["romantic piano", "lyrical cantabile melody", "arpeggiated accompaniment", "warm strings", "rubato"] },
  { id: "impressionist", family: "classical", bpm: [54, 92], tags: ["impressionist", "soft piano", "color chords and extended harmony", "airy flute and harp", "dreamlike"] },
  { id: "minimalist", family: "classical", bpm: [80, 132], tags: ["minimalist repetitive patterns", "phasing marimba and piano", "pulsing strings", "gradual process", "hypnotic"] },
  { id: "cinematic", family: "classical", bpm: [60, 128], tags: ["cinematic orchestral score", "epic strings and brass", "taiko drums", "emotional swells", "film trailer build"] },
  // jazz & blues
  { id: "jazz-fusion", family: "jazz", bpm: [84, 120], tags: ["jazz fusion", "Fender Rhodes", "driving bass ostinato", "brass hits", "syncopated groove"] },
  { id: "smooth-jazz", family: "jazz", bpm: [70, 104], tags: ["smooth jazz", "saxophone lead", "warm electric piano", "soft drums", "late night lounge"] },
  { id: "bossa-nova", family: "jazz", bpm: [76, 120], tags: ["bossa nova", "nylon guitar", "brush drums", "soft flute", "sunny and relaxed"] },
  { id: "swing-big-band", family: "jazz", bpm: [100, 170], tags: ["swing big band", "brass section", "walking bass", "jazz drums", "call and response"] },
  { id: "blues", family: "jazz", bpm: [60, 112], tags: ["slow blues", "electric guitar bends", "hammond organ", "shuffle drums", "twelve bar"] },
  // rock
  { id: "indie-rock", family: "rock", bpm: [92, 140], tags: ["indie rock", "jangly guitars", "driving drums", "melodic bass", "anthemic"] },
  { id: "post-rock", family: "rock", bpm: [70, 128], tags: ["post-rock", "swelling guitars with delay", "crescendo build", "tremolo picking", "cinematic"] },
  { id: "progressive-rock", family: "rock", bpm: [80, 140], tags: ["progressive rock", "analog synthesizers", "odd meter", "virtuoso guitar", "epic arrangement"] },
  { id: "surf-rock", family: "rock", bpm: [120, 170], tags: ["surf rock", "reverb guitar", "twangy melody", "fast drums", "retro cool"] },
  { id: "instrumental-metal", family: "rock", bpm: [100, 170], tags: ["instrumental metal", "heavy distorted guitars", "double bass drums", "melodic riffs", "powerful"] },
  // electronic & dance
  { id: "synthwave", family: "electronic", bpm: [80, 118], tags: ["synthwave", "analog arpeggios", "gated reverb drums", "retro neon", "driving bassline"] },
  { id: "house", family: "electronic", bpm: [110, 128], tags: ["deep house", "four on the floor", "warm chords", "filtered bass", "dancefloor groove"] },
  { id: "techno", family: "electronic", bpm: [118, 140], tags: ["melodic techno", "hypnotic sequences", "pulsing kick", "evolving synths", "dark"] },
  { id: "drum-and-bass", family: "electronic", bpm: [160, 176], tags: ["liquid drum and bass", "breakbeat", "deep sub bass", "atmospheric pads", "fast and fluid"] },
  { id: "disco-funk", family: "electronic", bpm: [100, 124], tags: ["disco funk", "slap bass", "wah guitar", "string stabs", "four on the floor"] },
  // ambient & chill
  { id: "ambient", family: "chill", bpm: [50, 80], tags: ["ambient", "evolving pads", "soft textures", "sparse piano", "spacious reverb"] },
  { id: "lofi", family: "chill", bpm: [70, 92], tags: ["lo-fi hip hop", "dusty drums", "warm electric piano", "vinyl crackle", "mellow"] },
  { id: "downtempo", family: "chill", bpm: [80, 108], tags: ["downtempo electronica", "trip-hop beat", "deep bass", "cinematic strings", "moody"] },
  { id: "new-age", family: "chill", bpm: [56, 92], tags: ["new age", "flowing piano", "crystal bells", "airy synth", "uplifting calm"] },
  // hip-hop
  { id: "boom-bap", family: "hiphop", bpm: [82, 98], tags: ["boom bap instrumental", "sampled jazz chords", "punchy drums", "deep bass", "head nodding"] },
  { id: "trap", family: "hiphop", bpm: [130, 160], tags: ["trap instrumental", "808 bass", "rolling hi-hats", "dark pads", "hard hitting"] },
  // world
  { id: "turkish-makam", family: "world", bpm: [72, 112], tags: ["Turkish classical music", "makam modal melody", "ney flute and oud", "kanun", "frame drum rhythm"] },
  { id: "anatolian-folk", family: "world", bpm: [84, 128], tags: ["Anatolian folk", "saz baglama", "darbuka and davul", "modal dance rhythm", "spirited"] },
  { id: "flamenco", family: "world", bpm: [80, 150], tags: ["flamenco", "nylon guitar rasgueado", "palmas handclaps", "cajon", "passionate"] },
  { id: "salsa", family: "world", bpm: [160, 200], tags: ["Latin salsa", "congas and timbales", "brass section", "montuno piano", "festive"] },
  { id: "afrobeat", family: "world", bpm: [100, 128], tags: ["afrobeat", "polyrhythmic percussion", "funky guitar", "horn riffs", "hypnotic groove"] },
  { id: "indian-fusion", family: "world", bpm: [70, 130], tags: ["Indian classical fusion", "sitar and tabla", "drone tanpura", "raga melody", "building tempo"] },
  { id: "celtic", family: "world", bpm: [90, 140], tags: ["Celtic folk", "tin whistle and fiddle", "bodhran", "reels and jigs", "lively"] },
  { id: "reggae", family: "world", bpm: [66, 84], tags: ["roots reggae", "offbeat guitar skank", "deep dub bass", "one drop drums", "sunny"] },
  // folk & acoustic
  { id: "acoustic-folk", family: "folk", bpm: [70, 118], tags: ["acoustic folk", "fingerpicked guitar", "light percussion", "warm cello", "storytelling feel"] },
  { id: "bluegrass", family: "folk", bpm: [100, 160], tags: ["bluegrass", "banjo and fiddle", "flat picked guitar", "upright bass", "fast and joyful"] },
];
const FAMILIES = [...new Set(GENRES.map((g) => g.family))];

const REGION_HINTS = {
  ASI: ["pentatonic colours"],
  MEA: ["modal oud-like colours"],
  AFR: ["polyrhythmic percussion colours"],
  AME: ["warm string colours"],
  EUR: ["piano and woodwind lines"],
  DOM: ["folk-like plucked colours"],
};

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const next = process.argv[i + 1];
  return next === undefined || next.startsWith("--") ? true : next;
};

/** Pure: summarise a day.json into four 6-hour windows (chronological), their energy and regional mix. */
export function summarize(day) {
  const from = day.window.from;
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
    const localHour = (((c.start + 3 * 1800) / 3600 + IST_OFFSET_H) % 24 + 24) % 24;
    const label = localHour < 6 ? "night" : localHour < 12 ? "morning" : localHour < 18 ? "afternoon" : "evening";
    const total = Object.values(c.regions).reduce((a, b) => a + b, 0) || 1;
    const shares = Object.entries(c.regions).map(([r, v]) => [r, v / total]).sort((a, b) => b[1] - a[1]);
    const topTo = Object.entries(c.to).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    return { label, energy: norm(c.airborneHours / 6), shares, topTo, avgAirborne: c.airborneHours / 6 };
  });
}

const dyn = (e) => (e < 0.25 ? ["very soft", "sparse", "intimate"] : e < 0.55 ? ["gentle", "building", "flowing"] : e < 0.8 ? ["energetic", "full arrangement", "driving"] : ["powerful", "full band at peak intensity", "climactic"]);
export const bpmFor = (g, e) => Math.round((g.bpm[0] + e * (g.bpm[1] - g.bpm[0])) / 2) * 2;

/** Pure: build the ElevenLabs composition plan (chunks) from the day summary and a genre. */
export function buildPlan(summary, genre, dateIso) {
  const chunks = summary.map((s, i) => {
    const regionHints = s.shares.filter(([, v]) => v >= 0.14).slice(0, 2).flatMap(([r]) => REGION_HINTS[r] ?? []);
    const name = `${s.label[0].toUpperCase()}${s.label.slice(1)}`;
    return {
      text: `[${name}]`,
      duration_ms: CHUNK_MS,
      positive_styles: [...(i === 0 ? genre.tags : genre.tags.slice(0, 3)), `${bpmFor(genre, s.energy)} BPM`, ...dyn(s.energy), ...regionHints, "instrumental"],
      negative_styles: ["vocals", "lyrics", "singing", "spoken words"],
      context_adherence: "high",
    };
  });
  return { chunks, meta: { date: dateIso, genre: genre.id, family: genre.family, sections: summary.map((s) => ({ label: s.label, energy: Number(s.energy.toFixed(2)), bpm: bpmFor(genre, s.energy), avgAirborne: Math.round(s.avgAirborne), topDestinations: s.topTo })) } };
}

/** Pure: pick `count` genres from DIFFERENT families, deterministically per date (explicit ids override). */
export function pickGenres(dateIso, count, forced) {
  if (forced) {
    const ids = String(forced).split(",").map((x) => x.trim()).filter(Boolean);
    const unknown = ids.filter((id) => !GENRES.some((g) => g.id === id));
    if (unknown.length) throw new Error(`Unknown genre id(s): ${unknown.join(", ")} (use --list)`);
    return ids.map((id) => GENRES.find((g) => g.id === id));
  }
  const day = Math.floor(Date.parse(dateIso) / 86400000);
  const n = Math.min(count, FAMILIES.length);
  return Array.from({ length: n }, (_, k) => {
    const fam = FAMILIES[(((day + k * 3) % FAMILIES.length) + FAMILIES.length) % FAMILIES.length];
    const pool = GENRES.filter((g) => g.family === fam);
    return pool[(day + k) % pool.length];
  });
}

async function loadKey() {
  let key = process.env.ELEVENLABS_API_KEY;
  if (!key && existsSync(".env.local")) {
    const m = (await readFile(".env.local", "utf8")).match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s#]+)/m);
    if (m) key = m[1];
  }
  return key;
}

async function main() {
  if (arg("list", false)) {
    for (const f of FAMILIES) console.log(`${f}: ${GENRES.filter((g) => g.family === f).map((g) => g.id).join(", ")}`);
    return;
  }
  const dryRun = !!arg("dry-run", false);
  const file = arg("file", null);
  const raw = file ? await readFile(file, "utf8") : await (await fetch(arg("url", DAY_URL))).text();
  const day = JSON.parse(raw);
  const dateIso = new Date(day.generatedAt * 1000).toISOString().slice(0, 10);
  const summary = summarize(day);
  const count = Math.max(1, Math.min(8, Number(arg("count", 3)) || 3));
  const genres = pickGenres(dateIso, count, arg("genres", null));

  console.log(`Day ${dateIso} · ${day.flights.length} flights · ${genres.length} alternatives: ${genres.map((g) => g.id).join(", ")}`);
  summary.forEach((s, i) => console.log(`  ${i + 1}. ${s.label.padEnd(9)} energy ${s.energy.toFixed(2)}  avg airborne ${Math.round(s.avgAirborne)}  top: ${s.topTo.join(", ")}`));
  const model = arg("model", "music_v2_5");
  const plans = genres.map((g) => ({ genre: g, plan: buildPlan(summary, g, dateIso) }));

  if (dryRun) {
    for (const { genre, plan } of plans) {
      console.log(`\n— ${genre.id} (${genre.family}): ${plan.meta.sections.map((s) => `${s.label} ${s.bpm} BPM`).join(" · ")}`);
      console.log(`  styles: ${plan.chunks[0].positive_styles.join(", ")}`);
    }
    if (arg("json", false)) console.log(JSON.stringify(plans.map((p) => ({ composition_plan: { chunks: p.plan.chunks }, model_id: model })), null, 2));
    console.log("\nDry run: nothing was sent. Run without --dry-run (and with a key in .env.local) to compose.");
    return;
  }
  const key = await loadKey();
  if (!key) {
    console.error("\nSet ELEVENLABS_API_KEY in your environment or in a .env.local file (never paste it into chat). Use --dry-run to see the plans without it.");
    process.exit(1);
  }
  const out = String(arg("out", "tmp-music"));
  await mkdir(out, { recursive: true });
  for (const { genre, plan } of plans) {
    console.log(`\nComposing "${genre.id}" (this can take a minute)…`);
    const body = { composition_plan: { chunks: plan.chunks }, model_id: model };
    const seed = arg("seed", null);
    if (seed && seed !== true) body.seed = Number(seed);
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": key }, body: JSON.stringify(body) });
    if (!res.ok) {
      console.error(`  ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 500)}`);
      if (res.status === 401 || res.status === 402 || res.status === 403) process.exit(1); // auth/plan problem: stop, don't burn more calls
      continue;
    }
    const base = join(out, `day-music-${dateIso}-${genre.id}`);
    await writeFile(`${base}.mp3`, Buffer.from(await res.arrayBuffer()));
    await writeFile(`${base}.plan.json`, JSON.stringify(plan, null, 2));
    console.log(`  saved ${base}.mp3`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
