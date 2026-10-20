import type { Effects } from "../app/art";
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { Box3, DoubleSide, MeshStandardMaterial, AmbientLight, DirectionalLight, Euler, Group, Quaternion, LinearSRGBColorSpace, Matrix4, Mesh, MeshLambertMaterial, NoColorSpace, PerspectiveCamera, RepeatWrapping, Scene, TextureLoader, type Texture, Vector3, WebGLRenderer } from "three";
import { TUNNEL_PERIOD, advance } from "@web/render/clocks";
import type { ScreenPoint } from "@web/render/picking";
import { LEVELS, initQuality, updateQuality } from "@web/render/quality";
import { earthRotationRad, sunDirection } from "../astro";
import { SMOOTH_SEC, blendPose, followWeight, initCam, smoothDampVec, stepCam, type CamMode, type CamState, type Damped, type Pose } from "../camera/follow-rig";
import { easeAbsTime, type TimeEase } from "../camera/time-ease";
import { newGlobeLook } from "./look";
import { chaseFor, headingFor } from "../camera/follow-pose";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { IDLE_YAW_RATE, PITCH_LIMIT, RIG_DISTANCE, dragRig, initRig, initialYaw, releaseRig, rigPosition, stepRig, type RigState } from "../camera/globe-rig";
import { altitudeRadius, latLonToVec3, type Vec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { EXTRAPOLATE_MAX_SEC, headState } from "../model/dead-reckon";
import { HeadSmoother } from "../model/head-smoother";
import { createAirports, type Airports } from "./airports";
import { ARC_BASE_LIFT, createArcs, type Arcs } from "./arcs";
import { createCorridors, type Corridors } from "./corridors"; // art:corridors
import { createAurora } from "./aurora"; // art:aurora
import { createAtmosphere } from "./atmosphere";
import { createEarth } from "./earth";
import { createHeads, headLatLons } from "./heads";
import { buildPickIndex, pickFlight, type PickIndex } from "./picking3d";
import { createSunGlare } from "./sun-glare"; // art:light
import { createSpace } from "./space";
import { chooseTier, type EarthTextures, detectTierInputs, loadEarthTextures, loadStarMap, lowerTier, type TextureTier, writeTierCap } from "./textures";

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
  /** draw the planned great circles even when corridors are on (the personal globe has no flown tracks) */
  alwaysPlanned?: boolean;
  /** the personal globe: no airport markers (the routes meet at the hub on their own); lines are drawn exactly like the live globe */
  noAirports?: boolean;
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
  /** flashes the corridor of a route key (a note of the route music); no-op without corridors */ // art:sound
  pulseRoute(key: string): void;
  headsInfo(): { count: number; extrapolated: number };
  setEffects(e: Effects): void;
  /** holds back the stars and nebula behind the globe (1 = default) */
  setSpaceDim(k: number, nebula?: boolean): void;
  /** on a portrait screen, widen the field of view so the globe fits the width */
  setPortraitFit(on: boolean): void;
  /** the vertical field of view of a landscape screen (40 by default); wider = a smaller globe with more room around it */
  setBaseFov(deg: number): void;
  /** how far (px) a portrait screen lowers the globe for the header above it; null = the default */
  setPortraitShift(px: number | null): void;
  /** show the night side to the camera (the sun goes behind the globe), whatever the real time is */
  setNight(on: boolean): void;
  /** the strength of the glow around the globe (1 = as is) */
  setAtmosphereBoost(k: number): void;
  /** a wide screen: the globe is lowered by this fraction of the height (negative values raise it); null = the default */
  setLandscapeLower(frac: number | null): void;
  /** use the blue Milky Way picture as the sky */
  setSkyBlue(on: boolean): void;
  /** an aeroplane model (glb) that stands in for the dot of the flight being followed; null removes it */
  setPlaneModel(url: string | null): void;
  /** resolves when the pictures and models the look needs first (the 4k Earth pair, the 4k sky, the aircraft) are loaded or have failed */
  whenAssetsReady(): Promise<void>;
  /** turn the camera so that (lat, lon) is at the middle of the globe, and optionally stop the slow idle spin */
  /** `lift` (degrees) tips the globe so the point sits that much above its middle */
  centerOn(lat: number, lon: number, lift?: number): void;
  /** multiplies the width of route lines and corridors (the 1080×1920 story is drawn at a pixel ratio of 1–2: its lines need more) */
  setLineScale(k: number): void;
  /** how far the camera stands from the globe's centre (3.2 by default); the opening film moves it */
  setRigDistance(d: number | null): void;
  /** the opening film: every route rests at `dim` (1 = as is) and a note's route flashes `boost` times as strong, so the route being played is the one that stands out */
  setRouteFocus(dim: number, boost?: number): void;
  /** the slow idle spin: on/off and a speed multiplier */
  setIdleSpin(on: boolean, speed?: number): void;
  dispose(): void;
}

