export const SMOOTH_SEC = 1.5;

const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

/** After a data refresh heads jump to their newly measured positions; this eases the jump over SMOOTH_SEC. */
export class HeadSmoother {
  private offsets = new Map<string, { dLat: number; dLon: number; t0: number }>();

  onSwap(prev: ReadonlyMap<string, [number, number]>, next: ReadonlyMap<string, [number, number]>, nowSec: number): void {
    this.offsets.clear();
    for (const [id, p] of prev) {
      const n = next.get(id);
      if (!n) continue;
      const dLat = p[0] - n[0];
      const dLon = wrap180(p[1] - n[1]);
      if (Math.abs(dLat) < 1e-6 && Math.abs(dLon) < 1e-6) continue;
      this.offsets.set(id, { dLat, dLon, t0: nowSec });
    }
  }

  apply(id: string, lat: number, lon: number, nowSec: number): [number, number] {
    const o = this.offsets.get(id);
    if (!o) return [lat, lon];
    const k = (nowSec - o.t0) / SMOOTH_SEC;
    if (k >= 1) {
      this.offsets.delete(id);
      return [lat, lon];
    }
    const w = 1 - k * k * (3 - 2 * k);
    return [lat + o.dLat * w, wrap180(lon + o.dLon * w)];
  }
}
