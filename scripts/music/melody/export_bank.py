"""Export the melody bank: every card (52) x every number of hits in a bar (1-9) -> the most diverse phrases of the grammar, as
minified JSON in globe/src/personal/melody-bank.json (format: docs/superpowers/specs/2026-10-27-melody-bank-design.md; rests are null).

Run from the repository root:  python3 scripts/music/melody/export_bank.py [--per-entry N] [--examples]

Without --per-entry the exporter keeps 96 phrases per (card, hits) when the file stays under 400 KB, else 64, else the largest count
that fits (and says so). A smaller count keeps a prefix of the same selection: the round robin of bank_entry puts the most diverse
phrases first.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grammar  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.json")
LIMIT = 400 * 1024
HITS = range(1, 10)


def build(keep: int, make: int = 400) -> dict:
    return {"version": 1, "cards": {cid: {str(h): grammar.bank_entry(cid, h, keep=keep, make=make) for h in HITS}
                                    for cid in sorted(grammar.FORM_OF)}}


def truncate(bank: dict, n: int) -> dict:
    return {"version": bank["version"], "cards": {cid: {h: ps[:n] for h, ps in by.items()} for cid, by in bank["cards"].items()}}


def dump(bank: dict) -> str:
    return json.dumps(bank, separators=(",", ":"), ensure_ascii=False)


def fmt(p: dict) -> str:
    return " | ".join(" ".join("." if d is None else str(d) for d in bar) for bar in p["b"])


def examples(bank: dict, per_form: int = 2, hits=(8, 6)) -> None:
    done = set()
    for cid in sorted(grammar.FORM_OF, key=lambda c: (grammar.FORMS.index(grammar.FORM_OF[c]), c)):
        f = grammar.FORM_OF[cid]
        if f in done:
            continue
        done.add(f)
        print(f"{f} ({cid}), cadence {grammar.idiom_of(cid)['cadence']}:")
        for k in range(per_form):
            h = hits[k % len(hits)]
            p = bank["cards"][cid][str(h)][k]
            print(f"  hits={h} s={p['s']} span={p['span']} bias={p['bias']:+d}  {json.dumps(p['b'])}")
            print(f"      {fmt(p)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-entry", type=int, default=0, help="phrases per (card, hits); 0 = 96, else 64, else what fits 400 KB")
    ap.add_argument("--examples", action="store_true", help="print two phrases of every form")
    args = ap.parse_args()
    full = build(max(96, args.per_entry))
    if args.per_entry:
        n = args.per_entry
    else:
        sizes = {}
        n = 0
        for cand in [96, 64] + list(range(63, 0, -1)):
            sizes[cand] = len(dump(truncate(full, cand)).encode("utf-8"))
            if sizes[cand] < LIMIT:
                n = cand
                break
        for cand in (96, 64):
            if cand in sizes:
                print(f"{cand} per entry: {sizes[cand] / 1024:.0f} KB" + ("" if sizes[cand] < LIMIT else " (over 400 KB)"))
        if n not in (96, 64):
            print(f"reduced to {n} per entry to stay under 400 KB")
    bank = truncate(full, n)
    text = dump(bank)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    counts = [len(ps) for by in bank["cards"].values() for ps in by.values()]
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(text.encode('utf-8')) / 1024:.0f} KB, {len(bank['cards'])} cards x {len(HITS)} hits, "
          f"{n} per entry (min {min(counts)}: small hit counts have fewer distinct phrases), {sum(counts)} phrases")
    if args.examples:
        examples(bank)


if __name__ == "__main__":
    main()
