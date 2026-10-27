"""The evaluation of the melody banks (spec docs/superpowers/specs/2026-10-27-melody-trained-design.md, section "Evaluation"):
per card with a corpus, the corpus vs the bank (the trained one when the card is trained) vs the OLD WALK (`walk-samples.json`, dumped
from TS by `globe/scripts/dump-walk-phrases.ts`: 200 phrases per card at hits 6 and 8).

Measured at hits 6 and 8:
- step / leap / repeat shares of the moves between consecutive sounding notes (rests skipped; intervals clipped to +-5 degrees), and the
  rest share of the slots. The corpus moves are its clamped notes as written (every note, across bar lines); its rest share is that of
  the phrases reduced to h slots (`train.prepare`), the resolution of the bank;
- KL(bank || corpus) and KL(walk || corpus) of the interval distribution (11 bins, add-0.5 smoothing on both sides);
- recurrence: the share of phrases with at least one bar that repeats or sequences an earlier one (`train.recurring`: the bar similarity
  of the model, `train.MATCH`), and the mean number of distinct bar-motifs per phrase (`train.distinct_motifs`); the corpus is measured
  on its phrases reduced to h slots, the bank on the whole entry and on its trained part only;
- the cadence hit rate (the last slot of bar k is the idiom's cadence[k]) and bars that end on a rest, over every card and hits 1-9 of
  both bank files;
- the five most common 4-note patterns (the three intervals between four consecutive sounding notes), corpus vs bank.

Acceptance (exit code 1 when violated): for every card whose bank is trained, KL(bank, corpus) < KL(walk, corpus) at hits 6 and 8 and
the bank's recurrence is at most 15 points above the corpus's; the cadence hit rate is 100%; no bar ends on a rest.

The bank of a card is melody-bank.local.json when that file exists and trains the card on SymbTr (the makam cards), else
melody-bank.json; its corpus is the sources the bank was trained on (for a grammar-only card: every source available).

Run from the repository root:  python3 scripts/music/melody/evaluate.py [--write] [--sample N]
(--write rewrites the "## Evaluation" section of docs/music-melody-model-report.md)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import grammar  # noqa: E402
import train  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SHIP = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.json")
LOCAL = os.path.join(ROOT, "globe", "src", "personal", "melody-bank.local.json")
WALK = os.path.join(HERE, "walk-samples.json")
REPORT = os.path.join(ROOT, "docs", "music-melody-model-report.md")
HITS = (6, 8)
MAX_IV = train.MAX_IV
BINS = list(range(-MAX_IV, MAX_IV + 1))
SOURCES = ("symbtr", "pdmx", "nottingham")
REC_CAP = 0.15               # the bank's share of recurring phrases may exceed the corpus's by at most this much (trained cards)


# ---------------------------------------------------------------- measures

def decode(s: str):
    return [[None if c == "." else int(c, 36) - 2 for c in b] for b in s.split("|")]


def clip(iv: int) -> int:
    return max(-MAX_IV, min(MAX_IV, iv))


def moves(seq):
    """intervals between consecutive sounding notes of a degree sequence (None = rest, skipped)"""
    notes = [d for d in seq if d is not None]
    return [clip(b - a) for a, b in zip(notes, notes[1:])]


def phrase_moves(bars):
    return moves([d for b in bars for d in b])


def corpus_moves(ph, card):
    """the clamped notes of a corpus phrase as written (every note, across bar lines)"""
    cl = train.clamp_phrase(ph["bars"], train.span_of(card), train.OCTAVE_OF.get(card, 7))
    return moves([n[1] for b in cl for n in sorted(b, key=lambda n: n[0])])


def shares(ivs, slots=None):
    """step / leap / repeat shares of the moves, and the rest share of the slots (None when not measured)"""
    n = max(1, len(ivs))
    out = {"step": sum(abs(i) == 1 for i in ivs) / n, "leap": sum(abs(i) >= 2 for i in ivs) / n, "repeat": sum(i == 0 for i in ivs) / n}
    out["rest"] = None if slots is None else sum(d is None for d in slots) / max(1, len(slots))
    return out


def dist(ivs):
    c = Counter(ivs)
    n = len(ivs) + 0.5 * len(BINS)
    return {b: (c[b] + 0.5) / n for b in BINS}


def kl(p, q) -> float:
    return sum(p[b] * math.log(p[b] / q[b]) for b in BINS)


def patterns(phrases_ivs, k: int = 5):
    """the k most common 4-note patterns (three consecutive intervals) with their shares"""
    c = Counter()
    for ivs in phrases_ivs:
        for i in range(len(ivs) - 2):
            c[tuple(ivs[i:i + 3])] += 1
    tot = max(1, sum(c.values()))
    return [("".join(f"{x:+d}" for x in pat), n / tot) for pat, n in c.most_common(k)]


def recurrence(phrases):
    """(share of phrases with a recurring / sequenced bar, mean distinct bar-motifs per phrase)"""
    if not phrases:
        return (0.0, 0.0)
    return (sum(train.recurring(b) for b in phrases) / len(phrases), sum(train.distinct_motifs(b) for b in phrases) / len(phrases))


def cadence_check(bank: dict):
    """(bars, bars on the cadence, bars ending on a rest) over every card and hits"""
    bars = hit = rest = 0
    for cid, by in bank["cards"].items():
        cad = grammar.idiom_of(cid)["cadence"]
        for h, strs in by.items():
            for s in strs:
                for k, b in enumerate(s.split("|")):
                    bars += 1
                    rest += b[-1] == "."
                    hit += b[-1] != "." and int(b[-1], 36) - 2 == cad[k]
    return bars, hit, rest


# ---------------------------------------------------------------- per card

def sample(xs, n):
    """an evenly spaced sample of at most n (deterministic; spreads over pieces, the corpus is in piece order)"""
    if len(xs) <= n:
        return list(xs)
    step = len(xs) / n
    return [xs[int(i * step)] for i in range(n)]


def evaluate_card(cid, bank, which, corpus_all, walk, n_sample):
    src = [s for s in bank["sources"][cid] if s != "grammar"]
    trained = bool(src)
    use = src if trained else [s for s in SOURCES if s != "symbtr" or which == "local"]
    ph = [p for p in corpus_all.get(cid, []) if p["src"] in use]
    sizes = {s: sum(p["src"] == s for p in corpus_all.get(cid, [])) for s in SOURCES}
    row = {"card": cid, "bank": which, "trained": trained, "sources": "+".join(bank["sources"][cid]), "sizes": sizes, "n": len(ph), "h": {}}
    if not ph:
        return row
    smp = sample(ph, n_sample)
    c_ivs = [corpus_moves(p, cid) for p in smp]
    c_flat = [i for ivs in c_ivs for i in ivs]
    c_dist = dist(c_flat)
    row["patterns"] = {"corpus": patterns(c_ivs)}
    for h in HITS:
        c_red = [train.prepare(p["bars"], cid, h) for p in smp]
        entry = [decode(s) for s in bank["cards"][cid][str(h)]]
        gram = {train.encode(p) for p in grammar.bank_entry(cid, h, keep=64, make=400)} if trained else set()
        tpart = [decode(s) for s in bank["cards"][cid][str(h)] if s not in gram]
        wk = [decode(s) for s in walk["cards"][cid][str(h)]]
        b_ivs = [phrase_moves(b) for b in entry]
        w_ivs = [phrase_moves(b) for b in wk]
        b_flat = [i for x in b_ivs for i in x]
        w_flat = [i for x in w_ivs for i in x]
        r = {
            "corpus": shares(c_flat, [d for b in c_red for bar in b for d in bar]),
            "bank": shares(b_flat, [d for b in entry for bar in b for d in bar]),
            "walk": shares(w_flat, [d for b in wk for bar in b for d in bar]),
            "kl_bank": kl(dist(b_flat), c_dist),
            "kl_walk": kl(dist(w_flat), c_dist),
            "rec_corpus": recurrence(c_red),
            "rec_bank": recurrence(entry),
            "rec_trained": recurrence(tpart) if trained else None,
            "rec_walk": recurrence(wk),
        }
        row["h"][h] = r
        if h == 8:
            row["patterns"]["bank"] = patterns(b_ivs)
            row["patterns"]["walk"] = patterns(w_ivs)
    return row


def run(n_sample: int = 2000):
    ship = json.load(open(SHIP, encoding="utf-8"))
    local = json.load(open(LOCAL, encoding="utf-8")) if os.path.exists(LOCAL) else None
    walk = json.load(open(WALK, encoding="utf-8"))
    corpus = train.read_corpus() if os.path.isdir(train.PHRASES) else {}
    rows = []
    for cid in sorted(ship["cards"]):
        if local is not None and "symbtr" in local["sources"].get(cid, []):
            bank, which = local, "local"
        else:
            bank, which = ship, "shippable"
        rows.append(evaluate_card(cid, bank, which, corpus, walk, n_sample))
    checks = {"melody-bank.json": cadence_check(ship)}
    if local is not None:
        checks["melody-bank.local.json"] = cadence_check(local)
    return rows, checks


def failures(rows, checks):
    bad = []
    for r in rows:
        if r["trained"] and r["h"]:
            for h, x in r["h"].items():
                if not x["kl_bank"] < x["kl_walk"]:
                    bad.append(f"{r['card']} hits {h}: KL bank {x['kl_bank']:.3f} >= walk {x['kl_walk']:.3f}")
                if "rec_bank" in x and x["rec_bank"][0] > x["rec_corpus"][0] + REC_CAP + 1e-9:
                    bad.append(f"{r['card']} hits {h}: recurrence bank {x['rec_bank'][0]:.2f} > corpus {x['rec_corpus'][0]:.2f} + {REC_CAP}")
    for name, (bars, hit, rest) in checks.items():
        if hit != bars:
            bad.append(f"{name}: cadence hit {hit}/{bars}")
        if rest:
            bad.append(f"{name}: {rest} bars end on a rest")
    return bad


# ---------------------------------------------------------------- report

def pct(x) -> str:
    return "-" if x is None else f"{100 * x:.0f}"


def section(rows, checks, n_sample: int) -> str:
    L = ["## Evaluation", ""]
    L.append("Written by `scripts/music/melody/evaluate.py --write` (exit code 1 when an acceptance rule fails). The corpus of a card is "
             "the sources its bank was trained on (`sources`; a grammar-only card is compared with every shippable source, plus SymbTr "
             "for the makam cards when the local bank exists), an evenly spaced sample of at most "
             f"{n_sample} phrases. The bank is `melody-bank.local.json` for the cards it trains on SymbTr (\"local\"), else "
             "`melody-bank.json`. The walk is the old hook melody (`phraseMotifs` without a bank), 200 phrases per card dumped by "
             "`globe/scripts/dump-walk-phrases.ts` into `scripts/music/melody/walk-samples.json`. Moves are intervals between consecutive "
             "sounding notes in scale degrees (rests skipped, clipped to +-5): step = 1, leap >= 2, repeat = 0; rest = the share of "
             "slots that are rests (the corpus reduced to h slots). KL = D(x || corpus) of the 11-bin interval distribution, add-0.5 "
             "smoothing. Recurrence = the share of phrases with a bar that repeats or sequences an earlier bar (the model's bar "
             f"similarity: at least {train.MATCH:.0%} of the slots before the cadence agree, transposed by 0, +-1 or +-2), "
             "\"motifs\" = the mean number of distinct bar-motifs per phrase (4 = every bar new); for a trained card the bank's "
             "recurrence is given for the whole entry and for its trained part (without the 30% grammar phrases).")
    L.append("")
    L.append("### Acceptance")
    L.append("")
    bad = failures(rows, checks)
    for name, (bars, hit, rest) in checks.items():
        L.append(f"- `{name}`: cadence hit {hit}/{bars} bars ({100 * hit / bars:.1f}%), {rest} bars end on a rest.")
    tr = [r for r in rows if r["trained"] and r["h"]]
    wins = sum(x["kl_bank"] < x["kl_walk"] for r in tr for x in r["h"].values())
    margin = min((x["kl_walk"] - x["kl_bank"], r["card"], h) for r in tr for h, x in r["h"].items())
    L.append(f"- KL(bank, corpus) < KL(walk, corpus) for {wins} of {2 * len(tr)} (card, hits) pairs of the {len(tr)} trained cards "
             f"(smallest margin {margin[0]:.3f}, {margin[1]} hits {margin[2]}).")
    over = max((x["rec_bank"][0] - x["rec_corpus"][0], r["card"], h) for r in tr for h, x in r["h"].items())
    L.append(f"- Recurrence of the bank at most {100 * REC_CAP:.0f} points above the corpus's for every trained card and hits (largest "
             f"excess {100 * over[0]:+.0f} points, {over[1]} hits {over[2]}).")
    L.append(f"- Result: {'PASS' if not bad else 'FAIL: ' + '; '.join(bad)}")
    L.append("")
    # averages
    L.append("### Averages")
    L.append("")
    L.append("| group | hits | cards | KL bank | KL walk | recurrence corpus / bank / trained part / walk | motifs corpus / bank / trained part / walk |")
    L.append("|---|---|---|---|---|---|---|")
    for label, grp in (("trained", [r for r in rows if r["trained"] and r["h"]]),
                       ("trained (shippable)", [r for r in rows if r["trained"] and r["h"] and r["bank"] == "shippable"]),
                       ("trained (local, SymbTr)", [r for r in rows if r["trained"] and r["h"] and r["bank"] == "local"]),
                       ("grammar-only with a corpus", [r for r in rows if not r["trained"] and r["h"]])):
        if not grp:
            continue
        for h in HITS:
            xs = [r["h"][h] for r in grp]
            m = lambda f: sum(f(x) for x in xs) / len(xs)  # noqa: E731
            tp = [x["rec_trained"] for x in xs if x["rec_trained"]]
            tpr = f"{pct(sum(t[0] for t in tp) / len(tp))}%" if tp else "-"
            tpm = f"{sum(t[1] for t in tp) / len(tp):.2f}" if tp else "-"
            L.append(f"| {label} | {h} | {len(grp)} | {m(lambda x: x['kl_bank']):.3f} | {m(lambda x: x['kl_walk']):.3f} | "
                     f"{pct(m(lambda x: x['rec_corpus'][0]))}% / {pct(m(lambda x: x['rec_bank'][0]))}% / {tpr} / {pct(m(lambda x: x['rec_walk'][0]))}% | "
                     f"{m(lambda x: x['rec_corpus'][1]):.2f} / {m(lambda x: x['rec_bank'][1]):.2f} / {tpm} / {m(lambda x: x['rec_walk'][1]):.2f} |")
    L.append("")
    # per card
    L.append("### Per card (hits 8; hits 6 in the KL column after the slash)")
    L.append("")
    L.append("Shares in %, step / leap / repeat / rest.")
    L.append("")
    L.append("| card | bank | sources | corpus (s / p / n) | corpus | bank | walk | KL bank (8 / 6) | KL walk (8 / 6) | recurrence corpus / bank / trained / walk | motifs corpus / bank / walk |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        sz = r["sizes"]
        sizes = f"{sz['symbtr']} / {sz['pdmx']} / {sz['nottingham']}"
        if not r["h"]:
            L.append(f"| {r['card']} | {r['bank']} | {r['sources']} | {sizes} | - | - | - | - | - | - | - |")
            continue
        x, y = r["h"][8], r["h"][6]
        sh = lambda s: f"{pct(s['step'])} / {pct(s['leap'])} / {pct(s['repeat'])} / {pct(s['rest'])}"  # noqa: E731
        rt = pct(x["rec_trained"][0]) if x["rec_trained"] else "-"
        L.append(f"| {r['card']} | {r['bank']}{'' if r['trained'] else ' (grammar)'} | {r['sources']} | {sizes} | {sh(x['corpus'])} | "
                 f"{sh(x['bank'])} | {sh(x['walk'])} | {x['kl_bank']:.3f} / {y['kl_bank']:.3f} | {x['kl_walk']:.3f} / {y['kl_walk']:.3f} | "
                 f"{pct(x['rec_corpus'][0])} / {pct(x['rec_bank'][0])} / {rt} / {pct(x['rec_walk'][0])} | "
                 f"{x['rec_corpus'][1]:.2f} / {x['rec_bank'][1]:.2f} / {x['rec_walk'][1]:.2f} |")
    L.append("")
    L.append("### The five most common 4-note patterns (hits 8; three intervals, share of all 4-note windows in %)")
    L.append("")
    L.append("| card | corpus | bank | walk |")
    L.append("|---|---|---|---|")
    for r in rows:
        if not r["h"]:
            continue
        p = r["patterns"]
        f = lambda ps: ", ".join(f"`{a}` {100 * s:.1f}" for a, s in ps)  # noqa: E731
        L.append(f"| {r['card']} | {f(p['corpus'])} | {f(p['bank'])} | {f(p['walk'])} |")
    L.append("")
    return "\n".join(L)


def write_report(sec: str) -> None:
    text = open(REPORT, encoding="utf-8").read()
    start = text.find("## Evaluation\n")
    if start >= 0:
        nxt = text.find("\n## ", start + 10)
        text = text[:start] + sec + ("\n" + text[nxt + 1:] if nxt >= 0 else "")
    else:
        text = text.rstrip("\n") + "\n\n" + sec
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(text.rstrip("\n") + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="rewrite the Evaluation section of docs/music-melody-model-report.md")
    ap.add_argument("--sample", type=int, default=2000, help="corpus phrases per card (evenly spaced), default 2000")
    a = ap.parse_args()
    rows, checks = run(a.sample)
    sec = section(rows, checks, a.sample)
    print(sec)
    if a.write:
        write_report(sec)
    bad = failures(rows, checks)
    if bad:
        print("ACCEPTANCE FAILED:\n  " + "\n  ".join(bad))
        sys.exit(1)


if __name__ == "__main__":
    main()
