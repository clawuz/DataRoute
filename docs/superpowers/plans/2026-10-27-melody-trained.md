# Trained Melody Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train the melody bank on real music (PDMX, SymbTr, Nottingham) with a grammar skeleton + learned note moves; ship only licence-clean material, keep the NC-trained makam bank local.

**Architecture:** `scripts/music/melody/corpus/*.py` (ingest) → `.corpora/phrases/*.jsonl` → `train.py` (reduce, learn, generate, rerank) → `export_bank.py` (two files) → `melody-bank.ts` loads local-or-shippable. Spec: `docs/superpowers/specs/2026-10-27-melody-trained-design.md`.

**Tech Stack:** Python 3 (stdlib; numpy 2.0 is in `.venv-music/bin/python` and may be used), vitest.

## Global Constraints

- Deterministic (fixed seeds; no Python `hash()`).
- `.corpora/` is git-excluded (`.git/info/exclude`); never `git add` anything under it; `melody-bank.local.json` is in `.gitignore`.
- No melody from any corpus is copied into the repo: only the generated bank strings (statistically generated phrases) are committed, and only the shippable bank.
- Existing tests stay green; goldens do not change (default melody stays `walk`).
- No push, no deploy.

---

### Task 1: Ingest: the phrase corpus

**Files:** Create `scripts/music/melody/corpus/{symbtr.py,pdmx.py,nottingham.py,common.py,makam-cards.json,cards-map.json}`, `scripts/music/melody/corpus/test_corpus.py`, `scripts/music/melody/build_corpus.py` (runs all, writes `.corpora/phrases/<card>.jsonl` and a corpus report).
- [ ] Failing tests first (fixtures: three real SymbTr rows files copied as test strings, a tiny MIDI built in the test, one ABC tune). [ ] Implement the three ingestors and `common.py` (degree mapping, bar building, windowing). [ ] Extract `mid.tar.gz` only for the PDMX files selected by the metadata filter (stream from the tar, do not extract 214 MB blindly; PDMX files are in `mid/` inside the archive: list first). [ ] Run on the real data; print per card the phrase counts by source into `docs/music-melody-model-report.md` section "Corpus". [ ] Commit (scripts, tests, docs only).

### Task 2: Train, generate, export two banks

**Files:** Create `scripts/music/melody/{train.py,test_train.py}`; Modify `scripts/music/melody/export_bank.py` (merge: trained where the corpus is large enough else grammar; shippable and local outputs), `.gitignore`.
- [ ] Failing tests first (`reduce_bar`, the learning tables on a toy corpus, generation determinism and cadence, bank schema, the shippable file has no `symbtr`). [ ] Implement as the spec says. [ ] Run on the real corpus; export `globe/src/personal/melody-bank.json` and `melody-bank.local.json`; sizes reported (< 1 MB minified each). [ ] Commit (not the local file).

### Task 3: The selector change and the evaluation

**Files:** Modify `globe/src/personal/melody-bank.ts`, `globe/test/personal-melody-bank.test.ts`; Create `scripts/music/melody/evaluate.py` extension (corpus vs bank vs walk) and the report.
- [ ] Tests first (ship check; loader precedence; `?melody=bank-shippable`). [ ] Implement. [ ] Run the evaluation; fix the TRAINING (not the acceptance rules) if an acceptance rule fails; paste the numbers in `docs/music-melody-model-report.md`. [ ] `cd globe && npx tsc --noEmit && npx vitest run` green. [ ] Commit.
