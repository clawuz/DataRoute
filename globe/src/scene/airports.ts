import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from "three";
import { latLonToVec3 } from "../geo3d/vec";
import type { GlobeModel } from "../model/globe-model";

const HUB = "IST";

export function airportSize(count: number, maxCount: number, isHub: boolean): number {
  if (isHub) return 14;
  const k = maxCount > 0 ? Math.sqrt(Math.min(count, maxCount) / maxCount) : 0;
  return 4 + 8 * k;
}

const VERT = /* glsl */ `
uniform float uPixelRatio;
attribute float aSize;
attribute vec3 aColor;
attribute float aPulse;
varying vec3 vColor;
varying float vPulse;
uniform float uNow;
void main() {
  vColor = aColor;
  vPulse = aPulse > -1e8 ? exp(-(uNow - aPulse) * 0.9) : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (1.0 + 2.2 * vPulse);
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vPulse;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float dot_ = 1.0 - smoothstep(0.0, 0.22, d);
  float ring = smoothstep(0.30, 0.38, d) * (1.0 - smoothstep(0.44, 0.50, d)) * vPulse;
  float a = dot_ * 0.9 + ring;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

export interface Airports {
  points: Points;
  codes: string[];
  pulse(iata: string, nowSec: number): void;
  setNow(nowSec: number): void;
  setPixelRatio(pr: number): void;
  dispose(): void;
}

export function createAirports(m: GlobeModel): Airports {
  const codes = new Set<string>([HUB]);
  for (const code of m.traffic.keys()) codes.add(code);
  const list = [...codes].filter((c) => m.airports[c] || c === HUB);
  // the hub must exist even when the day file has no airports table (older files)
  const fallbackHub = { lat: 41.2613, lon: 28.742 };
  let maxCount = 0;
  for (const [code, n] of m.traffic) if (code !== HUB) maxCount = Math.max(maxCount, n);

  const pos = new Float32Array(list.length * 3);
  const size = new Float32Array(list.length);
  const color = new Float32Array(list.length * 3);
  const pulse = new Float32Array(list.length).fill(-1e9);
  list.forEach((code, i) => {
    const a = m.airports[code] ?? fallbackHub;
    const p = latLonToVec3(a.lat, a.lon, 1.003);
    pos.set(p, i * 3);
    size[i] = airportSize(m.traffic.get(code) ?? 0, maxCount, code === HUB);
    if (code === HUB) color.set([0.89, 0.04, 0.09], i * 3);
    else color.set([0.82, 0.9, 1.0], i * 3);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("aSize", new BufferAttribute(size, 1));
  geometry.setAttribute("aColor", new BufferAttribute(color, 3));
  const pulseAttr = new BufferAttribute(pulse, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute("aPulse", pulseAttr);
  const uniforms = { uPixelRatio: { value: 1 }, uNow: { value: 0 } };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    codes: list,
    pulse(iata, nowSec) {
      const i = list.indexOf(iata);
      if (i < 0) return;
      pulse[i] = nowSec;
      pulseAttr.needsUpdate = true;
    },
    setNow(nowSec) {
      uniforms.uNow.value = nowSec;
    },
    setPixelRatio(pr) {
      uniforms.uPixelRatio.value = pr;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
