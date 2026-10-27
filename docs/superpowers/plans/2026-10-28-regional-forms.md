# Regional Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Horon, halay and uzun hava get their own forms (slow → fast, free-time intro) and metre variants.

**Architecture:** `GenreCard.form` / `cells` in `genres.ts`; `compose.ts` `formAt`, `grooveOf(card, speed)`, role thinning and free-time placement. Spec: `docs/superpowers/specs/2026-10-28-regional-forms-design.md` (read it first: it has every rule).

## Global Constraints

- Cards without `form`/`cells` and pieces whose cards have none stay byte-identical.
- Deterministic; hashes via `routeHash`; no `Math.random`.
- Goldens only via `cd globe && python3 /tmp/probe/recap.py "<reason>"` after understanding the failures; tests that count notes keep their property; no weakening.
- Docs follow the code. No push, no deploy.

---

### Task 1: Metre variants (`cells`) and the card fields

**Files:** `globe/src/personal/genres.ts` (`form?`, `cells?`, entries, `cellOf`), `globe/src/personal/compose.ts` (`grooveOf` takes the cell from `cellOf`), tests `globe/test/personal-cells.test.ts`, `docs/music-genre-cards.md`.
- [ ] Failing tests (spec Testing, first bullet). [ ] Implement. [ ] `cd globe && npx tsc --noEmit && npx vitest run` green; goldens recaptured only if a piece of a card with `cells` changed (karadeniz, dogu, zeybek). [ ] Commit `feat(personal): metre variants per card: the horon, the halay and the zeybek take one of their figures`.

### Task 2: The forms (horon, halay, uzunhava)

**Files:** `globe/src/personal/compose.ts` (`formAt`, `grooveOf(card, speed)`, role thinning, free-time notes), `globe/src/personal/genres.ts` (`form` on karadeniz, dogu, icanadolu, mevlevi), tests `globe/test/personal-forms.test.ts`, docs.
- [ ] Failing tests (spec Testing bullets 2–3). [ ] Implement A, B, C. [ ] Run all; understand every failing test; invariants over 300 selections; recapture goldens. [ ] Docs. [ ] Commit `feat(personal): regional forms: the horon and the halay thicken from slow to fast, the long air starts in free time`.
