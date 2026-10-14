import { playNote } from "../audio/instruments";
import type { PersonalNote, PersonalPiece } from "./compose";

export interface PersonalPlayer {
  /** begin (or restart) looping the piece; `onNote` fires when a note sounds, in time with the audio */
  play(piece: PersonalPiece, onNote: (n: PersonalNote) => void, onPlan?: (n: PersonalNote, wallAt: number) => void): void;
  stop(): void;
  /** browsers start a context suspended until a gesture */
  resume(): void;
  setMuted(m: boolean): void;
  /** the audio of the piece as a stream (for a recorded clip) */
  audioStream(): MediaStream | null;
  /** seconds into the current loop, or 0 when stopped */
  position(): number;
  dispose(): void;
}

const AHEAD = 3; // how far ahead notes are handed to the audio clock (s) — the note ribbon shows them coming
const TICK_MS = 60;
const GAP = 2.2; // silence between loops (s)

/** WebAudio graph: master → compressor → out, with a dry bus and a short synthetic room. */
export function createPersonalPlayer(ctx: AudioContext): PersonalPlayer {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(ctx.destination);
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.72;
  bus.connect(dry);
  dry.connect(master);
  const conv = ctx.createConvolver();
  const len = Math.floor(2.8 * ctx.sampleRate);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  conv.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  bus.connect(conv);
  conv.connect(wet);
  wet.connect(master);

  let tap: MediaStreamAudioDestinationNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let loopStart = 0; // audio-clock time of the loop's origin
  let piece: PersonalPiece | null = null;
  let onNote: ((n: PersonalNote) => void) | null = null;
  let onPlan: ((n: PersonalNote, wallAt: number) => void) | null = null;
  let next = 0; // index of the next note to schedule in this loop
  let sorted: PersonalNote[] = [];
  let disposed = false;

  const tick = () => {
    if (!piece || !onNote) return;
    const horizon = ctx.currentTime + AHEAD;
    while (next < sorted.length && loopStart + sorted[next].t <= horizon) {
      const n = sorted[next++];
      const when = Math.max(ctx.currentTime, loopStart + n.t);
      playNote(ctx, bus, { when, instrument: n.instrument, freq: n.freq, vel: n.vel, kind: "arr", durSec: n.d }, { gainScale: 1, cutoffScale: 1, pan: 0 });
      const cb = onNote;
      const inSec = Math.max(0, when - ctx.currentTime);
      onPlan?.(n, performance.now() / 1000 + inSec);
      setTimeout(() => cb(n), inSec * 1000);
    }
    if (next >= sorted.length && ctx.currentTime >= loopStart + piece.duration + GAP) {
      loopStart += piece.duration + GAP;
      next = 0;
    }
  };

  return {
    play(p, cb, plan) {
      if (disposed) return;
      piece = p;
      onNote = cb;
      onPlan = plan ?? null;
      sorted = [...p.notes].sort((a, b) => a.t - b.t);
      next = 0;
      void ctx.resume();
      loopStart = ctx.currentTime + 0.15;
      if (timer) clearInterval(timer);
      timer = setInterval(tick, TICK_MS);
    },
    resume() {
      void ctx.resume();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      piece = null;
    },
    audioStream() {
      if (!tap && typeof ctx.createMediaStreamDestination === "function") {
        tap = ctx.createMediaStreamDestination();
        comp.connect(tap); // post-compressor, so the clip is not affected by the mute button
      }
      return tap ? tap.stream : null;
    },
    setMuted(m) {
      master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
    },
    position() {
      return piece ? Math.max(0, ctx.currentTime - loopStart) : 0;
    },
    dispose() {
      disposed = true;
      if (timer) clearInterval(timer);
      timer = null;
      piece = null;
      void ctx.close().catch(() => {});
    },
  };
}
