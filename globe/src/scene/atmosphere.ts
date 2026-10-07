import { AdditiveBlending, BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWN;
void main() {
  vN = normalize(normalMatrix * normal);
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Back faces of a shell slightly larger than the Earth: -dot(N, view axis) is 0 at the shell's outer silhouette
// and grows towards the Earth's limb, giving a glow that fades outwards.
const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPower;
uniform float uRimScale;
uniform float uTwilight; // art:light
varying vec3 vN;
varying vec3 vWN;
void main() {
  float rim = clamp(-dot(normalize(vN), vec3(0.0, 0.0, 1.0)) * uRimScale, 0.0, 1.0);
  float sunSide = clamp(dot(normalize(vWN), uSunDir) * 0.8 + 0.45, 0.0, 1.0);
  float nd = dot(normalize(vWN), uSunDir); // art:light
  float tw = uTwilight * smoothstep(-0.18, 0.0, nd) * (1.0 - smoothstep(0.0, 0.12, nd)); // art:light
  float i = pow(rim, uPower) * uIntensity * max(sunSide, tw * 0.9); // art:light
  vec3 col = mix(uColor, vec3(1.0, 0.55, 0.35), tw * 0.7); // art:light
  gl_FragColor = vec4(col * i, 1.0);
}
`;

export interface Atmosphere {
  mesh: Mesh;
  setSun(dir: [number, number, number]): void;
  setTwilight(on: boolean): void; // art:light
  dispose(): void;
}

export function createAtmosphere(): Atmosphere {
  const uniforms = {
    uSunDir: { value: new Vector3(1, 0, 0) },
    uColor: { value: new Color(0.22, 0.5, 1.0) },
    uIntensity: { value: 1.2 },
    uPower: { value: 2.6 },
    uRimScale: { value: 3.4 },
    uTwilight: { value: 0 }, // art:light
  };
  const geometry = new SphereGeometry(1.045, 96, 64);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: BackSide,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    setSun(dir) {
      uniforms.uSunDir.value.set(dir[0], dir[1], dir[2]).normalize();
    },
    setTwilight(on) { // art:light
      uniforms.uTwilight.value = on ? 1 : 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
