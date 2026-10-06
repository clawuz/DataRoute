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
import { DEPTH, WINDOW } from "../data/mapping";
import type { Model } from "../data/model";
import { REGION_RGB } from "../data/palette";

export const RIBBON_WIDTH_PX = 1.4;

const RIBBON_VERT = /* glsl */ `
uniform float uCur;
uniform float uWindow;
uniform float uDepth;
uniform float uWidth;
uniform vec2 uRes;
uniform vec3 uColors[7];
uniform float uHighlight;
attribute vec2 aCorner; // x: side (-1 | 1), y: end (0 = A, 1 = B)
attribute vec2 aA;      // segment start: tRel, alt100
attribute vec2 aB;      // segment end:   tRel, alt100
attribute vec4 aFlight; // bearing, regionIdx, end, flightIdx
varying vec3 vColor;
varying float vAlpha;

float radiusFor(float alt) { return 1.0 - clamp(alt / 410.0, 0.0, 1.0) * 0.7; }
vec3 tunnelPos(vec2 s, float bearing) {
  float r = radiusFor(s.y);
  float a = radians(bearing);
  return vec3(r * sin(a), r * cos(a), -((uCur - s.x) / uWindow) * uDepth);
}

void main() {
  if (aA.x > uCur) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vAlpha = 0.0;
    vColor = vec3(0.0);
    return;
  }
  vec2 b = aB;
  if (aB.x > uCur) {
    float k = clamp((uCur - aA.x) / max(aB.x - aA.x, 1e-3), 0.0, 1.0);
    b = vec2(uCur, mix(aA.y, aB.y, k));
  }
  vec4 cA = projectionMatrix * modelViewMatrix * vec4(tunnelPos(aA, aFlight.x), 1.0);
  vec4 cB = projectionMatrix * modelViewMatrix * vec4(tunnelPos(b, aFlight.x), 1.0);
  vec2 sA = cA.xy / cA.w * uRes;
  vec2 sB = cB.xy / cB.w * uRes;
  vec2 dir = sB - sA;
  dir = length(dir) < 1e-4 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 n = vec2(-dir.y, dir.x);
  bool live = aFlight.z >= uCur;
  bool hi = abs(aFlight.w - uHighlight) < 0.5;
  float w = uWidth * (hi ? 2.4 : (live ? 1.5 : 1.0));
  vec4 c = mix(cA, cB, aCorner.y);
  c.xy += n * aCorner.x * w / uRes * c.w;
  gl_Position = c;
  float t = mix(aA.x, b.x, aCorner.y);
  float age = clamp((uCur - t) / uWindow, 0.0, 1.0);
  vAlpha = exp(-age * 2.2) * (hi ? 1.0 : (live ? 0.9 : 0.5));
  vec3 col = uColors[int(aFlight.y + 0.5)];
  vColor = hi ? mix(col, vec3(1.0), 0.4) : col;
}
`;

const RIBBON_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.001) discard;
  gl_FragColor = vec4(vColor * vAlpha, 1.0);
}
`;

export interface SegmentBuffers {
  a: Float32Array;
  b: Float32Array;
  flight: Float32Array;
  count: number;
}

export function buildSegments(m: Model): SegmentBuffers {
  const a = new Float32Array(m.segments * 2);
  const b = new Float32Array(m.segments * 2);
  const flight = new Float32Array(m.segments * 4);
  let k = 0;
  m.flights.forEach((f, fi) => {
    for (let i = 0; i + 1 < f.t.length; i++) {
      a[k * 2] = f.t[i];
      a[k * 2 + 1] = f.alt[i];
      b[k * 2] = f.t[i + 1];
      b[k * 2 + 1] = f.alt[i + 1];
      flight[k * 4] = f.bearing;
      flight[k * 4 + 1] = f.regionIdx;
      flight[k * 4 + 2] = f.end;
      flight[k * 4 + 3] = fi;
      k++;
    }
  });
  return { a, b, flight, count: k };
}

export interface Ribbons {
  mesh: Mesh;
  uniforms: {
    uCur: { value: number };
    uHighlight: { value: number };
    uWidth: { value: number };
    uRes: { value: Vector2 };
    uWindow: { value: number };
    uDepth: { value: number };
    uColors: { value: Vector3[] };
  };
  setResolution(w: number, h: number, pixelRatio: number): void;
  dispose(): void;
}

export function createRibbons(m: Model): Ribbons {
  const seg = buildSegments(m);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute("aCorner", new Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2));
  geometry.setAttribute("aA", new InstancedBufferAttribute(seg.a, 2));
  geometry.setAttribute("aB", new InstancedBufferAttribute(seg.b, 2));
  geometry.setAttribute("aFlight", new InstancedBufferAttribute(seg.flight, 4));
  geometry.instanceCount = seg.count;

  const uniforms = {
    uCur: { value: 0 },
    uHighlight: { value: -1 },
    uWidth: { value: RIBBON_WIDTH_PX },
    uRes: { value: new Vector2(1, 1) },
    uWindow: { value: WINDOW },
    uDepth: { value: DEPTH },
    uColors: { value: REGION_RGB.map(([r, g, b]) => new Vector3(r, g, b)) },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    setResolution(w, h, pixelRatio) {
      uniforms.uRes.value.set(w, h);
      uniforms.uWidth.value = RIBBON_WIDTH_PX * pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
