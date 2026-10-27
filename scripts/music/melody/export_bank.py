"""Export the melody banks (version 2, compact): every card (52) x every number of hits in a bar (1-9) -> up to N phrases, each a string of
four bars joined by "|"; a bar has `hits` characters: the base-36 digit of (degree + 2), or "." for a rest. Format:
docs/superpowers/specs/2026-10-27-melody-bank-design.md; the training: docs/superpowers/specs/2026-10-27-melody-trained-design.md.

Two files (minified JSON, each < 1 MB):
- globe/src/personal/melody-bank.json (SHIPPABLE, committed): a card with enough PDMX / Nottingham material (>= 400 phrases from >= 40
  pieces) is trained on those sources only (back-off levels included) and mixed 70% trained / 30% grammar; every other card is the
  grammar's. No SymbTr-derived phrase and no "symbtr" anywhere in it.
- globe/src/personal/melody-bank.local.json (git-ignored, local listening only): the same, plus the cards that have SymbTr material,
  trained on all their sources (SymbTr is CC BY-NC-SA: nothing derived from it ships until the user approves the licence).
Both carry `"sources": {card: ["pdmx", "grammar", ...]}`.

Run from the repository root:  python3 scripts/music/melody/export_bank.py [--per-entry N] [--grammar-only] [--examples] [--show]
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grammar  # noqa: E402
import train  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.json")
OUT_LOCAL = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.local.json")
LIMIT = 1024 * 1024
HITS = range(1, 10)
SHOW_CARDS = ("anatolian", "mevlevi", "jazz", "classical", "celtic", "hindustani")

encode = train.encode


def decode(s: str):
    return [[None if c == "." else int(c, 36) - 2 for c in b] for b in s.split("|")]


def grammar_entry(cid: str, h: int, keep: int) -> list:
    return [encode(p) for p in grammar.bank_entry(cid, h, keep=keep, make=400)]


def build(keep: int, make: int = 400) -> dict:
    """the grammar-only bank (every card from its form)"""
    return {"version": 2, "cards": {cid: {str(h): grammar_entry(cid, h, keep) for h in HITS} for cid in sorted(grammar.FORM_OF)},
            "sources": {cid: ["grammar"] for cid in sorted(grammar.FORM_OF)}}


def dump(bank: dict) -> str:
    return json.dumps(bank, separators=(",", ":"), ensure_ascii=False)


def fmt(p: dict) -> str:
    return " | ".join(" ".join("." if d is None else str(d) for d in bar) for bar in p["b"])


def learn_all(corpus: dict):
    """two sets of models (one per number of hits >= 2): `ship` learns from PDMX / Nottingham only, `local` from every source"""
    ship = {h: train.Model(h) for h in HITS if h > 1}
    local = {h: train.Model(h) for h in HITS if h > 1}
    for card, phrases in corpus.items():
        span, octave = train.span_of(card), train.OCTAVE_OF.get(card, 7)
        for ph in phrases:
            cl = train.clamp_phrase(ph["bars"], span, octave)
            shippable = ph["src"] in train.SHIPPABLE_SOURCES
            for h in ship:
                red = [train.reduce_bar(b, h, with_filler=True) for b in cl]
                slots, filler = [x for x, _ in red], [f for _, f in red]
                local[h].add(card, slots, filler)
                if shippable:
                    ship[h].add(card, slots, filler)
    return ship, local


def trained_card(models: dict, cid: str, keep: int, gram: dict) -> dict:
    out = {}
    for h in HITS:
        g = gram[h]
        if h == 1:
            out[str(h)] = g
            continue
        mixed_g = g[:round(keep * (1 - train.TRAINED_SHARE))]
        g_rate = sum(train.recurring(decode(s)) for s in mixed_g) / max(1, len(mixed_g))
        target = train.reuse_target(models[h].p_recur(cid), g_rate)
        t = [encode(p) for p in train.select(models[h], cid, h, keep=keep, make=train.MAKE, target=target)]
        out[str(h)] = train.mix(t, g, keep)
    return out


def sources_of(phrases, allowed) -> list:
    return [s for s in ("symbtr", "pdmx", "nottingham") if s in allowed and any(p["src"] == s for p in phrases)]


def build_banks(keep: int, corpus: dict, log=print):
    t0 = time.time()
    ship_m, local_m = learn_all(corpus)
    log(f"learned in {time.time() - t0:.0f} s")
    ship = {"version": 2, "cards": {}, "sources": {}}
    local = {"version": 2, "cards": {}, "sources": {}}
    for cid in sorted(grammar.FORM_OF):
        gram = {h: grammar_entry(cid, h, keep) for h in HITS}
        phrases = corpus.get(cid, [])
        ship_ph = [p for p in phrases if p["src"] in train.SHIPPABLE_SOURCES]
        if train.eligible(ship_ph):
            ship["cards"][cid] = trained_card(ship_m, cid, keep, gram)
            ship["sources"][cid] = sources_of(ship_ph, train.SHIPPABLE_SOURCES) + ["grammar"]
        else:
            ship["cards"][cid] = {str(h): gram[h] for h in HITS}
            ship["sources"][cid] = ["grammar"]
        if any(p["src"] == "symbtr" for p in phrases) and train.eligible(phrases):
            local["cards"][cid] = trained_card(local_m, cid, keep, gram)
            local["sources"][cid] = sources_of(phrases, ("symbtr", "pdmx", "nottingham")) + ["grammar"]
        else:
            local["cards"][cid] = ship["cards"][cid]
            local["sources"][cid] = ship["sources"][cid]
        log(f"  {cid:12s} ship {'+'.join(ship['sources'][cid]):24s} local {'+'.join(local['sources'][cid]):30s} {time.time() - t0:.0f} s")
    return ship, local, (ship_m, local_m)


def write(bank: dict, path: str) -> int:
    text = dump(bank)
    raw = len(text.encode("utf-8"))
    gz = len(gzip.compress(text.encode("utf-8"), 9))
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    counts = [len(ps) for by in bank["cards"].values() for ps in by.values()]
    print(f"wrote {os.path.relpath(path, ROOT)}: {raw / 1024:.0f} KB raw, {gz / 1024:.0f} KB gzipped, {len(bank['cards'])} cards, "
          f"{sum(counts)} phrases (min {min(counts)} per entry)")
    return raw


def examples(per_form: int = 2, hits=(8, 6)) -> None:
    done = set()
    for cid in sorted(grammar.FORM_OF, key=lambda c: (grammar.FORMS.index(grammar.FORM_OF[c]), c)):
        f = grammar.FORM_OF[cid]
        if f in done:
            continue
        done.add(f)
        print(f"{f} ({cid}), cadence {grammar.idiom_of(cid)['cadence']}:")
        for k in range(per_form):
            h = hits[k % len(hits)]
            p = grammar.bank_entry(cid, h, keep=per_form, make=400)[k]
            print(f"  hits={h} s={p['s']} span={p['span']} bias={p['bias']:+d}  {encode(p)}")
            print(f"      {fmt(p)}")


def show(ship: dict, local: dict, h: int = 8) -> None:
    """three trained phrases of six cards next to the grammar's first phrase"""
    for cid in SHOW_CARDS:
        g = grammar_entry(cid, h, 1)[0]
        bank, which = (local, "local") if "symbtr" in local["sources"][cid] else (ship, "shippable")
        gset = set(grammar_entry(cid, h, 64))
        tr = [s for s in bank["cards"][cid][str(h)] if s not in gset][:3]
        print(f"{cid} (hits {h}, {which} bank, sources {'+'.join(bank['sources'][cid])})")
        print(f"  grammar  {g}")
        for s in tr:
            print(f"  trained  {s}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-entry", type=int, default=64, help="phrases per (card, hits), default 64")
    ap.add_argument("--grammar-only", action="store_true", help="write the grammar bank only (no corpus needed)")
    ap.add_argument("--examples", action="store_true", help="print two phrases of every form")
    ap.add_argument("--show", action="store_true", help="print trained phrases of six cards next to the grammar's")
    args = ap.parse_args()
    t0 = time.time()
    if args.grammar_only or not os.path.isdir(train.PHRASES):
        if not args.grammar_only:
            print("no .corpora/phrases: writing the grammar bank only")
        sizes = [write(build(args.per_entry), OUT)]
    else:
        corpus = train.read_corpus()
        print(f"read the corpus in {time.time() - t0:.0f} s")
        ship, local, _ = build_banks(args.per_entry, corpus)
        assert "symbtr" not in dump(ship), "the shippable bank mentions symbtr"
        sizes = [write(ship, OUT), write(local, OUT_LOCAL)]
        print(f"trained cards: shippable {sum('grammar' != s[0] for s in ship['sources'].values())}, "
              f"local {sum('grammar' != s[0] for s in local['sources'].values())}; wall time {time.time() - t0:.0f} s")
        if args.show:
            show(ship, local)
    if max(sizes) >= LIMIT:
        print("OVER 1 MB: rerun with --per-entry 48")
        sys.exit(1)
    if args.examples:
        examples()


if __name__ == "__main__":
    main()
