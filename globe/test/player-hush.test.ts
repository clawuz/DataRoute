import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("../src/audio/sampler", () => ({
  createSampler: () => ({ use: async () => {}, has: () => true, ensure: async () => {}, dispose: () => {} }),
  setActiveSampler: () => {},
}));
vi.mock("../src/audio/instruments", () => ({ playNote: (...a: unknown[]) => void spy.calls.push(a) }));

import { createPersonalPlayer } from "../src/personal/player";

interface Fake { disconnected: boolean; gain: { value: number; setTargetAtTime(): void }; connect(): void; disconnect(): void; threshold: object; ratio: object }
const made: Fake[] = [];
const node = (): Fake => {
  const n: Fake = { disconnected: false, gain: { value: 0, setTargetAtTime() {} }, connect() {}, disconnect() { n.disconnected = true; }, threshold: {}, ratio: {} };
  made.push(n);
  return n;
};
const ctx = () =>
  ({ currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createDynamicsCompressor: node, createConvolver: () => node(),
     createBuffer: () => ({ getChannelData: () => new Float32Array(30000) }), resume: async () => {}, close: async () => {} }) as unknown as AudioContext;
const note = (t: number) => ({ t, d: 1, freq: 440, vel: 1, instrument: "PNO", pan: 0, wet: 0.5 });

describe("player: hush", () => {
  beforeEach(() => { spy.calls.length = 0; made.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("cuts the note buses and the room of the old piece, and plays nothing more of it", async () => {
    const pl = createPersonalPlayer(ctx());
    pl.play({ notes: [note(0), note(5)], duration: 40 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    const oldBus = spy.calls[0][1];
    const before = made.filter((n) => n.disconnected).length;
    pl.hush();
    // the three note buses and the convolver of the old room are disconnected
    expect(made.filter((n) => n.disconnected).length).toBeGreaterThanOrEqual(before + 4);
    expect((oldBus as Fake).disconnected).toBe(true);
    // the piece is stopped: the note of second five is never handed on
    spy.calls.length = 0;
    await vi.advanceTimersByTimeAsync(10000);
    expect(spy.calls.length).toBe(0);
    pl.dispose();
  });
  it("the next piece plays on a new bus that is not disconnected", async () => {
    const pl = createPersonalPlayer(ctx());
    pl.play({ notes: [note(0)], duration: 40 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    const oldBus = spy.calls[0][1];
    pl.hush();
    spy.calls.length = 0;
    pl.play({ notes: [note(0)], duration: 40 } as never, () => {});
    await vi.advanceTimersByTimeAsync(200);
    expect(spy.calls[0][1]).not.toBe(oldBus);
    expect((spy.calls[0][1] as Fake).disconnected).toBe(false);
    pl.dispose();
  });
});
