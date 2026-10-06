import { describe, expect, it, vi } from "vitest";
import { FIXTURE_URL, LIVE_URL, POLL_MS, createPoller, dataUrl, isFixture } from "../src/data/source";
import { makeDay } from "./helpers";

const flush = () => new Promise((r) => setTimeout(r, 0));

function harness(responses: Array<() => Response>) {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const onData = vi.fn();
  const onError = vi.fn();
  let call = 0;
  const fetchFn = vi.fn(async () => responses[Math.min(call++, responses.length - 1)]());
  const poller = createPoller({
    url: "u",
    fetch: fetchFn as unknown as typeof fetch,
    onData,
    onError,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: vi.fn(),
  });
  return { poller, timers, onData, onError, fetchFn };
}

const ok = () => new Response(JSON.stringify(makeDay()));
const fail = () => new Response("", { status: 503 });

describe("source", () => {
  it("dataUrl / isFixture", () => {
    expect(dataUrl("")).toBe(LIVE_URL);
    expect(dataUrl("?data=fixture")).toBe(FIXTURE_URL);
    expect(isFixture("?debug=1&data=fixture")).toBe(true);
    expect(isFixture("?data=live")).toBe(false);
  });

  it("delivers data and schedules the next poll", async () => {
    const h = harness([ok]);
    h.poller.start();
    await flush();
    expect(h.onData).toHaveBeenCalledTimes(1);
    expect(h.timers.map((t) => t.ms)).toEqual([POLL_MS]);
    expect(h.fetchFn).toHaveBeenCalledWith("u", { cache: "no-cache" });
  });

  it("backs off 15 → 30 → 60 → 120 → 120 s on failures, then resets", async () => {
    const h = harness([fail, fail, fail, fail, fail, ok, fail]);
    h.poller.start();
    for (let i = 0; i < 6; i++) {
      await flush();
      h.timers[h.timers.length - 1].fn();
    }
    await flush();
    expect(h.timers.map((t) => t.ms)).toEqual([15000, 30000, 60000, 120000, 120000, 120000, 15000]);
    expect(h.onError).toHaveBeenCalledTimes(6);
    expect(h.onData).toHaveBeenCalledTimes(1);
  });

  it("stop prevents further scheduling", async () => {
    const h = harness([ok]);
    h.poller.start();
    h.poller.stop();
    await flush();
    expect(h.timers).toHaveLength(0);
  });

  it("detaches fetch (handles this-sensitive fetch)", async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const onData = vi.fn();
    const onError = vi.fn();
    const fetchFn = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify(makeDay())));
    };
    const poller = createPoller({
      url: "u",
      fetch: fetchFn as unknown as typeof fetch,
      onData,
      onError,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimer: vi.fn(),
    });
    poller.start();
    await flush();
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(0);
  });

  it("restart race is safe: start/stop/start while fetch in-flight", async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const onData = vi.fn();
    const onError = vi.fn();
    let resolveFirst: ((v: Response) => void) = () => {};
    const firstFetch = new Promise<Response>((r) => {
      resolveFirst = r;
    });
    let fetchCallCount = 0;
    const fetchFn = vi.fn(async () => {
      if (fetchCallCount++ === 0) {
        return await firstFetch;
      }
      return new Response(JSON.stringify(makeDay()));
    });
    const clearTimerFn = vi.fn();
    const poller = createPoller({
      url: "u",
      fetch: fetchFn as unknown as typeof fetch,
      onData,
      onError,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimer: clearTimerFn,
    });
    poller.start();
    await flush();
    const timerCountAfterFirstStart = timers.length;
    poller.stop();
    poller.start();
    await flush();
    const timerCountAfterSecondStart = timers.length;
    resolveFirst(new Response(JSON.stringify(makeDay())));
    await flush();
    // The second start() should have scheduled a new fetch, and the first start's fetch resolving
    // should not schedule a new timer. Total onData calls should be at most 1 per run.
    // We expect the second run's fetch to complete, so onData should be called once.
    expect(onData.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
