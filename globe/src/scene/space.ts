import { AdditiveBlending, Matrix3, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial } from "three";
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
varying vec2 vNdc;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
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
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Space {
  stars: Mesh;
  nebula: Tunnel;
  update(camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createSpace(): Space {
  const uniforms = {
    uInvRot: { value: new Matrix3() },
    uAspect: { value: 1 },
    uTanHalf: { value: Math.tan((40 * Math.PI) / 360) },
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

  const nebula = createTunnel();
  nebula.uniforms.u_energy.value = 0.3;

  return {
    stars,
    nebula,
    update(camera) {
      uniforms.uInvRot.value.setFromMatrix4(camera.matrixWorld);
      uniforms.uAspect.value = camera.aspect;
      uniforms.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      nebula.dispose();
    },
  };
}
