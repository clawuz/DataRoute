import { describe, expect, it, vi } from "vitest";
import { EMPTY_GLOBE_SNAPSHOT, type AirportLabel, type GlobeHudSnapshot } from "../src/app/hud-model";
import { REWIND_SEC } from "../src/camera/time-ease";
import { GLOBE_CYCLE, createController } from "../src/app/controller";
import { createStore } from "@web/hud/store";
import type { GlobeEngine, GlobeFrameInput } from "../src/scene/engine";
import { FROM, flight, makeDay } from "./helpers";

const flush = () => new Promise((r) => setTimeout(r, 0));
const G1 = FROM + 86400;
const G2 = G1 + 120;

const dayAt = (generatedAt: number, flights: ReturnType<typeof flight>[]) =>
  makeDay({ generatedAt, window: { from: generatedAt - 86400, to: generatedAt }, collectingSince: generatedAt - 86400, flights });

const airborne = (end: "AIRBORNE" | "LANDED", arr: number | null) =>
  flight({
    id: "a", tk: "TK-a", from: "IST", to: "JFK", region: "AME", dep: G1 - 3000, arr, end,
    s: [[0, 300, 41, 29], [600, 370, 45, 20], [2900, 370, 55, -20]],
    now: { gs: 480, trk: 300 },
  });

function setup(opts: { fixture?: boolean; days?: ReturnType<typeof makeDay>[]; now?: { ms: number }; onLabels?: (l: AirportLabel[]) => void } = {}) {
  let frameFn: ((dt: number) => GlobeFrameInput) | null = null;
  let afterRender: (() => void) | null = null;
  const engine: GlobeEngine = {
    setModel: vi.fn(),
    loadTextures: vi.fn(async () => null),
    setFrameSource: (fn) => {
      frameFn = fn;
    },
    pick: vi.fn(() => 0),
    screenOf: () => ({ x: 100, y: 200, visible: true }),
    dragBy: vi.fn(),
    camMode: () => "GLOBE" as const,
    setAfterRender: (fn) => {
      afterRender = fn;
    },
    endDrag: vi.fn(),
    pulseAirport: vi.fn(),
    headsInfo: () => ({ count: 1, extrapolated: 3 }),
    dispose: vi.fn(),
  };
  const store = createStore<GlobeHudSnapshot>(EMPTY_GLOBE_SNAPSHOT);
  const days = opts.days ?? [dayAt(G1, [airborne("AIRBORNE", null)])];
  const clock = opts.now ?? { ms: (G1 + 30) * 1000 };
  let call = 0;
  const c = createController({
    engine,
    store,
    url: "u",
    fixture: opts.fixture ?? false,
    debug: false,
    reducedMotion: false,
    nowMs: () => clock.ms,
    onLabels: opts.onLabels,
    fetch: (async () => new Response(JSON.stringify(days[Math.min(call++, days.length - 1)]))) as unknown as typeof fetch,
  });
  return {
    c,
    engine,
    store,
    clock,
    frame: (dt: number) => frameFn!(dt),
    afterRender: () => afterRender?.(),
    pickResult: (n: number) => (engine.pick as ReturnType<typeof vi.fn>).mockReturnValue(n),
  };
}

