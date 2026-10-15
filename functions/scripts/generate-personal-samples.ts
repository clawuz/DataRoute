/**
 * Makes a set of AI tracks by hand (outside the per-visitor limit) and puts them where the site finds them:
 *   gs://<bucket>/public/personal/<mode>-<regions>.mp3   (the same keys the function uses, so they become the cache)
 * Reads ELEVENLABS_API_KEY from ../.env.local (never printed). Skips a track that already exists.
 *   npx tsx scripts/generate-personal-samples.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlan, characterKey, type Character } from "../src/personal-music.js";

const BUCKET = "gs://omerkilavuz-9ad41.firebasestorage.app/public/personal";
const MODEL = "music_v2_5";
const API = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";

const envFile = join(import.meta.dirname, "..", "..", ".env.local");
const key = readFileSync(envFile, "utf8").split("\n").map((l) => l.match(/^ELEVENLABS_API_KEY=(.*)$/)?.[1]?.trim().replace(/^["']|["']$/g, "")).find(Boolean);
if (!key) throw new Error("no ELEVENLABS_API_KEY in .env.local");

interface Job {
  label: string;
  c: Character;
  /** extra styles for every part of the form (a character's own flavour) */
  extra?: string[];
}
const JOBS: Job[] = [
  { label: "few — Europe only (journey)", c: { mode: "visited", regions: ["EUR"], size: "M" } },
  { label: "few — Asia only (wish)", c: { mode: "wish", regions: ["ASI"], size: "M" } },
  { label: "many — Americas, Asia, Europe (journey)", c: { mode: "visited", regions: ["AME", "ASI", "EUR"], size: "M" } },
  { label: "many — Europe, Asia, Africa (wish)", c: { mode: "wish", regions: ["EUR", "ASI", "AFR"], size: "M" } },
  { label: "Asia-heavy — Asia and Europe (journey)", c: { mode: "visited", regions: ["ASI", "EUR"], size: "M" }, extra: ["Asian-leaning", "koto and bamboo flute", "pentatonic melodies"] },
  { label: "Asia-heavy — Asia and Americas (wish)", c: { mode: "wish", regions: ["ASI", "AME"], size: "M" }, extra: ["Asian-leaning", "harp and bamboo flute", "pentatonic melodies"] },
  { label: "Africa breezes — Africa and Middle East (journey)", c: { mode: "visited", regions: ["AFR", "MEA"], size: "M" }, extra: ["African rhythms", "marimba and kalimba", "warm hand percussion"] },
  { label: "Turkish melodies — Anatolia (journey)", c: { mode: "visited", regions: ["DOM"], size: "M" }, extra: ["Turkish folk melody", "Anatolian saz and ney", "makam hicaz and nihavend inflections", "lyrical orchestral accompaniment"] },
];

async function compose(job: Job): Promise<Buffer> {
  const plan = buildPlan(job.c);
  if (job.extra) for (const ch of plan.chunks) ch.positive_styles.unshift(...job.extra);
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(API, { method: "POST", headers: { "xi-api-key": key!, "Content-Type": "application/json" }, body: JSON.stringify({ composition_plan: { chunks: plan.chunks }, model_id: MODEL }) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = (await res.text()).slice(0, 160);
    if (res.status === 429 || res.status === 503) {
      console.log(`   busy (${res.status}), retrying in ${attempt * 15}s`);
      await new Promise((r) => setTimeout(r, attempt * 15000));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }
  throw new Error("still busy after 6 attempts");
}

const dir = mkdtempSync(join(tmpdir(), "personal-samples-"));
for (const job of JOBS) {
  const name = `${characterKey(job.c)}.mp3`;
  const dest = `${BUCKET}/${name}`;
  let exists = false;
  try {
    execFileSync("gsutil", ["-q", "stat", dest]);
    exists = true;
  } catch {
    /* not there yet */
  }
  if (exists) {
    console.log(`= ${name}  (already there)  ${job.label}`);
    continue;
  }
  console.log(`+ ${name}  ${job.label} …`);
  const mp3 = await compose(job);
  const file = join(dir, name);
  writeFileSync(file, mp3);
  execFileSync("gsutil", ["-q", "-h", "Cache-Control:public,max-age=3600", "cp", file, dest]);
  console.log(`   saved ${(mp3.length / 1e6).toFixed(1)} MB`);
}
console.log("done");
