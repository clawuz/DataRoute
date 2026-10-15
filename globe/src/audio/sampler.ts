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
}

export interface SampleInstrument {
  zones: SampleZone[];
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
}

export interface SampleManifest {
  name: string;
  instruments: Record<string, SampleInstrument>;
}

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
  has(instrument: string): boolean;
  /** schedules a note; false when the instrument is not loaded (play the synth instead) */
  play(dest: AudioNode, instrument: string, freq: number, vel: number, when: number, durSec: number, onEnd?: () => void): boolean;
  dispose(): void;
}

export function createSampler(ctx: AudioContext): Sampler {
  const defs = new Map<string, SampleInstrument>();
  const buffers = new Map<string, AudioBuffer>();
  const loading = new Set<string>();

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
      } catch {
        /* offline or a bad manifest: the synth plays */
      }
      return n;
    },
    has: (instrument) => defs.has(instrument),
    play(dest, instrument, freq, vel, when, durSec, onEnd) {
      const inst = defs.get(instrument);
      if (!inst) return false;
      const z = pickZone(inst.zones, midiOf(freq), vel);
      const buf = z ? buffers.get(z.file) : undefined;
      if (!z || !buf) return false;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const rate = inst.unpitched ? 1 : rateFor(freq, z.root);
      src.playbackRate.setValueAtTime(rate, when);
      // held longer than the recording: loop its steady part
      if (inst.sustained && inst.loop && durSec * rate > buf.duration - (inst.release ?? 0.35)) {
        src.loop = true;
        src.loopStart = inst.loop[0];
        src.loopEnd = Math.min(inst.loop[1], buf.duration);
      }
      const g = ctx.createGain();
      const peak = Math.max(0.0001, vel * (inst.gain ?? 1));
      const release = inst.release ?? 0.35;
      const hold = when + Math.max(0.05, durSec);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(peak, when + 0.008);
      if (inst.sustained) {
        g.gain.setValueAtTime(peak, hold);
        g.gain.exponentialRampToValueAtTime(0.0001, hold + release);
      } else {
        // recorded decay plays out; only a short release if the note was meant to be short
        g.gain.setValueAtTime(peak, Math.max(when + 0.01, hold));
        g.gain.exponentialRampToValueAtTime(0.0001, hold + Math.max(release, 1.2));
      }
      src.connect(g);
      g.connect(dest);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
        onEnd?.();
      };
      src.start(when);
      src.stop(hold + Math.max(release, inst.sustained ? release : 1.2) + 0.1);
      return true;
    },
    dispose() {
      defs.clear();
      buffers.clear();
    },
  };
}

/** the sampler the synth consults (set by the app once an AudioContext exists) */
let active: Sampler | null = null;
export const setActiveSampler = (s: Sampler | null): void => {
  active = s;
};
export const activeSampler = (): Sampler | null => active;
