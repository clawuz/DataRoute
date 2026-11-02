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
import { PALETTE_SIZE, paletteColors } from "./palette-ext";
import { ALT_TONE_GLSL } from "./alt-tone";
import { haversineKm, interpolateGreatCircle } from "@collector/geo";
import { plannedArc } from "../geo3d/great";
import { resampleRun } from "../geo3d/resample";
import { R_EARTH_KM, altitudeRadius, latLonToVec3 } from "../geo3d/vec";
import type { GlobeFlight, GlobeModel } from "../model/globe-model";

export const ARC_BASE_LIFT = 0.002;
export const MAX_RUN_POINTS = 96;
export const PLANNED_POINTS = 48;
/** points of a bridge that closes a coverage gap or the start / end of a flight's line */
export const BRIDGE_POINTS = 14;
/** a bridge at the ends of a line is drawn when the observed track stops this far (km) from the airport */
export const BRIDGE_MIN_KM = 60;
/** the speed (km/h) a bridge's time span assumes */
const BRIDGE_KMH = 800;
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

export function buildArcBuffers(m: GlobeModel, opts: { planned?: boolean; bridge?: boolean } = {}): ArcBuffers {
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

  // a bridge: the great circle between two points of a flight (an estimate, drawn like the observed line so that no line is cut or missing)
  const bridgeArc = (f: GlobeFlight, fi: number, a: { lat: number; lon: number; alt100: number; t: number }, b: { lat: number; lon: number; alt100: number; t: number }): void => {
    if (![a.lat, a.lon, b.lat, b.lon, a.t, b.t].every(Number.isFinite) || haversineKm(a.lat, a.lon, b.lat, b.lon) < 1) return;
    let prev = { lat: a.lat, lon: a.lon, alt100: a.alt100, t: a.t };
    for (let k = 1; k < BRIDGE_POINTS; k++) {
      const u = k / (BRIDGE_POINTS - 1);
      const [lat, lon] = interpolateGreatCircle(a.lat, a.lon, b.lat, b.lon, u);
      const cur = { lat, lon, alt100: a.alt100 + (b.alt100 - a.alt100) * u, t: a.t + (b.t - a.t) * u };
      push(
        latLonToVec3(prev.lat, prev.lon, altitudeRadius(prev.alt100) + ARC_BASE_LIFT),
        latLonToVec3(cur.lat, cur.lon, altitudeRadius(cur.alt100) + ARC_BASE_LIFT),
        prev.t, cur.t, f.colorIdx ?? f.regionIdx, 0, fi, 0, 0, prev.alt100, cur.alt100,
      );
      prev = cur;
    }
  };

  m.flights.forEach((f, fi) => {
    const n = f.t.length;
    if (opts.bridge !== false) {
      // 1) a coverage gap: the plane is joined from the last sample before it to the first after it
      for (let i = 0; i + 1 < n; i++) {
        if (!isBreak(f, i)) continue;
        bridgeArc(f, fi, { lat: f.lat[i], lon: f.lon[i], alt100: f.alt[i], t: f.t[i] }, { lat: f.lat[i + 1], lon: f.lon[i + 1], alt100: f.alt[i + 1], t: f.t[i + 1] });
      }
      // 2) the ends: from the origin airport to the first sample (a flight that took off before it was watched), and from the last sample to
      // the destination airport (a flight that landed after the last sample): with a known route no flight goes without its line
      const pl = f.planned;
      if (pl && n > 0 && [pl.fromLat, pl.fromLon, pl.toLat, pl.toLon].every(Number.isFinite)) {
        const km0 = haversineKm(pl.fromLat, pl.fromLon, f.lat[0], f.lon[0]);
        if (km0 > BRIDGE_MIN_KM) {
          const span = (km0 / BRIDGE_KMH) * 3600;
          bridgeArc(f, fi, { lat: pl.fromLat, lon: pl.fromLon, alt100: 0, t: f.t[0] - span }, { lat: f.lat[0], lon: f.lon[0], alt100: f.alt[0], t: f.t[0] });
        }
        const L = n - 1;
        const km1 = haversineKm(pl.toLat, pl.toLon, f.lat[L], f.lon[L]);
        if (f.status === "LANDED" && km1 > BRIDGE_MIN_KM) {
          const span = (km1 / BRIDGE_KMH) * 3600;
          bridgeArc(f, fi, { lat: f.lat[L], lon: f.lon[L], alt100: f.alt[L], t: f.t[L] }, { lat: pl.toLat, lon: pl.toLon, alt100: 0, t: f.t[L] + span });
        }
      }
    }
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
              p.t, q.t, f.colorIdx ?? f.regionIdx, 0, fi, 0, 0, p.alt100, q.alt100,
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
          f.dep, f.end, f.colorIdx ?? f.regionIdx, 1, fi,
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
uniform float uGain;
uniform float uWidthK;
uniform float uHiMix;
uniform float uHiFull;
uniform float uHighlight;
uniform vec3 uHub;
uniform vec3 uColors[${PALETTE_SIZE}];
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
  alpha *= uGain;
  // ux: a soft cap around the Istanbul hub — hundreds of additive lines would otherwise burn into one white disc
  float dh = acos(clamp(dot(normalize(pa), uHub), -1.0, 1.0));
  alpha *= mix(0.5, 1.0, smoothstep(0.02, 0.14, dh));
  vec4 cA = projectionMatrix * modelViewMatrix * vec4(pa, 1.0);
  vec4 cB = projectionMatrix * modelViewMatrix * vec4(pb, 1.0);
  vec2 sA = cA.xy / cA.w * uRes;
  vec2 sB = cB.xy / cB.w * uRes;
  vec2 dir = sB - sA;
  dir = length(dir) < 1e-4 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 n = vec2(-dir.y, dir.x);
  float w = uWidth * uWidthK * (hi ? 2.2 : 1.0) * (kind < 0.5 ? 1.0 : 0.85) * (aInfo.x < 0.5 ? 0.7 : 1.0); // domestic routes (region 0) are thinner
  vec4 c = mix(cA, cB, aCorner.y);
  c.xy += n * aCorner.x * w / uRes * c.w;
  gl_Position = c;
  vec3 col = altTone(base, mix(aAlt.x, aAlt.y, aCorner.y));
  vColor = hi ? mix(mix(col, base, uHiFull), vec3(1.0), uHiMix) : col;
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
  /** brightness and width multipliers (1 = the live globe; the personal globe draws fewer, brighter routes) */
  uGain: { value: number };
  uWidthK: { value: number };
  /** how far a highlighted line goes toward white (0.4 live) and whether it shows its full region colour (1) or the altitude tone (0) */
  uHiMix: { value: number };
  uHiFull: { value: number };
  uHighlight: { value: number };
  uHub: { value: Vector3 };
  uColors: { value: Vector3[] };
};

export interface Arcs {
  mesh: Mesh;
  uniforms: ArcUniforms;
  setResolution(w: number, h: number, pixelRatio: number): void;
  dispose(): void;
}

export function createArcs(m: GlobeModel, opts: { planned?: boolean; bridge?: boolean } = {}): Arcs {
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
    uGain: { value: 1 },
    uWidthK: { value: 1 },
    uHiMix: { value: 0.4 },
    uHiFull: { value: 0 },
    uHighlight: { value: -1 },
    uHub: { value: new Vector3(...latLonToVec3(41.2613, 28.742, 1)).normalize() },
    uColors: { value: paletteColors().map(([r, g, b]) => new Vector3(r, g, b)) },
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
