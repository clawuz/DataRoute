/**
 * The bars of the music box (the scope's piano roll) as a tile for the entry title: note bars of different lengths
 * and colours on nine rows, drawn once to a canvas. The tile is 5.2 times as wide as it is high and has no seam.
 */
const PALETTE = ["#7BD389", "#5AA9E6", "#B66BFF", "#FFD479", "#FF5CCB", "#FF3B47", "#4FD1C5", "#9AE66E"];

/** a small deterministic generator, so the tile is the same every time */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Bar {
  x: number;
  row: number;
  len: number;
  color: string;
}

export function tileBars(width = 520, rows = 9, seed = 11): Bar[] {
  const r = rng(seed);
  const out: Bar[] = [];
  for (let row = 0; row < rows; row++) {
    let x = Math.floor(r() * 40);
    for (;;) {
      const len = [22, 34, 48, 70, 100][Math.floor(r() * 5)];
      if (x + len > width - 6) break;
      if (r() < 0.62) out.push({ x, row, len, color: PALETTE[Math.floor(r() * PALETTE.length)] });
      x += len + 14 + Math.floor(r() * 56);
    }
  }
  return out;
}

/** a PNG data URL of the tile, or null where there is no canvas */
export function musicTileUrl(): string | null {
  if (typeof document === "undefined") return null;
  const W = 520;
  const H = 100;
  const k = 2;
  const c = document.createElement("canvas");
  c.width = W * k;
  c.height = H * k;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.scale(k, k);
  for (const b of tileBars(W)) {
    const y = 8 + b.row * 10 - 4;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, y, b.len, 8);
  }
  try {
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}
