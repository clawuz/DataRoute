// art:sound — the ROUTES → MUSIC scope: a pitch ribbon of the flight lines over a rhythm strip of the groove
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DayCurveHud, MusicHud } from "../app/hud-model";
import type { NoteBus, NoteEvent } from "../audio/notes-bus";
import {
  DECAY_SEC, INSTRUMENT_COLOR, LANE_ORDER, NOTE_BAR_H_PX, SECTION_COLOR, TRACK_MAX_POINTS, TRACK_MAX_TRAILS, TRACK_RIBBON_SEC, TRAIL_TTL_SEC, layerColor, laneSample, levelSegments,
  dayLabel, altHeight, noteBar, pickShown, playingNow, playingPush, pruneTrails, pushTrail, routeColor, routeOfNote, scopeLabel, stepLane, windowAt, trailIdOf, type Lane, type Playing, type Trail,
} from "../audio/scope";
import type { Instrument } from "../audio/theory";
import { ROUTE_HEX, routeHex } from "../scene/route-palette";

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
const key = (k: string) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));

// the airline's pictograms (1080 × 1080 artboards): take-off, landing and flight (an aeroplane seen from above, nose to the right)
export const TAKEOFF_D = "M912.99,755.94H188.96v53.36h724.03v-53.36ZM328.98,241.95l-24.76,11.1,155.82,166.06-83.67,47.39-92.21-43.97c-33.73-16.22-54.64-17.5-90.5-4.7l-38.85,14.09,188.69,164.78,549.43-234.8c39.7-17.08,59.77-41.84,52.08-62.76-14.94-41.84-137.04-47.39-202.35-18.36l-127.22,56.78-187.84-92.21c-37.14-18.78-61.05-20.07-98.62-3.42";
export const LANDING_D = "M908.7,725.87H184.67v53.36h724.03v-53.36ZM690.13,673.79c23.91,0,37.99-14.09,37.99-38.42s-14.09-38.85-37.99-38.85-37.99,14.09-37.99,38.85,13.66,38.42,37.99,38.42M435.69,171.75l-26.89-4.7,33.3,224.98-95.63-8.54-51.23-88.8c-18.36-33.3-34.58-45.68-71.29-55.5l-40.13-10.67,60.62,242.91,585.71,120.39c41.84,8.54,72.57-.85,78.55-21.77,11.53-43.12-85.38-117.4-155.82-130.63l-136.61-26.04-101.6-182.71c-19.64-36.29-38.42-50.8-78.98-58.91";
export const FLIGHT_D = "M933.83,548.42c0-30.46-53.83-70.94-124.36-70.94h-157.74l-108.5-197.39c-20.03-36.72-44.24-50.91-86.38-50.91h-39.64l73.45,256.23-156.07,12.52-44.24-57.17c-16.28-21.7-30.05-30.05-57.17-33.39l-47.57-6.68,58.42,147.73-58.42,147.73,47.57-6.68c27.13-3.34,40.9-11.68,57.17-33.38l44.24-57.17,156.07,12.52-73.45,256.23h39.64c42.15,0,66.35-14.19,86.38-50.91l108.5-197.39h157.74c70.53,0,124.36-40.48,124.36-70.94";
const PICTO: Record<"takeoff" | "landing" | "flight", Path2D | null> = {
  takeoff: typeof Path2D !== "undefined" ? new Path2D(TAKEOFF_D) : null,
  landing: typeof Path2D !== "undefined" ? new Path2D(LANDING_D) : null,
  flight: typeof Path2D !== "undefined" ? new Path2D(FLIGHT_D) : null,
};
/** a pictogram centred at (cx, cy), `size` px for the artwork's ≈ 800-unit extent, `deg` clockwise */
function pictogram(g: CanvasRenderingContext2D, kind: "takeoff" | "landing" | "flight", cx: number, cy: number, size: number, deg = 0): void {
  const path = PICTO[kind];
  if (!path) return;
  g.save();
  g.translate(cx, cy);
  g.rotate((deg * Math.PI) / 180);
  g.scale(size / 800, size / 800);
  g.translate(-540, -540);
  g.fill(path);
  g.restore();
}
const ROUTE_ID = /^[A-Z]{3}-[A-Z]{3}$/;
/** altitude (ft) → 0..1 on the live ladder: more height for the levels where most of the flying is (20,000–40,000 ft) */
const ALT_KNOTS: [number, number][] = [[0, 0], [10000, 0.12], [20000, 0.26], [30000, 0.45], [40000, 1]];
const altU = (ft: number): number => {
  const f = Math.min(40000, Math.max(0, ft));
  for (let i = 1; i < ALT_KNOTS.length; i++) {
    if (f <= ALT_KNOTS[i][0]) {
      const [f0, u0] = ALT_KNOTS[i - 1], [f1, u1] = ALT_KNOTS[i];
      return u0 + ((f - f0) / (f1 - f0)) * (u1 - u0);
    }
  }
  return 1;
};
/** a small fixed offset per route (−4 … +4 lines) so two routes at the same altitude do not lie on one another */
const routeLift = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 9) - 4;
};
const LADDER_FT = [0, 10000, 20000, 30000, 35000, 40000];
/** the live screen's route colours (shared with the globe): a route keeps one of red, white, blue and grey */
function neonRouteColor(route: string): string {
  const [a, b] = route.split("-");
  return a && b ? routeHex(a, b) : ROUTE_HEX[0];
}
const DARK_INK = new Set<string>(["#f4f8ff", "#9aa4b8"]); // chips in these colours take dark text

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

