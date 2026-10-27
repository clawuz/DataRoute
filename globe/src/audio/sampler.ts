/**
 * Sampled instruments. A "pack" is a manifest of instruments, each a list of zones (one recorded note and the range
 * of notes it covers). A note is played by pitching the nearest zone with `playbackRate`. Until a pack has arrived
 * (or where an instrument is not in it) the caller falls back to the synthesised voice, so the music never waits.
 */

export interface SampleZone {
  /** the pitch the recording is at, as a MIDI note number */
  root: number;
  /** the notes this zone is used for (inclusive MIDI numbers) */
  lo: number;
  hi: number;
  /** file relative to the manifest */
  file: string;
  /** velocity range 0..1 this layer answers (omitted: all) */
  vel?: [number, number];
  /** seconds [start, end] of this recording's own steady part (a sustained instrument whose notes differ in length); else the instrument's `loop` */
  loop?: [number, number];
}

/** one copy of the recording in a voice (a chorus of detuned copies makes a zither or a course of strings) */
export interface SampleLayer {
  /** cents */
  detune: number;
  gain: number;
}

export interface SampleInstrument {
  /** build this voice from another instrument's recordings (e.g. a kanun from the harp) */
  use?: string;
  zones: SampleZone[];
  /** the voice is several copies of the recording, detuned against each other */
  layers?: SampleLayer[];
  /** a filter that shapes the colour of the voice */
  filter?: { type: "lowpass" | "highpass" | "bandpass" | "peaking"; freq: number; q?: number; gain?: number };
  /** the note starts this many semitones low and slides up in `glideSec` (a plucked-string "bend") */
  glide?: { semitones: number; sec: number };
  /** slow pitch vibrato that starts `after` seconds into the note */
  vibrato?: { rate: number; cents: number; after: number };
  /** seconds of release after the note ends (default 0.35) */
  release?: number;
  /** level trim */
  gain?: number;
  /** the note may be held: sample is long enough to sustain; otherwise it plays out as recorded */
  sustained?: boolean;
  /** seconds [start, end] of the steady part, looped when a note is held longer than the recording */
  loop?: [number, number];
  /** a drum or a noise: played as recorded at any requested pitch */
  unpitched?: boolean;
  /** a single recording stretched over a wide range sounds wrong: notes further than this many semitones from it are moved by octaves */
  maxShift?: number;
}

export interface SampleManifest {
  name: string;
  instruments: Record<string, SampleInstrument>;
}

/** the ramp of a per-note glide (s) */
const NOTE_GLIDE_SEC = 0.08;

/** the Q of the altitude low-pass of a note (altitude-feel.ts) */
const BRIGHT_Q = 0.6;
/** how long a short gesture note rings after its end (s) */
const SHORT_TAIL_SEC = 0.25;

/** how long one manifest may take before the sampler goes on without it (the synth plays its instruments) */
const MANIFEST_TIMEOUT_MS = 10000;

