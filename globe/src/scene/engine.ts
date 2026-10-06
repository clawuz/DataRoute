import { BloomEffect, EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { Group, LinearSRGBColorSpace, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { TUNNEL_PERIOD, advance } from "@web/render/clocks";
import type { ScreenPoint } from "@web/render/picking";
import { LEVELS, initQuality, updateQuality } from "@web/render/quality";
import { earthRotationRad, sunDirection } from "../astro";
import { IDLE_YAW_RATE, dragRig, initRig, initialYaw, releaseRig, rigPosition, stepRig, type RigState } from "../camera/globe-rig";
import { altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { HeadSmoother } from "../model/head-smoother";
import { createAirports, type Airports } from "./airports";
import { ARC_BASE_LIFT, createArcs, type Arcs } from "./arcs";
import { createAtmosphere } from "./atmosphere";
import { createEarth } from "./earth";
import { createHeads, headLatLons } from "./heads";
import { buildPickIndex, pickFlight, type PickIndex } from "./picking3d";
import { createSpace } from "./space";
import { chooseTier, detectTierInputs, loadEarthTextures } from "./textures";

export interface GlobeFrameInput {
  /** displayed UTC instant (unix seconds): drives Earth rotation and the sun */
  absTime: number;
  /** displayed time relative to window.from (seconds): drives arc/head clipping */
  cur: number;
  highlight: number;
  /** wall clock (unix seconds): drives pulses and smoothing */
  nowSec: number;
}

export interface GlobeEngineOptions {
  reducedMotion: boolean;
  onPerf?: (fps: number, level: number) => void;
  onError?: (msg: string) => void;
}

export interface GlobeEngine {
  setModel(m: GlobeModel | null, cur: number, nowSec: number): void;
  loadTextures(onProgress: (p: number) => void): Promise<"8k" | "4k" | null>;
  setFrameSource(fn: ((dt: number) => GlobeFrameInput) | null): void;
  pick(x: number, y: number, cur: number): number;
  screenOf(lat: number, lon: number, alt100?: number): ScreenPoint;
  dragBy(dxPx: number, dyPx: number, dtSec: number): void;
  endDrag(): void;
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

  let arcs: Arcs | null = null;
  let airports: Airports | null = null;
  let model: GlobeModel | null = null;
  let pickIndex: PickIndex | null = null;
  let headInfo = { count: 0, extrapolated: 0 };
  const smoother = new HeadSmoother();
  let rig: RigState = initRig(initialYaw(earthRotationRad(Date.now() / 1000), 30));
  const idleRate = IDLE_YAW_RATE * (opts.reducedMotion ? 0.4 : 1);

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
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const wall = Date.now() / 1000;
    const f: GlobeFrameInput = source ? source(dt) : { absTime: wall, cur: 0, highlight: -1, nowSec: wall };

    rig = stepRig(rig, dt, idleRate);
    const p = rigPosition(rig);
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    earthGroup.rotation.y = earthRotationRad(f.absTime);
    const sun = sunDirection(f.absTime);
    earth.setSun(sun);
    atmosphere.setSun(sun);
    earth.setCloudDrift(f.absTime * 1.5e-6);

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
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  const world = new Vector3();
  const cam = new Vector3();

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
      cam.copy(camera.position);
      const front = world.dot(cam) > 1.0;
      world.project(camera);
      return {
        x: ((world.x + 1) / 2) * size.w,
        y: ((1 - world.y) / 2) * size.h,
        visible: front && world.z >= -1 && world.z <= 1 && Math.abs(world.x) <= 1 && Math.abs(world.y) <= 1,
      };
    },
    dragBy(dx, dy, dt) {
      rig = dragRig(rig, -dx * DRAG_RAD_PER_PX, dy * DRAG_RAD_PER_PX, dt);
    },
    endDrag() {
      rig = releaseRig(rig);
    },
    pulseAirport(iata, nowSec) {
      airports?.pulse(iata, rel(nowSec));
    },
    headsInfo() {
      return headInfo;
    },
    dispose() {
      cancelAnimationFrame(raf);
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
