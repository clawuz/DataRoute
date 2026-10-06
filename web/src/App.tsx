import { useEffect, useMemo, useRef, useState } from "react";
import { createController, type Controller } from "./app/controller";
import { isFixture, dataUrl } from "./data/source";
import { EMPTY_SNAPSHOT, type HudSnapshot } from "./hud/snapshot";
import { createStore, useStore, type Store } from "./hud/store";
import { createEngine, hasWebGL2, type Engine } from "./render/engine";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => createStore<HudSnapshot>(EMPTY_SNAPSHOT), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasWebGL2()) {
      setError("WEBGL2 IS NOT AVAILABLE ON THIS DEVICE");
      return;
    }
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let controller: Controller | null = null;
    let engine: Engine;
    try {
      engine = createEngine(canvasRef.current!, {
        reducedMotion,
        onPerf: (fps, level) => controller?.setPerf(fps, level),
        onError: setError,
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
    const onKey = (e: KeyboardEvent) => controller?.onKey(e.key);
    const onMove = (e: PointerEvent) => controller?.onPointerMove(e.clientX, e.clientY);
    const onClick = () => controller?.onClick();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("click", onClick);
      controller?.dispose();
      engine.dispose();
    };
  }, [store]);

  return (
    <>
      <canvas ref={canvasRef} className="stage" />
      {error ? <pre className="debug">{error}</pre> : <DebugReadout store={store} />}
    </>
  );
}

function DebugReadout({ store }: { store: Store<HudSnapshot> }) {
  const s = useStore(store);
  if (!s.debug) return null;
  return (
    <pre className="debug">
      {`${s.debug.fps} FPS · Q${s.debug.level} · ${s.debug.flights} FLIGHTS · ${s.phase} ${s.timeLabel}`}
    </pre>
  );
}
