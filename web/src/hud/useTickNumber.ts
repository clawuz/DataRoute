import { useEffect, useRef, useState } from "react";

const DURATION_MS = 600;

/** Eases the displayed number towards `target`; jumps immediately when `animate` is false. */
export function useTickNumber(target: number, animate: boolean): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    if (!animate) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / DURATION_MS));
      const value = from + (target - from) * (1 - (1 - k) ** 3);
      fromRef.current = value;
      setShown(value);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);

  return animate ? shown : target;
}
