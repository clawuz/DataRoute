import {
  AdditiveBlending, DoubleSide, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, ShaderMaterial, Vector2,
} from "three";
import { plannedArc } from "../geo3d/great";
import { latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";
import { ARC_BASE_LIFT } from "./arcs";

export const CORRIDOR_POINTS = 64;

export interface Corridor {
  key: string;
  a: string;
  b: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distKm: number;
  count: number;
  regionIdx: number;
}

export const corridorKey = (from: string, to: string) => (from < to ? `${from}-${to}` : `${to}-${from}`);

/** One corridor per undirected airport pair among routed flights (planned route known), sorted by traffic. */
export function buildCorridors(m: GlobeModel): Corridor[] {
  const map = new Map<string, Corridor>();
  for (const f of m.flights) {
    const pl = f.planned;
    if (!pl || !f.from || !f.to || f.from === f.to) continue;
    if (![pl.fromLat, pl.fromLon, pl.toLat, pl.toLon, pl.distKm].every(Number.isFinite) || pl.distKm < 1) continue;
    const key = corridorKey(f.from, f.to);
    const cur = map.get(key);
    if (cur) {
      cur.count++;
      continue;
    }
    const forward = f.from < f.to; // a = smaller code
    map.set(key, {
      key,
      a: forward ? f.from : f.to,
      b: forward ? f.to : f.from,
      fromLat: forward ? pl.fromLat : pl.toLat,
      fromLon: forward ? pl.fromLon : pl.toLon,
      toLat: forward ? pl.toLat : pl.fromLat,
      toLon: forward ? pl.toLon : pl.fromLon,
      distKm: pl.distKm,
      count: 1,
      regionIdx: f.regionIdx,
    });
  }
  return [...map.values()].sort((x, y) => y.count - x.count || x.key.localeCompare(y.key));
}

export const corridorWeight = (count: number, max: number): number => (max > 0 ? Math.sqrt(Math.min(count, max) / max) : 0);

export interface CorridorStyle {
  widthPx: number;
  alpha: number;
  rgb: [number, number, number];
}

const RAMP: [number, [number, number, number]][] = [
  [0, [0.25, 0.45, 1.0]], // sparse: cool blue
  [0.5, [1.0, 0.55, 0.2]], // busy: orange
  [1, [1.0, 0.95, 0.85]], // busiest: near white
];

function ramp(w: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, w));
  for (let i = 1; i < RAMP.length; i++) {
    if (x <= RAMP[i][0]) {
      const [x0, c0] = RAMP[i - 1];
      const [x1, c1] = RAMP[i];
      const t = (x - x0) / (x1 - x0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export function corridorStyle(w: number): CorridorStyle {
  const x = Math.min(1, Math.max(0, w));
  return { widthPx: 0.9 + 3.6 * x, alpha: 0.1 + 0.35 * x, rgb: ramp(x) };
}

export interface CorridorBuffers {
  a: Float32Array;
  b: Float32Array;
  /** arc fraction at the segment start and end (for width taper and the shimmer wave) */
  u: Float32Array;
  /** arc length in radians at start/end */
  s: Float32Array;
  color: Float32Array;
  /** width px, alpha, weight, corridor index */
  misc: Float32Array;
  count: number;
}

const R_KM = 6371.0088;

export function buildCorridorBuffers(cs: Corridor[]): CorridorBuffers {
  const n = (CORRIDOR_POINTS - 1) * cs.length;
  const out: CorridorBuffers = {
    a: new Float32Array(n * 3), b: new Float32Array(n * 3), u: new Float32Array(n * 2), s: new Float32Array(n * 2),
    color: new Float32Array(n * 3), misc: new Float32Array(n * 4), count: n,
  };
  const max = cs.length ? cs[0].count : 0;
  let i = 0;
  cs.forEach((c, ci) => {
    const w = corridorWeight(c.count, max);
    const st = corridorStyle(w);
    const { points } = plannedArc({ lat: c.fromLat, lon: c.fromLon }, { lat: c.toLat, lon: c.toLon }, CORRIDOR_POINTS);
    for (let k = 0; k + 1 < points.length; k++, i++) {
      const p = points[k];
      const q = points[k + 1];
      out.a.set(latLonToVec3(p.lat, p.lon, p.radius + ARC_BASE_LIFT), i * 3);
      out.b.set(latLonToVec3(q.lat, q.lon, q.radius + ARC_BASE_LIFT), i * 3);
      out.u[i * 2] = p.u;
      out.u[i * 2 + 1] = q.u;
      out.s[i * 2] = (p.u * c.distKm) / R_KM;
      out.s[i * 2 + 1] = (q.u * c.distKm) / R_KM;
      out.color.set(st.rgb, i * 3);
      out.misc[i * 4] = st.widthPx;
      out.misc[i * 4 + 1] = st.alpha;
      out.misc[i * 4 + 2] = w;
      out.misc[i * 4 + 3] = ci;
    }
  });
  return out;
}

const VERT = /* glsl */ `
uniform vec2 uRes;
uniform float uWidth;
uniform float uHighlight;
attribute vec2 aCorner;
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aU;
attribute vec2 aS;
attribute vec3 aColor;
attribute vec4 aMisc;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vS;
varying float vW;
void main() {
  bool hi = abs(aMisc.w - uHighlight) < 0.5;
  vec4 cA = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
  vec4 cB = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
  vec2 sA = cA.xy / cA.w * uRes;
  vec2 sB = cB.xy / cB.w * uRes;
  vec2 dir = sB - sA;
  dir = length(dir) < 1e-4 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 n = vec2(-dir.y, dir.x);
  float u = mix(aU.x, aU.y, aCorner.y);
  float taper = 0.55 + 0.45 * sin(3.14159265 * u); // thicker mid-route, thinner at the airports
  float w = uWidth * aMisc.x * taper * (hi ? 1.6 : 1.0);
  vec4 c = mix(cA, cB, aCorner.y);
  c.xy += n * aCorner.x * w / uRes * c.w;
  gl_Position = c;
  vColor = aColor;
  vAlpha = aMisc.y * (hi ? 2.2 : 1.0);
  vEdge = aCorner.x;
  vS = mix(aS.x, aS.y, aCorner.y);
  vW = aMisc.z;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vS;
varying float vW;
void main() {
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vEdge));
  float wave = 1.0 + 0.45 * vW * sin(vS * 28.0 - uTime * 0.9); // slow shimmer; busier corridors shimmer more
  gl_FragColor = vec4(vColor * vAlpha * edge * wave, 1.0);
}
`;

export type CorridorUniforms = {
  uRes: { value: Vector2 };
  uWidth: { value: number };
  uTime: { value: number };
  uHighlight: { value: number };
};

export interface Corridors {
  mesh: Mesh;
  corridors: Corridor[];
  uniforms: CorridorUniforms;
  indexOf(from?: string, to?: string): number;
  setResolution(w: number, h: number, pixelRatio: number): void;
  dispose(): void;
}

export function createCorridors(m: GlobeModel): Corridors {
  const corridors = buildCorridors(m);
  const buf = buildCorridorBuffers(corridors);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute("aCorner", new Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2));
  geometry.setAttribute("aA", new InstancedBufferAttribute(buf.a, 3));
  geometry.setAttribute("aB", new InstancedBufferAttribute(buf.b, 3));
  geometry.setAttribute("aU", new InstancedBufferAttribute(buf.u, 2));
  geometry.setAttribute("aS", new InstancedBufferAttribute(buf.s, 2));
  geometry.setAttribute("aColor", new InstancedBufferAttribute(buf.color, 3));
  geometry.setAttribute("aMisc", new InstancedBufferAttribute(buf.misc, 4));
  geometry.instanceCount = buf.count;
  const uniforms: CorridorUniforms = {
    uRes: { value: new Vector2(1, 1) },
    uWidth: { value: 1 },
    uTime: { value: 0 },
    uHighlight: { value: -1 },
  };
  const material = new ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: AdditiveBlending,
    side: DoubleSide, depthTest: true, depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const index = new Map(corridors.map((c, i) => [c.key, i]));
  return {
    mesh,
    corridors,
    uniforms,
    indexOf: (from, to) => (from && to ? (index.get(corridorKey(from, to)) ?? -1) : -1),
    setResolution(w, h, pixelRatio) {
      uniforms.uRes.value.set(w, h);
      uniforms.uWidth.value = pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
