export type Rgb = [number, number, number];

/** Altitude (in 100 ft units, i.e. FL) at which the tone reaches full brightness. */
export const ALT_MAX100 = 410;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Tone of a region colour at an altitude: low = darker and muted, high = brighter and slightly whiter.
 * The hue stays the region's. Mirrored by `altToneGlsl` in the arc shader.
 */
export function altTone(rgb: Rgb, alt100: number): Rgb {
  const a = clamp01((Number.isFinite(alt100) ? alt100 : 0) / ALT_MAX100);
  const s = a * a * (3 - 2 * a);
  const lum = 0.299 * rgb[0] * 0.45 + 0.587 * rgb[1] * 0.45 + 0.114 * rgb[2] * 0.45;
  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const dark = lerp(rgb[i] * 0.45, lum, 0.35);
    const bright = lerp(rgb[i], 1, 0.45);
    out[i] = clamp01(lerp(dark, bright, s));
  }
  return out;
}

/** GLSL port of `altTone`; needs no uniforms. */
export const ALT_TONE_GLSL = /* glsl */ `
vec3 altTone(vec3 rgb, float alt100) {
  float a = clamp(alt100 / ${ALT_MAX100.toFixed(1)}, 0.0, 1.0);
  float s = a * a * (3.0 - 2.0 * a);
  vec3 dark = rgb * 0.45;
  dark = mix(dark, vec3(dot(dark, vec3(0.299, 0.587, 0.114))), 0.35);
  vec3 bright = mix(rgb, vec3(1.0), 0.45);
  return clamp(mix(dark, bright, s), 0.0, 1.0);
}
`;
