import { useEffect, useMemo, useRef, useState } from "react";
import { createGlobeEngine, type GlobeEngine } from "../scene/engine";
import { applyNewGlobeLook } from "../scene/look";
import { setExtraColors } from "../scene/palette-ext";
import { ROUTE_RGB, routeIndex } from "../scene/route-palette";
import { createPersonalPlayer, type PersonalPlayer } from "./player";
import { musicTileUrl } from "./music-tile";
import { FILM_SECONDS, SETTLE_FROM, SETTLE_TO, filmModel, filmPiece, filmRoutes, modelClock, openTimes, shotAt } from "./intro-film";

/** ?filmat=4.2 freezes the film at that second, silent (to look at a single frame) */
const frozenAt = (): number | null => { const v = new URLSearchParams(window.location.search).get("filmat"); return v === null || Number.isNaN(+v) ? null : +v; };
const LIVE_WAIT_MS = 20000; // the film never keeps the visitor out of a slow live screen for longer than this

/**
 * The opening film, on a globe of its own over the live screen (which keeps loading underneath): routes are made one by one, each by a
 * note of the film's music; then the airline's mark and the two lines; then the globe moves back to where the live screen has it,
 * the sound fades out, and the live screen starts. It waits for a tap (that is what lets the browser play sound).
 */
