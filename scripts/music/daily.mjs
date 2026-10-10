#!/usr/bin/env node
// Daily track pipeline (DEACTIVATED by default).
//
//   node scripts/music/daily.mjs --dry-run          # fetch the day, pick the genre, print the plan; nothing is composed or uploaded
//   node scripts/music/daily.mjs                    # compose → transcribe → give notes to routes → upload as a CANDIDATE
//   node scripts/music/daily.mjs --promote          # make the current candidate the live track (latest.json)
//
// It refuses to run unless scripts/music/daily.config.json has "enabled": true OR the environment sets
// DAILY_MUSIC_ENABLED=true (the GitHub workflow passes this from a repository variable). Options: --genre <id>, --date <YYYY-MM-DD>.
// Needs: ELEVENLABS_API_KEY (compose), GOOGLE_APPLICATION_CREDENTIALS (upload, a service account with Storage write), python3
// with basic-pitch (transcribe). Storage layout: public/music/<date>/{track.mp3,notes.json,plan.json}, public/music/candidate.json, public/music/latest.json.

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i < 0) return d;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};

/** Pure: which genre a date gets (a rotation through the configured list; an explicit id wins). */
export function genreForDate(dateIso, genres, forced = null) {
  if (forced) return forced;
  const day = Math.floor(Date.parse(dateIso) / 86400000);
  return genres[((day % genres.length) + genres.length) % genres.length];
}

/** Pure: the pointer file the site reads. */
export function pointer({ date, genre, model, generatedAt }) {
  const base = `public/music/${date}`;
  return { v: 1, date, genre, model, generatedAt, track: `${base}/track.mp3`, notes: `${base}/notes.json`, plan: `${base}/plan.json` };
}

/** Pure: is the pipeline switched on? */
export const isEnabled = (config, env = process.env) => config.enabled === true || env.DAILY_MUSIC_ENABLED === "true";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, env: process.env, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
}

async function bucketOf(config) {
  let admin;
  try {
    admin = (await import("firebase-admin")).default;
  } catch {
    throw new Error("firebase-admin is not installed: run `npm install` in scripts/music first");
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault(), storageBucket: config.bucket });
  return admin.storage().bucket();
}

async function main() {
  const config = JSON.parse(await readFile(join(HERE, "daily.config.json"), "utf8"));
  if (!isEnabled(config)) {
    console.log("daily music is deactivated (daily.config.json enabled=false, DAILY_MUSIC_ENABLED not true). Nothing done.");
    return;
  }
  const promote = !!arg("promote", false);
  if (promote) {
    const bucket = await bucketOf(config);
    const [buf] = await bucket.file("public/music/candidate.json").download();
    const cand = JSON.parse(buf.toString("utf8"));
    await bucket.file("public/music/latest.json").save(JSON.stringify({ ...cand, promotedAt: new Date().toISOString() }), { contentType: "application/json", metadata: { cacheControl: "public, max-age=300" } });
    console.log(`promoted ${cand.date} (${cand.genre}) to latest.json`);
    return;
  }

  const tmp = join(ROOT, "tmp-music", "daily");
  await mkdir(tmp, { recursive: true });
  const dayFile = join(tmp, "day.json");
  const res = await fetch(config.dayUrl);
  if (!res.ok) throw new Error(`day.json: ${res.status}`);
  await writeFile(dayFile, await res.text());
  const day = JSON.parse(await readFile(dayFile, "utf8"));
  const date = arg("date") || new Date(day.generatedAt * 1000).toISOString().slice(0, 10);
  const genre = genreForDate(date, config.genres, arg("genre"));
  console.log(`day ${date} · ${day.flights.length} flights · genre ${genre}`);

  if (arg("dry-run", false)) {
    run("node", ["scripts/generate-day-music.mjs", "--dry-run", "--genres", genre, "--file", dayFile, "--model", config.model]);
    console.log("dry run: nothing composed, nothing uploaded");
    return;
  }
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");

  run("node", ["scripts/generate-day-music.mjs", "--genres", genre, "--file", dayFile, "--model", config.model, "--out", tmp]);
  const base = join(tmp, `day-music-${date}-${genre}`);
  if (!existsSync(`${base}.mp3`)) throw new Error(`composition missing: ${base}.mp3`);
  run(process.env.PYTHON || "python3", ["scripts/music/transcribe.py", `${base}.mp3`]);
  const bundle = join(tmp, "bundle");
  run("node", ["scripts/music/assign-notes.mjs", `${base}.notes.json`, dayFile, "--bundle", bundle]);

  const bucket = await bucketOf(config);
  const dir = `public/music/${date}`;
  const files = [
    [join(bundle, "track.mp3"), `${dir}/track.mp3`, "audio/mpeg"],
    [join(bundle, "notes.json"), `${dir}/notes.json`, "application/json"],
    [`${base}.plan.json`, `${dir}/plan.json`, "application/json"],
  ];
  for (const [local, remote, type] of files) {
    await bucket.upload(local, { destination: remote, metadata: { contentType: type, cacheControl: "public, max-age=86400" } });
    console.log("uploaded", remote);
  }
  const ptr = pointer({ date, genre, model: config.model, generatedAt: new Date().toISOString() });
  await bucket.file("public/music/candidate.json").save(JSON.stringify(ptr), { contentType: "application/json", metadata: { cacheControl: "no-cache" } });
  console.log(`candidate ready: ${date} (${genre}). Listen, then run with --promote (or the workflow's promote action).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
