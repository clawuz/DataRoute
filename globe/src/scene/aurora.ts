import { AdditiveBlending, FrontSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";

export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Auroral oval weight by latitude (mirrored in the shader). */
export const auroraBand = (latDeg: number): number => {
  const a = Math.abs(latDeg);
  return smooth(58, 66, a) * (1 - smooth(76, 82, a));
};

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorldN;
varying vec3 vWorldPos;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vObj;
varying vec3 vWorldN;
varying vec3 vWorldPos;
#define PI 3.14159265359

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float sm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

void main() {
  vec3 d = normalize(vObj);
  float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float lon = atan(d.x, d.z);
  float band = sm(58.0, 66.0, abs(lat)) * (1.0 - sm(76.0, 82.0, abs(lat)));
  float night = 1.0 - sm(-0.05, 0.12, dot(normalize(vWorldN), uSunDir));
  // curtains: vertical streaks along longitude drifting slowly
  // sampled on the circle of longitudes (not raw lon) so there is no seam at the 180 meridian
  vec2 ring = normalize(d.xz + vec2(1e-5, 0.0));
  float curtain = noise(ring * 9.0 + vec2(uTime * 0.05, lat * 0.4)) * 0.6 + noise(ring * 23.0 + vec2(-uTime * 0.08, lat * 1.1)) * 0.4;
  curtain = smoothstep(0.35, 0.85, curtain);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(normalize(vWorldN), V), 0.0), 1.4); // curtains read best near the limb
  float h = clamp((abs(lat) - 60.0) / 20.0, 0.0, 1.0);
  vec3 col = mix(vec3(0.15, 1.0, 0.45), vec3(0.65, 0.3, 1.0), h);
  float i = band * night * curtain * (0.25 + 0.75 * rim) * (0.75 + 0.25 * sin(uTime * 0.7 + lon * 3.0));
  gl_FragColor = vec4(col * i * 0.9, 1.0);
}
`;

export interface Aurora {
  mesh: Mesh;
  setSun(dir: [number, number, number]): void;
  setTime(sec: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function createAurora(): Aurora {
  const uniforms = { uSunDir: { value: new Vector3(1, 0, 0) }, uTime: { value: 0 } };
  const geometry = new SphereGeometry(1.014, 96, 64);
  const material = new ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, blending: AdditiveBlending,
    side: FrontSide, depthTest: true, depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    setSun(dir) {
      uniforms.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
    },
    setTime(sec) {
      uniforms.uTime.value = sec % 10000;
    },
    setVisible(v) {
      mesh.visible = v;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
