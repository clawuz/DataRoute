import { BloomEffect, EffectComposer, EffectPass, RenderPass } from "postprocessing";
import { Group, LinearSRGBColorSpace, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { CAMERA_Z } from "../data/mapping";
import type { Model } from "../data/model";
import { createHeads } from "./heads";
import { collectPickPoints, pickNearest, projectToScreen, type PickPoints, type ScreenPoint } from "./picking";
import { LEVELS, initQuality, updateQuality } from "./quality";
import { createRibbons, type Ribbons } from "./ribbons";
import { createTunnel } from "./tunnel";

export interface FrameInput {
  tRel: number;
  roll: number;
  flow: number;
  tint: [number, number, number];
  highlight: number;
}

export interface EngineOptions {
  reducedMotion: boolean;
  onPerf?: (fps: number, level: number) => void;
  onError?: (msg: string) => void;
}

export interface Engine {
  setModel(m: Model | null): void;
  setFrameSource(fn: ((dt: number) => FrameInput) | null): void;
  pick(x: number, y: number, cur: number): number;
  screenOf(local: ArrayLike<number>): ScreenPoint;
  dispose(): void;
}

export const PICK_STRIDE = 3;
const IDLE_FRAME: FrameInput = { tRel: 0, roll: 0, flow: 1, tint: [1, 1, 1], highlight: -1 };

export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export function createEngine(canvas: HTMLCanvasElement, opts: EngineOptions): Engine {
  const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = LinearSRGBColorSpace; // colours are authored in display space, like the reference
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    console.error("[shader]", gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
    opts.onError?.("SHADER COMPILE ERROR — SEE CONSOLE");
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(90, 1, 0.05, 500);
  camera.position.set(0, 0, CAMERA_Z);
  const group = new Group();
  scene.add(group);
  const tunnel = createTunnel();
  scene.add(tunnel.display);
  const heads = createHeads();
  group.add(heads.points);
  let ribbons: Ribbons | null = null;
  let model: Model | null = null;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ luminanceThreshold: 0.45, luminanceSmoothing: 0.2, intensity: 1.15, mipmapBlur: true });
  composer.addPass(new EffectPass(camera, bloom));

  let quality = initQuality();
  let level = LEVELS[0];
  const size = { w: 1, h: 1 };
  let sized = false;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w < 1 || h < 1) {
      sized = false;
      return;
    }
    sized = true;
    size.w = w;
    size.h = h;
    renderer.setSize(size.w, size.h, false);
    composer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    tunnel.setSize(size.w * pr, size.h * pr, level.tunnelScale);
    bloom.resolution.scale = level.bloomScale; // must precede the explicit sizing below (fires a change event)
    // mipmapBlur ignores resolution.scale: size the luminance + mip chain explicitly (mip0 is already half its input).
    const k = level.bloomScale * 2;
    const bw = Math.max(1, Math.round(size.w * pr * k));
    const bh = Math.max(1, Math.round(size.h * pr * k));
    bloom.luminancePass.setSize(bw, bh);
    bloom.mipmapBlurPass.setSize(bw, bh);
    ribbons?.setResolution(size.w * pr, size.h * pr, pr);
    heads.setPixelRatio(pr);
  }

  let source: ((dt: number) => FrameInput) | null = null;
  let raf = 0;
  let last = performance.now();
  let clock = 0;
  let tunnelTime = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  const flowScale = opts.reducedMotion ? 0.4 : 1;

  function frame(now: number) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    const f = source ? source(dt) : IDLE_FRAME;

    tunnelTime += dt * f.flow * flowScale;
    tunnel.uniforms.u_time.value = tunnelTime;
    tunnel.uniforms.u_tint.value.set(f.tint[0], f.tint[1], f.tint[2]);
    group.rotation.z = f.roll;
    if (ribbons) {
      ribbons.uniforms.uCur.value = f.tRel;
      ribbons.uniforms.uHighlight.value = f.highlight;
    }
    if (model) heads.update(model, f.tRel, clock, f.highlight);

    if (sized) {
      tunnel.render(renderer);
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

  let pickCache: PickPoints | undefined;

  return {
    setModel(m) {
      if (ribbons) {
        group.remove(ribbons.mesh);
        ribbons.dispose();
        ribbons = null;
      }
      model = m;
      if (m) {
        ribbons = createRibbons(m);
        group.add(ribbons.mesh);
      } else {
        heads.points.geometry.setDrawRange(0, 0);
      }
      resize();
    },
    setFrameSource(fn) {
      source = fn;
    },
    pick(x, y, cur) {
      if (!model) return -1;
      pickCache = collectPickPoints(model, cur, PICK_STRIDE, pickCache);
      group.updateMatrixWorld();
      return pickNearest(pickCache, group.matrixWorld, camera, size.w, size.h, x, y);
    },
    screenOf(local) {
      group.updateMatrixWorld();
      return projectToScreen(local, group.matrixWorld, camera, size.w, size.h);
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ro?.disconnect();
      ribbons?.dispose();
      heads.dispose();
      tunnel.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
