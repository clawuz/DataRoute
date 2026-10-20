import { useEffect, useRef, useState } from "react";
import { createGlobeEngine, type GlobeEngine } from "../scene/engine";
import { applyNewGlobeLook } from "../scene/look";
import { setExtraColors } from "../scene/palette-ext";
import { ROUTE_RGB, routeIndex } from "../scene/route-palette";
import { buildPersonalModel } from "./model";
import { createPersonalPlayer, type PersonalPlayer } from "./player";
import { FILM_SECONDS, filmPiece, filmRoutes, shotAt } from "./intro-film";

export const FILM_SEEN_KEY = "wom-film-seen";
/** ?filmat=4.2 freezes the film at that second (to look at a single frame) */
const frozenAt = (): number | null => { const v = new URLSearchParams(window.location.search).get("filmat"); return v === null || Number.isNaN(+v) ? null : +v; };

/**
 * "Every Destination Has a Sound." — the opening film, on a globe of its own over the live screen: the world turns and comes in to Istanbul,
 * eight routes open, each with its own voice, the camera pulls back and the globe settles where the live screen has it. It waits for
 * a tap (that is what lets the browser play sound); `ready` is what the live screen is still loading underneath.
 */
export function IntroFilm({ ready, onDone }: { ready: Promise<unknown> | null; onDone: () => void }) {
  const [phase, setPhase] = useState<"splash" | "film" | "leave">("splash");
  const [canEnter, setCanEnter] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<Record<string, HTMLElement | null>>({});
  const engineRef = useRef<GlobeEngine | null>(null);
  const playerRef = useRef<PersonalPlayer | null>(null);
  const startRef = useRef(0);
  const flyRef = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const loadedRef = useRef<Promise<unknown>>(Promise.resolve());
  const midRef = useRef<Map<string, { lat: number; lon: number }>>(new Map());

  // the film's own globe, built while the splash shows; the tap enables once it and the live screen are complete
  useEffect(() => {
    const canvas = canvasRef.current!;
    let alive = true;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, { reducedMotion: false, noAirports: true });
    } catch {
      setCanEnter(true);
      return;
    }
    engineRef.current = engine;
    engine.setNight(true);
    applyNewGlobeLook(engine);
    engine.setPortraitFit(true);
    engine.setLandscapeLower(-0.07);
    engine.setEffects({ cloudShadow: true, glare: true, aurora: false, corridors: true, sound: false, starMap: true });
    engine.setIdleSpin(false);
    engine.setLineScale(2.2); // the routes read on a globe this large
    engine.setRigDistance(9);
    engine.centerOn(8, -50, 0);
    setExtraColors(ROUTE_RGB); // the live screen's colours: red, white, blue, grey
    const routes = filmRoutes();
    const model = buildPersonalModel(routes);
    model.flights.forEach((f, i) => { f.colorIdx = 7 + routeIndex(routes[i].from, routes[i].to); });
    routes.forEach((r) => midRef.current.set(r.key, { lat: (r.fromLat + r.toLat) / 2, lon: (r.fromLon + r.toLon) / 2 }));
    const nowSec = () => Date.now() / 1000;
    const span = model.span;
    const startCur = Math.min(...model.flights.map((f) => f.dep)) - 30;
    engine.setModel(model, span, nowSec());
    engine.setFrameSource(() => ({ absTime: nowSec(), cur: startCur + flyRef.current * (span - startCur), highlight: -1, nowSec: nowSec() }));
    loadedRef.current = engine.loadTextures(() => {}).catch(() => null).then(() => engine.whenAssetsReady());
    return () => {
      alive = false;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // the tap enables when the film's globe and everything the live screen is loading are complete
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void Promise.all([loadedRef.current, ready]).catch(() => undefined).then(() => { if (alive) setCanEnter(true); if (alive && frozenAt() !== null) begin(false); });
    const cap = setTimeout(() => { if (!alive) return; setCanEnter(true); if (frozenAt() !== null) begin(false); }, frozenAt() !== null ? 9000 : 25000); // a slow network never keeps the visitor out
    return () => { alive = false; clearTimeout(cap); };
  }, [ready]);

  const begin = (withSound: boolean) => {
    try { sessionStorage.setItem(FILM_SEEN_KEY, "1"); } catch { /* private window */ }
    if (withSound) {
      try {
        const ctx = new AudioContext();
        void ctx.resume();
        const player = createPersonalPlayer(ctx);
        playerRef.current = player;
        player.play(filmPiece(filmRoutes()), (n) => {
          const eng = engineRef.current;
          if (eng && n.key) eng.pulseRoute(n.key);
          if (n.show !== false) spawnNote(n.key);
        });
      } catch { /* no audio: the film goes on in silence */ }
    }
    startRef.current = performance.now();
    setPhase("film");
  };

  // one floating note over the middle of the route that sounds it
  const spawnNote = (key: string) => {
    const eng = engineRef.current;
    const box = notesRef.current;
    const mid = midRef.current.get(key);
    if (!eng || !box || !mid) return;
    const p = eng.screenOf(mid.lat, mid.lon, 0.4);
    if (!p.visible) return;
    const el = document.createElement("i");
    el.className = "if-note";
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  };

  const finish = () => {
    setPhase("leave");
    playerRef.current?.setMuted(true);
    setTimeout(() => { playerRef.current?.dispose(); playerRef.current = null; }, 600);
    setTimeout(() => doneRef.current(), 1600);
  };

  useEffect(() => {
    if (phase !== "film") return;
    let raf = 0;
    const tick = () => {
      const t = frozenAt() ?? Math.min(FILM_SECONDS, (performance.now() - startRef.current) / 1000);
      const s = shotAt(t);
      const eng = engineRef.current;
      if (eng) {
        eng.setRigDistance(s.dist);
        eng.centerOn(s.lat, s.lon, 0);
        eng.setAtmosphereBoost(s.glow);
      }
      flyRef.current = s.fly;
      if (canvasRef.current) canvasRef.current.style.opacity = String(s.fade * (1 - s.hud));
      if (rootRef.current) rootRef.current.style.background = `rgba(2, 3, 10, ${1 - s.hud})`;
      for (const k of ["every", "sound"] as const) {
        const el = textRefs.current[k];
        if (el) el.style.opacity = String(s.text[k]);
      }
      if (t >= FILM_SECONDS && frozenAt() === null) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { playerRef.current?.dispose(); }, []);

  const skip = () => {
    const eng = engineRef.current;
    if (eng) { eng.setRigDistance(3.2); eng.setAtmosphereBoost(1.9); }
    finish();
  };

  return (
    <div ref={rootRef} className={`intro intro-film${phase === "leave" ? " leave" : ""}${phase === "film" ? " playing" : ""}`} role="status" aria-label="Opening film">
      <canvas ref={canvasRef} className="if-canvas" />
      {phase === "splash" && (
        <div className="intro-mark">
          <img className="intro-logo" src="/brand/tk-lockup-vertical-light.png" alt="Turkish Airlines" />
          <span className="intro-title">A WORLD OF MUSIC</span>
          {canEnter ? (
            <>
              <button type="button" className="if-enter" onClick={() => begin(true)}>
                <span className="ms-eq" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${-((i * 37) % 17) / 10}s`, animationDuration: `${0.7 + ((i * 53) % 9) / 10}s` }} />)}</span>
                <span className="ms-make-txt">ENTER WITH SOUND</span>
              </button>
              <button type="button" className="if-quiet" onClick={() => begin(false)}>CONTINUE WITHOUT SOUND</button>
            </>
          ) : (
            <>
              <span className="intro-line" aria-hidden="true"><i /></span>
              <span className="intro-label">TUNING THE WORLD</span>
            </>
          )}
        </div>
      )}
      <div ref={notesRef} className="if-notes" aria-hidden="true" />
      <div className="if-words">
        <h2 className="if-head">
          <span ref={(e) => { textRefs.current.every = e; }}>EVERY DESTINATION</span>
          <span ref={(e) => { textRefs.current.sound = e; }}>HAS A SOUND.</span>
        </h2>
      </div>
      {phase === "film" && <button type="button" className="if-skip" onClick={skip}>SKIP</button>}
    </div>
  );
}
