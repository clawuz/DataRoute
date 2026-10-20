import { AdditiveBlending, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from "three";

const DISTANCE = 30; // inside the camera far plane (50): the Earth in front hides it through the depth test

const VERT = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize; // camera-facing billboard
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  float core = 1.0 / (1.0 + pow(r * 11.0, 2.0));
  float halo = exp(-r * 3.4) * 0.30;
  float rays = pow(abs(cos(ang * 2.0 + 0.5)), 26.0) * exp(-r * 3.2) * 0.30 + pow(abs(cos(ang * 4.0 + 1.2)), 22.0) * exp(-r * 5.0) * 0.16;
  float ring = exp(-pow((r - 0.55) * 11.0, 2.0)) * 0.05;
  float edge = 1.0 - smoothstep(0.85, 1.0, r);
  vec3 col = mix(uTint, vec3(1.0), clamp(core * 1.2, 0.0, 1.0)) * (core * 1.6 + halo + rays + ring);
  gl_FragColor = vec4(col * edge * 0.62, 1.0); // a softer sun
}
`;

export interface SunGlare {
  mesh: Mesh;
  setSun(dir: [number, number, number]): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function createSunGlare(): SunGlare {
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: { uSize: { value: 8.5 }, uTint: { value: new Vector3(1.0, 0.92, 0.74) } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, blending: AdditiveBlending, depthTest: true, depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    setSun(dir) {
      const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      mesh.position.set((dir[0] / l) * DISTANCE, (dir[1] / l) * DISTANCE, (dir[2] / l) * DISTANCE);
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
