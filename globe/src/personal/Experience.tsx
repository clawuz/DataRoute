import { useEffect, useMemo, useRef, useState } from "react";
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "../scene/engine";
import { composePiece, type PersonalNote, type PersonalPiece } from "./compose";
import { buildPersonalModel } from "./model";
import { createPersonalPlayer, type PersonalPlayer } from "./player";
import { buildRoutes } from "./routes";
import { pieceStats } from "./stats";
import { searchFromSelection, type PersonalSelection } from "./codec";
import { destinationOf, flagOf } from "./destinations";
import { renderCard } from "./card";
import { loadLogo } from "./brand";
import { REEL_H, REEL_SECONDS, REEL_W, drawGlobeFrame, drawReelBackdrop } from "./reel";
import { extOf, pickMime, recordClip } from "./clip";

interface Props {
  selection: PersonalSelection;
  onBack(): void;
}


export function Experience({ selection, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PersonalPlayer | null>(null);
  const engineRef = useRef<GlobeEngine | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const litRef = useRef<((flight: number) => void) | null>(null);
  const noteCbRef = useRef<((n: PersonalNote) => void) | null>(null);
  const pieceRef = useRef<PersonalPiece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState("");
  const [now, setNow] = useState<string[]>([]);

  const routes = useMemo(() => buildRoutes(selection.origin, selection.dests), [selection]);
  const piece = useMemo(() => composePiece(selection.mode, routes), [selection.mode, routes]);
  const stats = useMemo(() => pieceStats(selection.mode, selection.origin, selection.dests, routes), [selection.mode, routes]);

  useEffect(() => {
    if (!hasWebGL2()) {
      setError("WEBGL2 IS NOT AVAILABLE ON THIS DEVICE");
      return;
    }
    const canvas = canvasRef.current!;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, onError: setError, boldTracks: true });
    } catch (e) {
      setError(String(e));
      return;
    }
    engineRef.current = engine;
    engine.setNight(true); // always the night side: the lights and the routes read best on it
    engine.setEffects({ cloudShadow: true, glare: true, aurora: true, corridors: false, sound: false, starMap: true });
    const nowSec = () => Date.now() / 1000;
    const model = buildPersonalModel(routes);
    engine.setModel(model, model.span, nowSec());
    // the track of the route that is sounding is lit for a moment (the arcs keep their region colours)
    let lit = { flight: -1, until: 0 };
    litRef.current = (flight) => {
      lit = { flight, until: performance.now() + 520 };
    };
    engine.setFrameSource(() => ({ absTime: nowSec(), cur: model.span, highlight: performance.now() < lit.until ? lit.flight : -1, nowSec: nowSec() }));
    void engine.loadTextures(() => {}).catch(() => {});

    let player: PersonalPlayer | null = null;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      player = createPersonalPlayer(ctx);
      playerRef.current = player;
      pieceRef.current = piece;
      noteCbRef.current = (n) => {
        const r = n.route >= 0 ? routes[n.route] : undefined;
        if (!r) return;
        litRef.current?.(n.route);
        engine.pulseAirport(r.to, nowSec());
        engine.pulseAirport(r.from, nowSec());
        const far = destinationOf(r.to === "IST" ? r.from : r.to);
        if (far) setNow((p) => [...p.slice(-3), `${flagOf(far.iso)} ${r.from} → ${r.to} · ${far.city}`]);
      };
      const start = () => {
        player?.play(piece, (n) => noteCbRef.current?.(n));
        setRunning(true);
      };
      start();
      const unlock = () => {
        if (ctx.state !== "running") void ctx.resume().then(() => setRunning(ctx.state === "running"));
      };
      window.addEventListener("pointerdown", unlock, { once: true });
      // autoplay policy: a shared link opened cold has no gesture yet — the overlay below asks for a tap
      setRunning(ctx.state === "running");
      ctx.addEventListener("statechange", () => setRunning(ctx.state === "running"));
    } catch {
      setRunning(false);
    }

    return () => {
      player?.dispose();
      playerRef.current = null;
      engineRef.current = null;
      noteCbRef.current = null;
      engine.dispose();
    };
  }, [routes, piece]);

  const url = () => `${window.location.origin}${window.location.pathname}${searchFromSelection(selection)}`;
  const share = async () => {
    const data = { title: "A World of Music", text: `${stats.title} — my piece of A World of Music`, url: url() };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(data.url);
      setToast("LINK COPIED");
    } catch {
      setToast(data.url);
    }
    setTimeout(() => setToast(""), 2600);
  };

  const say = (t: string, ms = 2600) => {
    setToast(t);
    setTimeout(() => setToast(""), ms);
  };
  const deliver = async (blob: Blob, name: string, title: string) => {
    const file = new File([blob], name, { type: blob.type });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${stats.title} — ${url()}` });
        return;
      }
    } catch {
      return; // the share sheet was dismissed
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say("SAVED");
  };
  const saveCard = async () => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine || busy) return;
    setBusy("CARD");
    try {
      // the drawing buffer is only readable inside the frame it was drawn in
      const globe = await new Promise<HTMLImageElement>((res, rej) => {
        const timer = setTimeout(() => {
          engine.setAfterRender(null);
          rej(new Error("no frame (tab in the background?)"));
        }, 2500);
        engine.setAfterRender(() => {
          clearTimeout(timer);
          engine.setAfterRender(null);
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = () => rej(new Error("capture failed"));
          img.src = canvas.toDataURL("image/jpeg", 0.92);
        });
      });
      const blob = await renderCard({ mode: selection.mode, stats, dests: selection.dests, globe, url: url() });
      await deliver(blob, "a-world-of-music.png", "A World of Music");
    } catch {
      say("COULD NOT MAKE THE CARD");
    } finally {
      setBusy(null);
    }
  };
  const saveClip = async () => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    const audio = playerRef.current?.audioStream();
    const mime = pickMime();
    if (!canvas || !engine || busy) return;
    if (!mime) {
      say("VIDEO IS NOT SUPPORTED HERE — SAVE THE CARD");
      return;
    }
    setBusy("VIDEO");
    try {
      const logo = await loadLogo();
      try {
        await document.fonts.load('700 84px "TK Display Condensed"');
        await document.fonts.load('500 34px "TK Text Wide"');
      } catch {
        /* system fonts */
      }
      // a 9:16 canvas (Reels / Stories), filled from the live render once per frame
      const comp = document.createElement("canvas");
      comp.width = REEL_W;
      comp.height = REEL_H;
      const cctx = comp.getContext("2d")!;
      const back = document.createElement("canvas");
      back.width = REEL_W;
      back.height = REEL_H;
      drawReelBackdrop(back.getContext("2d")!, { stats, dests: selection.dests, url: url(), logo });
      engine.setAfterRender(() => {
        cctx.drawImage(back, 0, 0);
        drawGlobeFrame(cctx, canvas);
      });
      // the clip's sound is the chorus (the best 15 s), restarted from its first note; afterwards the whole piece goes on
      const hookPiece: PersonalPiece = {
        ...piece,
        notes: piece.notes.filter((n) => n.t >= piece.hook).map((n) => ({ ...n, t: n.t - piece.hook })),
        duration: piece.duration - piece.hook,
        hook: 0,
      };
      playerRef.current?.play(hookPiece, (n) => noteCbRef.current?.(n));
      const stream = comp.captureStream(30);
      audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
      const blob = await recordClip(stream, REEL_SECONDS * 1000, mime);
      await deliver(blob, `a-world-of-music.${extOf(mime)}`, "A World of Music");
      if (extOf(mime) !== "mp4") say("THIS BROWSER SAVES WEBM — INSTAGRAM NEEDS MP4 (CHROME OR SAFARI)", 5000);
    } catch {
      say("COULD NOT RECORD THE VIDEO");
    } finally {
      engine.setAfterRender(null);
      playerRef.current?.play(piece, (n) => noteCbRef.current?.(n));
      setBusy(null);
    }
  };

  if (error) return <div className="loading">{error}</div>;
  return (
    <>
      <canvas ref={canvasRef} className="stage" role="img" aria-label="A 3D globe with your routes drawn on it, played as music" />
      <div className="personal-hud">
        <button type="button" className="landing-back" onClick={onBack}>← NEW PIECE</button>
        <h1 className="personal-title">{stats.title}</h1>
        <p className="personal-sub">
          {stats.destinations} DESTINATIONS · {stats.countries} COUNTRIES · {stats.km.toLocaleString("en")} KM{stats.laps >= 0.1 ? ` · ${stats.laps}× AROUND THE EARTH` : ""}
        </p>
        <p className="personal-sub">SIGNATURE VOICE · {stats.signature.toUpperCase()}</p>
        <div className="personal-now" aria-live="off">
          {now.map((t, i) => (
            <span key={i} style={{ opacity: 0.35 + (i + 1) / now.length * 0.65 }}>{t}</span>
          ))}
        </div>
      </div>
      {!running && (
        <button type="button" className="tap-play" onClick={() => playerRef.current?.resume()}>TAP TO PLAY</button>
      )}
      <div className="personal-actions">
        <button type="button" className="compose-btn" disabled={!!busy} onClick={() => setSheet(true)}>
          {busy === "VIDEO" ? `RECORDING ${REEL_SECONDS} S…` : busy === "CARD" ? "MAKING THE CARD…" : "SHARE MY PIECE"}
        </button>
      </div>
      {sheet && (
        <div className="sheet-back" onClick={() => setSheet(false)} role="dialog" aria-label="Share my piece">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet-title">Share my piece</h2>
            <button type="button" className="sheet-opt" onClick={() => { setSheet(false); void saveClip(); }}>
              <span className="sheet-opt-name">VIDEO</span>
              <span className="sheet-opt-desc">{REEL_SECONDS} seconds · 9:16 · made for Instagram Reels and Stories</span>
            </button>
            <button type="button" className="sheet-opt" onClick={() => { setSheet(false); void saveCard(); }}>
              <span className="sheet-opt-name">CARD</span>
              <span className="sheet-opt-desc">An image of your globe and numbers · 4:5 · for feed posts</span>
            </button>
            <button type="button" className="sheet-link" onClick={() => { setSheet(false); void share(); }}>COPY LINK</button>
            <button type="button" className="sheet-link" onClick={() => setSheet(false)}>CLOSE</button>
          </div>
        </div>
      )}
      {toast && <div className="notice">{toast}</div>}
    </>
  );
}