export const midiOf = (freq: number): number => 69 + 12 * Math.log2(freq / 440);
export const freqOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** the zone that covers `midi` (and the velocity), or the nearest one; null for an empty instrument */
export function pickZone(zones: SampleZone[], midi: number, vel = 0.7): SampleZone | null {
  if (zones.length === 0) return null;
  const layered = zones.filter((z) => !z.vel || (vel >= z.vel[0] && vel <= z.vel[1]));
  const pool = layered.length > 0 ? layered : zones;
  const m = Math.round(midi);
  let best: SampleZone | null = null;
  let bestD = Infinity;
  for (const z of pool) {
    const d = m < z.lo ? z.lo - m : m > z.hi ? m - z.hi : Math.abs(m - z.root) * 0.001;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

/** playback rate that moves a recording at `rootMidi` to `freq`, kept within ±`limit` semitones of the root */
export function rateFor(freq: number, rootMidi: number, limit = 12): number {
  const semis = Math.max(-limit, Math.min(limit, midiOf(freq) - rootMidi));
  return 2 ** (semis / 12);
}

export interface Sampler {
  /** fetch a manifest and decode its files (in the background; resolves with how many files arrived) */
  load(manifestUrl: string): Promise<number>;
  /** read manifests into a catalogue (nothing is decoded); the first manifest to name an instrument wins */
  use(manifestUrls: string[]): Promise<void>;
  /** decode the recordings of these instruments (only those); resolves when present or after `timeoutMs`, never rejects */
  ensure(names: string[], timeoutMs?: number): Promise<void>;
  has(instrument: string): boolean;
  /** schedules a note; false when the instrument is not loaded (play the synth instead) */
  play(dest: AudioNode, instrument: string, freq: number, vel: number, when: number, durSec: number, onEnd?: () => void, glide?: number, short?: boolean, cutoffHz?: number): boolean;
  dispose(): void;
}

export function createSampler(ctx: AudioContext): Sampler {
  const defs = new Map<string, SampleInstrument>();
  const buffers = new Map<string, AudioBuffer>();
  const loading = new Set<string>();
  const catalogue = new Map<string, { inst: SampleInstrument; base: string }>();
  const seenManifests = new Set<string>();
  const inflight = new Map<string, Promise<boolean>>();
  let catalogueReady: Promise<void> = Promise.resolve();

  /** decode one instrument's recordings and register it; false when a file did not arrive */
  function fetchInstrument(name: string, chain: readonly string[] = []): Promise<boolean> {
    if (defs.has(name)) return Promise.resolve(true);
    if (chain.includes(name)) return Promise.resolve(false); // a `use` cycle: give up, the synth plays
    const known = catalogue.get(name);
    if (!known) return Promise.resolve(false);
    const running = inflight.get(name);
    if (running) return running;
    const job = (async () => {
      const { inst, base } = known;
      if (inst.use) {
        const ok = await fetchInstrument(inst.use, [...chain, name]);
        const from = defs.get(inst.use);
        if (!ok || !from) return false;
        defs.set(name, { ...from, ...inst, zones: from.zones });
        return true;
      }
      const urls = [...new Set(inst.zones.map((z) => base + z.file))];
      const ok = await Promise.all(
        urls.map(async (u) => {
          if (buffers.has(u)) return true;
          const b = await decode(u);
          if (b) buffers.set(u, b);
          return !!b;
        }),
      );
      if (!ok.every(Boolean)) return false;
      defs.set(name, { ...inst, zones: inst.zones.map((z) => ({ ...z, file: base + z.file })) });
      return true;
    })().finally(() => inflight.delete(name));
    inflight.set(name, job);
    return job;
  }

  async function decode(url: string): Promise<AudioBuffer | null> {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      return null;
    }
  }

  return {
    async load(manifestUrl) {
      if (loading.has(manifestUrl)) return 0;
      loading.add(manifestUrl);
      let n = 0;
      try {
        const res = await fetch(manifestUrl);
        if (!res.ok) return 0;
        const man = (await res.json()) as SampleManifest;
        const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
        const jobs: Promise<void>[] = [];
        for (const [name, inst] of Object.entries(man.instruments)) {
          if (inst.use) continue; // built from another instrument, below
          // an instrument counts as present once all of its zones are decoded
          const urls = [...new Set(inst.zones.map((z) => base + z.file))];
          jobs.push(
            Promise.all(
              urls.map(async (u) => {
                if (buffers.has(u)) return true;
                const b = await decode(u);
                if (b) buffers.set(u, b);
                return !!b;
              }),
            ).then((ok) => {
              if (ok.every(Boolean)) {
                defs.set(name, { ...inst, zones: inst.zones.map((z) => ({ ...z, file: base + z.file })) });
                n += urls.length;
              }
            }),
          );
        }
        await Promise.all(jobs);
        for (const [name, inst] of Object.entries(man.instruments)) {
          const from = inst.use ? defs.get(inst.use) : undefined;
          if (inst.use && from) defs.set(name, { ...from, ...inst, zones: from.zones });
        }
      } catch {
        /* offline or a bad manifest: the synth plays */
      }
      return n;
    },
    use(manifestUrls) {
      const run = async (): Promise<void> => {
        for (const url of manifestUrls) {
          if (seenManifests.has(url)) continue;
          seenManifests.add(url);
          // a manifest that never answers must not hold back the manifests after it (nor later calls to `ensure`)
          const abort = typeof AbortController === "function" ? new AbortController() : null;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const man = await Promise.race([
              (async () => {
                const res = await fetch(url, abort ? { signal: abort.signal } : undefined);
                return res.ok ? ((await res.json()) as SampleManifest) : null;
              })(),
              new Promise<null>((r) => {
                timer = setTimeout(() => {
                  abort?.abort();
                  r(null);
                }, MANIFEST_TIMEOUT_MS);
              }),
            ]);
            if (!man) continue;
            const base = url.slice(0, url.lastIndexOf("/") + 1);
            for (const [name, inst] of Object.entries(man.instruments)) if (!catalogue.has(name)) catalogue.set(name, { inst, base });
          } catch {
            /* offline or a bad manifest: the synth plays */
          } finally {
            clearTimeout(timer);
          }
        }
      };
      catalogueReady = catalogueReady.then(run);
      return catalogueReady;
    },
    async ensure(names, timeoutMs = 4000) {
      // the time limit covers the wait for the manifests too: a slow or hanging manifest never holds the piece back
      let timer: ReturnType<typeof setTimeout> | undefined;
      const gaveUp = new Promise<void>((r) => {
        timer = setTimeout(r, timeoutMs);
      });
      const fetchAll = catalogueReady.then(async () => {
        const wanted = [...new Set(names)].filter((n) => !defs.has(n) && catalogue.has(n));
        await Promise.all(wanted.map((n) => fetchInstrument(n)));
      }).catch(() => undefined); // a job that fails after the time is up must not surface as an unhandled rejection
      try {
        await Promise.race([fetchAll, gaveUp]);
      } catch {
        /* whatever went wrong inside a job, the synth plays */
      } finally {
        clearTimeout(timer);
      }
    },
    has: (instrument) => defs.has(instrument),
    play(dest, instrument, freq, vel, when, durSec, onEnd, glide, short, cutoffHz) {
      const inst = defs.get(instrument);
      if (!inst) return false;
      let f = freq;
      const z = pickZone(inst.zones, midiOf(f), vel);
      if (z && inst.maxShift) {
        while (midiOf(f) - z.root > inst.maxShift) f /= 2;
        while (z.root - midiOf(f) > inst.maxShift) f *= 2;
      }
      const buf = z ? buffers.get(z.file) : undefined;
      if (!z || !buf) return false;
      const rate = inst.unpitched ? 1 : rateFor(f, z.root);
      const peak = Math.max(0.0001, vel * (inst.gain ?? 1));
      // a short (hidden gesture) note rings out only briefly: many of them sound together, and each one is a voice
      const release = short ? Math.min(inst.release ?? 0.35, SHORT_TAIL_SEC) : (inst.release ?? 0.35);
      const hold = when + Math.max(0.05, durSec);
      const tail = short ? SHORT_TAIL_SEC : Math.max(release, inst.sustained ? release : 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.008);
      if (inst.sustained) {
        g.gain.setValueAtTime(peak, hold);
        g.gain.exponentialRampToValueAtTime(0.0001, hold + release);
      } else {
        // recorded decay plays out; a short release if the note was meant to be short
        g.gain.setValueAtTime(peak, Math.max(when + 0.01, hold));
        g.gain.exponentialRampToValueAtTime(0.0001, hold + tail);
      }
      let out: AudioNode = g;
      let filt: BiquadFilterNode | null = null;
      let bright: BiquadFilterNode | null = null;
      if (inst.filter) {
        filt = ctx.createBiquadFilter();
        filt.type = inst.filter.type;
        filt.frequency.value = inst.filter.freq;
        filt.Q.value = inst.filter.q ?? 0.8;
        if (inst.filter.gain !== undefined) filt.gain.value = inst.filter.gain;
        filt.connect(g);
        out = filt;
      }
      if (cutoffHz !== undefined && !short) {
        // the brightness of the altitude (altitude-feel.ts): an instrument's own low-pass takes the lower cutoff of the two,
        // else a low-pass of its own is added before the gain
        if (filt && inst.filter?.type === "lowpass") filt.frequency.value = Math.min(inst.filter.freq, cutoffHz);
        else {
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = cutoffHz;
          lp.Q.value = BRIGHT_Q;
          lp.connect(out);
          bright = lp;
          out = lp;
        }
      }
      g.connect(dest);
      const layers = inst.layers ?? [{ detune: 0, gain: 1 }];
      const stopAt = hold + tail + 0.1;
      let live = layers.length;
      const finish = () => {
        if (--live > 0) return;
        g.disconnect();
        filt?.disconnect();
        bright?.disconnect();
        onEnd?.();
      };
      for (const L of layers) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.setValueAtTime(rate, when);
        // the per-note glide (a slide into the note) adds to the instrument's own; the longer ramp wins
        const noteGlide = glide && glide > 0 ? glide : 0;
        const cents = L.detune - (inst.glide ? inst.glide.semitones * 100 : 0) - noteGlide * 100;
        src.detune.setValueAtTime(cents, when);
        if (inst.glide || noteGlide) src.detune.linearRampToValueAtTime(L.detune, when + Math.max(inst.glide?.sec ?? 0, noteGlide ? NOTE_GLIDE_SEC : 0));
        if (inst.vibrato) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = inst.vibrato.rate;
          depth.gain.setValueAtTime(0, when);
          depth.gain.setValueAtTime(0, when + inst.vibrato.after);
          depth.gain.linearRampToValueAtTime(inst.vibrato.cents, when + inst.vibrato.after + 0.4);
          lfo.connect(depth);
          depth.connect(src.detune);
          lfo.start(when);
          lfo.stop(stopAt);
          lfo.onended = () => {
            lfo.disconnect();
            depth.disconnect();
          };
        }
        // held longer than the recording: loop its steady part
        const loop = z.loop ?? inst.loop;
        if (inst.sustained && loop && durSec * rate > buf.duration - release) {
          src.loop = true;
          src.loopStart = loop[0];
          src.loopEnd = Math.min(loop[1], buf.duration);
        }
        const lg = ctx.createGain();
        lg.gain.value = L.gain;
        src.connect(lg);
        lg.connect(out);
        src.onended = () => {
          src.disconnect();
          lg.disconnect();
          finish();
        };
        src.start(when);
        src.stop(stopAt);
      }
      return true;
    },
    dispose() {
      defs.clear();
      buffers.clear();
      catalogue.clear();
      inflight.clear();
      seenManifests.clear();
    },
  };
}

/** the sampler the synth consults (set by the app once an AudioContext exists) */
let active: Sampler | null = null;
export const setActiveSampler = (s: Sampler | null): void => {
  active = s;
};
export const activeSampler = (): Sampler | null => active;
