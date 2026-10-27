"""Export the melody bank (version 2, compact): every card (52) x every number of hits in a bar (1-9) -> up to N phrases of the grammar,
each a string of four bars joined by "|"; a bar has `hits` characters: the base-36 digit of (degree + 2), or "." for a rest.
Minified JSON in globe/src/personal/melody-bank.json (format: docs/superpowers/specs/2026-10-27-melody-bank-design.md).

Run from the repository root:  python3 scripts/music/melody/export_bank.py [--per-entry N] [--examples]

Default 64 phrases per (card, hits); if the file is over 1 MB use --per-entry 48. Entries are ordered most-diverse first.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grammar  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.json")
LIMIT = 1024 * 1024
HITS = range(1, 10)


def encode(p: dict) -> str:
    """four bars -> "5342|4531|..." : digit = base-36 of (degree + 2), "." = rest"""
    return "|".join("".join("." if d is None else "0123456789ab"[d + 2] for d in bar) for bar in p["b"])


def build(keep: int, make: int = 400) -> dict:
    return {"version": 2, "cards": {cid: {str(h): [encode(p) for p in grammar.bank_entry(cid, h, keep=keep, make=make)] for h in HITS}
                                     for cid in sorted(grammar.FORM_OF)}}


def dump(bank: dict) -> str:
    return json.dumps(bank, separators=(",", ":"), ensure_ascii=False)


def fmt(p: dict) -> str:
    return " | ".join(" ".join("." if d is None else str(d) for d in bar) for bar in p["b"])


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-entry", type=int, default=64, help="phrases per (card, hits), default 64")
    ap.add_argument("--examples", action="store_true", help="print two phrases of every form")
    args = ap.parse_args()
    bank = build(args.per_entry)
    text = dump(bank)
    raw = len(text.encode("utf-8"))
    gz = len(gzip.compress(text.encode("utf-8"), 9))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    counts = [len(ps) for by in bank["cards"].values() for ps in by.values()]
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {raw / 1024:.0f} KB raw, {gz / 1024:.0f} KB gzipped, {len(bank['cards'])} cards x {len(HITS)} hits, "
          f"{args.per_entry} per entry (min {min(counts)}: small hit counts have fewer distinct phrases), {sum(counts)} phrases")
    if raw >= LIMIT:
        print("OVER 1 MB: rerun with --per-entry 48")
        sys.exit(1)
    if args.examples:
        examples()


if __name__ == "__main__":
    main()
