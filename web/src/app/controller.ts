import type { DayFile } from "@collector/day-schema";
import { SCRUB_SEC, keyToCommand } from "../cycle/input";
import { applyAction, initCycle, stepCycle, type Bounds, type CycleState } from "../cycle/machine";
import { sampleAt, tunnelXYZ } from "../data/mapping";
import { buildModel, type Model } from "../data/model";
import { createPoller } from "../data/source";
import { buildTimeline, flowFor, statsAt, tintFor, type Timeline } from "../data/timeline";
import { buildSnapshot, type HudSnapshot } from "../hud/snapshot";
import type { Store } from "../hud/store";
import type { Engine, FrameInput } from "../render/engine";
import type { ScreenPoint } from "../render/picking";

export const SPOTLIGHT_SEC = 8;
export const HUD_TICK_SEC = 0.25;
export const PICK_INTERVAL_MS = 100;
const ROLL_LIVE = 0.03; // rad/s
const ROLL_REPLAY = 0.01;

export interface ControllerDeps {
  engine: Engine;
  store: Store<HudSnapshot>;
  url: string;
  fixture: boolean;
  debug: boolean;
  reducedMotion: boolean;
  nowMs: () => number;
  fetch?: typeof fetch;
  random?: () => number;
}

export interface Controller {
  onKey(key: string): void;
  onPointerMove(x: number, y: number): void;
  onClick(): void;
  onPointerLeave(): void;
  setPerf(fps: number, level: number): void;
  dispose(): void;
}

export function createController(d: ControllerDeps): Controller {
  const random = d.random ?? Math.random;
  const motion = d.reducedMotion ? 0.4 : 1;
  let model: Model | null = null;
  let tl: Timeline | null = null;
  let cycle: CycleState = initCycle({ start: 0, end: 0 });
  let roll = 0;
  let spotId: string | null = null;
  let pinned = false;
  let spotTimer = SPOTLIGHT_SEC;
  let hoverIdx = -1;
  let hidden = false;
  let hudTimer = 0;
  let lastPick = -Infinity;
  let pendingPick: { x: number; y: number } | null = null;
  let perf = { fps: 0, level: 0 };
  const scratch = new Float32Array(3);

  const bounds = (): Bounds => (model ? { start: model.replayStart, end: model.span } : { start: 0, end: 0 });
  const idxOf = (id: string | null) => (model && id ? model.flights.findIndex((f) => f.id === id) : -1);

  function chooseSpotlight() {
    if (!model) return;
    const live: number[] = [];
    model.flights.forEach((f, i) => {
      if (sampleAt(f, cycle.tRel)) live.push(i);
    });
    spotId = live.length ? model.flights[live[Math.floor(random() * live.length)]].id : null;
    if (spotId === null) spotTimer = SPOTLIGHT_SEC - 1; // nothing airborne yet: retry in 1 s
  }

  function screenFor(idx: number): ScreenPoint | null {
    if (!model || idx < 0) return null;
    const f = model.flights[idx];
    const s = sampleAt(f, cycle.tRel);
    if (!s) return null;
    tunnelXYZ(cycle.tRel, s.alt, f.bearing, cycle.tRel, scratch);
    return d.engine.screenOf(scratch);
  }

  function pushHud() {
    const spotIdx = idxOf(spotId);
    d.store.set(
      buildSnapshot({
        model,
        tl,
        cycle,
        nowSec: d.nowMs() / 1000,
        fixture: d.fixture,
        spotlightIdx: spotIdx,
        spotlightScreen: screenFor(spotIdx),
        hoverIdx,
        hoverScreen: screenFor(hoverIdx),
        hidden,
        reducedMotion: d.reducedMotion,
        debug: d.debug ? { ...perf, flights: model?.flights.length ?? 0 } : undefined,
      }),
    );
  }

  const frame = (dt: number): FrameInput => {
    cycle = stepCycle(cycle, dt, bounds());
    if (!cycle.paused) roll += dt * (cycle.phase === "LIVE" ? ROLL_LIVE : ROLL_REPLAY) * motion;
    if (!pinned && !cycle.paused) {
      spotTimer += dt;
      if (spotTimer >= SPOTLIGHT_SEC) {
        spotTimer = 0;
        chooseSpotlight();
      }
    }
    if (pendingPick && d.nowMs() - lastPick >= PICK_INTERVAL_MS) {
      lastPick = d.nowMs();
      hoverIdx = d.engine.pick(pendingPick.x, pendingPick.y, cycle.tRel);
      pendingPick = null;
    }
    hudTimer += dt;
    if (hudTimer >= HUD_TICK_SEC) {
      hudTimer = 0;
      pushHud();
    }
    const stats = tl ? statsAt(tl, cycle.tRel) : null;
    return {
      tRel: cycle.tRel,
      roll,
      flow: tl ? flowFor(tl, cycle.tRel) : 1,
      tint: stats ? tintFor(stats.regionAirborne) : [1, 1, 1],
      highlight: hoverIdx >= 0 ? hoverIdx : idxOf(spotId),
    };
  };
  d.engine.setFrameSource(frame);

  const poller = createPoller({
    url: d.url,
    fetch: d.fetch ?? fetch.bind(globalThis),
    onData: (day: DayFile) => {
      const first = !model;
      model = buildModel(day);
      tl = buildTimeline(model);
      d.engine.setModel(model);
      if (first) {
        cycle = initCycle(bounds());
        spotTimer = SPOTLIGHT_SEC;
      }
      if (idxOf(spotId) < 0) {
        spotId = null;
        pinned = false;
      }
      hoverIdx = -1;
      pushHud();
    },
    onError: (e) => {
      console.warn("[data]", e);
      pushHud();
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  poller.start();
  pushHud();

  return {
    onKey(key) {
      const cmd = keyToCommand(key);
      if (!cmd) return;
      const b = bounds();
      if (cmd === "togglePause") cycle = applyAction(cycle, { type: "togglePause" }, b);
      else if (cmd === "scrubBack") cycle = applyAction(cycle, { type: "scrub", delta: -SCRUB_SEC }, b);
      else if (cmd === "scrubForward") cycle = applyAction(cycle, { type: "scrub", delta: SCRUB_SEC }, b);
      else {
        cycle = applyAction(cycle, { type: "interact" }, b);
        if (cmd === "toggleHud") hidden = !hidden;
        if (cmd === "fullscreen" && typeof document !== "undefined") {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.();
        }
        // "globe" is Plan 3; in Phase 1 it only counts as interaction.
      }
      pushHud();
    },
    onPointerMove(x, y) {
      cycle = applyAction(cycle, { type: "interact" }, bounds());
      const now = d.nowMs();
      if (now - lastPick >= PICK_INTERVAL_MS) {
        lastPick = now;
        pendingPick = null;
        hoverIdx = d.engine.pick(x, y, cycle.tRel);
      } else {
        pendingPick = { x, y };
      }
    },
    onClick() {
      cycle = applyAction(cycle, { type: "interact" }, bounds());
      if (hoverIdx >= 0 && model) {
        spotId = model.flights[hoverIdx].id;
        pinned = true;
      } else {
        pinned = false;
        spotTimer = SPOTLIGHT_SEC;
      }
      pushHud();
    },
    onPointerLeave() {
      hoverIdx = -1;
      pendingPick = null;
    },
    setPerf(fps, level) {
      perf = { fps, level };
    },
    dispose() {
      poller.stop();
      d.engine.setFrameSource(null);
    },
  };
}
