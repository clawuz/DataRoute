import { AdditiveBlending, Matrix3, Vector4, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial, type Texture } from "three";
import { newGlobeLook } from "./look";
import { createTunnel, type Tunnel } from "@web/render/tunnel";

const STARS_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const STARS_FRAG = /* glsl */ `
precision highp float;
uniform mat3 uInvRot;
uniform float uAspect;
uniform float uTanHalf;
uniform sampler2D uStarMap; // art:stars
uniform float uHasStarMap; // art:stars
uniform float uDim;
uniform float uShift; // turns the blue picture around the sky (0..1) to bring the Milky Way behind the globe
uniform float uTime;
uniform float uBlueMap; // 1: the star map is the blue Milky Way picture, shown as it is
uniform float uSky; // 1: a deep blue sky with soft blue and red nebula clouds
varying vec2 vNdc;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i), n100 = hash31(i + vec3(1, 0, 0)), n010 = hash31(i + vec3(0, 1, 0)), n110 = hash31(i + vec3(1, 1, 0));
  float n001 = hash31(i + vec3(0, 0, 1)), n101 = hash31(i + vec3(1, 0, 1)), n011 = hash31(i + vec3(0, 1, 1)), n111 = hash31(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
vec3 skyGlow(vec3 d) {
  vec3 base = mix(vec3(0.006, 0.016, 0.06), vec3(0.016, 0.05, 0.16), 0.5 + 0.5 * d.y);
  float a = fbm(d * 2.1 + vec3(3.0, 1.0, 7.0));
  float b = fbm(d * 3.3 + vec3(11.0, 5.0, 2.0));
  vec3 blue = vec3(0.05, 0.17, 0.62) * smoothstep(0.38, 0.85, a);
  float side = 0.5 + 0.5 * dot(d, normalize(vec3(-0.8, 0.05, 0.35)));
  vec3 red = vec3(0.6, 0.04, 0.09) * smoothstep(0.5, 0.88, b) * smoothstep(0.35, 0.95, side);
  return base + blue * 0.85 + red * 0.85;
}

float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// glints on stars that are really in the picture: the app picks a star (its direction) about every three seconds; here it flares for half a second
uniform vec4 uGlint[3]; // xyz: the star's direction in the sky, w: the time it started (a negative value: unused)
vec3 sparkle(vec2 p) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float age = uTime - uGlint[k].w;
    if (uGlint[k].w < 0.0 || age < 0.0 || age > 0.7) continue;
    vec3 vv = uGlint[k].xyz * uInvRot;                   // the star seen from the camera (the transpose turns the sky into the view)
    if (vv.z > -0.05) continue;
    vec2 pos = vv.xy / (-vv.z) / uTanHalf;
    vec2 q = p - pos;
    float r2 = dot(q, q);
    float u = age / 0.7;
    float core = exp(-r2 / 0.00004);
    float halo = exp(-r2 / 0.0012) * 0.35;
    float cross = (exp(-abs(q.x) / 0.0014) * exp(-abs(q.y) / 0.05) + exp(-abs(q.y) / 0.0014) * exp(-abs(q.x) / 0.05)) * 0.6;
    float fade = pow(sin(3.14159 * u), 1.4);
    acc += vec3(0.86, 0.94, 1.0) * (core * 1.5 + halo + cross) * fade;
  }
  return acc;
}

// shooting stars: three slots, each a streak every 7 to 11 seconds that lasts about a second
vec3 meteors(vec2 p) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float period = 7.0 + float(k) * 2.3;
    float t = uTime / period + float(k) * 0.37;
    float idx = floor(t);
    float ph = fract(t);
    float life = 0.1;
    if (ph > life) continue;
    float u = ph / life;
    float sd = idx * 7.31 + float(k) * 13.7;
    vec2 start = vec2(mix(-uAspect, uAspect * 0.7, h11(sd)), 0.15 + 0.8 * h11(sd + 1.0));
    float flip = h11(sd + 2.0) > 0.5 ? 1.0 : -1.0;
    vec2 dir = normalize(vec2(flip, -0.35 - 0.3 * h11(sd + 3.0)));
    vec2 head = start + dir * u * 1.5;
    vec2 q = p - head;
    float along = dot(q, dir);
    float perp = length(q - dir * along);
    float trail = smoothstep(-0.34, 0.0, along) * step(along, 0.0);
    float line = exp(-perp * perp / 0.0000022);
    float tip = exp(-dot(q, q) / 0.00012);
    float fade = sin(3.14159 * u);
    acc += vec3(0.85, 0.93, 1.0) * (line * trail * trail + tip) * fade;
  }
  return acc;
}

vec3 starLayer(vec3 d, float scale, float threshold, float size) {
  vec3 g = d * scale;
  vec3 id = floor(g);
  vec3 f = fract(g) - 0.5;
  float h = hash31(id);
  if (h < threshold) return vec3(0.0);
  float r = length(f);
  float s = 1.0 - smoothstep(0.0, size, r);
  float bright = (h - threshold) / (1.0 - threshold);
  vec3 tint = mix(vec3(0.70, 0.82, 1.0), vec3(1.0, 0.90, 0.75), hash31(id + 7.0));
  return tint * s * s * (0.25 + 1.4 * bright);
}

void main() {
  vec3 dir = normalize(uInvRot * vec3(vNdc.x * uAspect * uTanHalf, vNdc.y * uTanHalf, -1.0));
  vec3 col = starLayer(dir, 90.0, 0.965, 0.30) + starLayer(dir, 40.0, 0.985, 0.38) * 1.4;
  if (uHasStarMap > 0.5) { // art:stars
    float a = atan(dir.x, dir.z) / 6.28318530718;
    float u = fract(0.5 - a + uShift); // NASA convention: 0 h at the centre, RA increasing to the left
    float v = (asin(clamp(dir.y, -1.0, 1.0)) + 1.57079632679) / 3.14159265359;
    // seam-safe derivatives (same trick as the Earth shader)
    vec2 uv = vec2(u, v);
    vec2 uvB = vec2(fract(u + 0.5), v);
    vec2 dxA = dFdx(uv), dyA = dFdy(uv), dxB = dFdx(uvB), dyB = dFdy(uvB);
    bool useB = max(abs(dxA.x), abs(dyA.x)) > max(abs(dxB.x), abs(dyB.x));
    vec3 map = textureGrad(uStarMap, uv, useB ? dxB : dxA, useB ? dyB : dyA).rgb;
    col = uBlueMap > 0.5 ? map * 0.95 : pow(map, vec3(1.45)) * 0.85; // darker faint speckle so the Milky Way and bright stars read (the blue picture is left as drawn)
  }
  col += skyGlow(dir) * uSky * (1.0 - uBlueMap);
  if (uSky > 0.5) col += (sparkle(vNdc * vec2(uAspect, 1.0)) + meteors(vNdc * vec2(uAspect, 1.0))) * 0.95;
  gl_FragColor = vec4(col * uDim, 1.0);
}
`;

