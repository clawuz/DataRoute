// art:sound — the ROUTES → MUSIC scope: a pitch ribbon of the flight lines over a rhythm strip of the groove
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DayCurveHud, MusicHud } from "../app/hud-model";
import type { NoteBus, NoteEvent } from "../audio/notes-bus";
import {
  DECAY_SEC, INSTRUMENT_COLOR, LANE_ORDER, NOTE_BAR_H_PX, SECTION_COLOR, TRACK_MAX_POINTS, TRACK_MAX_TRAILS, TRACK_RIBBON_SEC, TRAIL_TTL_SEC, layerColor, laneSample, levelSegments,
  dayLabel, altHeight, noteBar, pickShown, playingNow, playingPush, pruneTrails, pushTrail, routeColor, routeOfNote, scopeLabel, stepLane, windowAt, trailIdOf, type Lane, type Playing, type Trail,
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

const PLANE_PATH: Path2D | null = typeof Path2D !== "undefined" ? new Path2D("M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z") : null;
/** a small aeroplane pictogram (the Material "flight" glyph) centred at (cx, cy), `deg` clockwise from nose-up */
function planeIcon(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, deg: number): void {
  if (!PLANE_PATH) return;
  g.save();
  g.translate(cx, cy);
  g.rotate((deg * Math.PI) / 180);
  g.scale(size / 24, size / 24);
  g.translate(-12, -12);
  g.fill(PLANE_PATH);
  g.restore();
}
const ROUTE_ID = /^[A-Z]{3}-[A-Z]{3}$/;

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

export function MusicScope({ bus, music, compact = false, footer, label, routeColors }: { bus: NoteBus; music: MusicHud; compact?: boolean; footer?: ReactNode; /** replaces the headline (the personal globe names its own piece) */ label?: string; /** a colour per route key, the same the globe draws it in (otherwise a hash of the key) */ routeColors?: ReadonlyMap<string, string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const colorsRef = useRef(routeColors);
  colorsRef.current = routeColors;
  const colorOf = (route: string): string => colorsRef.current?.get(route) ?? routeColor(route);
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
        pushTrail(trails, n, colorOf(routeOfNote(n)!), TRACK_MAX_POINTS, TRACK_MAX_TRAILS);
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
      // the live screen of the new link: an altitude ladder at the left, the departure airport at the left end of the ribbon and
      // the arrival airport at the right end, both lit at the altitude of the note that sounds
      const ladder = wide && !!m.day && document.body.classList.contains("personal-build");
      const narrow = canvas.clientWidth < 520;
      const ladderW = ladder ? (narrow ? 30 : 56) * dpr : 0;
      const chipW = ladder ? (narrow ? 30 : 38) * dpr : 0;
      const chipH = (narrow ? 11 : 13) * dpr;
      const xL = ladder ? ladderW + chipW + 8 * dpr : 0;
      const xR = ladder ? w - chipW - 8 * dpr : w;
      const top = ladder ? 24 * dpr : 0;
      const innerH = ladder ? ribbonH - top - 4 * dpr : ribbonH;
      const pxPerSec = ladder ? (xR - xL) / ribbonSec : w / ribbonSec;
      const px0 = ladder ? xL + (xR - xL) * 0.72 : wide ? 0.78 * w : w; // the reading line (generative: the right edge)
      const xOf = (t: number) => px0 - (now - t) * pxPerSec;
      const yOf = ladder ? (y: number) => top + (1 - y) * innerH : (y: number) => (1 - y) * ribbonH;
      const active: { id: string; y: number; color: string; t: number }[] = [];
      if (ladder) {
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
        g.font = `${9 * dpr}px ui-monospace, Menlo, Consolas, monospace`;
        g.textAlign = "right";
        g.textBaseline = "middle";
        for (let k = 0; k <= 4; k++) {
          const y = yOf(k / 4);
          g.fillStyle = "rgba(242, 245, 250, 0.78)";
          g.fillText(narrow ? String(k * 100) : `FL${String(k * 100).padStart(3, "0")}`, ladderW - 8 * dpr, y);
          g.fillStyle = "rgba(242, 245, 250, 0.07)";
          g.fillRect(ladderW, y, w - ladderW - 6 * dpr, 1);
        }
        g.fillStyle = "rgba(242, 245, 250, 0.22)";
        for (let k = 0; k <= 40; k++) g.fillRect(ladderW - (k % 5 === 0 ? 9 : 5) * dpr, yOf(k / 40), (k % 5 === 0 ? 9 : 5) * dpr, 1);
        // the two ends of every flight, always on show
        g.fillStyle = "rgba(233, 237, 245, 0.7)";
        planeIcon(g, ladderW + chipW / 2 + 2 * dpr, 11 * dpr, 15 * dpr, 50);
        planeIcon(g, w - chipW / 2 - 6 * dpr, 11 * dpr, 15 * dpr, 130);
        g.fillRect(ladderW + chipW / 2 - 9 * dpr, 18 * dpr, 22 * dpr, 1.5 * dpr);
        g.fillRect(w - chipW / 2 - 17 * dpr, 18 * dpr, 22 * dpr, 1.5 * dpr);
        g.fillStyle = "rgba(242, 245, 250, 0.55)";
        g.font = `${8.5 * dpr}px ui-monospace, Menlo, Consolas, monospace`;
        g.textAlign = "left";
        g.fillText("FROM", ladderW + chipW / 2 + 14 * dpr, 11 * dpr);
        g.textAlign = "right";
        g.fillText("TO", w - chipW / 2 - 16 * dpr, 11 * dpr);
        g.globalCompositeOperation = "lighter";
        g.save();
        g.beginPath();
        g.rect(xL, 0, xR - xL, ribbonH);
        g.clip();
      }
      const yOfPoint = (p: { y: number; alt?: number }, id: string): number => (ladder ? yOf(altHeight(p.alt, id, p.y)) : yOf(p.y));
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
            g.fillRect(x, yOfPoint(p, tr.lineId) - hh / 2, bw, hh);
            if (ladder && age >= 0 && age < Math.max(p.dur, 0.4) && ROUTE_ID.test(tr.lineId)) active.push({ id: tr.lineId, y: yOfPoint(p, tr.lineId), color: tr.color, t: p.t });
          } else g.fillRect(x, yOf(p.y) - barH / 2, bw, barH);
        }
        g.shadowBlur = 0;
      }
      if (ladder) {
        g.restore();
        // the airports of the notes that sound now (the newest three), at their altitude
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
        active.sort((a, b) => b.t - a.t);
        const act = active.slice(0, 3).sort((a, b) => a.y - b.y);
        for (let i = 1; i < act.length; i++) if (act[i].y - act[i - 1].y < chipH + 2 * dpr) act[i].y = act[i - 1].y + chipH + 2 * dpr;
        g.font = `bold ${(narrow ? 8 : 9) * dpr}px ui-monospace, Menlo, Consolas, monospace`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        for (const a of act) {
          const [from, to] = a.id.split("-");
          for (const [x, txt] of [[ladderW + 4 * dpr, from], [w - chipW - 4 * dpr, to]] as [number, string][]) {
            g.fillStyle = a.color;
            g.fillRect(x, a.y - chipH / 2, chipW, chipH);
            g.fillStyle = "#05070f";
            g.fillText(txt, x + chipW / 2, a.y + 0.5 * dpr);
          }
        }
        g.globalCompositeOperation = "lighter";
      }
      if (wide) { // the reading line
        g.globalAlpha = 0.9;
        g.fillStyle = "#fff";
        g.fillRect(px0 - 0.75 * dpr, 0, 1.5 * dpr, ribbonH);
        planePath(g, px0, 0, 9 * dpr); // an aeroplane (nose up) instead of a triangle
        g.fill();
      }
      // the route names are in the list under the box, not over the notes (it was too crowded)
      g.globalAlpha = 1;
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
    const shownAt = new Map<string, number>();
    let shown: string[] = [];
    const list = setInterval(() => { // art:track — the NOW PLAYING list refreshes ~6 Hz
      // with more routes than rows each route gets its turn (see pickShown)
      const now = wallSec();
      const cur = pickShown(playingNow(playing.current, now, 99), shown, shownAt, now, 6);
      shown = cur.map((p) => p.route);
      setNowList((prev) => (prev.length === cur.length && prev.every((p, i) => p.route === cur[i].route && p.note === cur[i].note) ? prev : cur));
    }, 160);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(list);
    };
  }, []);

  const [head, chord, tail] = label !== undefined ? [label, "", ""] : music.day ? [dayLabel(music.day), "", ""] : scopeLabel(music);
  const segColor = SECTION_COLOR[music.section] ?? SECTION_COLOR.DAY;
  return (
    <div className={`music-scope${compact ? " compact" : ""}`}>
      <div className="music-scope-wave" aria-hidden="true">
        <canvas ref={canvasRef} className="music-scope-canvas" />
        {!music.on && <div className="music-scope-off label">{typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "SOUND OFF · TAP SOUND" : "SOUND OFF · PRESS M"}</div>}
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
            <li key={p.route} style={{ borderLeftColor: colorOf(p.route) }}>
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
