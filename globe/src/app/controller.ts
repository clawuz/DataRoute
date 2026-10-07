import type { DayFile } from "@collector/day-schema";
import { applyAction, initCycle, stepCycle, type Bounds, type CycleConfig, type CycleState } from "@web/cycle/machine";
import { createPoller } from "@web/data/source";
import { buildTimeline, type Timeline } from "@web/data/timeline";
import { buildSnapshot } from "@web/hud/snapshot";
import type { Store } from "@web/hud/store";
import { diffEvents } from "../model/events";
import { telemetryAt } from "../geo3d/telemetry";
import { TOUR_END_HOLD_SEC, TOUR_LIVE_HOLD_SEC, initTour, stepTour } from "../model/tour";
import { SCRUB_FOLLOW_SEC, atEnd, atLiveHead, cycleSpeed, scrubFollow, startClock, stepFollow, type FollowClock } from "../model/follow-clock";
import { REWIND_SEC, blendCur } from "../camera/time-ease";
import { formatFollow } from "./follow-hud";
import { buildGlobeModel, type GlobeModel } from "../model/globe-model";
import type { GlobeEngine, GlobeFrameInput } from "../scene/engine";
import {
  CREDIT, LABEL_COUNT, addEvents, aircraftLabel, hoverNote, liveCur, pickLabelAirports,
  type AirportLabel, type DayCurveHud, type EventLine, type GlobeHudSnapshot, type MusicHud,
} from "./hud-model";
import { effectsFor, initArt, persistArt, toggleArt, type ArtState } from "./art";
import { createRouteSound, type RouteSound, type SoundFocus, type SoundInfo } from "../audio/engine"; // art:sound
import { createDayTrack, type DayTrack, type TrackNote } from "../audio/day-track"; // art:track
import { bestRoute } from "../audio/route-fit"; // art:track
import { eventsBetween, farOf } from "../audio/score"; // art:sound
import type { SkyFlight } from "../audio/lines"; // art:sound
import { routeKey } from "../audio/theory"; // art:sound
import { headState } from "../model/dead-reckon"; // art:sound
import { istanbulHour } from "../audio/form"; // art:sound
import { routeMidpoints, type RouteMidpoint } from "../audio/pans"; // art:sound
import type { NoteBus } from "../audio/notes-bus"; // art:sound
import { SCRUB_SEC, keyToCommand } from "./keys";

export const GLOBE_CYCLE: CycleConfig = { replaySec: 180, liveSec: Number.POSITIVE_INFINITY, holdSec: 20 };
export const HUD_TICK_SEC = 0.25;
export const PICK_INTERVAL_MS = 100;
export const FIXTURE_LIVE_LOOP_SEC = 240;

/** The flights with a head at `cur` for the music lines: head altitude, vertical speed, route key, region, far end and
 * (v5) seconds since departure. */ // art:sound
export function skyFlights(m: GlobeModel, cur: number): SkyFlight[] {
  const out: SkyFlight[] = [];
  for (const f of m.flights) {
    const h = headState(f, cur);
    if (!h) continue;
    out.push({
      id: f.id,
      key: routeKey(f.from, f.to, f.id),
      regionIdx: f.regionIdx,
      alt100: h.alt100,
      vsFpm: telemetryAt(f, cur, m.from)?.vsFpm ?? null, // the flight profile is cached per flight (profileOf)
      ...farOf(f),
      ageSec: Math.max(0, cur - f.dep), // art:sound — v5: the newest flight represents its route
    });
  }
  return out;
}

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
  /** the URL query string (for ?art=0); defaults to none */
  search?: string;
  /** the route orchestra (tests inject a stub); defaults to the Web Audio engine */ // art:sound
  sound?: RouteSound;
  /** viewport width in px for stereo panning; defaults to window.innerWidth */ // art:sound
  viewportWidth?: () => number;
  /** every planned note of the route music, for the scope panel */ // art:sound
  noteBus?: NoteBus;
  track?: DayTrack; // art:track
  /** wall clock of the sound engine's planner (seconds; default performance.now() / 1000) */ // art:sound
  clock?: () => number;
}

