#!/usr/bin/env node
/**
 * Makes single-note instrument samples with the ElevenLabs Sound Effects API, for listening and
 * trying out — it does NOT touch globe/public/samples/lite (copy what you like in by hand, then
 * add a zone to manifest.json).
 *
 *   node scripts/samples/generate-instrument-samples.mjs                  # dry run: lists jobs + cost
 *   node scripts/samples/generate-instrument-samples.mjs --go             # makes everything missing
 *   node scripts/samples/generate-instrument-samples.mjs --go --only=saz,ney --notes=C4,G4
 *   node scripts/samples/generate-instrument-samples.mjs --go --seconds=4 --out=some/dir
 *
 * Reads ELEVENLABS_API_KEY from ../../.env.local (never printed). Skips files that already exist.
 * Output: <out>/<instrument>/<instrument>_<note>.mp3  (default out = tmp-music-v1/instrument-samples)
 * Cost: the API bills about 40 credits per second when the duration is fixed, so the dry run
 * prints jobs × seconds × 40 before anything is spent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const API = "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
const CREDITS_PER_SECOND = 40;

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const GO = process.argv.includes("--go");
const SECONDS = Number(arg("seconds", "4"));
const OUT = join(root, arg("out", "tmp-music-v1/instrument-samples"));
const ONLY = arg("only", "")?.split(",").filter(Boolean);
const NOTES = arg("notes", "C3,C4,G4,C5").split(",");

/** how each instrument is asked for; "dry" keeps room reverb out so the sampler can add its own */
const INSTRUMENTS = {
  saz: "Turkish saz (baglama), a single plucked long-neck lute note, warm and nasal",
  oud: "oud, a single plucked fretless lute note, round and woody",
  ney: "ney, an end-blown reed flute, a single breathy sustained note",
  kanun: "kanun, a single plucked zither string, bright and shimmering",
  duduk: "duduk, a single soft sustained double-reed note",
  kemence: "Black Sea kemenche, a single bowed note, raw and reedy",
  darbuka: "darbuka hand drum, one open doum hit",
  zurna: "Turkish zurna, a single loud sustained note of a double-reed folk shawm, piercing and bright",
  cura: "Turkish cura, a single plucked note of a small high-pitched long-neck lute, bright and short",
  kaval: "Anatolian kaval, a single sustained note of an open shepherd's end-blown flute, breathy and warm",
  tulum: "Turkish tulum bagpipe, a single sustained drone-like note, reedy",
  def: "Turkish def frame drum with jingles, one single hit",
  bendir: "bendir frame drum, one single deep hit",
  piano: "grand piano, a single note, soft touch",
  harp: "concert harp, a single plucked note",
  cello: "solo cello, a single sustained bowed note, legato",
  violin: "solo violin, a single sustained bowed note, legato",
  flute: "concert flute, a single sustained note, airy",
};
const PERCUSSION = new Set(["darbuka", "def", "bendir"]); // unpitched: one file, no note list

const key = readFileSync(join(root, ".env.local"), "utf8")
  .split("\n")
  .map((l) => l.match(/^ELEVENLABS_API_KEY=(.*)$/)?.[1]?.trim().replace(/^["']|["']$/g, ""))
  .find(Boolean);
if (!key) throw new Error("no ELEVENLABS_API_KEY in .env.local");

const prompt = (inst, note) =>
  `${INSTRUMENTS[inst]}${PERCUSSION.has(inst) ? "" : `, pitch ${note}`}. Isolated, dry recording, no reverb, no background, no other instruments, clean start and natural decay.`;

const names = Object.keys(INSTRUMENTS).filter((i) => !ONLY.length || ONLY.includes(i));
const unknown = ONLY.filter((i) => !INSTRUMENTS[i]);
if (unknown.length) throw new Error(`unknown instrument(s): ${unknown.join(", ")} (have: ${Object.keys(INSTRUMENTS).join(", ")})`);

const jobs = names.flatMap((inst) =>
  (PERCUSSION.has(inst) ? ["hit"] : NOTES).map((note) => ({ inst, note, file: join(OUT, inst, `${inst}_${note}.mp3`) })),
);
const todo = jobs.filter((j) => !existsSync(j.file));
const credits = todo.length * SECONDS * CREDITS_PER_SECOND;
console.log(`${jobs.length} jobs, ${jobs.length - todo.length} already there, ${todo.length} to make × ${SECONDS}s ≈ ${credits} credits`);
if (!GO) {
  for (const j of todo) console.log(`  would make ${j.inst}/${j.inst}_${j.note}.mp3`);
  console.log("dry run — add --go to spend credits");
  process.exit(0);
}

async function generate(job) {
  const body = { text: prompt(job.inst, job.note), duration_seconds: SECONDS, prompt_influence: 0.7 };
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(API, { method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status === 503) {
      console.log(`   busy (${res.status}), retrying in ${attempt * 15}s`);
      await new Promise((r) => setTimeout(r, attempt * 15000));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error("still busy after 6 attempts");
}

for (const job of todo) {
  console.log(`+ ${job.inst}/${job.inst}_${job.note}.mp3 …`);
  const mp3 = await generate(job);
  mkdirSync(dirname(job.file), { recursive: true });
  writeFileSync(job.file, mp3);
  console.log(`   saved ${(mp3.length / 1e3).toFixed(0)} KB`);
}
console.log(`done — listen in ${OUT}`);
