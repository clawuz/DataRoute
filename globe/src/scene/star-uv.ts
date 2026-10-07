export function starUV(dir: [number, number, number]): { u: number; v: number } {
  const [x, y, z] = dir;
  const l = Math.hypot(x, y, z) || 1;
  const a = Math.atan2(x, z); // right ascension from +z toward +x
  let u = 0.5 - a / (2 * Math.PI); // NASA map: 0 h at the centre, RA increasing to the left
  u -= Math.floor(u);
  return { u, v: (Math.asin(Math.max(-1, Math.min(1, y / l))) + Math.PI / 2) / Math.PI };
}
