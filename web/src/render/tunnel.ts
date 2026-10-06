import {
  GLSL3,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RawShaderMaterial,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

const TUNNEL_VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Reference "ATC" ray-march (pulkitxm/claude-directory atc-tunnel-shader), unchanged except for
// u_energy / u_tint / u_fade applied after tone mapping.
export const TUNNEL_FRAG = /* glsl */ `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform vec3 u_tint;
uniform float u_fade;
out vec4 fragColor;

float tanh1(float x){ float e = exp(2.0*x); return (e-1.0)/(e+1.0); }
vec4 tanh4(vec4 v){ return vec4(tanh1(v.x), tanh1(v.y), tanh1(v.z), tanh1(v.w)); }

void main(){
  vec3 FC = vec3(gl_FragCoord.xy, 0.0);
  vec3 r  = vec3(u_res, max(u_res.x, u_res.y));
  float t = u_time;

  vec4 o = vec4(0.0);
  vec3 p = vec3(0.0);
  vec3 v = vec3(1.0, 2.0, 6.0);
  float i = 0.0, z = 1.0, d = 1.0, f = 1.0;

  for ( ; i++ < 5e1;
        o.rgb += (cos((p.x + z + v) * 0.1) + 1.0) / d / f / z )
  {
    p = z * normalize(FC * 2.0 - r.xyy);

    vec4 m = cos((p + sin(p)).y * 0.4 + vec4(0.0, 33.0, 11.0, 0.0));
    p.xz = mat2(m) * p.xz;

    p.x += t / 0.2;

    z += ( d = length(cos(p / v) * v + v.zxx / 7.0) /
           ( f = 2.0 + d / exp(p.y * 0.2) ) );
  }

  o = tanh4(0.2 * o);
  vec3 col = o.rgb * mix(vec3(1.0), u_tint * 1.6, 0.25) * u_energy * u_fade;
  fragColor = vec4(col, 1.0);
}
`;

const DISPLAY_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const DISPLAY_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(map, vUv); }
`;

export interface Tunnel {
  uniforms: {
    u_res: { value: Vector2 };
    u_time: { value: number };
    u_energy: { value: number };
    u_tint: { value: Vector3 };
    u_fade: { value: number };
  };
  display: Mesh;
  setSize(w: number, h: number, scale: number): void;
  render(r: WebGLRenderer): void;
  dispose(): void;
}

export function createTunnel(): Tunnel {
  const uniforms = {
    u_res: { value: new Vector2(1, 1) },
    u_time: { value: 0 },
    u_energy: { value: 0.55 },
    u_tint: { value: new Vector3(1, 1, 1) },
    u_fade: { value: 1 },
  };
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new PlaneGeometry(2, 2);
  const quadMat = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: TUNNEL_VERT,
    fragmentShader: TUNNEL_FRAG,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(quadGeo, quadMat);
  quad.frustumCulled = false;
  scene.add(quad);

  const target = new WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  const displayGeo = new PlaneGeometry(2, 2);
  const displayMat = new ShaderMaterial({
    uniforms: { map: { value: target.texture } },
    vertexShader: DISPLAY_VERT,
    fragmentShader: DISPLAY_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const display = new Mesh(displayGeo, displayMat);
  display.frustumCulled = false;
  display.renderOrder = -1;

  return {
    uniforms,
    display,
    setSize(w, h, scale) {
      const rw = Math.max(1, Math.floor(w * scale));
      const rh = Math.max(1, Math.floor(h * scale));
      target.setSize(rw, rh);
      uniforms.u_res.value.set(rw, rh);
    },
    render(r) {
      const prev = r.getRenderTarget();
      r.setRenderTarget(target);
      r.render(scene, camera);
      r.setRenderTarget(prev);
    },
    dispose() {
      quadGeo.dispose();
      quadMat.dispose();
      displayGeo.dispose();
      displayMat.dispose();
      target.dispose();
    },
  };
}
