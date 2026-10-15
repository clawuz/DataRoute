import { useEffect, useMemo, useRef, useState } from "react";
import { createGlobeEngine, hasWebGL2, type GlobeEngine } from "../scene/engine";
import { routeKey } from "../audio/theory";
import { composePiece, type PersonalNote, type PersonalPiece } from "./compose";
import { buildPersonalModel } from "./model";
import { createPersonalPlayer, type PersonalPlayer } from "./player";
import { buildRoutes } from "./routes";
import { countLabel, pieceStats } from "./stats";
import { searchFromSelection, type PersonalSelection } from "./codec";
import { destinationOf, flagOf } from "./destinations";
import { AI_MESSAGE, characterOf, requestAi } from "./ai";
import { MusicScope } from "../hud/MusicScope";
import { baseOf } from "../audio/theory";
import { createNoteBus } from "../audio/notes-bus";
import type { MusicHud } from "../app/hud-model";
import { loadLogo } from "./brand";
import { routePalette } from "./colors";
import { setExtraColors } from "../scene/palette-ext";
import { ISTANBUL } from "./destinations";
import { REEL_H, REEL_SECONDS, REEL_W, drawReelOverlay, drawScopeFrame } from "./reel";
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
  /** the AI version: idle → composing → on (and back to "my version") */
  const [ai, setAi] = useState<"idle" | "composing" | "on">("idle");
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  const aiUrlRef = useRef<string | null>(null);
  /** while the video is made: a still of the current view with a progress screen over it */
  const [making, setMaking] = useState<{ still: string; startedAt: number; kind: "VIDEO" | "CARD" } | null>(null);
  const [makingSec, setMakingSec] = useState(0);
  const noteCbRef = useRef<((n: PersonalNote) => void) | null>(null);
  const pieceRef = useRef<PersonalPiece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState("");
  const noteBus = useMemo(createNoteBus, []);
  const planCbRef = useRef<((n: PersonalNote, wallAt: number) => void) | null>(null);
  const [scope, setScope] = useState<{ pos: number; section: string }>({ pos: 0, section: "" });

  const routes = useMemo(() => buildRoutes(selection.places, selection.home), [selection]);
  const piece = useMemo(() => composePiece(selection.mode, routes), [selection.mode, routes]);
  const palette = useMemo(() => routePalette(routes), [routes]);
  const stats = useMemo(() => pieceStats(selection.mode, selection.places, selection.home, routes), [selection.mode, routes]);

  useEffect(() => {
    if (!hasWebGL2()) {
      setError("WEBGL2 IS NOT AVAILABLE ON THIS DEVICE");
      return;
    }
    const canvas = canvasRef.current!;
    let engine: GlobeEngine;
    try {
      engine = createGlobeEngine(canvas, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, onError: setError, noAirports: true });
    } catch (e) {
      setError(String(e));
      return;
    }
    engineRef.current = engine;
    engine.setNight(true); // always the night side: the lights and the routes read best on it
    engine.setSpaceDim(0.35, false); // a still, quiet sky behind the globe: no drifting clouds
    engine.setPortraitFit(true);
    engine.setPortraitShift(-20); // a phone: the globe sits higher, the music box lower
    engine.setEffects({ cloudShadow: true, glare: true, aurora: false, corridors: true, sound: false, starMap: true });
    const nowSec = () => Date.now() / 1000;
    setExtraColors(palette.rgb); // before the model: the arcs read the palette when they are built
    const model = buildPersonalModel(routes);
    engine.setModel(model, model.span, nowSec());
    engine.setFrameSource(() => ({ absTime: nowSec(), cur: model.span, highlight: -1, nowSec: nowSec() }));
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
        engine.pulseRoute(routeKey(r.from, r.to, "")); // the live globe's flash: the corridor of the sounding route
      };
      // the music box: a note appears on the ribbon three seconds before it sounds
      planCbRef.current = (n, wallAt) => {
        // the lead's own route, or for the accompaniment the route that leads its bar: every hit is on the ribbon
        const r = routes[n.route >= 0 ? n.route : n.via];
        if (!r || n.show === false) return; // the upper tones of a held chord sound but are not drawn again
        // the accompaniment is drawn softer than the line, so the line stays the picture
        noteBus.emit({ instrument: baseOf(n.instrument), lane: baseOf(n.instrument), freq: n.freq, pitch: n.freq, vel: n.route >= 0 ? n.vel : n.vel * 0.55, kind: "line", key: r.key, at: wallAt, durSec: n.d, lineId: r.key });
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
      aiAudioRef.current?.pause();
      engine.dispose();
    };
  }, [routes, piece, palette]);

  useEffect(() => {
    if (!making) {
      setMakingSec(0);
      return;
    }
    const id = setInterval(() => setMakingSec((performance.now() - making.startedAt) / 1000), 200);
    return () => clearInterval(id);
  }, [making]);

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
  const AI_ENDPOINT = (import.meta.env.VITE_PERSONAL_AI_URL as string | undefined) || "";
  const stopAi = () => {
    aiAudioRef.current?.pause();
    playerRef.current?.setSynthMuted(false);
    setAi("idle");
  };
  const startAiAudio = (el: HTMLAudioElement) => {
    el.currentTime = 0;
    void el.play().catch(() => {});
    playerRef.current?.setSynthMuted(true);
    // the visuals restart with it: the ribbon and the route lights follow the same form
    playerRef.current?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
    setAi("on");
  };
  const toggleAi = async () => {
    if (ai === "composing") return;
    if (ai === "on") {
      stopAi();
      return;
    }
    if (aiUrlRef.current && aiAudioRef.current) {
      startAiAudio(aiAudioRef.current);
      return;
    }
    setAi("composing");
    const out = await requestAi(AI_ENDPOINT, characterOf(selection.mode, routes, selection.places.length));
    if (out.status !== "ready") {
      setAi("idle");
      say(AI_MESSAGE[out.status], 5000);
      return;
    }
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.loop = true;
    el.preload = "auto";
    el.src = out.url;
    aiAudioRef.current = el;
    aiUrlRef.current = out.url;
    playerRef.current?.attachElement(el);
    startAiAudio(el);
  };

  /**
   * The Story scene shared by the card and the video: the globe scene itself laid out as 1080×1920 (the stage canvas is given
   * a 9:16 backbuffer and scaled down to fit the window, hidden under the progress screen), turned so Istanbul is in the
   * middle, with the lockup, the numbers and the music box composed over every frame. `work` gets the frame composer.
   */
  const withStory = async (kind: "VIDEO" | "CARD", work: (frame: () => void, comp: HTMLCanvasElement) => Promise<void>) => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const logo = await loadLogo();
    try {
      await document.fonts.load('700 84px "TK Display"');
      await document.fonts.load('500 34px "TK Text Wide"');
    } catch {
      /* system fonts */
    }
    // a still of what the person is looking at stays on screen under the progress card while the stage is re-laid out
    const still = await new Promise<string>((res) => {
      const timer = setTimeout(() => {
        engine.setAfterRender(null);
        res("");
      }, 1500);
      engine.setAfterRender(() => {
        clearTimeout(timer);
        engine.setAfterRender(null);
        res(canvas.toDataURL("image/jpeg", 0.7));
      });
    });
    setMaking({ still, startedAt: performance.now(), kind });
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = REEL_W / dpr;
      const cssH = REEL_H / dpr;
      const k = Math.min(1, (window.innerHeight - 24) / cssH);
      canvas.style.cssText = `position:fixed;inset:auto;left:50%;top:12px;width:${cssW}px;height:${cssH}px;transform-origin:top center;transform:translateX(-50%) scale(${k});z-index:15;cursor:default`;
      document.body.classList.add("recording-reel");
      // the engine re-sizes itself to the new canvas: wait until its backbuffer is the story's size (at most ~4 s)
      for (let i = 0; i < 40 && Math.abs(canvas.width - REEL_W) > 2; i++) await new Promise((r) => setTimeout(r, 100));
      engine.centerOn(ISTANBUL.lat, ISTANBUL.lon, 15); // Istanbul starts in the middle, a little above the centre of the picture
      engine.setIdleSpin(kind === "VIDEO", 5); // the video turns (a visible 45° over its 15 s); the card holds still
      engine.setPortraitFit(false); // the story picture keeps the framing it was drawn for
      engine.setPortraitShift(null);
      engine.setLineScale(2.8 / dpr); // a 1080-wide picture needs lines a few pixels thick
      await new Promise((r) => setTimeout(r, 450));
      const comp = document.createElement("canvas");
      comp.width = REEL_W;
      comp.height = REEL_H;
      const cctx = comp.getContext("2d")!;
      const overlay = document.createElement("canvas");
      overlay.width = REEL_W;
      overlay.height = REEL_H;
      drawReelOverlay(overlay.getContext("2d")!, { stats, dests: selection.places, url: url(), logo }, kind === "VIDEO");
      const frame = () => {
        cctx.drawImage(canvas, 0, 0, REEL_W, REEL_H);
        cctx.drawImage(overlay, 0, 0);
        if (kind === "CARD") return; // the card has no music box: a still ribbon says nothing
        // the music box as it is on screen: its canvas, its label and the routes sounding now
        const box = document.querySelector<HTMLElement>(".music-scope");
        drawScopeFrame(cctx, {
          canvas: box?.querySelector<HTMLCanvasElement>("canvas") ?? null,
          label: box?.querySelector(".music-scope-label")?.textContent?.trim() ?? "",
          items: [...(box?.querySelectorAll<HTMLElement>(".music-scope-now li") ?? [])].map((li) => ({
            text: [...li.children].map((c) => c.textContent?.trim() ?? "").filter(Boolean).join("  "),
            color: li.style.borderLeftColor || "#fff",
          })),
        });
      };
      await work(frame, comp);
    } finally {
      engine.setAfterRender(null);
      engine.setIdleSpin(true, 1);
      engine.setLineScale(1);
      engine.setPortraitFit(true);
      engine.setPortraitShift(-20);
      canvas.style.cssText = "";
      document.body.classList.remove("recording-reel");
      setMaking(null);
    }
  };

  const saveCard = async () => {
    if (!engineRef.current || busy) return;
    setBusy("CARD");
    try {
      await withStory("CARD", async (frame, comp) => {
        const engine = engineRef.current!;
        // one frame of the same scene as the video, taken inside a render so the globe is in the buffer
        await new Promise<void>((res, rej) => {
          const timer = setTimeout(() => {
            engine.setAfterRender(null);
            rej(new Error("no frame (tab in the background?)"));
          }, 3000);
          engine.setAfterRender(() => {
            clearTimeout(timer);
            engine.setAfterRender(null);
            frame();
            res();
          });
        });
        const blob = await new Promise<Blob>((res, rej) => comp.toBlob((b) => (b ? res(b) : rej(new Error("card failed"))), "image/png"));
        await deliver(blob, "a-world-of-music.png", "A World of Music");
      });
    } catch {
      say("COULD NOT MAKE THE CARD");
    } finally {
      setBusy(null);
    }
  };

  const saveClip = async () => {
    const audio = playerRef.current?.audioStream();
    const mime = pickMime();
    if (!engineRef.current || busy) return;
    if (!mime) {
      say("VIDEO IS NOT SUPPORTED HERE — SAVE THE CARD");
      return;
    }
    setBusy("VIDEO");
    try {
      await withStory("VIDEO", async (frame, comp) => {
        const engine = engineRef.current!;
        engine.setAfterRender(frame);
        // the clip's sound is the chorus (the best 15 s), restarted from its first note; afterwards the whole piece goes on
        const hookPiece: PersonalPiece = {
          ...piece,
          notes: piece.notes.filter((n) => n.t >= piece.hook).map((n) => ({ ...n, t: n.t - piece.hook })),
          duration: piece.duration - piece.hook,
          hook: 0,
        };
        playerRef.current?.play(hookPiece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
        const aiEl = aiAudioRef.current;
        if (aiEl && ai === "on" && Number.isFinite(aiEl.duration)) aiEl.currentTime = aiEl.duration * 0.5; // the AI version's chorus (half way, like ours)
        const stream = comp.captureStream(30);
        audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
        const blob = await recordClip(stream, REEL_SECONDS * 1000, mime);
        await deliver(blob, `a-world-of-music.${extOf(mime)}`, "A World of Music");
        if (extOf(mime) !== "mp4") say("THIS BROWSER SAVES WEBM — INSTAGRAM NEEDS MP4 (CHROME OR SAFARI)", 5000);
      });
    } catch {
      say("COULD NOT RECORD THE VIDEO");
    } finally {
      if (aiAudioRef.current && ai === "on") aiAudioRef.current.currentTime = 0;
      playerRef.current?.play(piece, (n) => noteCbRef.current?.(n), (n, at) => planCbRef.current?.(n, at));
      setBusy(null);
    }
  };

  if (error) return <div className="loading">{error}</div>;
  return (
    <>
      <canvas ref={canvasRef} className="stage" role="img" aria-label="A 3D globe with your routes drawn on it, played as music" />
      <header className="topbar">
        <button type="button" className="logo-link" onClick={onBack} aria-label="Turkish Airlines — back to the start">
          <img className="tk-lockup" src="/brand/tk-lockup-light.png" alt="Turkish Airlines" />
        </button>
        <button type="button" className="landing-back" onClick={onBack}>← NEW PIECE</button>
      </header>
      <div className="personal-hud">
        <h1 className="personal-title">{stats.title}</h1>
        <p className="personal-sub">
          {countLabel(stats.destinations, "destination", "destinations")} · {countLabel(stats.countries, "country", "countries")} · {stats.km.toLocaleString("en")} KM{stats.laps >= 0.1 ? ` · ${stats.laps}× AROUND THE EARTH` : ""}
        </p>
        <p className="personal-sub">SIGNATURE VOICE · {stats.signature.toUpperCase()}</p>
      </div>
      <MusicScope bus={noteBus} music={musicHud} routeColors={palette.css} label={`ROUTES → MUSIC · ${scope.section.toUpperCase()} · ${piece.bpm} BPM`} />
      {!running && (
        <button type="button" className="tap-play" onClick={() => playerRef.current?.resume()}>TAP TO PLAY</button>
      )}
      <div className="personal-actions">
        {AI_ENDPOINT && (
          <button type="button" className="ghost-btn" disabled={!!busy || ai === "composing"} onClick={() => void toggleAi()}>
            {ai === "composing" ? "COMPOSING WITH AI · ABOUT A MINUTE…" : ai === "on" ? "AI VERSION · ON — BACK TO MINE" : "AI VERSION"}
          </button>
        )}
        <button type="button" className="compose-btn" disabled={!!busy} onClick={() => setSheet(true)}>
          {busy === "VIDEO" ? `RECORDING ${REEL_SECONDS} S…` : busy === "CARD" ? "MAKING THE CARD…" : "SHARE MY PIECE"}
        </button>
      </div>
      {sheet && (
        <div className="sheet-back" onClick={() => setSheet(false)} role="dialog" aria-label="Share my piece">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet-title">Share my piece</h2>
            <div className="sheet-tiles">
              <button type="button" className="sheet-opt tile" onClick={() => { setSheet(false); void saveClip(); }}>
                <span className="sheet-ico" aria-hidden="true">▶</span>
                <span className="sheet-opt-name">VIDEO</span>
                <span className="sheet-opt-desc">{REEL_SECONDS} seconds · 9:16 · made for Instagram Reels and Stories</span>
              </button>
              <button type="button" className="sheet-opt tile" onClick={() => { setSheet(false); void saveCard(); }}>
                <span className="sheet-ico" aria-hidden="true">▣</span>
                <span className="sheet-opt-name">CARD</span>
                <span className="sheet-opt-desc">An image of your globe and numbers · 9:16 · made for Instagram Stories</span>
              </button>
            </div>
            <button type="button" className="sheet-link" onClick={() => { setSheet(false); void share(); }}>COPY LINK</button>
            <button type="button" className="sheet-link" onClick={() => setSheet(false)}>CLOSE</button>
          </div>
        </div>
      )}
      {making && (
        <div className="making" role="status" aria-live="polite">
          {making.still && <div className="making-still" style={{ backgroundImage: `url(${making.still})` }} />}
          <div className="making-card">
            <div className="making-spin" aria-hidden="true" />
            <div className="making-title">PREPARING YOUR {making.kind}</div>
            <div className="making-sub">
              {making.kind === "VIDEO" ? `Recording ${REEL_SECONDS} seconds of your piece · keep this tab open` : "Framing your globe and numbers · just a moment"}
            </div>
            <div className="making-bar"><i style={{ width: `${Math.min(100, (makingSec / (making.kind === "VIDEO" ? REEL_SECONDS + 2 : 4)) * 100)}%` }} /></div>
          </div>
        </div>
      )}
      {toast && <div className="notice">{toast}</div>}
    </>
  );
}
