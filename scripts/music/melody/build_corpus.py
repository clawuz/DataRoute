"""Build the phrase corpus: SymbTr + PDMX + Nottingham -> .corpora/phrases/<card>.jsonl, and the "Corpus" section of
docs/music-melody-model-report.md.

Spec: docs/superpowers/specs/2026-10-27-melody-trained-design.md ("The phrase corpus"). Plan: docs/superpowers/plans/2026-10-27-melody-
trained.md, Task 1. Nothing under .corpora/ is ever committed; the report holds counts only.

One line per phrase: {"src": "symbtr" | "pdmx" | "nottingham", "piece": <file / path / tune id>, "via": <why this card>, "start": <first
bar index in the piece>, "bars": [[[onset, degree, dur], ...] x 4]} with onset and dur in fractions of the bar and degree an index into
the card's scale (0 = tonic / karar, clipped to [-2, 9]). Identical phrases of one piece on one card are written once.

Run:  .venv-music/bin/python scripts/music/melody/build_corpus.py            (all three sources; ~5 min)
      .venv-music/bin/python scripts/music/melody/build_corpus.py --no-report
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tarfile
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "corpus"))

import common  # noqa: E402
import nottingham  # noqa: E402
import pdmx  # noqa: E402
import symbtr  # noqa: E402

ROOT = common.ROOT
CORPORA = os.path.join(ROOT, ".corpora")
REPORT = os.path.join(ROOT, "docs", "music-melody-model-report.md")
FALLBACK = 200   # a card with fewer phrases falls back to the grammar (spec, The model, step 4)
SOURCES = ("symbtr", "pdmx", "nottingham")


class Sink:
    def __init__(self, out_dir: str, cards):
        os.makedirs(out_dir, exist_ok=True)
        self.files = {c: open(os.path.join(out_dir, f"{c}.jsonl"), "w", encoding="utf-8") for c in sorted(cards)}
        self.phrases = defaultdict(Counter)          # card -> src -> phrases
        self.pieces = defaultdict(Counter)           # card -> src -> pieces with >= 1 phrase
        self.via = defaultdict(Counter)              # card -> "src/via" -> phrases

    def write(self, card: str, src: str, piece: str, via: str, bars) -> int:
        seen = set()
        n = 0
        for w in common.windows(bars):
            key = json.dumps(w["bars"], separators=(",", ":"))
            if key in seen:
                continue
            seen.add(key)
            self.files[card].write(json.dumps({"src": src, "piece": piece, "via": via, "start": w["start"], "bars": w["bars"]},
                                              ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
        if n:
            self.phrases[card][src] += n
            self.pieces[card][src] += 1
            self.via[card][f"{src}/{via}"] += n
        return n

    def close(self):
        for f in self.files.values():
            f.close()


def run_symbtr(sink: Sink, cards, stats: Counter):
    table = symbtr.load_table()
    d = os.path.join(CORPORA, "symbtr", "repo", "txt")
    st = {}
    for name, p, cs in symbtr.pieces(d, table, st):
        stats["symbtr: pieces parsed"] += 1
        got = 0
        for card, via in cs:
            got += sink.write(card, "symbtr", name, via, symbtr.card_bars(p, cards[card]))
        if not got:
            stats["symbtr: parsed, no phrase passed the window rules"] += 1
    for k, v in st.items():
        stats[f"symbtr: {k}"] += v


def run_nottingham(sink: Sink, cards, stats: Counter, books):
    d = os.path.join(CORPORA, "nottingham", "repo", "ABC_cleaned")
    st = {}
    for book, t in nottingham.pieces(d, books, st):
        stats["nottingham: tunes (key sections) parsed"] += 1
        got = 0
        for card in books[book]["cards"]:
            got += sink.write(card, "nottingham", f"{book} {t['id']}", book, common.card_bars_diatonic(t, cards[card]))
        if not got:
            stats["nottingham: parsed, no phrase passed the window rules"] += 1
    for k, v in st.items():
        stats[f"nottingham: {k} (tunes)"] += v


def run_pdmx(sink: Sink, cards, stats: Counter, cap: int, rules_used: dict):
    st = {}
    sel = pdmx.select(os.path.join(CORPORA, "pdmx", "PDMX.csv"), cap=cap, stats=st)
    stats["pdmx: csv rows"] += st.get("rows", 0)
    stats["pdmx: rows outside the licence-clean subset (not used)"] += st.get("rows outside the licence-clean subset", 0)
    stats["pdmx: pieces selected by cards-map.json"] += len(sel)
    for info in sel.values():
        for card, tier in info["cards"]:
            rules_used[card][tier] += 1
    want = {k[2:]: v for k, v in sel.items()}  # "./mid/..." -> "mid/..."
    found = 0
    with tarfile.open(os.path.join(CORPORA, "pdmx", "mid.tar.gz"), "r|gz") as tf:   # streamed: only the selected members are read
        for m in tf:
            info = want.get(m.name)
            if info is None or not m.isfile():
                continue
            found += 1
            data = tf.extractfile(m).read()
            try:
                piece = pdmx.piece_from_midi(data)
            except pdmx.Skip as e:
                stats[f"pdmx: skipped: {e}"] += 1
                continue
            got = 0
            for card, tier in info["cards"]:
                got += sink.write(card, "pdmx", "./" + m.name, f"tier{tier}", common.card_bars_diatonic(piece, cards[card]))
            if not got:
                stats["pdmx: parsed, no phrase passed the window rules"] += 1
            else:
                stats["pdmx: pieces with phrases"] += 1
    stats["pdmx: selected but missing from mid.tar.gz"] += len(want) - found


def report(sink: Sink, cards, stats: Counter, rules_used, cm: dict, cap: int, seconds: float) -> str:
    L = []
    L.append("## Corpus")
    L.append("")
    L.append("Built by `scripts/music/melody/build_corpus.py` (ingestors in `scripts/music/melody/corpus/`, mapping tables "
             "`makam-cards.json` and `cards-map.json`) into `.corpora/phrases/<card>.jsonl` (git-excluded; never committed). "
             "A phrase = 4 consecutive bars aligned to bar starts (stride 2), kept when it has >= 3 notes per bar on average, <= 40% rest "
             "time and <= 25% of its notes outside [-2, 9] (those are clipped); degrees are indices into the target card's scale "
             "(0 = tonic / karar). Identical phrases of one piece on one card are written once. "
             f"Deterministic (sorted inputs, the archive's member order, a stable SHA-1 order for the PDMX cap of {cap} pieces per card).")
    L.append("")
    L.append("### Licence ledger")
    L.append("")
    L.append("| source | licence | shippable | phrases (all cards) | pieces used (card x piece) |")
    L.append("|---|---|---|---|---|")
    for src in SOURCES:
        led = cm["ledger"][src]
        ph = sum(sink.phrases[c][src] for c in cards)
        pc = sum(sink.pieces[c][src] for c in cards)
        L.append(f"| {src} | {led['licence']} | {'yes' if led['shippable'] else 'no (local listening only)'} | {ph} | {pc} |")
    L.append("")
    L.append("### Phrases per card by source")
    L.append("")
    L.append("| card | symbtr | pdmx | nottingham | total | shippable total | pieces (s / p / n) | used as |")
    L.append("|---|---|---|---|---|---|---|---|")
    for c in sorted(cards):
        ph, pc = sink.phrases[c], sink.pieces[c]
        tot = sum(ph.values())
        ship = ph["pdmx"] + ph["nottingham"]
        use = "trained" if ship >= FALLBACK else ("trained (local, SymbTr) / grammar (shippable)" if tot >= FALLBACK else "grammar")
        L.append(f"| {c} | {ph['symbtr']} | {ph['pdmx']} | {ph['nottingham']} | {tot} | {ship} | "
                 f"{pc['symbtr']} / {pc['pdmx']} / {pc['nottingham']} | {use} |")
    L.append("")
    L.append(f"### Cards with fewer than {FALLBACK} phrases -> grammar fallback")
    L.append("")
    L.append("| card | all sources | shippable sources (PDMX + Nottingham) | fallback |")
    L.append("|---|---|---|---|")
    for c in sorted(cards):
        ph = sink.phrases[c]
        tot, ship = sum(ph.values()), ph["pdmx"] + ph["nottingham"]
        if ship < FALLBACK:
            which = "both banks" if tot < FALLBACK else "shippable bank only (the local bank trains on SymbTr)"
            L.append(f"| {c} | {tot} | {ship} | {which} |")
    L.append("")
    L.append("### How the phrases came to each card")
    L.append("")
    L.append("SymbTr `via`: region = a folk piece whose place (the composer field of a türkü) names the card; form = the form decides "
             "(zeybek, karşılama, ilahi / peşrev -> mevlevi...); makam = the makam family. PDMX `via`: tier0 = a specific match "
             "(composer, dance, national tag), tier1 = a broad genre fallback. Nottingham `via` = the book.")
    L.append("")
    L.append("| card | phrases by source / via |")
    L.append("|---|---|")
    for c in sorted(cards):
        v = sink.via[c]
        if v:
            L.append(f"| {c} | " + ", ".join(f"{k} {n}" for k, n in sorted(v.items())) + " |")
    L.append("")
    L.append("### PDMX: genres / tags -> cards")
    L.append("")
    L.append("Rows of `subset:no_license_conflict` with licence `publicdomain` or `cc-zero` only. Rules from `cards-map.json` "
             "(pieces selected per card: tier 0 / tier 1):")
    L.append("")
    L.append("| card | rule (what matched) | selected pieces tier 0 / tier 1 |")
    L.append("|---|---|---|")
    by_card = defaultdict(list)
    for r in cm["pdmx"]["rules"]:
        bits = []
        for k in ("genres", "tags", "composers", "words"):
            if r.get(k):
                vals = r[k]
                bits.append(f"{k}: " + ", ".join(vals[:8]) + (" ..." if len(vals) > 8 else ""))
        by_card[r["card"]].append(f"t{r.get('tier', 0)}: " + "; ".join(bits))
    for c in sorted(by_card):
        ru = rules_used.get(c, Counter())
        L.append(f"| {c} | " + " / ".join(by_card[c]).replace("|", "\\|") + f" | {ru[0]} / {ru[1]} |")
    L.append("")
    L.append("### Pieces used and skipped")
    L.append("")
    for k in sorted(stats):
        L.append(f"- {k}: {stats[k]}")
    L.append("")
    L.append("### Judgements to know when listening")
    L.append("")
    L.append("- SymbTr is mostly Ottoman / Turkish art music (şarkı, peşrev, saz semaisi, ilahi); the regional cards (karadeniz, "
             "icanadolu, dogu, zeybek, akdeniz, karsilama) get their own region's türküs where the file names a place, plus the makam "
             "family of the spec. Deviations from the spec's family list, following the cards' scales in genres.ts: dogu (HICAZ) takes the "
             "hicaz family, zeybek (USSAK) the uşşak family; greek (HICAZ) also takes the hicaz family. Seyir, etüd and örnek öz files are "
             "scale demonstrations / exercises and are not used.")
    L.append("- SymbTr bars = one usul cycle; cycles longer than two whole notes (devr-i kebir, muhammes, zencir, ...) are split into the "
             "fewest equal sub-bars of at most two whole notes whose count divides the usul's numerator.")
    L.append("- Western degrees: a pitch is read as a degree of its own key's 7-note mode (chromatic notes by their usual function: the "
             "leading tone in minor and the flat 7th in major are both the 7th), then kept as the same index on a 7-note card (a major "
             "tune on a minor card becomes its parallel-minor line; the site renders `scale` and `scaleWish` from the same degrees) or "
             "moved to the nearest note on a pentatonic card. SymbTr pitches go to the nearest comma degree of the card's scale "
             "(card semitones x 53/12). The octave of the tonic is the one that puts the most notes into [-2, 9].")
    L.append("- PDMX melody = the top line of the highest part among those with >= 30% of the busiest part's notes (not the busiest "
             "part: a cello or a left hand can be busier); key = the first key signature's major / relative-minor pair, chosen by the "
             "Krumhansl-Kessler profile; a key change ends the piece; time-signature events are bar lines (the PDMX MIDI writes a pickup or another irregular "
             "measure as its own short time signature: such a measure is not a bar, so pickups do not shift the grid).")
    L.append("- Nottingham tunes are read from the ABC (written bars, so pickups are exact); repeats are not expanded; a K: change starts "
             "a new piece; the Christmas book is not used.")
    L.append("")
    return "\n".join(L)


def write_report(section: str):
    head = ("# The melody model report\n\n"
            "Spec: `docs/superpowers/specs/2026-10-27-melody-trained-design.md`. Sections are rewritten by the scripts that own them.\n\n")
    text = open(REPORT, encoding="utf-8").read() if os.path.exists(REPORT) else head
    start = text.find("## Corpus\n")
    if start >= 0:
        nxt = text.find("\n## ", start + 10)
        text = text[:start] + section + ("\n" + text[nxt + 1:] if nxt >= 0 else "")
    else:
        text = text.rstrip("\n") + "\n\n" + section
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(text.rstrip("\n") + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(CORPORA, "phrases"))
    ap.add_argument("--cap", type=int, default=600, help="PDMX pieces per card")
    ap.add_argument("--no-report", action="store_true")
    a = ap.parse_args()
    t0 = time.time()
    cards = common.load_cards()
    with open(os.path.join(HERE, "corpus", "cards-map.json"), encoding="utf-8") as f:
        cm = json.load(f)
    sink = Sink(a.out, cards)
    stats: Counter = Counter()
    rules_used = defaultdict(Counter)
    run_symbtr(sink, cards, stats)
    print("symbtr done", time.time() - t0, flush=True)
    run_nottingham(sink, cards, stats, cm["nottingham"]["books"])
    print("nottingham done", time.time() - t0, flush=True)
    run_pdmx(sink, cards, stats, a.cap, rules_used)
    print("pdmx done", time.time() - t0, flush=True)
    sink.close()
    for src in SOURCES:
        print(src, sum(sink.phrases[c][src] for c in cards), "phrases")
    if not a.no_report:
        write_report(report(sink, cards, stats, rules_used, cm, a.cap, time.time() - t0))


if __name__ == "__main__":
    main()