export function IntroFilm({ ready, onDone }: { ready: Promise<unknown> | null; onDone: () => void }) {
  const [phase, setPhase] = useState<"splash" | "film" | "leave">("splash");
  const [canEnter, setCanEnter] = useState(false);
  const tile = useMemo(() => musicTileUrl(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const waitRef = useRef<HTMLSpanElement>(null);
  const els = useRef<Record<string, HTMLElement | null>>({});
  const engineRef = useRef<GlobeEngine | null>(null);
  const playerRef = useRef<PersonalPlayer | null>(null);
  const loadedRef = useRef<Promise<unknown>>(Promise.resolve());
  const liveReady = useRef(false);
  const startRef = useRef(0);
  const clockRef = useRef(0); // the model's clock (follows the film's time)
  const soundRef = useRef(false);
  const fadedRef = useRef(false);
  const prevNote = useRef(-1);
  const lineRef = useRef(2.2);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const routes = useMemo(() => filmRoutes(), []);
  const piece = useMemo(() => filmPiece(routes), [routes]);
  const mids = useRef<Map<string, { lat: number; lon: number }>>(new Map());

  // the film's own globe, built while the splash shows
  useEffect(() => {
    const canvas = canvasRef.current!;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, { reducedMotion: false, noAirports: true, lowRes: true });
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
    const model = filmModel(routes, openTimes(routes.length));
    model.flights.forEach((f, i) => { f.colorIdx = 7 + routeIndex(routes[i].from, routes[i].to); });
    routes.forEach((r) => mids.current.set(r.key, { lat: (r.fromLat + r.toLat) / 2, lon: (r.fromLon + r.toLon) / 2 }));
    const nowSec = () => Date.now() / 1000;
    engine.setModel(model, 0, nowSec());
    engine.setFrameSource(() => ({ absTime: nowSec(), cur: clockRef.current, highlight: -1, nowSec: nowSec() }));
    // the tap is enabled as soon as the FILM is complete: the live screen goes on loading while the film plays
    loadedRef.current = engine.loadTextures(() => {}).catch(() => null).then(() => engine.whenAssetsReady());
    void loadedRef.current.then(() => setCanEnter(true));
    const cap = setTimeout(() => setCanEnter(true), 12000);
    return () => {
      clearTimeout(cap);
      engine.dispose();
      engineRef.current = null;
    };
  }, [routes]);

  // what the live screen is waiting for, kept track of
  useEffect(() => {
    let alive = true;
    void (ready ? Promise.race([ready.catch(() => undefined), new Promise((r) => setTimeout(r, LIVE_WAIT_MS * 3))]) : Promise.resolve()).then(() => { if (alive) liveReady.current = true; });
    return () => { alive = false; };
  }, [ready]);

  const spawnNote = (key: string) => {
    const eng = engineRef.current;
    const box = notesRef.current;
    const mid = mids.current.get(key);
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

  const begin = (withSound: boolean) => {
    soundRef.current = false;
    if (withSound) {
      try {
        const ctx = new AudioContext();
        void ctx.resume();
        const player = createPersonalPlayer(ctx);
        player.setLevel(0, 0.01);
        player.play(piece, () => {});
        player.setLevel(0.9, 1);
        playerRef.current = player;
        soundRef.current = true;
      } catch { /* no audio: the film goes on in silence */ }
    }
    startRef.current = performance.now();
    setPhase("film");
  };
  useEffect(() => {
    if (canEnter && frozenAt() !== null && phase === "splash") begin(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEnter]);

  const finish = () => {
    setPhase("leave");
    const p = playerRef.current;
    if (p) { p.setLevel(0, 0.2); setTimeout(() => { p.stop(); p.dispose(); }, 400); }
    setTimeout(() => doneRef.current(), 1100);
  };

  useEffect(() => {
    if (phase !== "film") return;
    let raf = 0;
    let liveSince = 0;
    const tick = () => {
      const wall = (performance.now() - startRef.current) / 1000;
      const pos = soundRef.current ? playerRef.current?.position() ?? 0 : 0;
      const t = frozenAt() ?? Math.min(FILM_SECONDS, pos > 0 ? pos : wall); // with sound the audio clock is the film's clock
      const s = shotAt(t);
      clockRef.current = modelClock(t);
      const eng = engineRef.current;
      if (eng) {
        eng.setRigDistance(s.dist);
        eng.centerOn(s.lat, s.lon, 0);
        eng.setAtmosphereBoost(s.glow);
        const q = Math.round(s.lines * 5) / 5;
        if (q !== lineRef.current) { lineRef.current = q; eng.setLineScale(q); }
      }
      // the notes: each one lights its route and lets a light rise from it
      if (eng) for (const n of piece.notes) if (n.show !== false && n.t > prevNote.current && n.t <= t) { eng.pulseRoute(n.key); spawnNote(n.key); }
      prevNote.current = Math.max(prevNote.current, t);
      // the sound fades out while the globe moves back
      if (playerRef.current && !fadedRef.current && t >= SETTLE_FROM) { fadedRef.current = true; playerRef.current.setLevel(0, SETTLE_TO - SETTLE_FROM - 0.3); }
      const holding = t >= FILM_SECONDS && !liveReady.current && frozenAt() === null; // the live screen is not complete yet: the last picture stays
      const filmA = holding ? 1 : s.film;
      if (canvasRef.current) canvasRef.current.style.opacity = String(s.fade * filmA);
      if (rootRef.current) rootRef.current.style.background = `rgba(2, 3, 10, ${filmA})`;
      for (const k of ["logo", "presents", "world", "l1", "l2"] as const) { const el = els.current[k]; if (el) el.style.opacity = String(s.text[k]); }
      if (els.current.veil) els.current.veil.style.opacity = String(s.veil);
      if (waitRef.current) { if (holding && !liveSince) liveSince = performance.now(); waitRef.current.style.opacity = holding && performance.now() - liveSince > 600 ? "1" : "0"; }
      if (t >= FILM_SECONDS && frozenAt() === null && (liveReady.current || (liveSince > 0 && performance.now() - liveSince > LIVE_WAIT_MS))) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => { playerRef.current?.dispose(); }, []);

  const skip = () => {
    const p = playerRef.current;
    if (p) p.setLevel(0, 0.2);
    finish();
  };
  const set = (k: string) => (e: HTMLElement | null) => { els.current[k] = e; };

  return (
    <div ref={rootRef} className={`intro intro-film${phase === "leave" ? " leave" : ""}`} role="status" aria-label="Opening film">
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
      <div ref={set("veil")} className="if-veil" aria-hidden="true" />
      <div ref={notesRef} className="if-notes" aria-hidden="true" />
      <div className="if-text">
        <div className="if-presents">
          <img ref={set("logo")} className="if-plogo" src="/brand/tk-lockup-vertical-light.png" alt="Turkish Airlines" />
          <span ref={set("presents")} className="if-pword">PRESENTS</span>
        </div>
        <span ref={set("world")} className="if-world">A WORLD OF MUSIC</span>
        <h2 className="if-title">
          <span ref={set("l1")}>We fly to the most countries.</span>
          <span ref={set("l2")} className="if-music" style={tile ? { backgroundImage: `url(${tile}), linear-gradient(#f2f5fa, #f2f5fa)` } : undefined}>Now we make them play.</span>
        </h2>
      </div>
      <span ref={waitRef} className="if-wait">TUNING THE WORLD</span>
      {phase === "film" && <button type="button" className="if-skip" onClick={skip}>SKIP</button>}
    </div>
  );
}
