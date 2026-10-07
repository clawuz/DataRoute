// art:sound — the ROUTES → MUSIC scope: a pitch ribbon of the flight lines over a rhythm strip of the groove
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DayCurveHud, MusicHud } from "../app/hud-model";
import type { NoteBus, NoteEvent } from "../audio/notes-bus";
import {
  DECAY_SEC, INSTRUMENT_COLOR, LANE_ORDER, NOTE_BAR_H_PX, SECTION_COLOR, TRACK_MAX_POINTS, TRACK_MAX_TRAILS, TRACK_RIBBON_SEC, TRAIL_TTL_SEC, layerColor, laneSample, levelSegments,
  dayLabel, noteBar, playingNow, playingPush, pruneTrails, pushTrail, routeColor, routeOfNote, scopeLabel, stepLane, windowAt, trailIdOf, type Lane, type Playing, type Trail,
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

interface LaneTrace {
  lane: Lane;
  ring: Float32Array;
}

const wallSec = () => performance.now() / 1000;

/** art:track — path of a small aeroplane seen from above, nose pointing up, spanning `s` px from `top` at centre `cx` */
function planePath(g: CanvasRenderingContext2D, cx: number, top: number, s: number): void {
  const pts: [number, number][] = [
    [0, 1], [0.1, 0.78], [0.1, 0.56], [0.5, 0.3], [0.5, 0.18], [0.1, 0.36], [0.1, 0.18], [0.27, 0.04], [0.27, 0], [0.04, 0.1], [0, 0.1],
  ];
  const mirror = pts.slice(1, -1).reverse().map(([x, y]): [number, number] => [-x, y]);
  g.beginPath();
  [...pts.slice(0, -1), ...mirror].forEach(([x, y], i) => (i === 0 ? g.moveTo(cx + x * s, top + (1 - y) * s) : g.lineTo(cx + x * s, top + (1 - y) * s)));
  g.closePath();
}

/** art:track — bottom 30 % of the scope: the 24 h airborne curve with the 8 music windows and the playhead */
function drawDay(g: CanvasRenderingContext2D, d: DayCurveHud, w: number, top: number, h: number, dpr: number, base: number): void {
  const pad = 3 * dpr;
  const y0 = top + pad;
  const y1 = h - pad;
  const n = d.curve.length;
  if (n < 2) return;
  const xOf = (i: number) => (i / (n - 1)) * w;
  const yOf = (v: number) => y1 - v * (y1 - y0);
  g.globalCompositeOperation = "source-over";
  // window dividers (the music is composed in `windows` pieces); the current window is lightly lit
  const cur = windowAt(d.pos, d.windows);
  g.fillStyle = "rgba(160, 200, 255, 0.07)";
  g.fillRect((cur / d.windows) * w, y0, w / d.windows, y1 - y0);
  g.strokeStyle = "rgba(160, 200, 255, 0.22)";
  g.lineWidth = 1 * dpr;
  for (let k = 1; k < d.windows; k++) {
    const x = (k / d.windows) * w;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y1);
    g.stroke();
  }
  // the curve: area + line
  g.globalAlpha = base;
  g.beginPath();
  g.moveTo(0, y1);
  d.curve.forEach((v, i) => g.lineTo(xOf(i), yOf(v)));
  g.lineTo(w, y1);
  g.closePath();
  g.fillStyle = "rgba(90, 190, 255, 0.18)";
  g.fill();
  g.beginPath();
  d.curve.forEach((v, i) => (i === 0 ? g.moveTo(xOf(i), yOf(v)) : g.lineTo(xOf(i), yOf(v))));
  g.strokeStyle = "rgba(120, 210, 255, 0.95)";
  g.lineWidth = 1.4 * dpr;
  g.stroke();
  // playhead on the curve, its dot at the traffic right now
  const px = d.pos * w;
  g.globalAlpha = 1;
  g.strokeStyle = "rgba(255, 255, 255, 0.85)";
  g.lineWidth = 1.2 * dpr;
  g.beginPath();
  g.moveTo(px, y0);
  g.lineTo(px, y1);
  g.stroke();
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(px, yOf(d.level), 2.6 * dpr, 0, Math.PI * 2);
  g.fill();
}

