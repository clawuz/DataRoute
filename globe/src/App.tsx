import { Intro } from "./personal/Intro";
import { useEffect, useMemo, useRef, useState } from "react";
import { dataUrl, isFixture } from "@web/data/source";
import { ErrorScreen } from "@web/hud/Hud";
import { createStore } from "@web/hud/store";
import { isClick } from "./app/click";
import { createController, type GlobeController } from "./app/controller";
import { EMPTY_GLOBE_SNAPSHOT, createLabelBus, type GlobeHudSnapshot } from "./app/hud-model";
import { GlobeHud } from "./hud/GlobeHud";
import { ROUTE_RGB } from "./scene/route-palette";
import { setExtraColors } from "./scene/palette-ext";
import { createNoteBus } from "./audio/notes-bus"; // art:sound
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "./scene/engine";
import { Experience } from "./personal/Experience";
import { Landing } from "./personal/Landing";
import { selectionFromSearch, searchFromSelection, type PersonalSelection } from "./personal/codec";

function LiveApp({ onExit, onMake }: { onExit?: () => void; onMake?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => createStore<GlobeHudSnapshot>(EMPTY_GLOBE_SNAPSHOT), []);
  const labelBus = useMemo(() => createLabelBus(), []);
  const noteBus = useMemo(createNoteBus, []); // art:sound
  const [error, setError] = useState<string | null>(null);
  const personalLive = import.meta.env.VITE_PERSONAL === "1" || new URLSearchParams(window.location.search).get("personal") === "1";
  const [introReady, setIntroReady] = useState<Promise<unknown> | null>(null);
  const [introOn, setIntroOn] = useState(personalLive); // the opening screen covers the live screen until it is complete
  const introRef = useRef(personalLive);
  introRef.current = introOn;
  const gate = useRef<{ p: Promise<void>; open: () => void } | null>(null);
  if (!gate.current) {
    let open = () => {};
    const p = new Promise<void>((r) => { open = r; });
    gate.current = { p: personalLive ? p : Promise.resolve(), open };
  }

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
      engine.setSpaceDim(0.8, false);
      engine.setLandscapeLower(-0.07); // the title is at the left now: the globe sits higher
      engine.setPlaneModel("/models/a350.glb"); // the followed flight is an aeroplane, not a dot
      setExtraColors(ROUTE_RGB); // the arcs: a route is red, white, blue or grey, like its line in the music box
      engine.setSkyBlue(true); // the sky: a blue picture of the Milky Way
      engine.setNight(params.get("sun") !== "real"); // the sun glare sits behind the globe at the upper left, as before; the day / night blend has its own (staged) sun
      engine.setAtmosphereBoost(1.9); // a stronger glow around the globe
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
        artDefaults: params.get("personal") === "1" || import.meta.env.VITE_PERSONAL === "1" ? { aurora: true } : undefined,
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
    // the new link: a first visitor sees the globe settle, then the day replays and the music comes in
    const personalBuild = import.meta.env.VITE_PERSONAL === "1" || params.get("personal") === "1";
    const timers: ReturnType<typeof setTimeout>[] = [];
    // airport names that would be printed over a panel or a figure are dropped (checked a few times a second)
    if (personalBuild) {
      const SEL = ".counters, .live-stats, .flight-panel, .music-scope, .regions, .dep-globe, .title, .lockup, .events, .keys-btn, .live-back";
      const sweep = () => {
        const boxes = [...document.querySelectorAll<HTMLElement>(SEL)]
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0);
        document.querySelectorAll<HTMLElement>(".airport-label").forEach((l) => {
          const a = l.getBoundingClientRect();
          const hit = boxes.some((b) => a.right > b.left - 4 && a.left < b.right + 4 && a.bottom > b.top - 4 && a.top < b.bottom + 4);
          if (hit) l.setAttribute("data-covered", "");
          else l.removeAttribute("data-covered");
        });
      };
      const iv = setInterval(sweep, 250);
      timers.push(iv as unknown as ReturnType<typeof setTimeout>);
    }
    const startTour = () => {
      if (!personalBuild) return;
      let tries = 0;
      const attempt = () => {
        const s = store.get();
        const ready = s.depHist.some((v) => v > 0);
        if (!ready && tries++ < 12) {
          timers.push(setTimeout(attempt, 1000));
          return;
        }
        if (s.mode === "LIVE") controller?.onKey("r"); // the 24 h replay
        timers.push(
          setTimeout(() => {
            if (!store.get().music.on) controller?.onKey("m"); // then the music
          }, 800),
        );
      };
      timers.push(setTimeout(attempt, 3500));
    };
    const texturesReady = engine
      .loadTextures((p) => {
        maxProgress = Math.max(maxProgress, p);
        controller?.setTextureState(maxProgress, "");
      })
      .then(async (tier) => {
        controller?.setTextureState(1, tier ? "" : "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)");
        await gate.current!.p; // no replay, no music before the opening screen has lifted
        startTour();
      })
      .catch((e) => {
        console.error("[textures]", e);
        controller?.setTextureState(1, "FLAT-COLOUR EARTH (IMAGERY UNAVAILABLE)");
      });
    if (personalBuild) { // what the opening screen waits for: the pictures, the aircraft, and the first data of the day
      const data = new Promise<void>((res) => {
        let n = 0;
        const t = setInterval(() => {
          if (store.get().depHist.some((v) => v > 0) || ++n > 40) { clearInterval(t); res(); }
        }, 250);
        timers.push(t as unknown as ReturnType<typeof setTimeout>);
      });
      setIntroReady(Promise.all([texturesReady.then(() => engine.whenAssetsReady()), data]));
    }

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
      if (introRef.current) return; // nothing is played or changed behind the opening screen
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
      timers.forEach(clearTimeout);
      controller?.dispose();
      controller = null;
      engine.dispose();
      document.body.classList.remove("personal-build"); // the live screen's look must not stay on the other screens (the result of a piece, the entry screen)
    };
  }, [store, labelBus, noteBus]);

  useEffect(() => { // the music box's "make your own music" button: straight to "Where do you want to go?"
    if (!onMake) return;
    const go = () => onMake();
    window.addEventListener("worldofmusic:make", go);
    return () => window.removeEventListener("worldofmusic:make", go);
  }, [onMake]);

  return (
    <>
      <canvas ref={canvasRef} className="stage" role="img" aria-label="Interactive 3D globe: every Turkish Airlines flight of the last 24 hours, drawn as a route line and played as music" />
      {error ? <ErrorScreen message={error} /> : <GlobeHud store={store} labelBus={labelBus} noteBus={noteBus} />}
      {introOn && <Intro film ready={introReady} onDone={() => { setIntroOn(false); gate.current?.open(); }} />}
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
  // the live screen is the home page: there is no entry screen. A shared piece (?w= / ?v=) opens its result; "make your own music" opens the wish list
  const [view, setView] = useState<"landing" | "personal" | "live">(() => (selectionFromSearch(search) ? "personal" : "live"));
  const [selection, setSelection] = useState<PersonalSelection | null>(() => selectionFromSearch(search));
  const [cameFromLanding, setCameFromLanding] = useState(false);
  const [landingStart, setLandingStart] = useState<"wish" | null>(null); // the entry screen opens on the wish list after the live screen's button

  // the personal site can always step back to the three choices; the legacy live page (old link) has no entry screen
  const canLeave = personalDefault || params.get("personal") === "1" || selectionFromSearch(search) !== null || cameFromLanding;
  if (view === "live") {
    return (
      <LiveApp
        onExit={canLeave ? () => { setLandingStart(null); setView("landing"); } : undefined}
        onMake={canLeave ? () => { setLandingStart("wish"); setView("landing"); } : undefined}
      />
    );
  }
  if (view === "personal" && selection) {
    return (
      <Experience
        key={searchFromSelection(selection)}
        selection={selection}
        onBack={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setSelection(null);
          setLandingStart("wish");
          setView("landing");
        }}
      />
    );
  }
  return (
    <Landing
      key={landingStart ?? "start"}
      startAt={landingStart ?? undefined}
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
