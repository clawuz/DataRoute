import { useEffect, useMemo, useRef, useState } from "react";
import { dataUrl, isFixture } from "@web/data/source";
import { ErrorScreen } from "@web/hud/Hud";
import { createStore } from "@web/hud/store";
import { isClick } from "./app/click";
import { createController, type GlobeController } from "./app/controller";
import { EMPTY_GLOBE_SNAPSHOT, createLabelBus, type GlobeHudSnapshot } from "./app/hud-model";
import { GlobeHud } from "./hud/GlobeHud";
import { createNoteBus } from "./audio/notes-bus"; // art:sound
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "./scene/engine";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => createStore<GlobeHudSnapshot>(EMPTY_GLOBE_SNAPSHOT), []);
  const labelBus = useMemo(() => createLabelBus(), []);
  const noteBus = useMemo(createNoteBus, []); // art:sound
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
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      engine = createGlobeEngine(canvas, {
        reducedMotion,
        onPerf: (fps, level) => controller?.setPerf(fps, level),
        onError: (msg) => {
          setError(msg);
          if (msg.includes("RELOADING")) reloadTimer = setTimeout(() => window.location.reload(), 1500);
        },
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    try {
      controller = createController({
        engine,
        store,
        url: dataUrl(search),
        fixture: isFixture(search),
        debug: params.get("debug") === "1",
        reducedMotion,
        search, // art:core
        noteBus, // art:sound
        onLabels: labelBus.emit,
        nowMs: () => Date.now(),
      });
    } catch (e) {
      engine.dispose();
      setError(String(e));
      return;
    }
    controller.setTextureState(0, "");
    let maxProgress = 0;
    engine
      .loadTextures((p) => {
        maxProgress = Math.max(maxProgress, p);
        controller?.setTextureState(maxProgress, "");
      })
      .then((tier) => controller?.setTextureState(1, tier ? "" : "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)"))
      .catch((e) => {
        console.error("[textures]", e);
        controller?.setTextureState(1, "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)");
      });

    let press: { x: number; y: number; t: number } | null = null;
    let drag: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
      press = { x: e.clientX, y: e.clientY, t: performance.now() };
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
      press = null;
      drag = null;
      engine.endDrag();
      canvas.releasePointerCapture?.(e.pointerId);
    };
    const upClick = (e: PointerEvent) => {
      const p = press;
      press = null;
      up(e);
      if (p && isClick(e.clientX - p.x, e.clientY - p.y, performance.now() - p.t)) controller?.onClick(e.clientX, e.clientY);
    };
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " || e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
      if (e.repeat && !e.key.startsWith("Arrow")) return;
      controller?.onKey(e.key);
    };
    const leave = () => controller?.onPointerLeave();
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", upClick);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("lostpointercapture", up);
    window.addEventListener("keydown", key);
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", upClick);
      window.removeEventListener("pointercancel", up);
      canvas.removeEventListener("lostpointercapture", up);
      window.removeEventListener("keydown", key);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      if (reloadTimer !== undefined) clearTimeout(reloadTimer);
      controller?.dispose();
      controller = null;
      engine.dispose();
    };
  }, [store, labelBus, noteBus]);

  return (
    <>
      <canvas ref={canvasRef} className="stage" role="img" aria-label="Interactive 3D globe: every Turkish Airlines flight of the last 24 hours, drawn as a route line and played as music" />
      {error ? <ErrorScreen message={error} /> : <GlobeHud store={store} labelBus={labelBus} noteBus={noteBus} />}
    </>
  );
}
