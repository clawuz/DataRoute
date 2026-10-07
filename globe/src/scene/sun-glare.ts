import { AdditiveBlending, Mesh, PlaneGeometry, ShaderMaterial } from "three";

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
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float core = 1.0 / (1.0 + pow(r * 7.0, 2.0));
  float halo = exp(-r * 2.8) * 0.35;
  float ring = exp(-pow((r - 0.62) * 9.0, 2.0)) * 0.10;
  float edge = 1.0 - smoothstep(0.85, 1.0, r);
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * (core + halo + ring) * edge, 1.0);
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
    uniforms: { uSize: { value: 14 } }, vertexShader: VERT, fragmentShader: FRAG,
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