export interface GlobeController {
  onKey(key: string): void;
  onPointerMove(x: number, y: number): void;
  onClick(x: number, y: number): void;
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
  let art: ArtState = initArt(d.search ?? ""); // art:core
  const sound: RouteSound = d.sound ?? createRouteSound(); // art:sound
  let soundOn = false; // art:sound
  const clock = d.clock ?? (() => performance.now() / 1000); // art:sound
  let trackActive = false; // art:track — the recorded track of the day plays instead of the generative music
  const recentRoutes = new Map<string, number>(); // art:track — LIVE: the route that last played a note of the recording
  let lastSky: SkyFlight[] = []; // art:track
  let airRange: { model: GlobeModel; lo: number; hi: number; curve: number[] } | null = null; // art:track — the day's own quietest/busiest airborne counts
  const intensityNow = (): number => { // art:track — 0..1 between the quietest and busiest hour of the day
    if (!model) return 0.5;
    if (!airRange || airRange.model !== model) {
      let lo = Infinity;
      let hi = 0;
      const counts: number[] = [];
      for (let i = 0; i < 48; i++) {
        const c = skyFlights(model, (i / 47) * model.span).length;
        counts.push(c);
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
      }
      airRange = { model, lo, hi, curve: counts.map((c) => (hi - lo < 1 ? 0.5 : (c - lo) / (hi - lo))) };
    }
    const { lo, hi } = airRange;
    return hi - lo < 1 ? 0.5 : Math.min(1, Math.max(0, (lastSky.length - lo) / (hi - lo)));
  };
  const pulseTrack = (key: string) => { if (!disposed) d.engine.pulseRoute(key); }; // art:track
  const track: DayTrack = d.track ?? createDayTrack({ // art:track
    clock,
    onNote: (e) => {
      d.noteBus?.emit(e);
      const t = setTimeout(() => { pulseTimers.delete(t); pulseTrack(e.key); }, Math.max(0, (e.at - clock()) * 1000));
      pulseTimers.add(t);
    },
  });
  const pulseTimers = new Set<ReturnType<typeof setTimeout>>(); // art:sound
  const offNote = sound.onNote((n) => { // art:sound
    if (trackActive) return; // art:track
    d.noteBus?.emit(n);
    if (!n.key) return; // art:sound — groove voices have no route
    // flash the route's corridor when the note actually sounds
    const t = setTimeout(() => {
      pulseTimers.delete(t);
      if (!disposed) d.engine.pulseRoute(n.key);
    }, Math.max(0, (n.at - clock()) * 1000));
    pulseTimers.add(t);
  });
  let prevSoundCur: number | null = null; // art:sound
  const pans = new Map<string, { pan: number; visible: boolean }>(); // art:sound
  let panModel: GlobeModel | null = null; // art:sound
  let panRoutes: RouteMidpoint[] = []; // art:sound
  const pushEffects = () => { // art:core
    const e = effectsFor(art, perf.level);
    d.engine.setEffects(e); // art:core
    if (e.sound !== soundOn) { // art:sound
      soundOn = e.sound;
      sound.setEnabled(e.sound && !trackActive);
      track.setEnabled(e.sound); // art:track
      prevSoundCur = null;
    }
  };
  const soundFocus = (): SoundFocus | null => { // art:sound
    if (!follow || !model) return null;
    const f = model.flights[follow.idx];
    if (!f) return null;
    const tel = telemetryAt(f, follow.clock.u, model.from);
    return { regionIdx: f.regionIdx, alt100: tel?.alt100 ?? 0 };
  };
  function feedSky() { // art:sound — the music lines follow the sky (also while muted: the scope)
    if (!model) return;
    const cur = currentCur(d.nowMs() / 1000);
    const sky = skyFlights(model, cur);
    lastSky = sky; // art:track
    sound.setSky(sky, follow?.id ?? null, istanbulHour(model.from + cur), mode === "REPLAY", sky.length); // art:sound — v4 build-ups, level
  }
  const musicHud = (i: SoundInfo, cur: number): MusicHud => ({ // art:sound
    on: soundOn, section: i.section, chord: i.chord, bpm: i.bpm, instruments: i.instruments, level: i.level, layers: i.layers,
    ...(model && track.data() ? { day: dayCurveHud(cur) } : {}), // art:track
  });
  const dayCurveHud = (cur: number): DayCurveHud => { // art:track
    const level = intensityNow(); // also fills airRange.curve
    return {
      curve: airRange?.curve ?? [], pos: model && model.span > 0 ? Math.min(1, Math.max(0, cur / model.span)) : 0, level,
      hour: model ? (((istanbulHour(model.from + cur)) % 24) + 24) % 24 : 0, airborne: lastSky.length, windows: 8,
    };
  };
  function refreshPans() { // art:sound
    if (!model) return;
    if (panModel !== model) {
      panModel = model;
      panRoutes = routeMidpoints(model, 40);
    }
    const vw = (d.viewportWidth ?? (() => (typeof window === "undefined" ? 1280 : window.innerWidth)))();
    pans.clear();
    for (const c of panRoutes) {
      const p = d.engine.screenOf(c.lat, c.lon, 0);
      pans.set(c.key, { pan: Math.min(1, Math.max(-1, (p.x - vw / 2) / (vw / 2))), visible: p.visible });
    }
  }
  let tex = { progress: 0, note: "" };
  let firstDataSec = 0;
  let disposed = false;
  let follow: { id: string; idx: number; clock: FollowClock; liveHeadSec: number; endedSec: number } | null = null;
  /** displayed-time glide: "in" eases cur to the follow clock, "out" eases it back to the mode time; t in seconds */
  let blend: { from: number; t: number; dir: "in" | "out" } | null = null;
  let tour = initTour(true);
  let notice: { text: string; until: number } | null = null;
  const NOTICE_SEC = 3;
  const say = (text: string) => {
    notice = { text, until: d.nowMs() / 1000 + NOTICE_SEC };
  };
  function startFollow(idx: number) {
    const f = model?.flights[idx];
    if (!f) return;
    if (f.t.length < 2) {
      say("TRACK TOO SHORT");
      return;
    }
    const from = currentCur(d.nowMs() / 1000);
    follow = { id: f.id, idx, clock: startClock(f), liveHeadSec: 0, endedSec: 0 };
    blend = { from, t: 0, dir: "in" };
  }
  /** leaves FOLLOW; the displayed time glides from where it is now back to the mode time */
  function endFollow(from?: number) {
    if (!follow) return;
    blend = { from: from ?? currentCur(d.nowMs() / 1000), t: 0, dir: "out" };
    follow = null;
  }

