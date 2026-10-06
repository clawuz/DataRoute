import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from "three";
import { sampleAt, tunnelXYZ } from "../data/mapping";
import type { Model } from "../data/model";
import { REGION_RGB } from "../data/palette";

export const HEAD_SIZE_PX = 7;
export const MAX_HEADS = 4096;

const HEAD_VERT = /* glsl */ `
uniform float uSize;
uniform float uTime;
uniform float uHighlight;
attribute vec3 aColor;
attribute float aFlight;
varying vec3 vColor;
varying float vHi;
void main() {
  vColor = aColor;
  vHi = abs(aFlight - uHighlight) < 0.5 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float pulse = 1.0 + 0.25 * sin(uTime * 3.0 + aFlight * 1.7);
  gl_PointSize = uSize * pulse * (vHi > 0.5 ? 2.2 : 1.0);
}
`;

const HEAD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vHi;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  vec3 col = mix(vColor, vec3(1.0), 0.35 + 0.4 * vHi);
  gl_FragColor = vec4(col * a * 1.4, 1.0);
}
`;

/** Writes one head per flight in the air at `cur`; returns the count. */
export function computeHeads(
  m: Model,
  cur: number,
  pos: Float32Array,
  color: Float32Array,
  flightIdx: Float32Array,
  max = MAX_HEADS,
): number {
  let n = 0;
  for (let fi = 0; fi < m.flights.length && n < max; fi++) {
    const f = m.flights[fi];
    const s = sampleAt(f, cur);
    if (!s) continue;
    tunnelXYZ(cur, s.alt, f.bearing, cur, pos, n * 3);
    const [r, g, b] = REGION_RGB[f.regionIdx];
    color[n * 3] = r;
    color[n * 3 + 1] = g;
    color[n * 3 + 2] = b;
    flightIdx[n] = fi;
    n++;
  }
  return n;
}

export interface Heads {
  points: Points;
  update(m: Model, cur: number, time: number, highlight: number): number;
  setPixelRatio(pr: number): void;
  dispose(): void;
}

export function createHeads(): Heads {
  const pos = new Float32Array(MAX_HEADS * 3);
  const color = new Float32Array(MAX_HEADS * 3);
  const flightIdx = new Float32Array(MAX_HEADS);
  const geometry = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  const colAttr = new BufferAttribute(color, 3).setUsage(DynamicDrawUsage);
  const idxAttr = new BufferAttribute(flightIdx, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aColor", colAttr);
  geometry.setAttribute("aFlight", idxAttr);
  geometry.setDrawRange(0, 0);
  const uniforms = { uSize: { value: HEAD_SIZE_PX }, uTime: { value: 0 }, uHighlight: { value: -1 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: HEAD_VERT,
    fragmentShader: HEAD_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(m, cur, time, highlight) {
      const n = computeHeads(m, cur, pos, color, flightIdx);
      geometry.setDrawRange(0, n);
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      idxAttr.needsUpdate = true;
      uniforms.uTime.value = time;
      uniforms.uHighlight.value = highlight;
      return n;
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
