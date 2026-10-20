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
uniform float uFade; // 1 far away, small when the camera is close to the surface (the glow would fill the view)
uniform float uWhite; // how much the inner part of the glow turns white
uniform float uFloor; // a minimum for the sun-side factor: the rim glows all the way round
varying vec3 vN;
varying vec3 vWN;
void main() {
  float rim = clamp(-dot(normalize(vN), vec3(0.0, 0.0, 1.0)) * uRimScale, 0.0, 1.0);
  float sunSide = clamp(dot(normalize(vWN), uSunDir) * 0.8 + 0.45, 0.0, 1.0);
  sunSide = max(sunSide, uFloor);
  float i = pow(rim, uPower) * uIntensity * sunSide * uFade;
  vec3 tint = mix(uColor, vec3(0.85, 0.93, 1.0), uWhite * smoothstep(0.45, 1.0, rim));
  gl_FragColor = vec4(tint * i, 1.0);
}
`;

export interface Atmosphere {
  mesh: Mesh;
  setSun(dir: [number, number, number]): void;
  /** multiplies the strength of the glow (1 = as is) */
  setBoost(k: number): void;
  /** 0..1: how much of the glow shows (the camera close to the surface turns it down) */
  setFade(f: number): void;
  dispose(): void;
}

export function createAtmosphere(): Atmosphere {
  const uniforms = {
    uSunDir: { value: new Vector3(1, 0, 0) },
    uColor: { value: new Color(0.22, 0.5, 1.0) },
    uIntensity: { value: 1.2 },
    uPower: { value: 2.6 },
    uRimScale: { value: 3.4 },
    uFloor: { value: 0 },
    uWhite: { value: 0 },
    uFade: { value: 1 },
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
    setFade(f) {
      uniforms.uFade.value = f;
    },
    setBoost(k) {
      uniforms.uIntensity.value = 1.2 * k;
      const strong = k > 1.5; // the personal build: a wider glow, white-blue near the limb, all the way round
      uniforms.uFloor.value = strong ? 0.8 : 0;
      uniforms.uWhite.value = strong ? 0.75 : 0;
      uniforms.uPower.value = strong ? 2.9 : 2.6;
      uniforms.uRimScale.value = strong ? 1.9 : 3.4; // a gentle slope instead of a flat band: the same strength at the limb, reaching further out
      mesh.scale.setScalar(strong ? 1.27 : 1); // a soft halo that hugs the globe and fades outwards
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
