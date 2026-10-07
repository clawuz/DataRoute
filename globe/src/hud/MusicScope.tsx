// art:sound — the ROUTES → MUSIC scope: one oscilloscope lane per instrument of the current section
import { useEffect, useRef } from "react";
import type { MusicHud } from "../app/hud-model";
import type { NoteBus, NoteEvent } from "../audio/notes-bus";
import { DECAY_SEC, INSTRUMENT_COLOR, LANE_ORDER, laneSample, stepLane, type Lane } from "../audio/scope";
import type { Instrument } from "../audio/theory";

/** samples kept per lane (≈ 5.3 s of history at 30 Hz) */
export const SCOPE_SAMPLES = 160;
export const SCOPE_RATE = 30;
const STEP = 1 / SCOPE_RATE;
const MAX_QUEUE = 512;

interface LaneTrace {
  lane: Lane;
  ring: Float32Array;
}

const wallSec = () => performance.now() / 1000;

export function MusicScope({ bus, music }: { bus: NoteBus; music: MusicHud }) {
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
    let head = 0; // next ring write position
    let simT = wallSec(); // time of the last simulated sample
    let raf = 0;

    const tick = () => {
      const now = wallSec();
      if (now - simT > 1) simT = now - 1; // after a hidden tab: catch up at most one second
      while (simT + STEP <= now) {
        simT += STEP;
        const hits = new Map<Instrument, { freq: number; vel: number }>();
        const q = queue.current;
        let keep = 0;
        for (const n of q) {
          if (n.at <= simT) {
            const prev = hits.get(n.instrument);
            if (!prev || n.vel >= prev.vel) hits.set(n.instrument, { freq: n.freq, vel: n.vel });
          } else q[keep++] = n;
        }
        q.length = keep;
        for (const [inst, t] of traces) {
          t.lane = stepLane(t.lane, STEP, DECAY_SEC[inst] ?? 1, hits.get(inst));
          t.ring[head] = laneSample(t.lane);
        }
        head = (head + 1) % SCOPE_SAMPLES;
      }
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
      const lanes = LANE_ORDER.filter((i) => m.instruments.includes(i));
      if (lanes.length === 0) return;
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = m.on ? 0.9 : 0.55;
      g.lineWidth = 1.2 * dpr;
      const laneH = h / lanes.length;
      const dx = w / (SCOPE_SAMPLES - 1);
      lanes.forEach((inst, k) => {
        const t = traces.get(inst)!;
        const mid = (k + 0.5) * laneH;
        const scale = 0.42 * laneH;
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
    <div className="music-scope">
      <div className="music-scope-wave" aria-hidden="true">
        <canvas ref={canvasRef} className="music-scope-canvas" />
        {!music.on && <div className="music-scope-off label">SOUND OFF · PRESS M</div>}
      </div>
      <div className="music-scope-label label">{`ROUTES → MUSIC · ${music.section} · ${music.chord} · ${music.bpm} BPM`}</div>
    </div>
  );
}
