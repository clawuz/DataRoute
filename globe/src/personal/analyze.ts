/**
 * Listens to a finished piece of audio (the AI version) and writes down where its notes are: when each one begins,
 * how long it lasts, how loud it is and what pitch it has. The music box and the route lights are then driven by what is
 * actually heard, not by the piece the page composed itself.
 */
export interface Onset {
  /** seconds from the start */
  t: number;
  /** seconds the note rings */
  d: number;
  /** MIDI pitch (fractional); a drum or a noise has none and gets a nominal low value */
  midi: number;
  /** 0..1 */
  vel: number;
  /** false for a hit without a clear pitch */
  voiced: boolean;
}

const N = 512; // frame
const HOP = 256;

/** in-place radix-2 FFT of a real frame (re, im arrays of length N) */
function fft(re: Float32Array, im: Float32Array, cos: Float32Array, sin: Float32Array, rev: Uint16Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = start + k;
        const b = a + half;
        const tr = re[b] * cos[w] + im[b] * sin[w];
        const ti = im[b] * cos[w] - re[b] * sin[w];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** mono samples → about 11 kHz (a plain average of neighbours is enough for onsets and low pitch) */
function decimate(x: Float32Array, sr: number): { y: Float32Array; fs: number } {
  const f = Math.max(1, Math.round(sr / 11025));
  const m = Math.floor(x.length / f);
  const y = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let k = 0; k < f; k++) s += x[i * f + k];
    y[i] = s / f;
  }
  return { y, fs: sr / f };
}

/** fundamental by normalised autocorrelation on `y[a..b)`; null when there is no clear pitch */
function pitchOf(y: Float32Array, a: number, b: number, fs: number): number | null {
  const lo = Math.floor(fs / 1500);
  const hi = Math.min(Math.floor(fs / 65), Math.floor((b - a) / 2));
  if (b - a < hi * 2 || hi <= lo) return null;
  let e0 = 0;
  for (let i = a; i < b; i++) e0 += y[i] * y[i];
  if (e0 < 1e-7) return null;
  let best = 0;
  let bl = 0;
  const cs = new Float32Array(hi + 2);
  for (let lag = lo; lag <= hi; lag++) {
    let c = 0;
    for (let i = a; i + lag < b; i += 2) c += y[i] * y[i + lag];
    cs[lag] = (2 * c) / e0;
  }
  // the first strong peak, not the strongest: the strongest is often a multiple of the period
  const top = Math.max(...cs);
  if (top < 0.4) return null;
  for (let lag = lo + 1; lag < hi; lag++) {
    if (cs[lag] >= 0.85 * top && cs[lag] >= cs[lag - 1] && cs[lag] >= cs[lag + 1]) {
      best = cs[lag];
      bl = lag;
      break;
    }
  }
  if (!bl || best < 0.4) return null;
  // parabolic refinement
  const l = cs[bl - 1];
  const r = cs[bl + 1];
  const den = l - 2 * best + r;
  const shift = den !== 0 ? (0.5 * (l - r)) / den : 0;
  return fs / (bl + shift);
}

export function analyze(samples: Float32Array, sampleRate: number, maxNotes = 1800): Onset[] {
  const { y, fs } = decimate(samples, sampleRate);
  const frames = Math.floor((y.length - N) / HOP);
  if (frames < 8) return [];
  const cos = new Float32Array(N / 2);
  const sin = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / N);
    sin[i] = Math.sin((2 * Math.PI * i) / N);
  }
  const rev = new Uint16Array(N);
  const bits = Math.log2(N);
  for (let i = 0; i < N; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const kLo = Math.max(2, Math.floor((90 / fs) * N));
  const kHi = Math.min(N / 2 - 1, Math.floor((3500 / fs) * N));
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let prev = new Float32Array(kHi + 1);
  const cur = new Float32Array(kHi + 1);
  const flux = new Float32Array(frames);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = y[f * HOP + i];
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    env[f] = Math.sqrt(e / N);
    fft(re, im, cos, sin, rev);
    let fl = 0;
    for (let k = kLo; k <= kHi; k++) {
      cur[k] = Math.log1p(40 * Math.hypot(re[k], im[k]) / N * 8);
      const d = cur[k] - prev[k];
      if (d > 0) fl += d;
    }
    flux[f] = fl;
    prev = Float32Array.from(cur);
  }
  // peaks above a moving threshold
  const W = Math.round((0.5 * fs) / HOP);
  const minGap = Math.max(2, Math.round((0.055 * fs) / HOP));
  const peaks: number[] = [];
  let last = -1e9;
  for (let f = 2; f < frames - 2; f++) {
    let m = 0;
    let s2 = 0;
    let c = 0;
    for (let k = Math.max(0, f - W); k <= Math.min(frames - 1, f + W); k++) {
      m += flux[k];
      s2 += flux[k] * flux[k];
      c++;
    }
    m /= c;
    const sd = Math.sqrt(Math.max(0, s2 / c - m * m));
    const thr = m + 0.6 * sd + 0.015;
    const isMax = flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && flux[f] > flux[f - 2] && flux[f] >= flux[f + 2];
    if (isMax && flux[f] > thr && f - last >= minGap) {
      peaks.push(f);
      last = f;
    }
  }
  // loudness scale: the 95th percentile of the notes' own levels
  const lv = peaks.map((f) => env[Math.min(frames - 1, f + 2)]).sort((a, b) => a - b);
  const ref = lv.length ? lv[Math.floor(lv.length * 0.95)] || 1e-6 : 1e-6;
  const out: Onset[] = [];
  for (let pi = 0; pi < peaks.length; pi++) {
    const f = peaks[pi];
    const t = (f * HOP) / fs;
    const nextT = pi + 1 < peaks.length ? (peaks[pi + 1] * HOP) / fs : Infinity;
    // duration: until the envelope falls to a third of its peak, the next onset, or 3 s
    const peak = Math.max(env[f], env[Math.min(frames - 1, f + 1)], env[Math.min(frames - 1, f + 2)], 1e-6);
    let df = f + 2;
    while (df < frames - 1 && env[df] > 0.33 * peak && (df * HOP) / fs - t < 3) df++;
    const d = Math.max(0.08, Math.min(3, (df * HOP) / fs - t, nextT - t));
    const a = Math.floor(((t + 0.03) * fs));
    const b = Math.min(y.length, a + Math.floor(0.16 * fs));
    const hz = pitchOf(y, a, b, fs);
    const vel = Math.min(1, Math.max(0.12, Math.sqrt(peak / ref) * 0.8));
    const midi = hz ? 69 + 12 * Math.log2(hz / 440) : 45;
    // in a mix the next onset is usually another voice's: a pitched note rings for as long as its pitch is still heard
    let ring = d;
    if (hz) {
      for (let w = 1; w <= 16; w++) {
        const wa = a + Math.floor(w * 0.15 * fs);
        const wb = Math.min(y.length, wa + Math.floor(0.16 * fs));
        const h2 = pitchOf(y, wa, wb, fs);
        if (!h2 || Math.abs(69 + 12 * Math.log2(h2 / 440) - midi) > 1.2) break;
        ring = 0.03 + w * 0.15 + 0.1;
      }
    }
    out.push({ t, d: Math.min(3, Math.max(d, ring)), midi, vel, voiced: !!hz });
  }
  // a very busy recording: keep the strongest
  if (out.length > maxNotes) {
    const keep = [...out].sort((a, b) => b.vel - a.vel).slice(0, maxNotes);
    return keep.sort((a, b) => a.t - b.t);
  }
  return out;
}
