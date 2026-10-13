import { useMemo, useState } from "react";
import { REGION_HEX, REGION_LABEL } from "@web/data/palette";
import { COUNTRIES, countryName, flagOf } from "./countries";
import { MAX_COUNTRIES, MIN_COUNTRIES, type PersonalMode, type PersonalSelection } from "./codec";

interface Props {
  onCompose(sel: PersonalSelection): void;
  onLive(): void;
}

const COPY: Record<PersonalMode, { head: string; sub: string; cta: string }> = {
  visited: { head: "Where have you been?", sub: "Pick the countries you have travelled to. Your journey becomes a piece of music.", cta: "COMPOSE MY JOURNEY" },
  wish: { head: "Where do you want to go?", sub: "Pick your dream destinations. We will play the sound of the trip you have not taken yet.", cta: "COMPOSE MY WISHLIST" },
};

export function Landing({ onCompose, onLive }: Props) {
  const [mode, setMode] = useState<PersonalMode | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const rows = COUNTRIES.filter((c) => c.iso !== "TR").map((c) => ({ ...c, name: countryName(c.iso) }));
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.name.toLowerCase().includes(needle) || r.iso.toLowerCase() === needle) : rows;
  }, [q]);

  if (!mode) {
    return (
      <div className="landing" role="main">
        <h1 className="landing-title">A WORLD OF MUSIC</h1>
        <p className="landing-sub">Every journey has a sound. Choose yours.</p>
        <div className="mode-cards">
          <button type="button" className="mode-card" onClick={() => setMode("visited")}>
            <span className="mode-n">01</span>
            <span className="mode-name">Where I have been</span>
            <span className="mode-desc">Your travelled countries, composed into one piece.</span>
          </button>
          <button type="button" className="mode-card" onClick={() => setMode("wish")}>
            <span className="mode-n">02</span>
            <span className="mode-name">Where I want to go</span>
            <span className="mode-desc">Your wishlist, as the music of a trip yet to come.</span>
          </button>
          <button type="button" className="mode-card" onClick={onLive}>
            <span className="mode-n">03</span>
            <span className="mode-name">The world, live</span>
            <span className="mode-desc">Every Turkish Airlines flight of the last 24 hours, played as music.</span>
          </button>
        </div>
      </div>
    );
  }

  const toggle = (iso: string) =>
    setPicked((p) => (p.includes(iso) ? p.filter((x) => x !== iso) : p.length >= MAX_COUNTRIES ? p : [...p, iso]));
  const ready = picked.length >= MIN_COUNTRIES;
  const c = COPY[mode];

  return (
    <div className="landing picker" role="main">
      <button type="button" className="landing-back" onClick={() => { setMode(null); setPicked([]); setQ(""); }}>← BACK</button>
      <h1 className="picker-head">{c.head}</h1>
      <p className="landing-sub">{c.sub}</p>
      <input className="picker-search" type="search" placeholder="Search a country" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a country" />
      <div className="picker-grid">
        {list.map((r) => {
          const on = picked.includes(r.iso);
          return (
            <button key={r.iso} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(r.iso)} style={on ? { borderColor: REGION_HEX[r.region] } : undefined} title={REGION_LABEL[r.region]}>
              <span className="chip-flag">{flagOf(r.iso)}</span>
              <span className="chip-name">{r.name}</span>
            </button>
          );
        })}
      </div>
      <div className="picker-bar">
        <span className="picker-count">
          {picked.length} / {MAX_COUNTRIES} {picked.length < MIN_COUNTRIES ? `· PICK AT LEAST ${MIN_COUNTRIES}` : ""}
        </span>
        <button type="button" className="compose-btn" disabled={!ready} onClick={() => onCompose({ mode, isos: picked })}>
          {c.cta}
        </button>
      </div>
    </div>
  );
}