export function MusicScope({ bus, music, compact = false, footer }: { bus: NoteBus; music: MusicHud; compact?: boolean; footer?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const queue = useRef<NoteEvent[]>([]);
  const fresh = useRef<NoteEvent[]>([]); // art:track — recorded-track notes enter the ribbon when published (ahead of their sound)
  const playing = useRef<Playing[]>([]); // art:track — the routes sounding right now
  const [nowList, setNowList] = useState<Playing[]>([]);

  useEffect(
    () =>
      bus.subscribe((n) => {
        const q = queue.current;
        if (q.length >= MAX_QUEUE) q.shift();
        q.push(n);
        if (routeOfNote(n)) fresh.current.push(n); // art:track
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
    let ribbonSec = RIBBON_SEC; // art:track — the window widens while the recorded track plays
    let lastTrackHit = -Infinity;

    const tick = () => {
      const now = wallSec();
      if (now - simT > 1) simT = now - 1; // after a hidden tab: catch up at most one second
      // sounding notes: flight lines (and the Istanbul ensemble) join their trail, groove voices wait for their sample
      for (const n of fresh.current) { // art:track — recorded-track notes take their route's colour, drawn ahead of the reading line
        lastTrackHit = now;
        pushTrail(trails, n, routeColor(routeOfNote(n)!), TRACK_MAX_POINTS, TRACK_MAX_TRAILS);
      }
      fresh.current.length = 0;
      const q = queue.current;
      let keep = 0;
      for (const n of q) {
        if (n.at > now) q[keep++] = n;
        else if (traces.has(n.lane)) beats.push(n);
        else if (routeOfNote(n)) playing.current = playingPush(playing.current, n, now); // the list shows the notes that sound now
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
      ribbonSec = now - lastTrackHit < 8 ? TRACK_RIBBON_SEC : RIBBON_SEC;
      pruneTrails(trails, now, ribbonSec);
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

      // pitch ribbon (top 70 %): x = right − age·px/s, y = (1 − pitchY)·height, alpha fading with age; each note is a
      // thick bar as long as the note (v5), over the thin trail line
      const now = wallSec();
      const ribbonH = (m.day ? 0.8 : RIBBON_SHARE) * h; // the recorded track gets a taller ribbon over a slimmer day curve
      const wide = ribbonSec > RIBBON_SEC; // the recorded track: a reading line, notes flow through it
      const pxPerSec = w / ribbonSec;
      const px0 = wide ? 0.78 * w : w; // the reading line (generative: the right edge)
      const xOf = (t: number) => px0 - (now - t) * pxPerSec;
      const yOf = (y: number) => (1 - y) * ribbonH;
      const labels: { x: number; y: number; text: string; color: string }[] = [];
      for (const tr of trails.values()) {
        const age = Math.max(0, now - tr.lastHit);
        g.globalAlpha = base * (wide ? 1 : Math.max(0.15, 1 - age / ribbonSec));
        g.strokeStyle = tr.color;
        if (!wide) {
          g.beginPath();
          tr.points.forEach((p, j) => {
            if (j === 0) g.moveTo(xOf(p.t), yOf(p.y));
            else g.lineTo(xOf(p.t), yOf(p.y));
          });
          g.stroke();
        }
        g.fillStyle = tr.color;
        const barH = (wide ? 2.2 : NOTE_BAR_H_PX) * dpr; // thin, long lines
        for (const p of tr.points) {
          const [x, bw] = noteBar(xOf(p.t), p.dur, pxPerSec, dpr);
          if (x + bw < 0 || x > w) continue;
          if (wide) {
            // ahead of the line: dim · under the line (sounding): bright and glowing · behind: fading
            const age = now - p.t;
            const sounding = age >= 0 && age < Math.max(p.dur, 0.25);
            g.globalAlpha = base * (age < 0 ? 0.4 : sounding ? 1 : Math.max(0.15, 1 - age / (ribbonSec * 0.78)));
            g.shadowColor = tr.color;
            g.shadowBlur = sounding ? 6 * dpr : 0; // a tight glow, not a blob (additive blending)
            const hh = sounding ? barH * 1.7 : barH;
            g.fillRect(x, yOf(p.y) - hh / 2, bw, hh);
            if (sounding && p.v > 0.8) labels.push({ x, y: yOf(p.y) - barH * 2, text: tr.lineId.replace("-", "→"), color: tr.color });
          } else g.fillRect(x, yOf(p.y) - barH / 2, bw, barH);
        }
        g.shadowBlur = 0;
      }
      if (wide) { // the reading line
        g.globalAlpha = 0.9;
        g.fillStyle = "#fff";
        g.fillRect(px0 - 0.75 * dpr, 0, 1.5 * dpr, ribbonH);
        planePath(g, px0, 0, 9 * dpr); // an aeroplane (nose up) instead of a triangle
        g.fill();
      }
      // ribbon+: the strongest notes name their route
      g.globalAlpha = 1;
      g.font = `${Math.round(9 * dpr)}px ui-monospace, monospace`;
      for (const l of labels.slice(-5)) {
        g.fillStyle = l.color;
        g.fillText(l.text, Math.min(l.x, w - 54 * dpr), Math.max(10 * dpr, l.y));
      }

      if (m.day) { // art:track — the day's traffic curve replaces the (silent) rhythm strip
        drawDay(g, m.day, w, ribbonH, h, dpr, base);
        return;
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
    const list = setInterval(() => { // art:track — the NOW PLAYING list refreshes ~6 Hz
      const cur = playingNow(playing.current, wallSec(), 6);
      setNowList((prev) => (prev.length === cur.length && prev.every((p, i) => p.route === cur[i].route && p.note === cur[i].note) ? prev : cur));
    }, 160);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(list);
    };
  }, []);

  const [head, chord, tail] = music.day ? [dayLabel(music.day), "", ""] : scopeLabel(music);
  const segColor = SECTION_COLOR[music.section] ?? SECTION_COLOR.DAY;
  return (
    <div className={`music-scope${compact ? " compact" : ""}`}>
      <div className="music-scope-wave" aria-hidden="true">
        <canvas ref={canvasRef} className="music-scope-canvas" />
        {!music.on && <div className="music-scope-off label">SOUND OFF · PRESS M</div>}
        {/* v4: the rhythm level (five segments) and one dot per active region layer, over the rhythm strip */}
        {!music.day && <div className="music-scope-meter"> {/* art:track — the rhythm level and region dots belong to the generative engine */}
          <div className="music-scope-level">
            {levelSegments(music.level).map((on, i) => (
              <span key={i} className={`seg${on ? " on" : ""}${i === music.level ? " cur" : ""}`} style={on ? { background: segColor } : undefined} />
            ))}
          </div>
          <div className="music-scope-layers">
            {music.layers.map((r) => (
              <span key={r} className="dot" data-region={r} style={{ background: layerColor(r) }} />
            ))}
          </div>
        </div>}
      </div>
      {music.on && <div className="music-scope-label label">{head}<span className="music-scope-chord">{chord}</span>{tail}</div>}
      {music.day && ( // art:track — always rendered at a fixed height
        <ul className="music-scope-now" aria-label="Routes playing now">
          {nowList.map((p) => (
            <li key={p.route} style={{ borderLeftColor: routeColor(p.route) }}>
              <span className="route">{p.route.replace("-", " → ")}</span>
              <span className="note">{p.note}</span>
              {p.alt !== undefined && <span className="np-alt">{Math.round(p.alt / 100) * 100} ft</span>}
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
}