export interface Space {
  stars: Mesh;
  nebula: Tunnel;
  setStarMap(tex: Texture | null): void; // art:stars
  /** the star map is a blue picture of the Milky Way (shown as drawn, no extra sky glow) */
  setBlueMap(on: boolean): void;
  /** the stars that may glint: pairs of (u, v) on the sky picture; without a list nothing glints */
  setGlintStars(uv: ArrayLike<number> | null): void;
  /** 1 = as is; below 1 the stars, the Milky Way and the nebula behind the globe are held back */
  setDim(k: number, nebulaOn?: boolean): void;
  update(camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createSpace(): Space {
  const uniforms = {
    uInvRot: { value: new Matrix3() },
    uAspect: { value: 1 },
    uTanHalf: { value: Math.tan((40 * Math.PI) / 360) },
    uStarMap: { value: null as Texture | null }, // art:stars
    uHasStarMap: { value: 0 }, // art:stars
    uDim: { value: 1 },
    uTime: { value: 0 },
    uGlint: { value: [new Vector4(0, 0, 1, -1), new Vector4(0, 0, 1, -1), new Vector4(0, 0, 1, -1)] },
    uBlueMap: { value: 0 },
    uShift: { value: typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("skyshift") ?? 0.25) : 0.25 },
    uSky: { value: newGlobeLook() ? 1 : 0 },
  };
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: STARS_VERT,
    fragmentShader: STARS_FRAG,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true, // sits at the far plane: the Earth (nearer) hides it
    depthWrite: false,
  });
  const stars = new Mesh(geometry, material);
  stars.frustumCulled = false;

  let glintDirs: Float32Array | null = null;
  let nextGlint = 0;
  let slot = 0;
  const nebula = createTunnel();
  nebula.uniforms.u_energy.value = 0.3;

  return {
    stars,
    nebula,
    setStarMap(tex) {
      uniforms.uStarMap.value = tex; // art:stars
      uniforms.uHasStarMap.value = tex ? 1 : 0;
    },
    setGlintStars(uv) {
      glintDirs = null;
      if (!uv || uv.length < 2) return;
      const n = Math.floor(uv.length / 2);
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { // texture (u, v) -> sky direction: the inverse of the star-map lookup above
        const ang = 2 * Math.PI * (0.5 + uniforms.uShift.value - uv[i * 2]);
        const lat = (uv[i * 2 + 1] - 0.5) * Math.PI;
        out[i * 3] = Math.cos(lat) * Math.sin(ang);
        out[i * 3 + 1] = Math.sin(lat);
        out[i * 3 + 2] = Math.cos(lat) * Math.cos(ang);
      }
      glintDirs = out;
    },
    setBlueMap(on) {
      uniforms.uBlueMap.value = on ? 1 : 0;
    },
    setDim(k, nebulaOn = true) {
      uniforms.uDim.value = k;
      nebula.uniforms.u_energy.value = 0.3 * k;
      nebula.display.visible = nebulaOn; // the drifting clouds are the only thing that moves in the sky
    },
    update(camera) {
      uniforms.uTime.value = (performance.now() / 1000) % 3600;
      uniforms.uSky.value = newGlobeLook() ? 1 : 0; // set by the app after the engine exists
      uniforms.uInvRot.value.setFromMatrix4(camera.matrixWorld);
      uniforms.uAspect.value = camera.aspect;
      uniforms.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
      const now = uniforms.uTime.value;
      if (glintDirs && uniforms.uSky.value > 0.5 && uniforms.uHasStarMap.value > 0.5 && now >= nextGlint) {
        nextGlint = now + 2.2 + Math.random() * 1.6; // about every three seconds
        const e = camera.matrixWorld.elements; // the camera's rotation (columns = its axes in the sky)
        const n = glintDirs.length / 3;
        for (let tries = 0; tries < 160; tries++) {
          const i = Math.floor(Math.random() * n);
          const x = glintDirs[i * 3], y = glintDirs[i * 3 + 1], z = glintDirs[i * 3 + 2];
          const vx = e[0] * x + e[1] * y + e[2] * z, vy = e[4] * x + e[5] * y + e[6] * z, vz = e[8] * x + e[9] * y + e[10] * z; // R^T * dir
          if (vz > -0.2) continue;
          const px = vx / -vz / uniforms.uTanHalf.value, py = vy / -vz / uniforms.uTanHalf.value; // the same (aspect-scaled) plane the shader uses
          const asp = uniforms.uAspect.value;
          if (Math.abs(px) > asp * 0.96 || Math.abs(py) > 0.94) continue;
          if (Math.hypot(px, py - 0.05) < 0.95) continue; // not behind the globe
          uniforms.uGlint.value[slot].set(x, y, z, now);
          slot = (slot + 1) % 3;
          break;
        }
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      nebula.dispose();
    },
  };
}
