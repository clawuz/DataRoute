import { describe, expect, it, vi } from "vitest";
import { createController } from "../src/app/controller";
import { EMPTY_SNAPSHOT, type HudSnapshot } from "../src/hud/snapshot";
import { createStore } from "../src/hud/store";
import type { Engine, FrameInput } from "../src/render/engine";
import { FROM, flight, makeDay } from "./helpers";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(o: { deferFetch?: boolean; flights?: Parameters<typeof makeDay>[0] extends infer P ? (P extends { flights?: infer F } ? F : never) : never } = {}) {
  let now = (FROM + 86400) * 1000;
  let frameFn: ((dt: number) => FrameInput) | null = null;
  const engine: Engine = {
    setModel: vi.fn(),
    setFrameSource: (fn) => {
      frameFn = fn;
    },
    pick: vi.fn(() => 0),
    screenOf: () => ({ x: 100, y: 200, visible: true }),
    dispose: vi.fn(),
  };
  const store = createStore<HudSnapshot>(EMPTY_SNAPSHOT);
  const day = makeDay({
    collectingSince: FROM + 3600,
    flights: o.flights ?? [flight({ id: "a", from: "IST", to: "JFK", dep: FROM + 3600, arr: null, s: [[0, 0, 0, 0], [600, 300, 0, 1]] })],
  });
  let release: () => void = () => {};
  const gate = o.deferFetch ? new Promise<void>((r) => (release = r)) : null;
  const c = createController({
    engine,
    store,
    url: "u",
    fixture: false,
    debug: false,
    reducedMotion: false,
    nowMs: () => now,
    fetch: (async () => {
      if (gate) await gate;
      return new Response(JSON.stringify(day));
    }) as unknown as typeof fetch,
    random: () => 0,
  });
  return { c, engine, store, frame: (dt: number) => frameFn!(dt), advance: (ms: number) => (now += ms), release };
}

describe("controller", () => {
  it("loads data, starts the replay at collectingSince and feeds the engine", async () => {
    const h = setup();
    await flush();
    expect(h.engine.setModel).toHaveBeenCalledTimes(1);
    const f = h.frame(0.016);
    expect(f.tRel).toBeCloseTo(3600 + (86400 - 3600) * (0.016 / 90), 3);
    expect(f.flow).toBeGreaterThanOrEqual(0.6);
    h.frame(0.3);
    expect(h.store.get().ready).toBe(true);
    h.c.dispose();
  });

  it("space pauses and the snapshot reflects it", async () => {
    const h = setup();
    await flush();
    h.c.onKey(" ");
    expect(h.store.get().paused).toBe(true);
    const a = h.frame(1).tRel;
    expect(h.frame(1).tRel).toBe(a);
    h.c.dispose();
  });

  it("H toggles the HUD, hover picks and click pins a spotlight", async () => {
    const h = setup();
    await flush();
    h.c.onKey("h");
    expect(h.store.get().hidden).toBe(true);
    h.c.onPointerMove(100, 200);
    expect(h.engine.pick).toHaveBeenCalledWith(100, 200, expect.any(Number));
    h.c.onClick();
    expect(h.frame(0.016).highlight).toBe(0);
    h.c.dispose();
  });

  it("dispose detaches from the engine", async () => {
    const h = setup();
    await flush();
    h.c.dispose();
    expect(() => h.frame(0.016)).toThrow();
  });

  it("runs a trailing pick for a throttled pointer move", async () => {
    const h = setup();
    await flush();
    h.c.onPointerMove(1, 2);
    expect(h.engine.pick).toHaveBeenCalledTimes(1);
    h.advance(40);
    h.c.onPointerMove(30, 40);
    expect(h.engine.pick).toHaveBeenCalledTimes(1);
    h.frame(0.016);
    expect(h.engine.pick).toHaveBeenCalledTimes(1); // still inside the window
    h.advance(100);
    h.frame(0.016);
    expect(h.engine.pick).toHaveBeenCalledTimes(2);
    expect(h.engine.pick).toHaveBeenLastCalledWith(30, 40, expect.any(Number));
    h.c.dispose();
  });

  it("pointer leave clears the hover", async () => {
    const h = setup();
    await flush();
    vi.mocked(h.engine.pick).mockReturnValue(7); // hover differs from the spotlighted flight (0)
    h.c.onPointerMove(1, 2);
    expect(h.frame(0.016).highlight).toBe(7);
    h.c.onPointerLeave();
    expect(h.frame(0.016).highlight).toBe(0); // falls back to the spotlight
    h.c.dispose();
  });

  it("picks the first spotlight right after data even when frames ran before it", async () => {
    const h = setup({ deferFetch: true });
    await flush();
    for (let i = 0; i < 3; i++) h.frame(0.3); // pre-data frames reset the spotlight timer
    expect(h.store.get().ready).toBe(false);
    h.release();
    await flush();
    h.frame(0.3);
    // with the old behaviour (no timer reset on first data) the spotlight would wait ~8 s here
    expect(h.frame(0.016).highlight).toBeGreaterThanOrEqual(0);
    expect(h.store.get().spotlight).not.toBeNull();
    h.c.dispose();
  });

  it("retries the spotlight after 1 s when no flight is live yet", async () => {
    const late = flight({ id: "late", from: "IST", to: "JFK", dep: FROM + 3600 + 2760, arr: null, s: [[0, 0, 0, 0], [600, 300, 0, 1]] });
    const h = setup({ flights: [late] });
    await flush();
    expect(h.frame(0.3).highlight).toBe(-1); // nothing airborne at replayStart
    // replay advances ~920 s per second, so the flight is airborne after ~3 s; a retry must happen well before 8 s
    let found = -1;
    for (let i = 0; i < 12 && found < 0; i++) found = h.frame(0.3).highlight; // up to 3.6 s
    expect(found).toBe(0);
    h.c.dispose();
  });

  it("keeps a pinned spotlight while manual mode is active, releases it when auto-cycle resumes", async () => {
    const long = (id: string) => flight({ id, from: "IST", to: "JFK", dep: FROM + 3600, arr: null, s: [[0, 0, 0, 0], [80000, 300, 0, 1]] });
    const h = setup({ flights: [long("a"), long("b")] });
    await flush();
    h.frame(0.3); // first spotlight: random() = 0 -> flight a (index 0)
    vi.mocked(h.engine.pick).mockReturnValue(1);
    h.c.onPointerMove(1, 2);
    h.c.onClick(); // pins b
    h.c.onPointerLeave();
    expect(h.frame(0.016).highlight).toBe(1);
    for (let i = 0; i < 15; i++) h.frame(1); // 15 s: still inside the 20 s hold
    expect(h.frame(0.016).highlight).toBe(1);
    for (let i = 0; i < 6; i++) h.frame(1); // hold expires
    h.frame(0.016);
    expect(h.frame(0.016).highlight).toBe(0); // rotated away from the pinned flight
    h.c.dispose();
  });
});
