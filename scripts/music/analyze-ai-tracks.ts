/**
 * Reads the AI tracks (decoded to 22.05 kHz mono float32 files) and writes down what they are like: tempo, key,
 * chords, how busy they are, how loud over their length. Used to bring the AI pieces' character into our own composer.
 *   npx tsx scripts/music/analyze-ai-tracks.ts DIR
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "../../globe/src/personal/analyze.ts";

const SR = 22050;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

function chromaWindows(x: Float32Array, win: number, step: number): { chroma: Float64Array; rms: number; centroid: number }[] {
  const out: { chroma: Float64Array; rms: number; centroid: number }[] = [];
  const N = 4096;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let s = 0; s + win <= x.length; s += step) {
    const chroma = new Float64Array(12);
    let rms = 0;
    let cen = 0;
    let cw = 0;
    let frames = 0;
    for (let f = s; f + N <= s + win; f += N / 2) {
      for (let i = 0; i < N; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
        re[i] = x[f + i] * w;
        im[i] = 0;
        rms += x[f + i] * x[f + i];
      }
      fft(re, im);
      for (let k = Math.floor((70 / SR) * N); k < Math.floor((2200 / SR) * N); k++) {
        const hz = (k * SR) / N;
        const mag = Math.hypot(re[k], im[k]);
        const pc = ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12 + 9) % 12;
        chroma[pc] += mag;
        cen += hz * mag;
        cw += mag;
      }
      frames++;
    }
    out.push({ chroma, rms: Math.sqrt(rms / (frames * N || 1)), centroid: cw ? cen / cw : 0 });
  }
  return out;
}

function bestKey(ch: Float64Array): string {
  let best = "";
  let bs = -Infinity;
  for (let r = 0; r < 12; r++) {
    for (const [name, prof] of [["major", MAJ], ["minor", MIN]] as const) {
      let s = 0;
      for (let i = 0; i < 12; i++) s += ch[(r + i) % 12] * prof[i];
      if (s > bs) {
        bs = s;
        best = `${NAMES[r]} ${name}`;
      }
    }
  }
  return best;
}
function chordOf(ch: Float64Array): string {
  let best = "";
  let bs = -Infinity;
  for (let r = 0; r < 12; r++) {
    for (const [name, third] of [["", 4], ["m", 3]] as const) {
      const s = ch[r] * 1.2 + ch[(r + third) % 12] + ch[(r + 7) % 12] * 0.9 - 0.25 * (ch[(r + 1) % 12] + ch[(r + 6) % 12]);
      if (s > bs) {
        bs = s;
        best = NAMES[r] + name;
      }
    }
  }
  return best;
}

const dir = process.argv[2];
const rows: Record<string, unknown>[] = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith(".f32")).sort()) {
  const buf = readFileSync(join(dir, f));
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const secs = x.length / SR;
  const on = analyze(x, SR, 6000);
  // tempo: the beat period that the onsets line up with best
  let bpm = 0;
  let bsc = -1;
  for (let b = 60; b <= 150; b += 0.5) {
    const T = 60 / b;
    let c = 0;
    let s = 0;
    for (const o of on) {
      if (o.vel < 0.25) continue;
      const ph = (2 * Math.PI * (o.t % T)) / T;
      c += Math.cos(ph) * o.vel;
      s += Math.sin(ph) * o.vel;
    }
    const sc = Math.hypot(c, s);
    if (sc > bsc) {
      bsc = sc;
      bpm = b;
    }
  }
  const ws = chromaWindows(x, SR * 2, SR * 2);
  const total = new Float64Array(12);
  for (const w of ws) for (let i = 0; i < 12; i++) total[i] += w.chroma[i] / (w.chroma.reduce((a, c) => a + c, 0) || 1);
  const chords: string[] = [];
  for (const w of ws) {
    const c = chordOf(w.chroma);
    if (chords[chords.length - 1] !== c) chords.push(c);
  }
  const energy = Array.from({ length: 10 }, (_, i) => {
    const a = Math.floor((i / 10) * x.length);
    const b = Math.floor(((i + 1) / 10) * x.length);
    let e = 0;
    for (let k = a; k < b; k++) e += x[k] * x[k];
    return Math.sqrt(e / (b - a));
  });
  const peak = Math.max(...energy);
  const midis = on.filter((o) => o.voiced).map((o) => o.midi).sort((a, b) => a - b);
  const q = (p: number) => midis[Math.floor(p * (midis.length - 1))]?.toFixed(0);
  rows.push({
    track: f.replace(".f32", ""),
    secs: Math.round(secs),
    onsetsPerSec: +(on.length / secs).toFixed(2),
    bpm,
    key: bestKey(total),
    centroidHz: Math.round(ws.reduce((a, w) => a + w.centroid, 0) / ws.length),
    midi10_50_90: `${q(0.1)}/${q(0.5)}/${q(0.9)}`,
    energyCurve: energy.map((e) => Math.round((e / peak) * 100)).join(" "),
    chords: chords.slice(0, 14).join(" "),
  });
}
for (const r of rows) console.log(JSON.stringify(r));
