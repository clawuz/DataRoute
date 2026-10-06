import { describe, expect, it, vi } from "vitest";
import { createController } from "../src/app/controller";
import { EMPTY_SNAPSHOT, type HudSnapshot } from "../src/hud/snapshot";
import { createStore } from "../src/hud/store";
import type { Engine, FrameInput } from "../src/render/engine";
import { FROM, flight, makeDay } from "./helpers";

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
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
    flights: [flight({ id: "a", from: "IST", to: "JFK", dep: FROM + 3600, arr: null, s: [[0, 0, 0, 0], [600, 300, 0, 1]] })],
  });
  const c = createController({
    engine,
    store,
    url: "u",
    fixture: false,
    debug: false,
    reducedMotion: false,
    nowMs: () => (FROM + 86400) * 1000,
    fetch: (async () => new Response(JSON.stringify(day))) as unknown as typeof fetch,
    random: () => 0,
  });
  return { c, engine, store, frame: (dt: number) => frameFn!(dt) };
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
});
