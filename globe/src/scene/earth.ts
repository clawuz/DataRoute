/*
 * Earth look (day/night blend, night lights, cloud mix, Reinhard-style tone mapping) adapted from
 * "realtime-planet-shader" by Julien Sulpis — https://github.com/jsulpis/realtime-planet-shader (GPL-3.0).
 * Re-implemented on a 3D sphere mesh so that arcs can be depth-tested and the camera can move.
 * See /NOTICE.
 */
import { Mesh, ShaderMaterial, SphereGeometry, Vector3, type Texture } from "three";
import type { EarthTextures } from "./textures";

export const EARTH_VERT = /* glsl */ `
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

export const EARTH_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform float uHasTex;
uniform vec3 uSunDir;
uniform float uCloudDrift;
uniform float uExposure;
uniform float uGamma;
varying vec3 vObj;
varying vec3 vWorldN;
varying vec3 vWorldPos;
#define PI 3.14159265359

vec2 sphereUV(vec3 p) {
  vec3 d = normalize(p);
  float lon = atan(d.x, d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  return vec2((lon + PI) / (2.0 * PI), (lat + PI * 0.5) / PI);
}

vec3 reinhard(vec3 c) {
  c *= uExposure / (1.0 + c / uExposure);
  return pow(c, vec3(uGamma));
}

void main() {
  vec3 N = normalize(vWorldN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 uv = sphereUV(vObj);
  float ndl = dot(N, uSunDir);
  float dayAmt = smoothstep(-0.10, 0.22, ndl);

  vec3 dayCol = uHasTex > 0.5 ? texture2D(uDay, uv).rgb : vec3(0.10, 0.22, 0.45);
  float cloud = uHasTex > 0.5 ? texture2D(uClouds, vec2(fract(uv.x + uCloudDrift), uv.y)).r : 0.0;
  float ocean = clamp((dayCol.b - max(dayCol.r, dayCol.g)) * 6.0, 0.0, 1.0);

  vec3 albedo = mix(dayCol, vec3(1.0), cloud * 0.6);
  float diffuse = pow(clamp(ndl, 0.0, 1.0), 0.85) * 1.15;
  vec3 col = albedo * (0.015 + diffuse);

  vec3 R = reflect(-uSunDir, N);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(R, V), 0.0), 36.0) * ocean * (1.0 - cloud) * 0.45 * dayAmt;

  vec3 night = uHasTex > 0.5 ? pow(texture2D(uNight, uv).rgb, vec3(1.7)) : vec3(0.0);
  col += night * vec3(1.0, 0.78, 0.5) * 1.7 * (1.0 - dayAmt) * (1.0 - cloud * 0.65);

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.10, 0.32, 0.95) * fres * (0.10 + 0.9 * dayAmt) * 0.9;

  gl_FragColor = vec4(reinhard(col), 1.0);
}
`;

// type alias (not interface) so it is assignable to three's `{ [uniform: string]: IUniform }`
export type EarthUniforms = {
  uDay: { value: Texture | null };
  uNight: { value: Texture | null };
  uClouds: { value: Texture | null };
  uHasTex: { value: number };
  uSunDir: { value: Vector3 };
  uCloudDrift: { value: number };
  uExposure: { value: number };
  uGamma: { value: number };
}

export interface Earth {
  mesh: Mesh;
  uniforms: EarthUniforms;
  setTextures(t: EarthTextures | null): void;
  setSun(dir: [number, number, number]): void;
  setCloudDrift(x: number): void;
  dispose(): void;
}

export function createEarth(): Earth {
  const uniforms: EarthUniforms = {
    uDay: { value: null },
    uNight: { value: null },
    uClouds: { value: null },
    uHasTex: { value: 0 },
    uSunDir: { value: new Vector3(1, 0, 0) },
    uCloudDrift: { value: 0 },
    uExposure: { value: 1.5 },
    uGamma: { value: 1 / 2.4 },
  };
  const geometry = new SphereGeometry(1, 128, 96);
  const material = new ShaderMaterial({ uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms,
    setTextures(t) {
      uniforms.uDay.value = t?.day ?? null;
      uniforms.uNight.value = t?.night ?? null;
      uniforms.uClouds.value = t?.clouds ?? null;
      uniforms.uHasTex.value = t ? 1 : 0;
    },
    setSun(dir) {
      uniforms.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
    },
    setCloudDrift(x) {
      uniforms.uCloudDrift.value = ((x % 1) + 1) % 1;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