  const bounds = (): Bounds => (model ? { start: model.replayStart, end: model.span } : { start: 0, end: 0 });
  const act = (a: Parameters<typeof applyAction>[1]) => {
    cycle = applyAction(cycle, a, bounds(), GLOBE_CYCLE);
  };

  /** unfrozen LIVE time: the wall clock, or the looped stale-snapshot clock in fixture mode */
  function liveRaw(m: GlobeModel, nowSec: number): number {
    return d.fixture ? m.span + ((nowSec - firstDataSec) % FIXTURE_LIVE_LOOP_SEC) : liveCur(m, nowSec);
  }

  /** the time of the underlying mode (follow clock while following, else LIVE / REPLAY) */
  function rawCur(nowSec: number): number {
    if (!model) return 0;
    if (follow) return follow.clock.u;
    if (mode === "REPLAY") return cycle.tRel;
    return liveFrozen ?? liveRaw(model, nowSec);
  }

  /** the displayed time: the raw time, or the glide between old and new while a blend runs */
  function currentCur(nowSec: number): number {
    const raw = rawCur(nowSec);
    return blend ? blendCur(blend.from, raw, blend.t / REWIND_SEC) : raw;
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
    let tooltip = base.tooltip;
    if (tooltip && model && hoverIdx >= 0) {
      const hf = model.flights[hoverIdx];
      const note = hoverNote(hf, cur);
      const ac = hf.type ?? (hf.desc ? aircraftLabel(hf).name : "");
      tooltip = { ...tooltip, route: `${tooltip.route}${ac ? ` · ${ac}` : ""}${note ? ` · ${note}` : ""}` };
    }
    let followHud = null;
    if (follow && model) {
      const f = model.flights[follow.idx];
      const tel = f ? telemetryAt(f, follow.clock.u, model.from) : null;
      if (f && tel) followHud = formatFollow(f, tel, follow.clock);
    }
    d.store.set({
      ...base,
      tooltip,
      mode,
      events,
      labels,
      extrapolated: d.engine.headsInfo().extrapolated,
      textureProgress: tex.progress,
      textureNote: tex.note,
      credit: CREDIT,
      follow: followHud,
      camMode: d.engine.camMode(),
      notice: notice && nowSec < notice.until ? notice.text : "",
      tour: tour.enabled,
      art, // art:core
      music: musicHud(sound.info(model ? istanbulHour(model.from + cur) : undefined), cur), // art:sound
    });
  }

