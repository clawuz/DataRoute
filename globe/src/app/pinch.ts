/** Tracks the pointers on the canvas: with two of them down, `move` returns how much the distance between them changed (px, > 0 = spread). */
export function createPinch() {
  const pts = new Map<number, { x: number; y: number }>();
  const gap = (): number => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  return {
    down(id: number, x: number, y: number): void {
      pts.set(id, { x, y });
    },
    /** null when fewer than two fingers are down (a plain drag), else the change of the gap since the last move */
    move(id: number, x: number, y: number): number | null {
      if (!pts.has(id)) return null;
      if (pts.size < 2) {
        pts.set(id, { x, y });
        return null;
      }
      const before = gap();
      pts.set(id, { x, y });
      return gap() - before;
    },
    up(id: number): void {
      pts.delete(id);
    },
    get active(): boolean {
      return pts.size >= 2;
    },
  };
}
