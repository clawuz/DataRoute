import type { DayFile } from "@collector/day-schema";
import { applyAction, initCycle, stepCycle, type Bounds, type CycleConfig, type CycleState } from "@web/cycle/machine";
import { createPoller } from "@web/data/source";
import { buildTimeline, type Timeline } from "@web/data/timeline";
import { buildSnapshot } from "@web/hud/snapshot";
import type { Store } from "@web/hud/store";
import { diffEvents } from "../model/events";
import { buildGlobeModel, type GlobeModel } from "../model/globe-model";
import type { GlobeEngine, GlobeFrameInput } from "../scene/engine";
import {
  CREDIT, LABEL_COUNT, addEvents, liveCur, pickLabelAirports,
  type AirportLabel, type EventLine, type GlobeHudSnapshot,
} from "./hud-model";
import { SCRUB_SEC, keyToCommand } from "./keys";

export const GLOBE_CYCLE: CycleConfig = { replaySec: 180, liveSec: Number.POSITIVE_INFINITY, holdSec: 20 };
export const HUD_TICK_SEC = 0.25;
export const PICK_INTERVAL_MS = 100;
export const FIXTURE_LIVE_LOOP_SEC = 240;

export interface GlobeControllerDeps {
  engine: GlobeEngine;
  store: Store<GlobeHudSnapshot>;
  url: string;
  fixture: boolean;
  debug: boolean;
  reducedMotion: boolean;
  nowMs: () => number;
  fetch?: typeof fetch;
  visible?: () => boolean;
  /** per-frame airport label positions (the store only carries them at HUD rate) */
  onLabels?: (labels: AirportLabel[]) => void;
}

export interface GlobeController {
  onKey(key: string): void;
  onPointerMove(x: number, y: number): void;
  onPointerLeave(): void;
  onInteract(): void;
  refresh(): void;
  setPerf(fps: number, level: number): void;
  setTextureState(progress: number, note: string): void;
  dispose(): void;
}

