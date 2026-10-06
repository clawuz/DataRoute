import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from "three";
import { REGION_RGB } from "@web/data/palette";
import { altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import { headState } from "../model/dead-reckon";
import type { GlobeModel } from "../model/globe-model";
import type { HeadSmoother } from "../model/head-smoother";
import { altTone } from "./alt-tone";
import { ARC_BASE_LIFT } from "./arcs";

export const HEAD_SIZE_PX = 8;
export const MAX_HEADS = 4096;
export const HEAD_LIFT = 0.004;

export interface HeadBuffers {
  pos: Float32Array;
  color: Float32Array;
  flight: Float32Array;
  flag: Float32Array;
}

/** Writes one head per flight that has one at relative time `cur`. Returns the counts. */
export function computeHeads(
  m: GlobeModel,
  cur: number,
  nowSec: number,
  smoother: HeadSmoother | null,
  out: HeadBuffers,
  max = MAX_HEADS,
): { count: number; extrapolated: number } {
  let n = 0;
  let extrapolated = 0;
  for (let fi = 0; fi < m.flights.length && n < max; fi++) {
    const f = m.flights[fi];
    const h = headState(f, cur);
    if (!h) continue;
    let lat = h.lat;
    let lon = h.lon;
    if (smoother) [lat, lon] = smoother.apply(f.id, lat, lon, nowSec);
    const p = latLonToVec3(lat, lon, altitudeRadius(h.alt100) + ARC_BASE_LIFT + HEAD_LIFT);
    out.pos[n * 3] = p[0];
    out.pos[n * 3 + 1] = p[1];
    out.pos[n * 3 + 2] = p[2];
    const [r, g, b] = altTone(REGION_RGB[f.regionIdx], h.alt100);
    out.color[n * 3] = r;
    out.color[n * 3 + 1] = g;
    out.color[n * 3 + 2] = b;
    out.flight[n] = fi;
    out.flag[n] = h.extrapolated ? 1 : 0;
    if (h.extrapolated) extrapolated++;
    n++;
  }
  return { count: n, extrapolated };
}

/** Current head positions of airborne flights by flight id (used to ease jumps when new data arrives). */
export function headLatLons(m: GlobeModel, cur: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const f of m.flights) {
    if (f.status !== "AIRBORNE") continue;
    const h = headState(f, cur);
    if (h) out.set(f.id, [h.lat, h.lon]);
  }
  return out;
}

const HEAD_VERT = /* glsl */ `
uniform float uSize;
uniform float uTime;
uniform float uHighlight;
attribute vec3 aColor;
attribute float aFlight;
attribute float aFlag;
varying vec3 vColor;
varying float vFlag;
varying float vHi;
void main() {
  vColor = aColor;
  vFlag = aFlag;
  vHi = abs(aFlight - uHighlight) < 0.5 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float pulse = 1.0 + 0.2 * sin(uTime * 3.0 + aFlight * 1.7);
  gl_PointSize = uSize * pulse * (vHi > 0.5 ? 2.0 : 1.0);
}
`;

const HEAD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vFlag;
varying float vHi;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float solid = 1.0 - smoothstep(0.0, 0.5, d);
  float ring = smoothstep(0.18, 0.30, d) * (1.0 - smoothstep(0.40, 0.50, d));
  float a = vFlag > 0.5 ? ring : solid;
  vec3 col = mix(vColor, vec3(1.0), 0.35 + 0.4 * vHi);
  gl_FragColor = vec4(col * a * 1.5, 1.0);
}
`;

export interface Heads {
  points: Points;
  data: HeadBuffers & { count: number };
  update(m: GlobeModel, cur: number, nowSec: number, highlight: number, smoother: HeadSmoother | null): { count: number; extrapolated: number };
  setPixelRatio(pr: number): void;
  dispose(): void;
}

export function createHeads(): Heads {
  const data = {
    pos: new Float32Array(MAX_HEADS * 3),
    color: new Float32Array(MAX_HEADS * 3),
    flight: new Float32Array(MAX_HEADS),
    flag: new Float32Array(MAX_HEADS),
    count: 0,
  };
  const geometry = new BufferGeometry();
  const attrs = {
    position: new BufferAttribute(data.pos, 3).setUsage(DynamicDrawUsage),
    aColor: new BufferAttribute(data.color, 3).setUsage(DynamicDrawUsage),
    aFlight: new BufferAttribute(data.flight, 1).setUsage(DynamicDrawUsage),
    aFlag: new BufferAttribute(data.flag, 1).setUsage(DynamicDrawUsage),
  };
  for (const [k, v] of Object.entries(attrs)) geometry.setAttribute(k, v);
  geometry.setDrawRange(0, 0);
  const uniforms = { uSize: { value: HEAD_SIZE_PX }, uTime: { value: 0 }, uHighlight: { value: -1 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: HEAD_VERT,
    fragmentShader: HEAD_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    data,
    update(m, cur, nowSec, highlight, smoother) {
      const r = computeHeads(m, cur, nowSec, smoother, data);
      data.count = r.count;
      geometry.setDrawRange(0, r.count);
      for (const a of Object.values(attrs)) a.needsUpdate = true;
      uniforms.uTime.value = nowSec % (2 * Math.PI);
      uniforms.uHighlight.value = highlight;
      return r;
    },
    setPixelRatio(pr) {
      uniforms.uSize.value = HEAD_SIZE_PX * pr;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