export function MusicScope({ bus, music, compact = false, footer, label, routeColors, controls, action }: { bus: NoteBus; music: MusicHud; compact?: boolean; footer?: ReactNode; /** the live screen's own play / pause ring and Live pill */ controls?: { paused: boolean; replay: boolean }; /** the pill at the box's top right (default: "make your own music", which opens the wish list) */ action?: { label: string; onClick: () => void; busy?: boolean }; /** replaces the headline (the personal globe names its own piece) */ label?: string; /** a colour per route key, the same the globe draws it in (otherwise a hash of the key) */ routeColors?: ReadonlyMap<string, string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const musicRef = useRef(music);
  musicRef.current = music;
  const colorsRef = useRef(routeColors);
  colorsRef.current = routeColors;
  const colorOf = (route: string): string => colorsRef.current?.get(route) ?? (typeof document !== "undefined" && document.body.classList.contains("personal-build") ? neonRouteColor(route) : routeColor(route));
  const queue = useRef<NoteEvent[]>([]);
  const fresh = useRef<NoteEvent[]>([]); // art:track — recorded-track notes enter the ribbon when published (ahead of their sound)
  const playing = useRef<Playing[]>([]); // art:track — the routes sounding right now
  const [nowList, setNowList] = useState<Playing[]>([]);
  const [collapsed, setCollapsed] = useState(false); // the live screen's music box can be folded down to its tab

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
      const wide = ribbonSec > RIBBON_SEC; // the recorded track: a reading line, notes flow through it
      const neon = wide && !!m.day && document.body.classList.contains("personal-build");
      const ribbonH = (m.day ? (neon ? 0.97 : 0.8) : RIBBON_SHARE) * h; // the recorded track gets a taller ribbon over a slimmer day curve
      // the live screen of the new link: an altitude ladder at the left, the departure airport at the left end of the ribbon and
      // the arrival airport at the right end, both lit at the altitude of the note that sounds
      const ladder = wide && !!m.day && document.body.classList.contains("personal-build");
      const narrow = canvas.clientWidth < 520;
      const ladderW = ladder ? (narrow ? 30 : 56) * dpr : 0;
      const chipW = ladder ? (narrow ? 30 : 38) * dpr : 0;
      const chipH = (narrow ? 11 : 13) * dpr;
      const xL = ladder ? ladderW + chipW + 8 * dpr : 0;
      const xR = ladder ? w - chipW - 8 * dpr : w;
      const top = ladder ? 10 * dpr : 0;
      const innerH = ladder ? ribbonH - top - 4 * dpr : ribbonH;
      const pxPerSec = ladder ? (xR - xL) / ribbonSec : w / ribbonSec;
      const px0 = ladder ? xL + (xR - xL) * 0.5 : wide ? 0.78 * w : w; // the reading line (generative: the right edge)
      const xOf = (t: number) => px0 - (now - t) * pxPerSec;
      const yOf = ladder ? (y: number) => top + (1 - y) * innerH : (y: number) => (1 - y) * ribbonH;
      const active: { id: string; y: number; color: string; t: number }[] = [];
      if (ladder) {
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
        g.font = `${9 * dpr}px ui-monospace, Menlo, Consolas, monospace`;
        g.textAlign = "right";
        g.textBaseline = "middle";
        for (const ft of LADDER_FT) {
          const y = yOf(altU(ft));
          g.fillStyle = "rgba(242, 245, 250, 0.78)";
          g.fillText(narrow ? String(ft / 100) : `FL${String(ft / 100).padStart(3, "0")}`, ladderW - 8 * dpr, y);
          g.fillStyle = "rgba(242, 245, 250, 0.07)";
          g.fillRect(ladderW, y, w - ladderW - 6 * dpr, 1);
        }
        g.fillStyle = "rgba(242, 245, 250, 0.22)";
        for (let ft = 0; ft <= 40000; ft += 1000) g.fillRect(ladderW - (ft % 5000 === 0 ? 9 : 5) * dpr, yOf(altU(ft)), (ft % 5000 === 0 ? 9 : 5) * dpr, 1);
        g.globalCompositeOperation = "lighter";
        g.save();
        g.beginPath();
        g.rect(xL, 0, xR - xL, ribbonH);
        g.clip();
      }
      // every note sits at the altitude of the flight when the note was made, and stays there as it flows past: nothing moves up or down
      const yOfPoint = (p: { y: number; alt?: number }, id: string): number =>
        ladder ? yOf(Math.min(0.995, Math.max(0.005, altU(p.alt ?? 30000) + (routeLift(id) * 1.15 * dpr) / Math.max(1, innerH)))) : yOf(p.y);
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
        const barH = (wide ? (neon ? 3.4 : 3.2) : NOTE_BAR_H_PX) * dpr;
        let lastLow = -1e9; // thin, long lines
        for (const p of tr.points) {
          const [x, bw] = noteBar(xOf(p.t), p.dur, pxPerSec, dpr);
          if (x + bw < 0 || x > w) continue;
          if (wide) {
            // ahead of the line: dim · under the line (sounding): bright and glowing · behind: fading
            const age = now - p.t;
            const sounding = age >= 0 && age < Math.max(p.dur, 0.25);
            g.globalAlpha = base * (age < 0 ? (neon ? 0.55 : 0.4) : sounding ? 1 : Math.max(neon ? 0.3 : 0.15, 1 - age / (ribbonSec * 0.78)));
            g.shadowColor = tr.color;
            g.shadowBlur = sounding ? (neon ? 1.2 : 6) * dpr : 0; // a tight glow, not a blob (additive blending)
            const hh = sounding ? barH * (neon ? 1.2 : 1.7) : barH;
            if (neon) { // a flight line: it grows from a hairline to a full stroke towards its head, which ends in a dot
              const yc = yOfPoint(p, tr.lineId);
              const low = (p.alt ?? 30000) < 4000; // near the ground: short lines, spaced out, so the bottom stays calm
              if (low) {
                if (!sounding && x - lastLow < 110 * dpr && lastLow > -1e8) continue; // (a sounding note is always drawn)
                lastLow = x;
              }
              const len = low ? Math.min(bw, 46 * dpr) : bw;
              const lw = (sounding ? 3.2 : 2.4) * dpr;
              g.shadowBlur = sounding ? 5 * dpr : 0;
              g.beginPath();
              g.moveTo(x, yc - 0.35 * dpr);
              g.lineTo(x + len - lw, yc - lw / 2);
              g.lineTo(x + len - lw, yc + lw / 2);
              g.lineTo(x, yc + 0.35 * dpr);
              g.closePath();
              g.fill();
              g.shadowBlur = 0;
              g.beginPath();
              g.arc(x + len - lw * 0.5, yc, lw * 0.95, 0, Math.PI * 2);
              g.fill();
            } else g.fillRect(x, yOfPoint(p, tr.lineId) - hh / 2, bw, hh);
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
            g.fillStyle = DARK_INK.has(a.color) ? "#05070f" : "#fff";
            g.fillText(txt, x + chipW / 2, a.y + 0.5 * dpr);
          }
        }
        g.globalCompositeOperation = "lighter";
      }
      if (wide) { // the reading line
        if (neon) { // a neon line over the route bars only: it ends in a glowing dot where the equaliser begins, never cutting through it
          g.globalCompositeOperation = "lighter";
          const lg = g.createLinearGradient(0, 0, 0, ribbonH);
          lg.addColorStop(0, "rgba(255, 70, 85, 0.95)");
          lg.addColorStop(1, "rgba(255, 36, 56, 0.55)");
          g.shadowColor = "#ff2438";
          g.shadowBlur = 6 * dpr;
          g.globalAlpha = 1;
          g.fillStyle = lg;
          g.fillRect(px0 - 1 * dpr, 0, 2 * dpr, ribbonH);
          g.fillStyle = "#ffd5d9";
          g.fillRect(px0 - 0.4 * dpr, 0, 0.8 * dpr, ribbonH);
          g.beginPath();
          g.arc(px0, ribbonH + 2 * dpr, 3.4 * dpr, 0, Math.PI * 2);
          g.fillStyle = "#ff3a4c";
          g.fill();
          g.shadowBlur = 0;
        } else {
          g.globalAlpha = 0.9;
          g.fillStyle = "#fff";
          g.fillRect(px0 - 0.75 * dpr, 0, 1.5 * dpr, ribbonH);
        }
        g.globalAlpha = 0.95;
        g.fillStyle = neon ? "#ff6b78" : "#fff";
      }
      // the route names are in the list under the box, not over the notes (it was too crowded)
      g.globalAlpha = 1;
      if (m.day) { // art:track — the day's traffic curve replaces the (silent) rhythm strip
        if (!neon) drawDay(g, m.day, w, ribbonH, h, dpr, base); // the live screen has no strip under the routes
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
    const cardHold = new Map<string, Playing>();
    let shown: string[] = [];
    const list = setInterval(() => { // art:track — the NOW PLAYING list refreshes ~6 Hz
      // with more routes than rows each route gets its turn (see pickShown)
      const now = wallSec();
      if (musicRef.current.day) { // the cards of the neon box follow the route bars that sound now
        for (const tr of trails.values()) {
          if (!ROUTE_ID.test(tr.lineId)) continue;
          for (const p of tr.points) {
            const age = now - p.t;
            if (age >= 0 && age < Math.max(p.dur, 0.4)) cardHold.set(tr.lineId, { route: tr.lineId, note: "", alt: p.alt, until: now + 1.6 });
          }
        }
        for (const [k, v] of cardHold) if (v.until < now) cardHold.delete(k);
      }
      const cur = pickShown(musicRef.current.day ? [...cardHold.values()] : playingNow(playing.current, now, 99), shown, shownAt, now, 6);
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
  const neonUi = !!music.day && typeof document !== "undefined" && document.body.classList.contains("personal-build");
  return (
    <div className={`music-scope${compact ? " compact" : ""}${neonUi ? " neon" : ""}${neonUi && collapsed ? " collapsed" : ""}`}>
      {neonUi && (
        <>
          <div className="ms-tab">
            {controls && (
              <button type="button" className="ms-ring" aria-label={controls.paused ? "Play" : "Pause"} title="Pause / resume (Space)" onClick={() => key(" ")}>
                <svg className={`ms-ring-arc${controls.paused ? " paused" : ""}`} viewBox="0 0 46 46" width="46" height="46" aria-hidden="true">
                  <circle cx="23" cy="23" r="22" fill="none" stroke="#ffe3e6" strokeWidth="2.2" strokeLinecap="round" pathLength="100" strokeDasharray="9 91" transform="rotate(-90 23 23)" />
                </svg>
                {controls.paused ? <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor" /></svg> : <svg viewBox="0 0 24 24" width="18" height="18"><rect x="6" y="5" width="4" height="14" rx="1.6" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.6" fill="currentColor" /></svg>}
              </button>
            )}
            <div className="ms-title"><b>LIVE ROUTES</b><span>FLIGHTS GENERATE MUSIC</span></div>
            <button type="button" className="ms-fold" aria-label={collapsed ? "Show the music box" : "Make the music box smaller"} aria-expanded={!collapsed} title={collapsed ? "Show" : "Smaller"} onClick={() => setCollapsed((c) => !c)}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <button type="button" className="ms-make" title={action ? action.label : "Make your own music"} disabled={!!action?.busy} onClick={() => (action ? action.onClick() : window.dispatchEvent(new CustomEvent("worldofmusic:make")))}>
            <span className="ms-eq" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${-((i * 37) % 17) / 10}s`, animationDuration: `${0.7 + ((i * 53) % 9) / 10}s` }} />)}</span>
            <span className="ms-make-txt">
              {action ? action.label : "MAKE YOUR OWN MUSIC"}
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </button>
        </>
      )}
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
