import { useEffect, useRef, useState } from "react";
import { createGlobeEngine, hasWebGL2 } from "../scene/engine";

/**
 * The night side of the globe, alive behind the entry screens (the still photo is what shows until the textures are in
 * and wherever WebGL is not available). No routes, no airports: it is a backdrop, felt more than read.
 */
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!hasWebGL2()) return;
    const canvas = ref.current!;
    let engine: ReturnType<typeof createGlobeEngine>;
    try {
      engine = createGlobeEngine(canvas, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, noAirports: true });
    } catch {
      return;
    }
    engine.setSpaceDim(0.35, false); // a still, quiet sky behind the globe: no drifting clouds
    engine.setNight(true);
    engine.setEffects({ cloudShadow: false, glare: true, aurora: true, corridors: false, sound: false, starMap: true });
    engine.setModel(null, 0, Date.now() / 1000);
    engine.setFrameSource(() => {
      const t = Date.now() / 1000;
      return { absTime: t, cur: 0, highlight: -1, nowSec: t };
    });
    let alive = true;
    void engine
      .loadTextures(() => {})
      .then((tier) => alive && tier && setLive(true))
      .catch(() => {});
    return () => {
      alive = false;
      engine.dispose();
    };
  }, []);

  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-img" />
      <canvas ref={ref} className={`backdrop-canvas${live ? " on" : ""}`} />
      <div className="backdrop-veil" />
    </div>
  );
}
