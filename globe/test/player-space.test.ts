import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../src/audio/sampler", () => ({
  createSampler: () => ({ use: async () => {}, has: () => true, ensure: async () => {}, dispose: () => {} }),
  setActiveSampler: () => {},
}));
vi.mock("../src/audio/instruments", () => ({ playNote: (...a: unknown[]) => void spy.calls.push(a) }));

import { createPersonalPlayer } from "../src/personal/player";

const node = () => ({ gain: { value: 0, setTargetAtTime() {} }, connect() {}, threshold: {}, ratio: {} });
const ctx = () =>
  ({ currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createDynamicsCompressor: node, createConvolver: () => ({ connect() {} }),
     createBuffer: () => ({ getChannelData: () => new Float32Array(30000) }), resume: async () => {}, close: async () => {} }) as unknown as AudioContext;
const note = (t: number, pan: number, wet: number) => ({ t, d: 1, freq: 440, vel: 1, instrument: "PNO", pan, wet });

describe("player: space", () => {
  beforeEach(() => { spy.calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("plays each note at its pan and sends it to the reverb bus of its wetness", async () => {
    const pl = createPersonalPlayer(ctx());
    pl.play({ notes: [note(0, -0.5, 0.1), note(0.1, 0.6, 0.5), note(0.2, 0.1, 0.12)], duration: 4 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    const [a, b, c] = spy.calls;
    expect((a[3] as { pan: number }).pan).toBe(-0.5);
    expect((b[3] as { pan: number }).pan).toBe(0.6);
    expect(a[1]).toBe(c[1]); // the same send: both dry-ish
    expect(a[1]).not.toBe(b[1]); // the wet one goes elsewhere
    pl.dispose();
  });
  it("plays a note without pan and wet (a solo piece) in the middle", async () => {
    const pl = createPersonalPlayer(ctx());
    pl.play({ notes: [{ t: 0, d: 1, freq: 440, vel: 1, instrument: "PNO" }], duration: 4 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    expect((spy.calls[0][3] as { pan: number }).pan).toBe(0);
    pl.dispose();
  });
});

describe("player: glide", () => {
  beforeEach(() => { spy.calls.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());
  it("hands a note's glide to playNote, and none when the note has none", async () => {
    const pl = createPersonalPlayer(ctx());
    pl.play({ notes: [{ ...note(0, 0, 0.2), glide: 1 }, note(0.1, 0, 0.2)], duration: 4 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    expect((spy.calls[0][2] as { glide?: number }).glide).toBe(1);
    expect((spy.calls[1][2] as { glide?: number }).glide).toBeUndefined();
    pl.dispose();
  });
});
