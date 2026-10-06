import { BloomEffect, EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { Group, LinearSRGBColorSpace, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { TUNNEL_PERIOD, advance } from "@web/render/clocks";
import type { ScreenPoint } from "@web/render/picking";
import { LEVELS, initQuality, updateQuality } from "@web/render/quality";
import { earthRotationRad, sunDirection } from "../astro";
import { SMOOTH_SEC, blendPose, followWeight, initCam, smoothDampVec, stepCam, type CamMode, type CamState, type Damped, type Pose } from "../camera/follow-rig";
import { easeAbsTime, type TimeEase } from "../camera/time-ease";
import { chaseFor } from "../camera/follow-pose";
import { IDLE_YAW_RATE, dragRig, initRig, initialYaw, releaseRig, rigPosition, stepRig, type RigState } from "../camera/globe-rig";
import { altitudeRadius, latLonToVec3, type Vec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { EXTRAPOLATE_MAX_SEC, headState } from "../model/dead-reckon";
import { HeadSmoother } from "../model/head-smoother";
import { createAirports, type Airports } from "./airports";
import { ARC_BASE_LIFT, createArcs, type Arcs } from "./arcs";
import { createAtmosphere } from "./atmosphere";
import { createEarth } from "./earth";
import { createHeads, headLatLons } from "./heads";
import { buildPickIndex, pickFlight, type PickIndex } from "./picking3d";
import { createSpace } from "./space";
import { chooseTier, type EarthTextures, detectTierInputs, loadEarthTextures, lowerTier, type TextureTier, writeTierCap } from "./textures";

export interface GlobeFrameInput {
  /** displayed UTC instant (unix seconds): drives Earth rotation and the sun */
  absTime: number;
  /** displayed time relative to window.from (seconds): drives arc/head clipping */
  cur: number;
  highlight: number;
  /** wall clock (unix seconds): drives pulses and smoothing */
  nowSec: number;
  /** FOLLOW target: flight index in the current model and its flight time (seconds relative to window.from) */
  follow?: { flight: number; id?: string; u: number } | null;
}

export interface GlobeEngineOptions {
  reducedMotion: boolean;
  onPerf?: (fps: number, level: number) => void;
  onError?: (msg: string) => void;
}

export interface GlobeEngine {
  setModel(m: GlobeModel | null, cur: number, nowSec: number): void;
  loadTextures(onProgress: (p: number) => void): Promise<TextureTier | null>;
  setFrameSource(fn: ((dt: number) => GlobeFrameInput) | null): void;
  pick(x: number, y: number, cur: number): number;
  screenOf(lat: number, lon: number, alt100?: number): ScreenPoint;
  dragBy(dxPx: number, dyPx: number, dtSec: number): void;
  endDrag(): void;
  camMode(): CamMode;
  setAfterRender(fn: (() => void) | null): void;
  pulseAirport(iata: string, nowSec: number): void;
  headsInfo(): { count: number; extrapolated: number };
  dispose(): void;
}

const DRAG_RAD_PER_PX = 0.0045;

/*
 * Time contract: the engine's public API takes EPOCH seconds (`nowSec`), but the shaders and attributes
 * (airports pulse/now, heads uTime) are float32, which cannot resolve sub-second values at ~1.7e9. Internally
 * everything handed to the GPU-facing modules is `nowSec - base` (seconds since engine creation).
 */

export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function createGlobeEngine(canvas: HTMLCanvasElement, opts: GlobeEngineOptions): GlobeEngine {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = LinearSRGBColorSpace; // colours are authored in display space
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    console.error("[shader]", gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
    opts.onError?.("SHADER COMPILE ERROR — SEE CONSOLE");
  };
  const onContextLost = (e: Event) => {
    e.preventDefault();
    const lower = texs ? lowerTier(texs.tier) : null; // don't repeat the same GPU-memory failure after the reload
    if (lower) writeTierCap(lower);
    opts.onError?.("WEBGL CONTEXT LOST — RELOADING");
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  const base = Date.now() / 1000;
  const rel = (nowSec: number) => nowSec - base;

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.05, 50);
  const space = createSpace();
  scene.add(space.nebula.display);
  scene.add(space.stars);
  const earthGroup = new Group();
  scene.add(earthGroup);
  const earth = createEarth();
  earthGroup.add(earth.mesh);
  const atmosphere = createAtmosphere();
  scene.add(atmosphere.mesh);
  const heads = createHeads();
  earthGroup.add(heads.points);

  let disposed = false;
  let texs: EarthTextures | null = null;
  let arcs: Arcs | null = null;
  let airports: Airports | null = null;
  let model: GlobeModel | null = null;
  let pickIndex: PickIndex | null = null;
  let headInfo = { count: 0, extrapolated: 0 };
  const smoother = new HeadSmoother();
  let rig: RigState = initRig(initialYaw(earthRotationRad(Date.now() / 1000), 30));
  const idleRate = IDLE_YAW_RATE * (opts.reducedMotion ? 0.4 : 1);
  let cam: CamState = initCam();
  let timeEase: TimeEase | null = null;
  let chasePos: Damped = { p: [0, 0, 0], v: [0, 0, 0] };
  let chaseTgt: Damped = { p: [0, 0, 0], v: [0, 0, 0] };
  let followKey: string | number = -2; // flight identity (id, else index) the damped chase state was initialised for (-2 = none)
  let lastChase: { pos: Vec3; target: Vec3 } | null = null; // Earth-fixed
  let afterRender: (() => void) | null = null;
  let lastDragMove = 0;
  const camScale = opts.reducedMotion ? 0.5 : 1;
  const cA = new Vector3();
  const cB = new Vector3();

  /** Earth-fixed head position of flight `fi` at flight time `u` (clamped to where the flight can be drawn). */
  const posAt = (fi: number) => (u: number): Vec3 | null => {
    const f = model?.flights[fi];
    if (!f) return null;
    const hi = f.status === "AIRBORNE" ? f.lastT + EXTRAPOLATE_MAX_SEC : f.end;
    const h = headState(f, Math.min(Math.max(u, f.t[0]), hi));
    return h ? latLonToVec3(h.lat, h.lon, altitudeRadius(h.alt100) + ARC_BASE_LIFT) : null;
  };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ luminanceThreshold: 0.8, luminanceSmoothing: 0.2, intensity: 0.9, mipmapBlur: true });
  composer.addPass(new EffectPass(camera, bloom));

  let quality = initQuality();
  let level = LEVELS[0];
  const size = { w: 1, h: 1 };
  let sized = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 1 || h < 1) {
      sized = false; // not laid out yet / hidden: keep buffers, skip rendering
      return;
    }
    sized = true;
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    bloom.resolution.scale = level.bloomScale; // fires a size reset: must precede the explicit sizing below
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    space.nebula.setSize(w * pr, h * pr, 0.35 * level.tunnelScale);
    // mipmapBlur ignores resolution.scale: size its chain explicitly (mip0 is already ½ of its input)
    const k = level.bloomScale * 2;
    const bw = Math.max(1, Math.round(w * pr * k));
    const bh = Math.max(1, Math.round(h * pr * k));
    bloom.luminancePass.setSize(bw, bh);
    bloom.mipmapBlurPass.setSize(bw, bh);
    arcs?.setResolution(w * pr, h * pr, pr);
    heads.setPixelRatio(pr);
    airports?.setPixelRatio(pr);
  }

  let source: ((dt: number) => GlobeFrameInput) | null = null;
  let raf = 0;
  let last = performance.now();
  let nebulaTime = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  const flowScale = opts.reducedMotion ? 0.4 : 1;

  function frame(now: number) {
    try {
      frameBody(now);
    } catch (e) {
      console.error("[frame]", e);
      opts.onError?.("RENDER ERROR — SEE CONSOLE");
    } finally {
      if (!disposed) raf = requestAnimationFrame(frame);
    }
  }

  function frameBody(now: number) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const wall = Date.now() / 1000;
    const f: GlobeFrameInput = source ? source(dt) : { absTime: wall, cur: 0, highlight: -1, nowSec: wall };

    const fol = f.follow && model && model.flights[f.follow.flight] ? f.follow : null;
    cam = stepCam(cam, dt, !!fol, camScale);
    rig = stepRig(rig, dt, cam.mode === "GLOBE" ? idleRate : 0);

    timeEase = easeAbsTime(timeEase, f.absTime, dt);
    const shownAbs = timeEase.shown;
    earthGroup.rotation.y = earthRotationRad(shownAbs);
    earthGroup.updateMatrixWorld();

    if (fol) {
      const pose = chaseFor(posAt(fol.flight), fol.u);
      if (pose) {
        const key = fol.id ?? fol.flight;
        if (followKey !== key) {
          chasePos = { p: pose.pos, v: [0, 0, 0] };
          chaseTgt = { p: pose.target, v: [0, 0, 0] };
          followKey = key;
        } else {
          chasePos = smoothDampVec(chasePos, pose.pos, SMOOTH_SEC, dt);
          chaseTgt = smoothDampVec(chaseTgt, pose.target, SMOOTH_SEC, dt);
        }
        lastChase = { pos: chasePos.p, target: chaseTgt.p };
      }
    } else if (cam.mode === "GLOBE") {
      followKey = -2;
    }

    const rp = rigPosition(rig);
    if (cam.mode !== "GLOBE" && lastChase) {
      const m = earthGroup.matrixWorld;
      cA.set(lastChase.pos[0], lastChase.pos[1], lastChase.pos[2]).applyMatrix4(m);
      cB.set(lastChase.target[0], lastChase.target[1], lastChase.target[2]).applyMatrix4(m);
      const globe: Pose = { pos: rp, target: [0, 0, 0], up: [0, 1, 0] };
      const chase: Pose = {
        pos: [cA.x, cA.y, cA.z],
        target: [cB.x, cB.y, cB.z],
        up: [cA.x, cA.y, cA.z], // radial direction = local up; normalised inside blendPose
      };
      const pose = blendPose(globe, chase, followWeight(cam));
      camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
      camera.up.set(pose.up[0], pose.up[1], pose.up[2]);
      camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(rp[0], rp[1], rp[2]);
      camera.lookAt(0, 0, 0);
    }
    camera.updateMatrixWorld();

    const sun = sunDirection(shownAbs);
    earth.setSun(sun);
    atmosphere.setSun(sun);
    earth.setCloudDrift(shownAbs * 1.5e-6);

    if (arcs) {
      arcs.uniforms.uCur.value = f.cur;
      arcs.uniforms.uHighlight.value = f.highlight;
    }
    if (model) headInfo = heads.update(model, f.cur, rel(f.nowSec), f.highlight, smoother);
    airports?.setNow(rel(f.nowSec));

    space.update(camera);
    nebulaTime = advance(nebulaTime, dt * 0.35 * flowScale, TUNNEL_PERIOD);
    space.nebula.uniforms.u_time.value = nebulaTime;

    if (sized) {
      space.nebula.render(renderer);
      composer.render(dt);
    }
    afterRender?.();

    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      const fps = fpsFrames / fpsAcc;
      const prev = quality.level;
      quality = updateQuality(quality, fps, fpsAcc);
      if (quality.level !== prev) {
        level = LEVELS[quality.level];
        resize();
      }
      opts.onPerf?.(Math.round(fps), quality.level);
      fpsAcc = 0;
      fpsFrames = 0;
    }
  }

  window.addEventListener("resize", resize);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  const world = new Vector3();
  const camWorld = new Vector3();

  return {
    setModel(m, cur, nowSec) {
      const prev = model;
      const prevHeads = prev && m ? headLatLons(prev, m.from + cur - prev.from) : null;
      if (arcs) {
        earthGroup.remove(arcs.mesh);
        arcs.dispose();
        arcs = null;
      }
      if (airports) {
        earthGroup.remove(airports.points);
        airports.dispose();
        airports = null;
      }
      model = m;
      if (m) {
        arcs = createArcs(m);
        earthGroup.add(arcs.mesh);
        airports = createAirports(m);
        earthGroup.add(airports.points);
        pickIndex = buildPickIndex(m, 3);
        if (prevHeads) smoother.onSwap(prevHeads, headLatLons(m, cur), rel(nowSec));
        if (sized) {
          const pr = renderer.getPixelRatio();
          arcs.setResolution(size.w * pr, size.h * pr, pr);
          airports.setPixelRatio(pr);
        }
      } else {
        pickIndex = null;
        heads.points.geometry.setDrawRange(0, 0);
        headInfo = { count: 0, extrapolated: 0 };
      }
    },
    async loadTextures(onProgress) {
      const t = await loadEarthTextures(renderer, chooseTier(detectTierInputs(renderer)), onProgress);
      if (disposed) {
        if (t) for (const tex of [t.day, t.night, t.clouds]) tex.dispose();
        return null;
      }
      texs = t;
      earth.setTextures(t);
      return t ? t.tier : null;
    },
    setFrameSource(fn) {
      source = fn;
    },
    pick(x, y, cur) {
      if (!pickIndex) return -1;
      earthGroup.updateMatrixWorld();
      return pickFlight(pickIndex, heads.data, cur, earthGroup.matrixWorld, camera, size.w, size.h, x, y);
    },
    screenOf(lat, lon, alt100 = 0) {
      earthGroup.updateMatrixWorld();
      const p = latLonToVec3(lat, lon, altitudeRadius(alt100) + ARC_BASE_LIFT);
      world.set(p[0], p[1], p[2]).applyMatrix4(earthGroup.matrixWorld);
      camWorld.copy(camera.position);
      const front = world.dot(camWorld) > 1.0;
      world.project(camera);
      return {
        x: ((world.x + 1) / 2) * size.w,
        y: ((1 - world.y) / 2) * size.h,
        visible: front && world.z >= -1 && world.z <= 1 && Math.abs(world.x) <= 1 && Math.abs(world.y) <= 1,
      };
    },
    camMode() {
      return cam.mode;
    },
    setAfterRender(fn) {
      afterRender = fn;
    },
    dragBy(dx, dy, dt) {
      if (cam.mode === "FOLLOW" || cam.mode === "TO_FOLLOW") return;
      lastDragMove = performance.now();
      rig = dragRig(rig, -dx * DRAG_RAD_PER_PX, dy * DRAG_RAD_PER_PX, dt);
    },
    endDrag() {
      // a pause before release must not fling the globe with the last move's velocity
      const stale = performance.now() - lastDragMove > 60;
      rig = releaseRig(stale ? { ...rig, yawVel: 0, pitchVel: 0 } : rig);
    },
    pulseAirport(iata, nowSec) {
      airports?.pulse(iata, rel(nowSec));
    },
    headsInfo() {
      return headInfo;
    },
    dispose() {
      disposed = true;
      afterRender = null;
      cancelAnimationFrame(raf);
      if (texs) for (const tex of [texs.day, texs.night, texs.clouds]) tex.dispose();
      texs = null;
      window.removeEventListener("resize", resize);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      arcs?.dispose();
      airports?.dispose();
      heads.dispose();
      earth.dispose();
      atmosphere.dispose();
      space.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
