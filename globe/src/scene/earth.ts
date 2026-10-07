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
uniform float uNightPow;
uniform float uGamma;
uniform float uCloudShadow; // art:light
varying vec3 vObj;
varying vec3 vWorldN;
varying vec3 vWorldPos;
#define PI 3.14159265359

vec2 sphereUV(vec3 p) {
  vec3 d = normalize(p);
  float lon = (abs(d.x) + abs(d.z) < 1e-6) ? 0.0 : atan(d.x, d.z); // atan(0, 0) is undefined at the exact poles
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
  // u wraps 1 -> 0 at the antimeridian; take the derivatives from whichever of u / u+0.5 is continuous there,
  // otherwise the 2x2 quad across the seam samples the smallest mip and draws a hairline.
  vec2 uvB = vec2(fract(uv.x + 0.5), uv.y);
  vec2 dxA = dFdx(uv), dyA = dFdy(uv), dxB = dFdx(uvB), dyB = dFdy(uvB);
  bool useB = max(abs(dxA.x), abs(dyA.x)) > max(abs(dxB.x), abs(dyB.x));
  vec2 gx = useB ? dxB : dxA;
  vec2 gy = useB ? dyB : dyA;
  float ndl = dot(N, uSunDir);
  float dayAmt = smoothstep(-0.10, 0.22, ndl);

  vec3 dayCol = uHasTex > 0.5 ? textureGrad(uDay, uv, gx, gy).rgb : vec3(0.10, 0.22, 0.45);
  float cloud = uHasTex > 0.5 ? textureGrad(uClouds, vec2(uv.x + uCloudDrift, uv.y), gx, gy).r : 0.0;
  if (uCloudShadow > 0.5 && uHasTex > 0.5) { // art:light
    vec3 eastW = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-6, 0.0, 0.0)); // art:light
    vec3 northW = cross(N, eastW); // art:light
    vec3 sunT = uSunDir - N * dot(N, uSunDir); // art:light
    float coslat = max(sqrt(max(0.0, 1.0 - N.y * N.y)), 0.05); // art:light
    vec2 sh = vec2(dot(sunT, eastW) / coslat / (2.0 * PI), dot(sunT, northW) / PI) * 0.015; // art:light
    float shadow = textureGrad(uClouds, vec2(uv.x + uCloudDrift + sh.x, uv.y + sh.y), gx, gy).r; // art:light
    dayCol *= 1.0 - 0.35 * shadow * dayAmt * (1.0 - cloud); // art:light
  } // art:light
  float ocean = clamp((dayCol.b - max(dayCol.r, dayCol.g)) * 6.0, 0.0, 1.0);

  vec3 albedo = mix(dayCol, vec3(1.0), cloud * 0.6);
  float diffuse = pow(clamp(ndl, 0.0, 1.0), 0.85) * 1.15;
  vec3 col = albedo * (0.015 + diffuse);

  vec3 R = reflect(-uSunDir, N);
  col += vec3(1.0, 0.97, 0.9) * pow(max(dot(R, V), 0.0), 36.0) * ocean * (1.0 - cloud) * 0.45 * dayAmt;

  vec3 night = uHasTex > 0.5 ? pow(textureGrad(uNight, uv, gx, gy).rgb, vec3(uNightPow)) : vec3(0.0);
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
  uNightPow: { value: number };
  uGamma: { value: number };
  uCloudShadow: { value: number }; // art:light
}

export interface Earth {
  mesh: Mesh;
  uniforms: EarthUniforms;
  setTextures(t: EarthTextures | null): void;
  setSun(dir: [number, number, number]): void;
  setCloudDrift(x: number): void;
  setLight(e: { cloudShadow: boolean }): void; // art:light
  dispose(): void;
}

/** Night-map contrast: the 2012 16K map carries a brighter blue land/ocean background than the 2016 8K one, so it needs a steeper curve to keep only the city lights. */
export const NIGHT_POW_DEFAULT = 1.7;
export const NIGHT_POW_16K = 2.8;

export function createEarth(): Earth {
  const uniforms: EarthUniforms = {
    uDay: { value: null },
    uNight: { value: null },
    uClouds: { value: null },
    uHasTex: { value: 0 },
    uSunDir: { value: new Vector3(1, 0, 0) },
    uCloudDrift: { value: 0 },
    uExposure: { value: 1.5 },
    uNightPow: { value: NIGHT_POW_DEFAULT },
    uGamma: { value: 1 / 2.4 },
    uCloudShadow: { value: 0 }, // art:light
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
      uniforms.uNightPow.value = t?.tier === "16k" ? NIGHT_POW_16K : NIGHT_POW_DEFAULT;
    },
    setSun(dir) {
      uniforms.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
    },
    setCloudDrift(x) {
      uniforms.uCloudDrift.value = ((x % 1) + 1) % 1;
    },
    setLight(e) { // art:light
      uniforms.uCloudShadow.value = e.cloudShadow ? 1 : 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
