#!/usr/bin/env python3
"""
Build docs/credits.html from the ledgers (not published: it is outside globe/public). Never edit the page by hand: change a ledger or this script and re-run.
  python3 scripts/samples/make_credits.py
"""
import html, json, os
from collections import OrderedDict

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
def ledger(name): return json.load(open(os.path.join(ROOT, "docs", name)))
e = html.escape

lite = ledger("music-pack-lite-ledger.json")
fs = ledger("music-pack-freesound-ledger.json")
world = ledger("music-pack-world-ledger.json")

def by_author(rows):
    out = OrderedDict()
    for r in sorted(rows, key=lambda r: (r["author"].lower(), r.get("title", ""))):
        out.setdefault(r["author"], []).append(r)
    return out

def author_block(rows, open_=False):
    parts = []
    for a, rs in by_author(rows).items():
        links = "".join(f'<li><a href="{e(r["source"])}" rel="noopener">{e(r.get("title") or r["file"])}</a> <span class="i">{e(r["instrument"].title().replace("_", " "))}</span></li>' for r in rs)
        parts.append(f"<details><summary>{e(a)} <span class=\"n\">{len(rs)}</span></summary><ul>{links}</ul></details>")
    return "\n".join(parts)

cc_by = [r for r in world if r["licence"] == "CC BY" and r["author"].startswith("Google") is False]
nsynth = [r for r in world if r["author"].startswith("Google")]
nsynth_author = nsynth[0]["author"] if nsynth else "Google Magenta"
vcsl = [r for r in world if r["author"].startswith("Versilian")]
cc0_fs = [r for r in world if r["licence"].startswith("CC0") and not r["author"].startswith("Versilian")] + fs
n_instr = len({r["instrument"] for r in world})

PAGE = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Credits — A World of Music</title>
<meta name="robots" content="noindex">
<style>
  @font-face {{ font-family: "TK Text"; src: url("/fonts/TKText-Regular.woff2") format("woff2"); font-weight: 400; font-display: swap; }}
  @font-face {{ font-family: "TK Text"; src: url("/fonts/TKText-SemiBold.woff2") format("woff2"); font-weight: 600; font-display: swap; }}
  :root {{ --bg: #05070d; --fg: #e8eefc; --mute: #8d9ab8; --line: #1d2640; --red: #ff2438; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 "TK Text", -apple-system, system-ui, sans-serif; }}
  main {{ max-width: 760px; margin: 0 auto; padding: 28px 16px 64px; }}
  a {{ color: #bcd3ff; }}
  h1 {{ font-size: 24px; margin: 8px 0 4px; letter-spacing: 0.02em; }}
  h2 {{ font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--red); margin: 36px 0 8px; font-weight: 600; }}
  p {{ margin: 8px 0; color: var(--fg); }} .mute {{ color: var(--mute); }}
  details {{ border-top: 1px solid var(--line); padding: 6px 0; }} summary {{ cursor: pointer; }}
  summary .n {{ color: var(--mute); font-size: 12px; margin-left: 6px; }}
  ul {{ margin: 6px 0 10px; padding-left: 20px; }} li .i {{ color: var(--mute); font-size: 12px; margin-left: 6px; }}
</style>
</head>
<body>
<main>
<h1>Credits</h1>
<p class="mute">The music on this site is made by rules from the routes you choose and played by recordings of real instruments. Thank you to everyone who recorded and shared them.</p>

<h2>Recorded instruments</h2>
<p><b>VSCO 2 Community Edition</b> by Versilian Studios — orchestra strings, winds, brass, harp, piano and percussion ({len(lite)} recordings), <a href="https://github.com/sgossner/VSCO-2-CE" rel="noopener">github.com/sgossner/VSCO-2-CE</a>, CC0 1.0 (public domain).</p>
<p><b>VCSL</b> — Versilian Community Sample Library by Versilian Studios — pianos, harpsichord, organ, saxophone, harmonica, dan tranh, psaltery, folk harp, kalimba, vibraphone, darbuka and frame drums ({len(vcsl)} recordings), <a href="https://github.com/sgossner/VCSL" rel="noopener">github.com/sgossner/VCSL</a>, CC0 1.0.</p>
<p><b>NSynth</b> by {e(nsynth_author)} — electric and acoustic guitars, electric keyboards, organs and basses ({len(nsynth)} notes), <a href="https://magenta.tensorflow.org/datasets/nsynth" rel="noopener">magenta.tensorflow.org/datasets/nsynth</a>, licensed under Creative Commons Attribution 4.0 (CC BY 4.0). Notes were converted to mono MP3.</p>
<p>All recordings were trimmed, level-matched and converted to mono MP3; the pitch of each was measured. No recording is presented as made by anyone else.</p>

<h2>Sounds from Freesound — Creative Commons Attribution (CC BY)</h2>
<p class="mute">Each author below, with the sounds used. Licence: <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY</a>.</p>
{author_block(cc_by, True)}

<h2>Sounds from Freesound — CC0 (with thanks)</h2>
<p class="mute">Public domain; no credit is required, and we are glad to give it.</p>
{author_block(cc0_fs)}

<h2>Flights, maps and pictures</h2>
<p>Live aircraft data: <a href="https://adsb.fi" rel="noopener">adsb.fi</a> open data (personal, non-commercial use). Flight routes: adsbdb. Aircraft registry: tar1090-db.</p>
<p>Earth imagery: NASA Earth Observatory / Visible Earth — Blue Marble, Black Marble 2016 (Suomi NPP VIIRS) and a cloud composite. Star map: NASA/Goddard Space Flight Center Scientific Visualization Studio, "Deep Star Maps 2020"; Gaia DR2: ESA/Gaia/DPAC; constellation figures based on those developed for the IAU by Alan MacRobert of Sky and Telescope magazine (Roger Sinnott and Rick Fienberg).</p>
<p>The Earth shading (day and night blend, night lights, clouds, tone mapping) is adapted from <a href="https://github.com/jsulpis/realtime-planet-shader" rel="noopener">realtime-planet-shader</a> by Julien Sulpis, GPL-3.0.</p>
<p>Typefaces: TK Display and TK Text are licensed fonts.</p>

<h2>Project</h2>
<p>A Platon.Ai project. Source and notices: <a href="https://github.com/clawuz/DataRoute" rel="noopener">github.com/clawuz/DataRoute</a>.</p>
<p class="mute">Generated from the sample ledgers ({n_instr} world-pack instruments). Last built by scripts/samples/make_credits.py.</p>
</main>
</body>
</html>
"""
open(os.path.join(ROOT, "docs", "credits.html"), "w").write(PAGE)
print("credits.html:", len(PAGE) // 1024, "KB;", len({r['author'] for r in cc_by}), "CC BY authors,", len({r['author'] for r in cc0_fs}), "CC0 authors")
