// the live screen's top-right data (personal build): a LIVE pill with a tagline, a big "Live Flights" card with a small world
// glowing where the traffic is, and three figures in glass tiles
import { useEffect, useRef } from "react";
import { fmtInt, fmtKm } from "@web/lib/format";
import { useTickNumber } from "@web/hud/useTickNumber";
import type { GlobeHudSnapshot } from "../app/hud-model";
import { FLIGHT_D, LANDING_D, TAKEOFF_D } from "./MusicScope";

/** where each region's traffic glows on the small map: DOM, EUR, MEA, AFR, ASI, AME, other (lat, lon) */
const REGION_SPOT: [number, number][] = [[39, 35], [50, 10], [27, 45], [4, 20], [26, 105], [36, -96], [-25, 135]];

function MiniWorld({ regions }: { regions: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const draw = () => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (img.current?.complete && img.current.naturalWidth) {
      g.globalAlpha = 0.9;
      g.drawImage(img.current, 0, 0, w, h);
      g.globalAlpha = 1;
      g.fillStyle = "rgba(5, 9, 24, 0.42)"; // dim the picture to a quiet map
      g.fillRect(0, 0, w, h);
    }
    const max = Math.max(1, ...regions);
    g.globalCompositeOperation = "lighter";
    regions.forEach((n, i) => {
      if (n <= 0) return;
      const k = n / max;
      const x = ((REGION_SPOT[i][1] + 180) / 360) * w, y = ((90 - REGION_SPOT[i][0]) / 180) * h;
      const r = (0.08 + 0.18 * Math.sqrt(k)) * w;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255, 36, 56, ${0.35 + 0.5 * k})`);
      gr.addColorStop(1, "rgba(255, 36, 56, 0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
      for (let d = 0; d < Math.min(14, Math.ceil(n / 4)); d++) { // a few bright points around the glow
        const a = (d * 2.399 + i) % (Math.PI * 2), rr = ((d * 37 + i * 11) % 100) / 100 * r * 0.7;
        g.fillStyle = "rgba(255, 150, 160, 0.9)";
        g.fillRect(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7, 1.6 * dpr, 1.6 * dpr);
      }
    });
    g.globalCompositeOperation = "source-over";
  };
  useEffect(() => {
    const im = new Image();
    im.onload = draw;
    im.src = "/textures/earth-night-4k.jpg";
    img.current = im;
  }, []);
  useEffect(draw, [regions.join(",")]);
  return <canvas ref={ref} className="ls-map" aria-hidden="true" />;
}

function Tile({ label, value, format, animate, icon }: { label: string; value: number; format: (n: number) => string; animate: boolean; icon: string }) {
  const shown = useTickNumber(value, animate);
  return (
    <div className="ls-tile">
      <svg className="ls-tile-ico" viewBox="150 130 800 740" width="22" height="20" aria-hidden="true"><path d={icon} fill="currentColor" /></svg>
      <div className="ls-tile-val num">{format(shown)}</div>
      <div className="ls-tile-label">{label}</div>
    </div>
  );
}

export function LiveStats({ s, animate }: { s: GlobeHudSnapshot; animate: boolean }) {
  const airborne = useTickNumber(s.counters.airborne, animate);
  return (
    <div className="live-stats">
      <div className="ls-top">
        <span className="ls-live"><i />LIVE</span>
        <span className="ls-tag"><span>A GLOBAL SYMPHONY</span><span>IN REAL TIME</span></span>
      </div>
      <div className="ls-card">
        <div className="ls-card-main">
          <div className="ls-card-head"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor" /></svg>Live flights</div>
          <div className="ls-big num">{fmtInt(airborne)}</div>
        </div>
        <MiniWorld regions={s.regionAirborne} />
      </div>
      <div className="ls-tiles">
        <Tile label="FLIGHTS · 24H" value={s.counters.flights} format={fmtInt} animate={animate} icon={TAKEOFF_D} />
        <Tile label="DESTINATIONS" value={s.counters.destinations} format={fmtInt} animate={animate} icon={LANDING_D} />
        <Tile label="KM FLOWN" value={s.counters.km} format={fmtKm} animate={animate} icon={FLIGHT_D} />
      </div>
    </div>
  );
}
