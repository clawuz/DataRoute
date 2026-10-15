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
import { Experience } from "./personal/Experience";
import { Landing } from "./personal/Landing";
import { selectionFromSearch, searchFromSelection, type PersonalSelection } from "./personal/codec";

function LiveApp({ onExit }: { onExit?: () => void }) {
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
    // the new link keeps the sky behind the globe quiet on the live screen too (the old deploy is left as it was)
    if (import.meta.env.VITE_PERSONAL === "1" || params.get("personal") === "1") {
      engine.setSpaceDim(0.35, false);
      engine.setPortraitFit(true);
      engine.setBaseFov(48); // room around the globe for the side panels
      engine.setPortraitShift(-34); // no counters on a phone here: the globe sits higher
      document.body.classList.add("personal-build");
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
      {onExit && (
        <>
          <button type="button" className="live-logo" onClick={onExit} aria-label="Turkish Airlines — back to the start" />
          <button type="button" className="live-back" onClick={onExit}>
            ← BACK
          </button>
        </>
      )}
    </>
  );
}

/**
 * Entry: a personal piece (`?v=` / `?w=`), the picker, or the live sky.
 * The picker is the default only when the build sets VITE_PERSONAL=1 (the new link); the old deploy keeps the live sky.
 */
export function App() {
  const search = window.location.search;
  const params = new URLSearchParams(search);
  const personalDefault = import.meta.env.VITE_PERSONAL === "1";
  const wantsLive = params.has("live") || params.has("data") || params.has("debug") || params.has("art");
  const [view, setView] = useState<"landing" | "personal" | "live">(() => {
    if (selectionFromSearch(search)) return "personal";
    if (params.get("personal") === "1" || (personalDefault && !wantsLive)) return "landing";
    return "live";
  });
  const [selection, setSelection] = useState<PersonalSelection | null>(() => selectionFromSearch(search));
  const [cameFromLanding, setCameFromLanding] = useState(false);

  // the personal site can always step back to the three choices; the legacy live page (old link) has no entry screen
  const canLeave = personalDefault || params.get("personal") === "1" || selectionFromSearch(search) !== null || cameFromLanding;
  if (view === "live") return <LiveApp onExit={canLeave ? () => setView("landing") : undefined} />;
  if (view === "personal" && selection) {
    return (
      <Experience
        key={searchFromSelection(selection)}
        selection={selection}
        onBack={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setSelection(null);
          setView("landing");
        }}
      />
    );
  }
  return (
    <Landing
      onCompose={(sel) => {
        window.history.replaceState(null, "", window.location.pathname + searchFromSelection(sel));
        setSelection(sel);
        setView("personal");
      }}
      onLive={() => {
        setCameFromLanding(true);
        setView("live");
      }}
    />
  );
}
