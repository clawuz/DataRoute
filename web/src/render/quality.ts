export interface QualityLevel {
  tunnelScale: number;
  bloomScale: number;
}

export const LEVELS: QualityLevel[] = [
  { tunnelScale: 1, bloomScale: 0.5 },
  { tunnelScale: 0.5, bloomScale: 0.5 },
  { tunnelScale: 0.5, bloomScale: 0.25 },
];

const LOW_FPS = 45;
const HIGH_FPS = 58;
const DOWN_AFTER = 5;
const UP_AFTER = 10;

export interface QualityState {
  level: number;
  low: number; // seconds spent below LOW_FPS
  high: number; // seconds spent above HIGH_FPS
}

export const initQuality = (): QualityState => ({ level: 0, low: 0, high: 0 });

export function updateQuality(s: QualityState, fps: number, dt: number): QualityState {
  let { level } = s;
  let low = fps < LOW_FPS ? s.low + dt : 0;
  let high = fps > HIGH_FPS ? s.high + dt : 0;
  if (low >= DOWN_AFTER - 1e-9 && level < LEVELS.length - 1) {
    level++;
    low = 0;
    high = 0;
  } else if (high >= UP_AFTER - 1e-9 && level > 0) {
    level--;
    low = 0;
    high = 0;
  }
  return { level, low, high };
}
