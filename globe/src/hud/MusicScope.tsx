// art:sound — the ROUTES → MUSIC scope: a pitch ribbon of the flight lines over a rhythm strip of the groove
import { useEffect, useRef } from "react";
import type { MusicHud } from "../app/hud-model";
import type { NoteBus, NoteEvent } from "../audio/notes-bus";
import {
  DECAY_SEC, INSTRUMENT_COLOR, LANE_ORDER, TRAIL_TTL_SEC, laneSample, pruneTrails, pushTrail, stepLane, trailIdOf,
  type Lane, type Trail,
} from "../audio/scope";
import type { Instrument } from "../audio/theory";

/** samples kept per rhythm lane (≈ 5.3 s of history at 30 Hz) */
export const SCOPE_SAMPLES = 160;
export const SCOPE_RATE = 30;
/** share of the canvas height of the pitch ribbon (the rhythm strip gets the rest) */
export const RIBBON_SHARE = 0.7;
const STEP = 1 / SCOPE_RATE;
const MAX_QUEUE = 512;
/** seconds of history across the ribbon's width (a trail fades out over the same time) */
const RIBBON_SEC = TRAIL_TTL_SEC;
const DOT_PX = 1.6;

interface LaneTrace {
  lane: Lane;
  ring: Float32Array;
}

const wallSec = () => performance.now() / 1000;

export function MusicScope({ bus, music, compact = false }: { bus: NoteBus; music: MusicHud; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const queue = useRef<NoteEvent[]>([]);

  useEffect(
    () =>
      bus.subscribe((n) => {
        const q = queue.current;
        if (q.length >= MAX_QUEUE) q.shift();
        q.push(n);
      }),
    [bus],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas?.getContext("2d") ?? null;
    } catch {
      ctx = null;
    }
    if (!canvas || !ctx) return; // no 2D canvas (jsdom, blocked): the label alone
    const g = ctx;
    const traces = new Map<Instrument, LaneTrace>(
      LANE_ORDER.map((i) => [i, { lane: { amp: 0, phase: 0, hz: 2 }, ring: new Float32Array(SCOPE_SAMPLES) }]),
    );
    const trails = new Map<string, Trail>();
    const beats: NoteEvent[] = []; // sounded groove notes not yet sampled into their lane
    let head = 0; // next ring write position
    let simT = wallSec(); // time of the last simulated sample
    let raf = 0;

    const tick = () => {
      const now = wallSec();
      if (now - simT > 1) simT = now - 1; // after a hidden tab: catch up at most one second
      // sounding notes: flight lines (and the Istanbul ensemble) join their trail, groove voices wait for their sample
      const q = queue.current;
      let keep = 0;
      for (const n of q) {
        if (n.at > now) q[keep++] = n;
        else if (traces.has(n.lane)) beats.push(n);
        else if (trailIdOf(n) !== null) pushTrail(trails, n, INSTRUMENT_COLOR[n.instrument]);
      }
      q.length = keep;
      while (simT + STEP <= now) {
        simT += STEP;
        const hits = new Map<Instrument, { freq: number; vel: number }>();
        let kept = 0;
        for (const n of beats) {
          if (n.at <= simT) {
            const prev = hits.get(n.lane);
            if (!prev || n.vel >= prev.vel) hits.set(n.lane, { freq: n.freq, vel: n.vel });
          } else beats[kept++] = n;
        }
        beats.length = kept;
        for (const [inst, t] of traces) {
          t.lane = stepLane(t.lane, STEP, DECAY_SEC[inst] ?? 0.3, hits.get(inst));
          t.ring[head] = laneSample(t.lane);
        }
        head = (head + 1) % SCOPE_SAMPLES;
      }
      pruneTrails(trails, now);
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      const m = musicRef.current;
      const base = m.on ? 0.9 : 0.55;
      g.globalCompositeOperation = "lighter";
      g.lineWidth = 1.2 * dpr;

      // pitch ribbon (top 70 %): x = right − age·px/s, y = (1 − pitchY)·height, alpha fading with age
      const now = wallSec();
      const ribbonH = RIBBON_SHARE * h;
      const pxPerSec = w / RIBBON_SEC;
      const xOf = (t: number) => w - (now - t) * pxPerSec;
      const yOf = (y: number) => (1 - y) * ribbonH;
      for (const tr of trails.values()) {
        const age = Math.max(0, now - tr.lastHit);
        g.globalAlpha = base * Math.max(0.15, 1 - age / RIBBON_SEC);
        g.strokeStyle = tr.color;
        g.beginPath();
        tr.points.forEach((p, j) => {
          if (j === 0) g.moveTo(xOf(p.t), yOf(p.y));
          else g.lineTo(xOf(p.t), yOf(p.y));
        });
        g.stroke();
        g.fillStyle = tr.color;
        for (const p of tr.points) {
          const x = xOf(p.t);
          if (x < 0) continue;
          g.beginPath();
          g.arc(x, yOf(p.y), DOT_PX * dpr, 0, 2 * Math.PI);
          g.fill();
        }
      }

      // rhythm strip (bottom 30 %): one thin waveform lane per groove voice
      g.globalAlpha = base;
      const laneH = (h - ribbonH) / LANE_ORDER.length;
      const dx = w / (SCOPE_SAMPLES - 1);
      LANE_ORDER.forEach((inst, k) => {
        const t = traces.get(inst)!;
        const mid = ribbonH + (k + 0.5) * laneH;
        const scale = 0.45 * laneH;
        g.strokeStyle = INSTRUMENT_COLOR[inst];
        g.beginPath();
        for (let j = 0; j < SCOPE_SAMPLES; j++) {
          // oldest sample on the left, newest on the right: the trace scrolls left
          const y = mid - scale * t.ring[(head + j) % SCOPE_SAMPLES];
          if (j === 0) g.moveTo(0, y);
          else g.lineTo(j * dx, y);
        }
        g.stroke();
      });
    };

    const frame = () => {
      try {
        tick();
        draw();
      } catch {
        /* the scope is decorative: never break the HUD */
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`music-scope${compact ? " compact" : ""}`}>
      <div className="music-scope-wave" aria-hidden="true">
        <canvas ref={canvasRef} className="music-scope-canvas" />
        {!music.on && <div className="music-scope-off label">SOUND OFF · PRESS M</div>}
      </div>
      <div className="music-scope-label label">{`ROUTES → MUSIC · ${music.section} · `}<span className="music-scope-chord">{music.chord}</span>{` · ${music.bpm} BPM`}</div>
    </div>
  );
}