  const frame = (dt: number): GlobeFrameInput => {
    const nowSec = d.nowMs() / 1000;
    const stepped = stepCycle(cycle, dt, bounds(), GLOBE_CYCLE);
    // while following in REPLAY the displayed instant belongs to the follow clock: freeze the replay position
    cycle = follow && mode === "REPLAY" ? { ...stepped, phase: cycle.phase, elapsed: cycle.elapsed, tRel: cycle.tRel } : stepped;
    if (mode === "REPLAY" && cycle.phase === "LIVE") {
      if (soundOn && track.ready() && !follow) {
        cycle = { ...initCycle(bounds()), phase: "REPLAY" }; // art:track — the music is done: rewind, the replay (and the music) start over
      } else {
        mode = "LIVE"; // replay finished: back to the present
        liveFrozen = null;
      }
    }
    if (mode === "LIVE") {
      if (!cycle.paused) liveFrozen = null;
      else if (liveFrozen === null && model) liveFrozen = liveRaw(model, nowSec);
    }
    // the flight starts only once the displayed time has arrived at its first sample
    const rewinding = blend?.dir === "in";
    if (blend) {
      blend.t += dt;
      if (blend.t >= REWIND_SEC) blend = null;
    }
    if (follow && model && !rewinding) {
      const f = model.flights[follow.idx];
      follow.clock = stepFollow(follow.clock, f, dt);
      if (atLiveHead(follow.clock, f) && !follow.clock.paused) follow.liveHeadSec += dt;
      if (atEnd(follow.clock, f)) follow.endedSec += dt;
    }
    if (mode === "LIVE") {
      const r = stepTour(tour, dt, {
        following: !!follow,
        followDone: !!follow && (follow.liveHeadSec >= TOUR_LIVE_HOLD_SEC || follow.endedSec >= TOUR_END_HOLD_SEC),
        manual: cycle.manual,
        model,
        cur: currentCur(nowSec),
        rand: Math.random,
      });
      tour = r.s;
      if (r.a.type === "follow") startFollow(r.a.index);
      else if (r.a.type === "exit") endFollow();
    }
    if (pending && d.nowMs() - lastPick >= PICK_INTERVAL_MS) {
      lastPick = d.nowMs();
      hoverIdx = d.engine.pick(pending.x, pending.y, currentCur(nowSec));
      pending = null;
    }
    hudTimer += dt;
    if (hudTimer >= HUD_TICK_SEC) {
      hudTimer = 0;
      pushHud();
      if (model) { // art:sound — planned also while muted (scope, route flashes)
        refreshPans();
        feedSky(); // art:sound
        sound.setEnergy(track.data() ? 0.3 + 0.7 * intensityNow() : Math.min(1, Math.max(0, (d.store.get().counters.airborne ?? 0) / 150)));
      }
    }
    const cur = currentCur(nowSec);
    if (model) { // art:track — in REPLAY the recorded track of the day replaces the generative music (LIVE and FOLLOW keep it)
      // the recording is the music in every mode: REPLAY follows the replay position; while a flight is followed and in
      // LIVE it keeps going round on its own clock, and in LIVE its notes are handed to the routes flying right now
      const want = soundOn && track.ready();
      if (want !== trackActive) {
        trackActive = want;
        sound.setEnabled(soundOn && !want);
        prevSoundCur = null;
      }
      sound.setGenerative(!track.data());
      track.setGain(0.4 + 0.6 * intensityNow()); // the recorded audio rises and falls with the traffic of the hour
      const live = mode !== "REPLAY";
      const remap = live
        ? (n: TrackNote): TrackNote | null => {
            const f = bestRoute(n, lastSky, recentRoutes, clock());
            if (!f) return null;
            recentRoutes.set(f.key, clock());
            return { ...n, k: f.key, from: f.key.slice(0, 3), to: f.key.slice(4), alt: f.alt100 * 100 };
          }
        : undefined;
      track.update(model.span > 0 ? cur / model.span : 0, want && !(follow ? follow.clock.paused : cycle.paused), live || !!follow, remap);
    }
    if (model) { // art:sound
      if (prevSoundCur !== null) {
        const ev = eventsBetween(model, prevSoundCur, cur);
        if (ev.length) sound.schedule(ev, soundFocus(), pans, istanbulHour(model.from + cur)); // art:sound
      }
      prevSoundCur = cur;
    }
    return {
      absTime: (model?.from ?? nowSec) + cur,
      cur,
      highlight: follow ? follow.idx : hoverIdx,
      nowSec,
      follow: follow ? { flight: follow.idx, id: follow.id, u: follow.clock.u } : null,
    };
  };
  d.engine.setFrameSource(frame);
  pushEffects();
  d.engine.setAfterRender(() => {
    if (d.onLabels && model && !disposed) d.onLabels(computeLabels());
  });

