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
import { MusicScope } from "../hud/MusicScope";
import { createNoteBus } from "../audio/notes-bus";
import type { MusicHud } from "../app/hud-model";
import { loadLogo } from "./brand";
import { REEL_H, REEL_SECONDS, REEL_W, drawGlobeFrame, drawReelBackdrop } from "./reel";
import { chooseDelivery, extOf, pickMime, recordClip } from "./clip";

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
  const noteBus = useMemo(createNoteBus, []);
  const planCbRef = useRef<((n: PersonalNote, wallAt: number) => void) | null>(null);
  const [scope, setScope] = useState<{ pos: number; section: string }>({ pos: 0, section: "" });

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

    // drag to turn the globe (the card and the video take whatever angle is on screen)
    let drag: { x: number; y: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const t = performance.now();
      engine.dragBy(e.clientX - drag.x, e.clientY - drag.y, (t - drag.t) / 1000);
      drag = { x: e.clientX, y: e.clientY, t };
    };
    const up = (e: PointerEvent) => {
      if (!drag) return;
      drag = null;
      engine.endDrag();
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

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
      };
      // the music box: a note appears on the ribbon three seconds before it sounds
      planCbRef.current = (n, wallAt) => {
        const r = n.route >= 0 ? routes[n.route] : undefined;
        if (!r) return;
        noteBus.emit({ instrument: n.instrument, lane: n.instrument, freq: n.freq, pitch: n.freq, vel: n.vel, kind: "line", key: r.key, at: wallAt, durSec: n.d, lineId: r.key });
      };
      const start = () => {
        player?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
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
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      player?.dispose();
      playerRef.current = null;
      engineRef.current = null;
      noteCbRef.current = null;
      planCbRef.current = null;
      engine.dispose();
    };
  }, [routes, piece]);

  // the playhead of the music box
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p || piece.duration <= 0) return;
      const t = Math.min(p.position(), piece.duration);
      const sec = piece.sections.find((x) => t >= x.start && t < x.end) ?? piece.sections[piece.sections.length - 1];
      setScope((prev) => {
        const pos = Math.round((t / piece.duration) * 200) / 200;
        return prev.pos === pos && prev.section === (sec?.name ?? "") ? prev : { pos, section: sec?.name ?? "" };
      });
    }, 250);
    return () => clearInterval(id);
  }, [piece]);

  const musicHud: MusicHud = useMemo(
    () => ({
      on: true,
      section: "DAY",
      chord: "",
      bpm: piece.bpm,
      instruments: [],
      level: 0,
      layers: [],
      day: { curve: piece.energy, pos: scope.pos, level: piece.energy[Math.min(47, Math.floor(scope.pos * 48))] ?? 0, hour: 0, airborne: 0, windows: Math.max(1, piece.sections.length) },
    }),
    [piece, scope.pos],
  );

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
    // phones and tablets: the share sheet (Instagram, Messages …); desktops: a plain browser download
    const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (chooseDelivery(touch, !!navigator.canShare?.({ files: [file] })) === "share") {
      try {
        await navigator.share({ files: [file], title, text: `${stats.title} — ${url()}` });
        return;
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return; // the sheet was dismissed
        // NotAllowedError (the recording outlasted the tap) and others: fall through to a download
      }
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(href);
    }, 10000);
    say(touch ? "SAVED — CHECK YOUR FILES OR PHOTOS" : `DOWNLOADED ${name}`, 4000);
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
      playerRef.current?.play(hookPiece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
      const stream = comp.captureStream(30);
      audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
      const blob = await recordClip(stream, REEL_SECONDS * 1000, mime);
      await deliver(blob, `a-world-of-music.${extOf(mime)}`, "A World of Music");
      if (extOf(mime) !== "mp4") say("THIS BROWSER SAVES WEBM — INSTAGRAM NEEDS MP4 (CHROME OR SAFARI)", 5000);
    } catch {
      say("COULD NOT RECORD THE VIDEO");
    } finally {
      engine.setAfterRender(null);
      playerRef.current?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
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
      </div>
      <MusicScope bus={noteBus} music={musicHud} label={`ROUTES → MUSIC · ${scope.section.toUpperCase()} · ${piece.bpm} BPM`} />
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
