import {
  AdditiveBlending,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import { REGION_RGB } from "@web/data/palette";
import { ALT_TONE_GLSL } from "./alt-tone";
import { plannedArc } from "../geo3d/great";
import { resampleRun } from "../geo3d/resample";
import { R_EARTH_KM, altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";

export const ARC_BASE_LIFT = 0.002;
export const MAX_RUN_POINTS = 96;
export const PLANNED_POINTS = 48;
export const BREAK_SEC = 600;
export const ARC_WIDTH_PX = 1.9;
/** Cruise altitude (100 ft) of the planned-route tone profile. */
export const PLANNED_CRUISE100 = 370;

/** True when the sample pair (i, i+1) is a coverage gap and must not be drawn as observed track. */
export function isBreak(f: GlobeFlight, i: number): boolean {
  if (f.t[i + 1] - f.t[i] > BREAK_SEC) return true;
  return f.gaps.some(([g0, g1]) => Math.abs(f.t[i] - g0) <= 1 && Math.abs(f.t[i + 1] - g1) <= 1);
}

export interface ArcBuffers {
  a: Float32Array;
  b: Float32Array;
  t: Float32Array;
  info: Float32Array;
  s: Float32Array;
  alt: Float32Array;
  count: number;
}

export function buildArcBuffers(m: GlobeModel, opts: { planned?: boolean } = {}): ArcBuffers {
  const a: number[] = [];
  const b: number[] = [];
  const t: number[] = [];
  const info: number[] = [];
  const s: number[] = [];
  const alt: number[] = [];
  let count = 0;
  const push = (pa: number[], pb: number[], tA: number, tB: number, region: number, kind: number, fi: number, sA: number, sB: number, altA: number, altB: number) => {
    a.push(pa[0], pa[1], pa[2]);
    b.push(pb[0], pb[1], pb[2]);
    t.push(tA, tB);
    info.push(region, kind, fi, 0);
    s.push(sA, sB);
    alt.push(altA, altB);
    count++;
  };

  m.flights.forEach((f, fi) => {
    const n = f.t.length;
    // observed runs, split at coverage gaps
    let i0 = 0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      if (last || isBreak(f, i)) {
        if (i > i0) {
          const pts = resampleRun(f.t, f.alt, f.lat, f.lon, i0, i, MAX_RUN_POINTS);
          for (let k = 0; k + 1 < pts.length; k++) {
            const p = pts[k];
            const q = pts[k + 1];
            push(
              latLonToVec3(p.lat, p.lon, altitudeRadius(p.alt100) + ARC_BASE_LIFT),
              latLonToVec3(q.lat, q.lon, altitudeRadius(q.alt100) + ARC_BASE_LIFT),
              p.t, q.t, f.regionIdx, 0, fi, 0, 0, p.alt100, q.alt100,
            );
          }
        }
        i0 = i + 1;
      }
    }
    // planned route (origin → destination), always available for routed flights
    const pl = f.planned;
    if (
      opts.planned !== false && // art:corridors
      pl &&
      [pl.fromLat, pl.fromLon, pl.toLat, pl.toLon, pl.distKm].every(Number.isFinite) &&
      pl.distKm >= 1
    ) {
      const { points, distKm } = plannedArc(
        { lat: pl.fromLat, lon: pl.fromLon },
        { lat: pl.toLat, lon: pl.toLon },
        PLANNED_POINTS,
      );
      for (let k = 0; k + 1 < points.length; k++) {
        const p = points[k];
        const q = points[k + 1];
        push(
          latLonToVec3(p.lat, p.lon, p.radius + ARC_BASE_LIFT),
          latLonToVec3(q.lat, q.lon, q.radius + ARC_BASE_LIFT),
          f.dep, f.end, f.regionIdx, 1, fi,
          (p.u * distKm) / R_EARTH_KM, (q.u * distKm) / R_EARTH_KM,
          PLANNED_CRUISE100 * Math.pow(Math.sin(Math.PI * p.u), 0.6),
          PLANNED_CRUISE100 * Math.pow(Math.sin(Math.PI * q.u), 0.6),
        );
      }
    }
  });

  return {
    a: Float32Array.from(a),
    b: Float32Array.from(b),
    t: Float32Array.from(t),
    info: Float32Array.from(info),
    s: Float32Array.from(s),
    alt: Float32Array.from(alt),
    count,
  };
}

const ARC_VERT = /* glsl */ `
${ALT_TONE_GLSL}
uniform float uCur;
uniform float uWindow;
uniform vec2 uRes;
uniform float uWidth;
uniform float uHighlight;
uniform vec3 uColors[7];
attribute vec2 aCorner;
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aT;
attribute vec4 aInfo;
attribute vec2 aS;
attribute vec2 aAlt;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vS;
varying float vKind;

void hide() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vColor = vec3(0.0);
  vAlpha = 0.0;
  vS = 0.0;
  vKind = 0.0;
}

void main() {
  float kind = aInfo.y;
  bool hi = abs(aInfo.z - uHighlight) < 0.5;
  vec3 base = uColors[int(aInfo.x + 0.5)];
  vec3 pa = aA;
  vec3 pb = aB;
  float alpha;
  if (kind < 0.5) {
    if (aT.x > uCur) { hide(); return; }
    float k = 1.0;
    if (aT.y > uCur) {
      k = clamp((uCur - aT.x) / max(aT.y - aT.x, 1e-3), 0.0, 1.0);
      pb = mix(aA, aB, k);
    }
    float t = mix(aT.x, mix(aT.x, aT.y, k), aCorner.y);
    float age = clamp((uCur - t) / uWindow, 0.0, 1.0);
    alpha = exp(-age * 2.6) * (hi ? 1.0 : 0.5);
  } else {
    if (aT.x > uCur) { hide(); return; }
    float after = max(uCur - aT.y, 0.0) / uWindow;
    alpha = 0.34 * exp(-after * 8.0) * (hi ? 3.0 : 1.0);
  }
  vec4 cA = projectionMatrix * modelViewMatrix * vec4(pa, 1.0);
  vec4 cB = projectionMatrix * modelViewMatrix * vec4(pb, 1.0);
  vec2 sA = cA.xy / cA.w * uRes;
  vec2 sB = cB.xy / cB.w * uRes;
  vec2 dir = sB - sA;
  dir = length(dir) < 1e-4 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 n = vec2(-dir.y, dir.x);
  float w = uWidth * (hi ? 2.2 : 1.0) * (kind < 0.5 ? 1.0 : 0.85);
  vec4 c = mix(cA, cB, aCorner.y);
  c.xy += n * aCorner.x * w / uRes * c.w;
  gl_Position = c;
  vec3 col = altTone(base, mix(aAlt.x, aAlt.y, aCorner.y));
  vColor = hi ? mix(col, vec3(1.0), 0.4) : col;
  vAlpha = alpha;
  vS = mix(aS.x, aS.y, aCorner.y);
  vEdge = aCorner.x;
  vKind = kind;
}
`;

const ARC_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vS;
varying float vKind;
void main() {
  if (vAlpha <= 0.002) discard;
  if (vKind > 0.5 && fract(vS * 90.0) > 0.55) discard;
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vEdge));
  gl_FragColor = vec4(vColor * vAlpha * edge, 1.0);
}
`;

export type ArcUniforms = {
  uCur: { value: number };
  uWindow: { value: number };
  uRes: { value: Vector2 };
  uWidth: { value: number };
  uHighlight: { value: number };
  uColors: { value: Vector3[] };
};

export interface Arcs {
  mesh: Mesh;
  uniforms: ArcUniforms;
  setResolution(w: number, h: number, pixelRatio: number): void;
  dispose(): void;
}

export function createArcs(m: GlobeModel, opts: { planned?: boolean } = {}): Arcs {
  const buf = buildArcBuffers(m, opts); // art:corridors
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute("aCorner", new Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2));
  geometry.setAttribute("aA", new InstancedBufferAttribute(buf.a, 3));
  geometry.setAttribute("aB", new InstancedBufferAttribute(buf.b, 3));
  geometry.setAttribute("aT", new InstancedBufferAttribute(buf.t, 2));
  geometry.setAttribute("aInfo", new InstancedBufferAttribute(buf.info, 4));
  geometry.setAttribute("aS", new InstancedBufferAttribute(buf.s, 2));
  geometry.setAttribute("aAlt", new InstancedBufferAttribute(buf.alt, 2));
  geometry.instanceCount = buf.count;

  const uniforms: ArcUniforms = {
    uCur: { value: 0 },
    uWindow: { value: 86400 },
    uRes: { value: new Vector2(1, 1) },
    uWidth: { value: ARC_WIDTH_PX },
    uHighlight: { value: -1 },
    uColors: { value: REGION_RGB.map(([r, g, b]) => new Vector3(r, g, b)) },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: ARC_VERT,
    fragmentShader: ARC_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    setResolution(w, h, pixelRatio) {
      uniforms.uRes.value.set(w, h);
      uniforms.uWidth.value = ARC_WIDTH_PX * pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