  const onData = (day: DayFile) => {
    const prev = model;
    // ignore equal/older payloads (cached or stale responses)
    if (prev && !(day.generatedAt > prev.generatedAt)) return;
    if (disposed) return;
    const next = buildGlobeModel(day);
    const nextTl = buildTimeline(next);
    const nowSec = d.nowMs() / 1000;
    const shownBefore = currentCur(nowSec);
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
    if (!first && prevSoundCur !== null) prevSoundCur -= next.from - prev!.from; // art:sound
    if (!first && blend) blend.from = Math.max(0, blend.from - (next.from - prev!.from));
    if (!first && follow) {
      const idx = next.flights.findIndex((f) => f.id === follow!.id);
      if (idx < 0) {
        endFollow(Math.max(0, shownBefore - (next.from - prev!.from)));
        say("FLIGHT NO LONGER IN DATA");
      } else {
        follow.idx = idx;
        follow.clock = {
          ...follow.clock,
          u: Math.max(next.flights[idx].t[0], follow.clock.u - (next.from - prev!.from)),
        };
      }
    }
    const evs = diffEvents(prev, next);
    events = addEvents(events, evs);
    d.engine.setModel(next, currentCur(nowSec), nowSec);
    for (const e of evs) if (e.airport) d.engine.pulseAirport(e.airport, nowSec);
    hoverIdx = -1;
    pending = null;
    pushHud();
    feedSky(); // art:sound — new flights reach the lines without waiting for the next HUD tick
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
      const f = follow && model ? model.flights[follow.idx] : null;
      if (cmd === "toggleCorridors" || cmd === "toggleAurora" || cmd === "toggleSound") { // art:core
        if (!art.enabled) return; // ?art=0: art keys are inert
        art = toggleArt(art, cmd === "toggleCorridors" ? "corridors" : cmd === "toggleAurora" ? "aurora" : "sound");
        persistArt(art);
        pushEffects();
        pushHud();
        return;
      }
      if (cmd === "toggleTour") {
        tour = { ...tour, enabled: !tour.enabled };
        pushHud();
        return;
      }
      if (cmd === "exitFollow") {
        act({ type: "interact" });
        endFollow();
        pushHud();
        return;
      }
      if (follow && f) {
        let handled = true;
        if (cmd === "togglePause") follow.clock = { ...follow.clock, paused: !follow.clock.paused };
        else if (cmd === "scrubBack" || cmd === "scrubForward")
          follow.clock = scrubFollow(follow.clock, f, cmd === "scrubBack" ? -SCRUB_FOLLOW_SEC : SCRUB_FOLLOW_SEC);
        else if (cmd === "slower" || cmd === "faster") follow.clock = cycleSpeed(follow.clock, f, cmd === "faster" ? 1 : -1);
        else if (cmd === "toggleReplay") {
          endFollow(); // falls through to the normal REPLAY toggle below
          handled = false;
        } else handled = false; // HUD / fullscreen keep their normal handling while following
        if (handled) {
          act({ type: "interact" });
          pushHud();
          return;
        }
      }
      if (cmd === "slower" || cmd === "faster") return; // speed keys only matter while following
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
    onClick(x, y) {
      act({ type: "interact" });
      if (!model) return;
      const idx = d.engine.pick(x, y, currentCur(d.nowMs() / 1000));
      if (idx >= 0) {
        if (!follow || follow.idx !== idx) startFollow(idx);
      } else if (follow) endFollow();
      pushHud();
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
      pushEffects(); // art:core
    },
    setTextureState(progress, note) {
      if (disposed) return;
      tex = { progress, note };
      pushHud();
    },
    dispose() {
      disposed = true;
      offNote(); // art:sound
      for (const t of pulseTimers) clearTimeout(t); // art:sound
      pulseTimers.clear(); // art:sound
      sound.dispose(); // art:sound
      track.dispose(); // art:track
      poller.stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      d.engine.setFrameSource(null);
      d.engine.setAfterRender(null);
    },
  };
}
