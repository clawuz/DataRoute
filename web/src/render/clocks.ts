/** The tunnel shader is exactly periodic in t with period 4π; the head pulse sin(3t + …) repeats every 2π/3, which divides 2π. */
export const TUNNEL_PERIOD = 4 * Math.PI;
export const PULSE_PERIOD = 2 * Math.PI;

/** Advance a clock and wrap it so float32 precision never degrades on long-running kiosks. */
export function advance(value: number, delta: number, period: number): number {
  return (value + delta) % period;
}
