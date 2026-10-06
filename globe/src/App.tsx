import { useEffect, useMemo, useRef, useState } from "react";
import { dataUrl, isFixture } from "@web/data/source";
import { ErrorScreen } from "@web/hud/Hud";
import { createStore, useStore, type Store } from "@web/hud/store";
import { createController, type GlobeController } from "./app/controller";
import { EMPTY_GLOBE_SNAPSHOT, type GlobeHudSnapshot } from "./app/hud-model";
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "./scene/engine";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => createStore<GlobeHudSnapshot>(EMPTY_GLOBE_SNAPSHOT), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasWebGL2()) {
      setError("WEBGL2 IS NOT AVAILABLE ON THIS DEVICE");
      return;
    }
    const canvas = canvasRef.current!;
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let controller: GlobeController | null = null;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, {
        reducedMotion,
        onPerf: (fps, level) => controller?.setPerf(fps, level),
        onError: (msg) => {
          setError(msg);
          if (msg.includes("RELOADING")) setTimeout(() => window.location.reload(), 1500);
        },
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    controller = createController({
      engine,
      store,
      url: dataUrl(search),
      fixture: isFixture(search),
      debug: params.get("debug") === "1",
      reducedMotion,
      nowMs: () => Date.now(),
    });
    controller.setTextureState(0, "");
    void engine
      .loadTextures((p) => controller?.setTextureState(p, ""))
      .then((tier) => controller?.setTextureState(1, tier ? "" : "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)"));

    let drag: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      controller?.onInteract();
    };
    const move = (e: PointerEvent) => {
      controller?.onPointerMove(e.clientX, e.clientY);
      if (drag) {
        const now = performance.now();
        engine.dragBy(e.clientX - drag.x, e.clientY - drag.y, (now - drag.t) / 1000);
        drag = { x: e.clientX, y: e.clientY, t: now };
      }
    };
    const up = (e: PointerEvent) => {
      drag = null;
      engine.endDrag();
      canvas.releasePointerCapture?.(e.pointerId);
    };
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      controller?.onKey(e.key);
    };
    const leave = () => controller?.onPointerLeave();
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      controller?.dispose();
      engine.dispose();
    };
  }, [store]);

  return (
    <>
      <canvas ref={canvasRef} className="stage" />
      {error ? <ErrorScreen message={error} /> : <DebugReadout store={store} />}
    </>
  );
}

// Replaced by <GlobeHud> in Task 12.
function DebugReadout({ store }: { store: Store<GlobeHudSnapshot> }) {
  const s = useStore(store);
  return (
    <pre className="debug">
      {`${s.mode} ${s.timeLabel} · ${s.counters.airborne} AIRBORNE · ${s.extrapolated} EXTRAPOLATED · ${Math.round(s.textureProgress * 100)}% TEX`}
    </pre>
  );
}