describe("globe controller", () => {
  it("opens in LIVE with the model loaded and no events", async () => {
    const h = setup();
    await flush();
    expect(h.engine.setModel).toHaveBeenCalledTimes(1);
    h.frame(0.3);
    const s = h.store.get();
    expect(s.ready).toBe(true);
    expect(s.mode).toBe("LIVE");
    expect(s.events).toEqual([]);
    expect(s.extrapolated).toBe(3);
    h.c.dispose();
  });

  it("LIVE time follows the wall clock; absTime = window.from + cur", async () => {
    const h = setup();
    await flush();
    const f = h.frame(0.016);
    expect(f.cur).toBe(86430);
    expect(f.absTime).toBe(G1 - 86400 + 86430);
    expect(f.nowSec).toBe(G1 + 30);
    h.clock.ms += 10_000;
    expect(h.frame(0.016).cur).toBe(86440);
    h.c.dispose();
  });

  it("a data swap that lands a flight produces an event and pulses the airport", async () => {
    const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null)]), dayAt(G2, [airborne("LANDED", G2 - 60)])] });
    await flush();
    h.c.refresh();
    await flush();
    h.frame(0.3);
    expect(h.store.get().events.map((e) => e.text)).toEqual(["TK-a LANDED JFK"]);
    expect(h.engine.pulseAirport).toHaveBeenCalledWith("JFK", expect.any(Number));
    expect(h.engine.setModel).toHaveBeenCalledTimes(2);
    h.c.dispose();
  });

  it("R switches to a 3-minute REPLAY and back to LIVE when it ends", async () => {
    const h = setup();
    await flush();
    h.c.onKey("r");
    h.frame(0.5);
    expect(h.store.get().mode).toBe("REPLAY");
    expect(GLOBE_CYCLE.replaySec).toBe(180);
    const first = h.frame(0.5).cur;
    const later = h.frame(10).cur;
    expect(later).toBeGreaterThan(first);
    for (let i = 0; i < 400; i++) h.frame(0.5); // 200 s > 180 s
    h.frame(0.3);
    expect(h.store.get().mode).toBe("LIVE");
    h.c.dispose();
  });

  it("Space freezes LIVE time and resumes on the second press", async () => {
    const h = setup();
    await flush();
    const before = h.frame(0.016).cur;
    h.c.onKey(" ");
    h.clock.ms += 5000;
    const frozen1 = h.frame(0.016).cur;
    h.clock.ms += 5000;
    const frozen2 = h.frame(0.016).cur;
    expect(frozen1).toBe(frozen2);
    expect(frozen1).toBeGreaterThanOrEqual(before);
    h.c.onKey(" ");
    h.clock.ms += 5000;
    expect(h.frame(0.016).cur).toBeGreaterThan(frozen2);
    h.c.dispose();
  });

  it("H hides the HUD", async () => {
    const h = setup();
    await flush();
    h.c.onKey("h");
    h.frame(0.3);
    expect(h.store.get().hidden).toBe(true);
    h.c.dispose();
  });

  it("fixture mode loops LIVE time inside [span, span + 240)", async () => {
    const h = setup({ fixture: true });
    await flush();
    for (const dt of [0, 100_000, 237_000, 241_000]) {
      h.clock.ms += dt;
      const cur = h.frame(0.016).cur;
      expect(cur).toBeGreaterThanOrEqual(86400);
      expect(cur).toBeLessThan(86400 + 240);
    }
    h.c.dispose();
  });

  it("Space freezes fixture-looped LIVE time (stays inside the loop) and resumes", async () => {
    const h = setup({ fixture: true });
    await flush();
    h.clock.ms += 100_000;
    h.frame(0.016);
    h.c.onKey(" ");
    const f1 = h.frame(0.016).cur;
    h.clock.ms += 77_000;
    const f2 = h.frame(0.016).cur;
    expect(f2).toBe(f1);
    expect(f1).toBeGreaterThanOrEqual(86400);
    expect(f1).toBeLessThan(86400 + 240);
    h.c.onKey(" ");
    h.clock.ms += 7_000;
    expect(h.frame(0.016).cur).not.toBe(f1);
    h.c.dispose();
  });

  it("hover: synchronous first pick, trailing pick, pointer leave clears it", async () => {
    const h = setup();
    await flush();
    h.c.onPointerMove(10, 20);
    expect(h.engine.pick).toHaveBeenCalledTimes(1);
    h.c.onPointerMove(11, 21); // inside the 100 ms window → deferred
    expect(h.engine.pick).toHaveBeenCalledTimes(1);
    h.clock.ms += 150;
    h.frame(0.016);
    expect(h.engine.pick).toHaveBeenCalledTimes(2);
    expect(h.engine.pick).toHaveBeenLastCalledWith(11, 21, expect.any(Number));
    expect(h.frame(0.016).highlight).toBe(0);
    h.c.onPointerLeave();
    expect(h.frame(0.016).highlight).toBe(-1);
    h.c.dispose();
  });

  it("hover card appends the aircraft type to the route, before the honesty note", async () => {
    const live = (): ReturnType<typeof flight> => ({ ...airborne("AIRBORNE", null), s: [[0, 300, 41, 29], [600, 370, 45, 20], [3030, 370, 55, -20]] });
    const withType = { ...live(), type: "B739", desc: "BOEING 737-900" };
    const noType = live();
    const a = setup({ days: [dayAt(G1, [withType])] });
    await flush();
    a.c.onPointerMove(10, 20);
    a.frame(0.3);
    expect(a.store.get().tooltip!.route).toContain("IST → JFK · B739");
    a.c.dispose();
    const b = setup({ days: [dayAt(G1, [noType])] });
    await flush();
    b.c.onPointerMove(10, 20);
    b.frame(0.3);
    expect(b.store.get().tooltip!.route).toBe("IST → JFK · NO DATA");
    b.c.dispose();
  });

  it("labels: IST is projected for the HUD", async () => {
    const h = setup();
    await flush();
    h.frame(0.3);
    const labels = h.store.get().labels;
    expect(labels.some((l) => l.iata === "IST" && l.visible)).toBe(true);
    h.c.dispose();
  });

  const long4 = flight({
    id: "L", tk: "TK-L", from: "IST", to: "JFK", region: "AME", dep: G1 - 3000, arr: null, end: "AIRBORNE",
    s: [[0, 300, 41, 29], [600, 370, 45, 20], [1800, 370, 50, 0], [2900, 370, 55, -20]],
    now: { gs: 480, trk: 300 },
  });

  it("a click on a flight starts FOLLOW at the first sample and advances at the derived speed", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    expect(h.frame(REWIND_SEC).follow).toEqual({ flight: 0, id: "a", u: 83400 }); // the flight waits for the rewind
    const f = h.frame(1);
    expect(f.follow).toEqual({ flight: 0, id: "a", u: 83400 + 116 });
    expect(f.cur).toBe(83516);
    expect(f.highlight).toBe(0);
    expect(f.absTime).toBe(G1 - 86400 + 83516);
    h.c.dispose();
  });

  describe("follow rewind blend", () => {
    const LIVE_CUR = 86430;
    const U0 = 83400;

    it("after a click cur glides monotonically from the live time to u0 and the follow clock waits", async () => {
      const h = setup();
      await flush();
      expect(h.frame(0.016).cur).toBe(LIVE_CUR);
      h.c.onClick(10, 10);
      let prev = LIVE_CUR;
      let f = h.frame(0.1);
      for (let i = 0; i < 20; i++) {
        expect(f.cur).toBeLessThanOrEqual(prev);
        expect(f.cur).toBeGreaterThan(U0);
        expect(f.follow!.u).toBe(U0);
        expect(f.absTime).toBe(G1 - 86400 + f.cur);
        prev = f.cur;
        f = h.frame(0.1);
      }
      f = h.frame(1); // finishes the rewind: cur has arrived, the flight has not started yet
      expect(f.cur).toBe(U0);
      expect(f.follow!.u).toBe(U0);
      expect(h.frame(1).follow!.u).toBeGreaterThan(U0);
      h.c.dispose();
    });

    it("leaving glides cur from the last u back to the live time without a jump", async () => {
      const h = setup();
      await flush();
      h.c.onClick(10, 10);
      h.frame(REWIND_SEC);
      const last = h.frame(1).cur;
      h.c.onKey("Escape");
      let prev = last;
      let max = 0;
      for (let i = 0; i < 150; i++) {
        const f = h.frame(1 / 60);
        expect(f.follow).toBeNull();
        expect(f.cur).toBeGreaterThanOrEqual(prev);
        max = Math.max(max, f.cur - prev);
        prev = f.cur;
      }
      expect(max).toBeLessThan(100);
      expect(h.frame(0.1).cur).toBe(LIVE_CUR);
      h.c.dispose();
    });

    it("leaving mid-rewind blends out from the currently displayed cur", async () => {
      const h = setup();
      await flush();
      h.c.onClick(10, 10);
      const mid = h.frame(1.25).cur;
      expect(mid).toBeLessThan(LIVE_CUR);
      expect(mid).toBeGreaterThan(U0);
      h.c.onKey("Escape");
      expect(Math.abs(h.frame(0.001).cur - mid)).toBeLessThan(5);
      h.c.dispose();
    });

    it("starting another follow mid-rewind starts a new blend from the displayed cur", async () => {
      const b = flight({ id: "b", tk: "TK-b", from: "IST", to: "LHR", region: "EUR", dep: G1 - 2000, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29], [600, 370, 45, 20], [1900, 370, 50, 0]], now: { gs: 480, trk: 300 } });
      const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null), b])] });
      await flush();
      h.c.onClick(10, 10);
      const mid = h.frame(1).cur;
      h.pickResult(1);
      h.c.onClick(10, 10);
      expect(Math.abs(h.frame(0.001).cur - mid)).toBeLessThan(5);
      h.c.dispose();
    });
  });

  it("Escape and a blank click leave FOLLOW", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    h.frame(0.1);
    h.c.onKey("Escape");
    expect(h.frame(0.1).follow).toBeNull();
    h.c.onClick(10, 10);
    expect(h.frame(0.1).follow).not.toBeNull();
    h.pickResult(-1);
    h.c.onClick(500, 500);
    expect(h.frame(0.1).follow).toBeNull();
    h.c.dispose();
  });

  it("Space pauses the follow clock; ] picks the next ladder speed; arrows scrub five minutes", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    h.frame(REWIND_SEC);
    expect(h.frame(1).cur).toBe(83516);
    h.c.onKey(" ");
    expect(h.frame(1).cur).toBe(83516);
    h.c.onKey(" ");
    h.c.onKey("]"); // 116 -> nearest rung 120 -> 240
    expect(h.frame(1).cur).toBe(83516 + 240);
    h.c.onKey("ArrowLeft");
    expect(h.frame(0).cur).toBe(83516 + 240 - 300);
    h.c.dispose();
  });

  it("a single-sample track cannot be followed and says why", async () => {
    const one = flight({ id: "s", tk: "TK-s", dep: G1 - 100, arr: null, end: "AIRBORNE", s: [[0, 300, 41, 29]] });
    const h = setup({ days: [dayAt(G1, [one])] });
    await flush();
    h.c.onClick(10, 10);
    expect(h.frame(0.3).follow).toBeNull();
    expect(h.store.get().notice).toBe("TRACK TOO SHORT");
    h.clock.ms += 4000;
    h.frame(0.3);
    expect(h.store.get().notice).toBe("");
    h.c.dispose();
  });

  it("keeps following the same flight across a data swap and shifts its time with the window", async () => {
    const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null)]), dayAt(G2, [airborne("AIRBORNE", null)])] });
    await flush();
    h.c.onClick(10, 10);
    h.frame(REWIND_SEC);
    expect(h.frame(1).follow!.u).toBe(83516);
    h.c.refresh();
    await flush();
    const f = h.frame(0);
    expect(f.follow).toEqual({ flight: 0, id: "a", u: 83516 - 120 });
    h.c.dispose();
  });

  it("ends FOLLOW with a notice when the flight disappears from the data", async () => {
    const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null)]), dayAt(G2, [])] });
    await flush();
    h.c.onClick(10, 10);
    h.frame(0.3);
    h.c.refresh();
    await flush();
    expect(h.frame(0.1).follow).toBeNull();
    expect(h.store.get().notice).toBe("FLIGHT NO LONGER IN DATA");
    h.c.dispose();
  });

  it("H toggles the HUD while following without leaving FOLLOW", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    h.frame(0.3);
    h.c.onKey("h");
    expect(h.frame(0.3).follow).not.toBeNull();
    expect(h.store.get().hidden).toBe(true);
    h.c.dispose();
  });

  it("clamps the shifted follow time to the flight's first sample after a window move", async () => {
    const h = setup({ days: [dayAt(G1, [airborne("AIRBORNE", null)]), dayAt(G1 + 5000, [airborne("AIRBORNE", null)])] });
    await flush();
    h.c.onClick(10, 10);
    h.frame(0);
    h.c.refresh();
    await flush();
    const f = h.frame(0);
    expect(f.follow!.u).toBeGreaterThanOrEqual(0);
    expect(f.follow!.id).toBe("a");
    h.c.dispose();
  });

  it("publishes the telemetry block while following", async () => {
    const h = setup();
    await flush();
    h.c.onClick(10, 10);
    h.frame(1);
    h.frame(0.3);
    const fh = h.store.get().follow!;
    expect(fh.tk).toBe("TK-a");
    expect(fh.route).toBe("IST \u2192 JFK");
    expect(fh.state).toBe("OBSERVED");
    expect(h.store.get().mode).toBe("LIVE");
    h.c.dispose();
  });

  it("the auto-tour starts a follow after 25 s without input, and T turns it off", async () => {
    const mk = () => setup({ days: [dayAt(G1, [long4])] });
    let h = mk();
    await flush();
    let f = h.frame(1);
    for (let i = 0; i < 26; i++) f = h.frame(1);
    expect(f.follow).not.toBeNull();
    h.c.dispose();

    h = mk();
    await flush();
    h.c.onKey("t");
    for (let i = 0; i < 40; i++) f = h.frame(1);
    expect(f.follow).toBeNull();
    expect(h.store.get().tour).toBe(false);
    h.c.dispose();
  });

  it("fixture data is never reported as delayed, however old", async () => {
    const h = setup({ fixture: true, now: { ms: (G1 + 90_000) * 1000 } });
    await flush();
    h.frame(0.3);
    expect(h.store.get().dataState).not.toBe("delayed");
    h.c.dispose();
  });

  it("emits airport labels from the post-render hook, not from frame", async () => {
    const seen: number[] = [];
    const h = setup({ onLabels: (l) => seen.push(l.length) });
    await flush();
    h.frame(0.1);
    expect(seen).toEqual([]);
    h.afterRender();
    expect(seen.length).toBe(1);
    expect(seen[0]).toBeGreaterThan(0);
    h.c.dispose();
  });

  it("dispose detaches from the engine", async () => {
    const h = setup();
    await flush();
    h.c.dispose();
    expect(() => h.frame(0.016)).toThrow();
  });
});