export function createController(d: GlobeControllerDeps): GlobeController {
  let model: GlobeModel | null = null;
  let tl: Timeline | null = null;
  let mode: "LIVE" | "REPLAY" = "LIVE";
  let cycle: CycleState = { ...initCycle({ start: 0, end: 0 }), phase: "LIVE" };
  let liveFrozen: number | null = null;
  let events: EventLine[] = [];
  let hoverIdx = -1;
  let pointer = { x: 0, y: 0 };
  let pending: { x: number; y: number } | null = null;
  let lastPick = -Infinity;
  let hidden = false;
  let hudTimer = 0;
  let perf = { fps: 0, level: 0 };
  let tex = { progress: 0, note: "" };
  let firstDataSec = 0;
  let disposed = false;

  const bounds = (): Bounds => (model ? { start: model.replayStart, end: model.span } : { start: 0, end: 0 });
  const act = (a: Parameters<typeof applyAction>[1]) => {
    cycle = applyAction(cycle, a, bounds(), GLOBE_CYCLE);
  };

  /** unfrozen LIVE time: the wall clock, or the looped stale-snapshot clock in fixture mode */
  function liveRaw(m: GlobeModel, nowSec: number): number {
    return d.fixture ? m.span + ((nowSec - firstDataSec) % FIXTURE_LIVE_LOOP_SEC) : liveCur(m, nowSec);
  }

  function currentCur(nowSec: number): number {
    if (!model) return 0;
    if (mode === "REPLAY") return cycle.tRel;
    return liveFrozen ?? liveRaw(model, nowSec);
  }

  let labelModel: GlobeModel | null = null;
  let labelIatas: string[] = [];
  function computeLabels(): AirportLabel[] {
    if (!model) return [];
    if (labelModel !== model) {
      labelModel = model;
      labelIatas = pickLabelAirports(model, LABEL_COUNT);
    }
    const out: AirportLabel[] = [];
    for (const iata of labelIatas) {
      const a = model.airports[iata];
      if (!a) continue;
      const p = d.engine.screenOf(a.lat, a.lon, 0);
      out.push({ iata, x: p.x, y: p.y, visible: p.visible });
    }
    return out;
  }

  function pushHud() {
    if (disposed) return;
    const nowSec = d.nowMs() / 1000;
    const cur = currentCur(nowSec);
    let hoverScreen: { x: number; y: number; visible: boolean } | null = null;
    if (model && hoverIdx >= 0) hoverScreen = { x: pointer.x, y: pointer.y, visible: true };
    const base = buildSnapshot({
      model,
      tl,
      cycle: { phase: mode, elapsed: cycle.elapsed, tRel: cur, paused: cycle.paused, manual: cycle.manual, idle: cycle.idle },
      nowSec,
      fixture: d.fixture,
      spotlightIdx: -1,
      spotlightScreen: null,
      hoverIdx,
      hoverScreen,
      hidden,
      reducedMotion: d.reducedMotion,
      debug: d.debug ? { ...perf, flights: model?.flights.length ?? 0 } : undefined,
    });
    const labels = computeLabels();
    d.store.set({
      ...base,
      mode,
      events,
      labels,
      extrapolated: d.engine.headsInfo().extrapolated,
      textureProgress: tex.progress,
      textureNote: tex.note,
      credit: CREDIT,
    });
  }

  const frame = (dt: number): GlobeFrameInput => {
    const nowSec = d.nowMs() / 1000;
    cycle = stepCycle(cycle, dt, bounds(), GLOBE_CYCLE);
    if (mode === "REPLAY" && cycle.phase === "LIVE") {
      mode = "LIVE"; // replay finished: back to the present
      liveFrozen = null;
    }
    if (mode === "LIVE") {
      if (!cycle.paused) liveFrozen = null;
      else if (liveFrozen === null && model) liveFrozen = liveRaw(model, nowSec);
    }
    if (pending && d.nowMs() - lastPick >= PICK_INTERVAL_MS) {
      lastPick = d.nowMs();
      hoverIdx = d.engine.pick(pending.x, pending.y, currentCur(nowSec));
      pending = null;
    }
    if (d.onLabels && model) d.onLabels(computeLabels());
    hudTimer += dt;
    if (hudTimer >= HUD_TICK_SEC) {
      hudTimer = 0;
      pushHud();
    }
    const cur = currentCur(nowSec);
    return { absTime: (model?.from ?? nowSec) + cur, cur, highlight: hoverIdx, nowSec };
  };
  d.engine.setFrameSource(frame);

  const onData = (day: DayFile) => {
    const prev = model;
    // ignore equal/older payloads (cached or stale responses)
    if (prev && !(day.generatedAt > prev.generatedAt)) return;
    if (disposed) return;
    const next = buildGlobeModel(day);
    const nextTl = buildTimeline(next);
    const nowSec = d.nowMs() / 1000;
    const first = !prev;
    model = next;
    tl = nextTl;
    if (first) {
      firstDataSec = nowSec;
      mode = "LIVE";
      cycle = { ...initCycle(bounds()), phase: "LIVE" };
      liveFrozen = null;
    } else if (cycle.paused && mode === "REPLAY") {
      // keep the displayed instant stable while paused (window.from moved forward)
      cycle = { ...cycle, tRel: Math.max(0, cycle.tRel - (next.from - prev!.from)) };
    }
    if (!first && liveFrozen !== null) liveFrozen = Math.max(0, liveFrozen - (next.from - prev!.from));
    const evs = diffEvents(prev, next);
    events = addEvents(events, evs);
    d.engine.setModel(next, currentCur(nowSec), nowSec);
    for (const e of evs) if (e.airport) d.engine.pulseAirport(e.airport, nowSec);
    hoverIdx = -1;
    pending = null;
    pushHud();
  };

  const poller = createPoller({
    url: d.url,
    fetch: d.fetch ?? fetch.bind(globalThis),
    onData,
    onError: (e) => {
      console.warn("[data]", e);
      pushHud();
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    visible: d.visible ?? (() => typeof document === "undefined" || !document.hidden),
  });
  poller.start();
  const onVisible = () => {
    if (typeof document !== "undefined" && !document.hidden) poller.refresh();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  pushHud();

  return {
    onKey(key) {
      const cmd = keyToCommand(key);
      if (!cmd) return;
      const nowSec = d.nowMs() / 1000;
      if (cmd === "togglePause") act({ type: "togglePause" });
      else if (cmd === "scrubBack" || cmd === "scrubForward") {
        if (mode === "LIVE" && model) {
          mode = "REPLAY";
          liveFrozen = null;
          cycle = { ...initCycle(bounds()), tRel: Math.min(model.span, liveCur(model, nowSec)), phase: "REPLAY" };
        }
        act({ type: "scrub", delta: cmd === "scrubBack" ? -SCRUB_SEC : SCRUB_SEC });
      } else if (cmd === "toggleReplay") {
        if (mode === "LIVE") {
          mode = "REPLAY";
          liveFrozen = null;
          cycle = { ...initCycle(bounds()), phase: "REPLAY" };
        } else {
          mode = "LIVE";
          cycle = { ...cycle, phase: "LIVE", paused: false };
        }
        act({ type: "interact" });
      } else {
        act({ type: "interact" });
        if (cmd === "toggleHud") hidden = !hidden;
        if (cmd === "fullscreen" && typeof document !== "undefined") {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
        }
      }
      pushHud();
    },
    onPointerMove(x, y) {
      pointer = { x, y };
      act({ type: "interact" });
      const now = d.nowMs();
      if (now - lastPick >= PICK_INTERVAL_MS) {
        lastPick = now;
        pending = null;
        hoverIdx = d.engine.pick(x, y, currentCur(now / 1000));
      } else pending = { x, y };
    },
    onPointerLeave() {
      hoverIdx = -1;
      pending = null;
    },
    onInteract() {
      act({ type: "interact" });
    },
    refresh() {
      if (!disposed) poller.refresh();
    },
    setPerf(fps, level) {
      if (disposed) return;
      perf = { fps, level };
    },
    setTextureState(progress, note) {
      if (disposed) return;
      tex = { progress, note };
      pushHud();
    },
    dispose() {
      disposed = true;
      poller.stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      d.engine.setFrameSource(null);
    },
  };
}