const DRAG_RAD_PER_PX = 0.0045;
/** the personal globe's few routes are drawn against a live-like busiest corridor of this many flights */
const PERSONAL_CORRIDOR_REF = 24;

/** a sun direction behind the globe as seen from the camera, nudged so the terminator crosses the limb */
const ORDER_TIERS: TextureTier[] = ["4k", "8k", "16k"];

/** the personal build's sun for the day / night blend: from the left of the view and a little towards the camera, so the day / night
 *  line always runs through the visible globe (the Earth turns under it, so a country passes from day into night on screen) */
export function stageSun(cam: [number, number, number]): [number, number, number] {
  const l = Math.hypot(cam[0], cam[1], cam[2]) || 1;
  const c: [number, number, number] = [cam[0] / l, cam[1] / l, cam[2] / l];
  // right = forward × up, with forward = −c and up = (0, 1, 0)
  let r: [number, number, number] = [c[2], 0, -c[0]];
  const rl = Math.hypot(r[0], r[1], r[2]) || 1;
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  // behind the globe, at the left (level with its upper half, clear of the title): the glare sits right there and the light comes from the same place
  const v: [number, number, number] = [-0.78 * c[0] - 0.55 * r[0], -0.78 * c[1] + 0.12, -0.78 * c[2] - 0.55 * r[2]];
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function nightSun(cam: [number, number, number]): [number, number, number] {
  const l = Math.hypot(cam[0], cam[1], cam[2]) || 1;
  const v: [number, number, number] = [-cam[0] / l + 0.38, -cam[1] / l + 0.22, -cam[2] / l];
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

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
  let effects: Effects | null = null;
  let night = false;
  const sunMode: "stage" | "real" | "night" = typeof location !== "undefined" ? ((new URLSearchParams(location.search).get("sun") as "real" | "night" | null) ?? "stage") : "stage";
  let idleSpin = true;
  let rigDist = RIG_DISTANCE;
  let focusDim = 1;
  let focusBoost = 1;
  let shownAbsNow = Date.now() / 1000; // the time the Earth is shown at (a replay shows a time that is not now)
  let idleSpeed = 1;
  let lineScale = 1;
  let portraitFit = false;
  let baseFov = 40;
  let portraitShift: number | null = null;
  let landscapeLower: number | null = null; // fraction of the height the globe is lowered on a wide screen (negative: raised)
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
  let starTex: Texture | null = null; // art:stars
  let blueSky = false; // the personal build swaps the NASA star map for a blue picture of the Milky Way
  void loadStarMap().then((t) => { // art:stars
    if (disposed || blueSky) { // art:stars
      t?.dispose(); // art:stars
      return; // art:stars
    } // art:stars
    if (t) { // art:stars
      starTex = t; // art:stars
      space.setStarMap(effects?.starMap === false ? null : t); // art:stars
    } // art:stars
  }); // art:stars
  const earthGroup = new Group();
  scene.add(earthGroup);
  const earth = createEarth();
  const planeGroup = new Group(); // the followed flight's aeroplane (Earth-fixed, child of the Earth group)
  planeGroup.visible = false;
  let planeLoaded = false;
  const tracked: Promise<unknown>[] = []; // first-look assets in flight (see whenAssetsReady)
  const track = <T,>(p: Promise<T>): Promise<T> => { tracked.push(p.catch(() => undefined)); return p; };
  const planeTest = typeof location !== "undefined" && new URLSearchParams(location.search).has("planetest");
  const PLANE_LEN = 0.05; // in Earth radii: far bigger than a real aeroplane, so it can be seen from the chase camera
  const planeSun = new DirectionalLight(0xffffff, 2.2);
  const planeAmb = new AmbientLight(0xffffff, 2.7);
  const bx = new Vector3(), by = new Vector3(), bz = new Vector3(), bm = new Matrix4();
  earthGroup.add(earth.mesh);
  earthGroup.add(planeGroup);
  scene.add(planeSun);
  scene.add(planeAmb);
  const atmosphere = createAtmosphere();
  scene.add(atmosphere.mesh);
  const glare = createSunGlare(); // art:light
  scene.add(glare.mesh); // art:light (inertial frame, not in earthGroup)
  const aurora = createAurora(); // art:aurora
  earthGroup.add(aurora.mesh); // art:aurora (Earth-fixed child, hidden by default)
  const heads = createHeads();
  earthGroup.add(heads.points);

  let disposed = false;
  let texs: EarthTextures | null = null;
  let arcs: Arcs | null = null;
  let corridors: Corridors | null = null; // art:corridors
  const planned = () => !!opts.alwaysPlanned || !(effects?.corridors ?? false); // art:corridors
  let airports: Airports | null = null;
  let model: GlobeModel | null = null;
  let pickIndex: PickIndex | null = null;
  let headInfo = { count: 0, extrapolated: 0 };
  const smoother = new HeadSmoother();
  let rig: RigState = initRig(initialYaw(earthRotationRad(Date.now() / 1000), 30));
  const idleRate = IDLE_YAW_RATE * (opts.reducedMotion ? 0.4 : 1);
  let cam: CamState = initCam();
  let timeEase: TimeEase | null = null;
  let wasFollowing = false;
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
    // a tall phone screen: widen the view so the globe (and the routes on it) fit the width instead of filling the height
    camera.fov = portraitFit && h > w ? Math.min(64, Math.max(40, (2 * Math.atan(Math.tan((20 * Math.PI) / 180) / (w / h)) * 180) / Math.PI)) : baseFov;
    // ux: the globe sits lower so the top-centre title lockup has room (picking and label projection use the same matrix)
    // portrait phones carry the whole lockup + counters above the globe: it sits lower there
    camera.setViewOffset(w, h, 0, -Math.round(h > w ? (portraitShift ?? Math.min(150, Math.max(70, h * 0.12))) : (landscapeLower === null ? Math.min(56, Math.max(24, h * 0.06)) : h * landscapeLower)), w, h);
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    space.nebula.setSize(w * pr, h * pr, 0.35 * level.tunnelScale);
    // mipmapBlur ignores resolution.scale: size its chain explicitly (mip0 is already ½ of its input)
    const k = level.bloomScale * 2;
    const bw = Math.max(1, Math.round(w * pr * k));
    const bh = Math.max(1, Math.round(h * pr * k));
    bloom.luminancePass.setSize(bw, bh);
    bloom.mipmapBlurPass.setSize(bw, bh);
    arcs?.setResolution(w * pr, h * pr, pr * lineScale);
    corridors?.setResolution(w * pr, h * pr, pr * lineScale); // art:corridors
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
    rig = stepRig(rig, dt, cam.mode === "GLOBE" && idleSpin ? idleRate * idleSpeed : 0);

    if (wasFollowing && !fol) timeEase = null; // leaving a flight: the time is at the current moment at once (no glide back)
    wasFollowing = !!fol;
    timeEase = easeAbsTime(timeEase, f.absTime, dt);
    const shownAbs = timeEase.shown;
    shownAbsNow = shownAbs;
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

    const rp = rigPosition(rig, rigDist);
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
    if (planeTest && planeLoaded) { // ?planetest: the aeroplane stands in front of the camera, nose to the right (to check the model and its light)
      const camQ = camera.quaternion;
      const worldPos = new Vector3(0, -0.04, -0.85).applyQuaternion(camQ).add(camera.position);
      planeGroup.position.copy(earthGroup.worldToLocal(worldPos));
      const worldQ = camQ.clone().multiply(new Quaternion().setFromEuler(new Euler(0.25, Math.PI / 2 + 0.5, 0)));
      planeGroup.quaternion.copy(earthGroup.quaternion).invert().multiply(worldQ);
      planeGroup.scale.setScalar(0.55);
      planeGroup.visible = true;
    }
    // close to the surface (following a flight) the glow around the globe would fill the view with white: it fades with the distance
    const camDist = camera.position.length();
    const near = Math.min(1, Math.max(0, (camDist - 1.08) / (2.4 - 1.08)));
    const fade = 0.06 + 0.94 * near * near * (3 - 2 * near);
    atmosphere.setFade(fade);
    earth.setRimFade(0.15 + 0.85 * fade);

    const sun = sunMode === "stage" ? stageSun(rp) : night ? nightSun(rp) : sunDirection(shownAbs);
    earth.setSun(sun);
    planeSun.position.set(sun[0] * 10, sun[1] * 10, sun[2] * 10);
    earth.setFlatSun(sunMode === "real" ? sunDirection(shownAbs) : sun); // the day / night blend: the staged sun (default), the real sun (?sun=real) or the old night-facing one (?sun=night)
    atmosphere.setSun(sun);
    glare.setSun(sun); // art:light
    aurora.setSun(sun); // art:aurora
    aurora.setTime(rel(f.nowSec)); // art:aurora
    earth.setCloudDrift(shownAbs * 1.5e-6);

    if (arcs) {
      arcs.uniforms.uCur.value = f.cur;
      arcs.uniforms.uHighlight.value = f.highlight;
      arcs.uniforms.uGain.value = focusDim;
    }
    if (corridors) { // art:corridors
      corridors.uniforms.uTime.value = rel(f.nowSec); // art:corridors
      corridors.uniforms.uBase.value = focusDim;
      corridors.update(dt); // art:sound
      const fl = f.follow ? model?.flights[f.follow.flight] : undefined; // art:corridors
      corridors.uniforms.uHighlight.value = fl ? corridors.indexOf(fl.from, fl.to) : -1; // art:corridors
    } // art:corridors
    if (model) headInfo = heads.update(model, f.cur, rel(f.nowSec), f.highlight, smoother);
    // the followed flight's aeroplane: at the head of the flight, nose along its track, local up as its up
    let planeHidden = -1;
    if (fol && planeLoaded) {
      const hd = headingFor(posAt(fol.flight), fol.u);
      let hp: Vec3 | null = null;
      const hdat = heads.data;
      for (let i = 0; i < hdat.count; i++) if (hdat.flight[i] === fol.flight) { hp = [hdat.pos[i * 3], hdat.pos[i * 3 + 1], hdat.pos[i * 3 + 2]]; break; }
      if (hd && hp) {
        bz.set(hd.tan[0], hd.tan[1], hd.tan[2]);
        by.set(hd.up[0], hd.up[1], hd.up[2]);
        bx.crossVectors(by, bz).normalize();
        bz.crossVectors(bx, by).normalize();
        bm.makeBasis(bx, by, bz);
        planeGroup.quaternion.setFromRotationMatrix(bm);
        planeGroup.position.set(hp[0], hp[1], hp[2]);
        planeGroup.scale.setScalar(PLANE_LEN);
        planeGroup.visible = true;
        planeHidden = fol.flight;
      } else if (!planeTest) planeGroup.visible = false;
    } else if (!planeTest) planeGroup.visible = false;
    heads.setHidden(planeHidden);
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

  // art:corridors — (re)build the arc / corridor overlays for the current model
  function rebuildOverlays() {
    if (arcs) {
      earthGroup.remove(arcs.mesh);
      arcs.dispose();
      arcs = null;
    }
    if (corridors) {
      earthGroup.remove(corridors.mesh);
      corridors.dispose();
      corridors = null;
    }
    if (!model) return;
    arcs = createArcs(model, { planned: planned() });
    earthGroup.add(arcs.mesh);
    if (effects?.corridors) {
      corridors = createCorridors(model, { refMax: opts.noAirports ? PERSONAL_CORRIDOR_REF : 0 });
      earthGroup.add(corridors.mesh);
    }
    if (sized) {
      const pr = renderer.getPixelRatio();
      arcs.setResolution(size.w * pr, size.h * pr, pr * lineScale);
      corridors?.setResolution(size.w * pr, size.h * pr, pr * lineScale);
    }
  }

  const world = new Vector3();
  const camWorld = new Vector3();

  return {
    setModel(m, cur, nowSec) {
      const prev = model;
      const prevHeads = prev && m ? headLatLons(prev, m.from + cur - prev.from) : null;
      if (airports) {
        earthGroup.remove(airports.points);
        airports.dispose();
        airports = null;
      }
      model = m;
      if (m) {
        rebuildOverlays(); // art:corridors
        if (!opts.noAirports) { // the personal globe draws no airport rings: the tracks meet at the hub on their own
          airports = createAirports(m);
          earthGroup.add(airports.points);
        }
        pickIndex = buildPickIndex(m, 3);
        if (prevHeads) smoother.onSwap(prevHeads, headLatLons(m, cur), rel(nowSec));
        if (sized) {
          const pr = renderer.getPixelRatio();
          airports?.setPixelRatio(pr);
        }
      } else {
        rebuildOverlays(); // art:corridors
        pickIndex = null;
        heads.points.geometry.setDrawRange(0, 0);
        headInfo = { count: 0, extrapolated: 0 };
      }
    },
    async loadTextures(onProgress) {
      // ux: progressive — the 4k set first (a few MB: the Earth and the data appear quickly), then the preferred tier in the background
      const preferred = chooseTier(detectTierInputs(renderer));
      // the illustrated pair starts loading at once, beside the classic 4k set (it used to wait for it)
      const flatWanted = newGlobeLook() && new URLSearchParams(location.search).get("map") !== "classic";
      const loadFlat = async (kind: "night" | "day", tier: string): Promise<Texture | null> => {
        try {
          const t = await new TextureLoader().loadAsync(`/textures/earth-${kind}-${tier}.jpg`);
          t.colorSpace = NoColorSpace;
          t.flipY = true;
          t.wrapS = RepeatWrapping;
          t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
          return t;
        } catch {
          return null;
        }
      };
      const flatPair = flatWanted ? track(Promise.all([loadFlat("night", "4k"), loadFlat("day", "4k")])) : null;
      const first = await loadEarthTextures(renderer, "4k", onProgress);
      if (disposed) {
        if (first) for (const tex of [first.day, first.night, first.clouds]) tex.dispose();
        return null;
      }
      texs = first;
      earth.setTextures(first);
      const flat = !!first && newGlobeLook() && new URLSearchParams(location.search).get("map") !== "classic";
      if (flat) {
        // the personal build shows two illustrated pictures of the world (night: NASA city lights; day) and blends them along the
        // terminator: the 4k pair first, then the preferred tier (8k / 16k, by the same rules as before) in the background
        const shown: { night: Texture | null; day: Texture | null } = { night: null, day: null };
        const show = (kind: "night" | "day", t: Texture | null) => {
          if (!t) return;
          if (disposed) { t.dispose(); return; }
          if (kind === "night") earth.setFlatMap(t);
          else earth.setFlatDay(t);
          shown[kind]?.dispose();
          shown[kind] = t;
        };
        void (flatPair ?? Promise.resolve([null, null] as (Texture | null)[])).then(async ([n, d]) => {
          show("night", n);
          show("day", d);
          if (preferred !== "4k") { // a failed load keeps the 4k picture
            show("night", await loadFlat("night", preferred));
            show("day", await loadFlat("day", preferred));
          }
        });
      }
      if (first && preferred !== "4k" && !flat) {
        void loadEarthTextures(renderer, preferred, () => {}).then((hi) => {
          if (!hi) return;
          if (disposed || hi.tier === "4k") {
            for (const tex of [hi.day, hi.night, hi.clouds]) tex.dispose();
            return;
          }
          const old = texs;
          texs = hi;
          earth.setTextures(hi);
          if (old) for (const tex of [old.day, old.night, old.clouds]) tex.dispose();
        });
      }
      return first ? first.tier : null;
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
    setPortraitShift(px) {
      portraitShift = px;
      resize();
    },
    setLandscapeLower(frac) {
      landscapeLower = frac;
      resize();
    },
    setBaseFov(deg) {
      baseFov = deg;
      resize();
    },
    setPortraitFit(on) {
      portraitFit = on;
      resize();
    },
    setSpaceDim(k, nebula = true) {
      space.setDim(k, nebula);
    },
    setEffects(e) {
      const prev = effects; // art:corridors
      effects = e; // art:core
      earth.setLight({ cloudShadow: e.cloudShadow }); // art:light
      glare.setVisible(e.glare); // art:light
      aurora.setVisible(e.aurora); // art:aurora
      space.setStarMap(e.starMap ? starTex : null); // art:stars
      if (model && prev?.corridors !== e.corridors) rebuildOverlays(); // art:corridors
    },
    setNight(on) {
      night = on;
    },
    setAtmosphereBoost(k) {
      atmosphere.setBoost(k);
    },
    setPlaneModel(url) {
      if (!url) { planeLoaded = false; planeGroup.clear(); return; }
      if (planeLoaded) return;
      new GLTFLoader().load(url, (gltf) => {
        if (disposed) return;
        // the model is used as it comes (its own textures); it is centred, scaled to a length of 1 and its nose already points along +Z
        const box = new Box3().setFromObject(gltf.scene);
        const size = box.getSize(new Vector3());
        const centre = box.getCenter(new Vector3());
        const k = 1 / Math.max(1e-6, size.z);
        gltf.scene.scale.setScalar(k);
        gltf.scene.position.set(-centre.x * k, -centre.y * k, -centre.z * k);
        gltf.scene.traverse((o) => {
          const m = o as Mesh;
          if (!m.isMesh) return;
          m.frustumCulled = false;
          const old = m.material as MeshStandardMaterial;
          if (old.map) old.map.colorSpace = NoColorSpace; // the pictures are used as drawn, like the Earth pictures
          m.material = new MeshLambertMaterial({ map: old.map ?? null, color: old.color, side: DoubleSide, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest });
        });
        planeGroup.clear();
        planeGroup.add(gltf.scene);
        planeLoaded = true;
      }, undefined, () => { /* without the model the dot stays */ });
    },
    async whenAssetsReady() {
      for (let n = -1; n !== tracked.length; ) { // assets requested while waiting are waited for too
        n = tracked.length;
        await Promise.all(tracked);
      }
    },
    setSkyBlue(on) {
      if (!on || blueSky) return;
      blueSky = true;
      // the sky: the 4k picture first, then 8k and 16k. The sky shows only a small part of the panorama at a time, so it gets the
      // largest picture the graphics card can hold (16k where the card allows it, except on touch screens)
      const inputs = detectTierInputs(renderer);
      const capped = (t: TextureTier): TextureTier => (inputs.cap && ORDER_TIERS.indexOf(t) > ORDER_TIERS.indexOf(inputs.cap) ? inputs.cap : t);
      const best: TextureTier = inputs.coarsePointer ? "4k" : inputs.maxTextureSize >= 16384 ? "16k" : inputs.maxTextureSize >= 8192 ? "8k" : "4k";
      const target = capped(best);
      const apply = (t: Texture) => {
        starTex?.dispose();
        starTex = t;
        space.setBlueMap(true);
        space.setStarMap(effects?.starMap === false ? null : t);
      };
      void fetch("/textures/sky-stars.json").then((r) => r.json()).then((j: { uv: number[] }) => { if (!disposed) space.setGlintStars(j.uv); }).catch(() => { /* without the list nothing glints */ });
      void track(loadStarMap(undefined, "/textures/sky-4k.jpg")).then(async (t) => {
        if (disposed || !t) { t?.dispose(); return; }
        apply(t);
        for (const tier of ORDER_TIERS) {
          if (tier === "4k" || ORDER_TIERS.indexOf(tier) > ORDER_TIERS.indexOf(target)) continue;
          const hi = await loadStarMap(undefined, `/textures/sky-${tier}.jpg`);
          if (disposed || !hi) { hi?.dispose(); return; } // a failed load keeps the picture already shown
          apply(hi);
        }
      });
    },
    centerOn(lat, lon, lift = 0) {
      const pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, ((lat - lift) * Math.PI) / 180));
      rig = { yaw: initialYaw(earthRotationRad(shownAbsNow), lon), pitch, yawVel: 0, pitchVel: 0, dragging: false };
    },
    setRigDistance(d) {
      rigDist = d ?? RIG_DISTANCE;
    },
    setIdleSpin(on, speed = 1) {
      idleSpin = on;
      idleSpeed = speed;
    },
    setLineScale(k) {
      lineScale = k;
      resize();
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
    setRouteFocus(dim, boost = 1) {
      focusDim = dim;
      focusBoost = boost;
    },
    pulseRoute(key) { // art:sound
      if (corridors) corridors.pulse(corridors.indexOfKey(key), focusBoost);
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
      starTex?.dispose(); // art:stars
      starTex = null; // art:stars
      window.removeEventListener("resize", resize);
      ro?.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      arcs?.dispose();
      corridors?.dispose(); // art:corridors
      airports?.dispose();
      heads.dispose();
      earth.dispose();
      atmosphere.dispose();
      glare.dispose(); // art:light
      aurora.dispose(); // art:aurora
      space.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
