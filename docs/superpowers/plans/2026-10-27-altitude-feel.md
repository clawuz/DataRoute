# Altitude Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loudness, brightness and room follow the altitude of the flight (small amounts).

**Architecture:** `altitude-feel.ts` (pure) + `compose.ts` `push` + `PersonalNote.bright` + a per-note lowpass in `sampler.play`. Spec: `docs/superpowers/specs/2026-10-27-altitude-feel-design.md`.

## Global Constraints

- Deterministic; the constants in one place; percussion roles and the drone untouched.
- Goldens only via `cd globe && python3 /tmp/probe/recap.py "<reason>"` after understanding the failures; tests that compare velocities or `wet` of old behaviour keep their property (change inputs/expectations only where the new rule is the cause, say so).
- Docs: `docs/music-data-mapping.md` (three rows with a Where cell).
- No push, no deploy.

---

### Task 1: The mapping and the filter path

**Files:** Create `globe/src/personal/altitude-feel.ts`, `globe/test/personal-altitude-feel.test.ts`. Modify `globe/src/personal/compose.ts` (`push`, `PersonalNote.bright`), `globe/src/personal/player.ts`, `globe/src/audio/engine.ts` or `instruments.ts` (playNote path), `globe/src/audio/sampler.ts` (`play`), `docs/music-data-mapping.md`. Tests: extend `sampler.test.ts`, add composed-piece tests.

- [ ] **Step 1: Failing tests** as in the spec's Testing section (unit, composed, sampler).
- [ ] **Step 2:** See them fail. **Step 3:** Implement. Hidden gesture notes copy `wet` of their source (check `gestures.ts` copies it: it does for route/via/key/alt/pan/wet; the source's `wet` is already shifted by then).
- [ ] **Step 4:** `cd globe && npx tsc --noEmit && npx vitest run` green; recapture goldens as the constraint says; measure with a scratch probe (outside the repo): the number of notes with `bright` per piece and the extra Web Audio nodes (one lowpass each) against the node estimate of the gestures review (median 172, max 292 alive): report the numbers; if the max rises above 340, create the filter only for notes with `d >= 0.15` and report.
- [ ] **Step 5:** Docs rows. **Step 6:** Commit `feat(personal): the altitude of the flight sets the loudness, the brightness and the room of a note`.

### Task 2: The flight runs (nağme)

**Files:** Modify `globe/src/personal/altitude-feel.ts` (`flightRun`), `globe/src/personal/compose.ts` (the hook branch), `docs/music-data-mapping.md`, `docs/music-genre-cards.md` if a card's behaviour is described there. Test: extend `globe/test/personal-altitude-feel.test.ts`.

- [ ] **Step 1: Failing tests** from the spec's "The flight runs" and Testing sections (`flightRun(1, 3)` = `[4, 5, 6, 7]`, `flightRun(-1, 3)` = `[2, 1, 0, -1]`; composed: in a known selection the notes of a hook route in a climbing bar end with four rising notes; in a descending bar four falling notes; none in a bar with a hook hit at beat 3 or later; none in a `reply` bar).
- [ ] **Step 2:** See them fail. **Step 3:** Implement in the hook branch after the slot loop (reuse the same scale and lift conventions as the hook notes: `sc`, `sh`, `KEY_ROOT`, the chorus octave `sc.length`, `occ[i] > 0 ? 2 : 0`; the degrees are `total` of the bar's last hook note plus the run's offsets; the altitude lift is that of the run's time). Fold with `fit` as every pushed note.
- [ ] **Step 4:** `cd globe && npx tsc --noEmit && npx vitest run` green; recapture goldens (`python3 /tmp/probe/recap.py "the flight runs"`) after understanding; invariants (NaN, order, ranges, `drawDur`, note count ≤ 6000) pass; report how many runs a 3-route and a 10-route piece have. **Step 5:** Docs. **Step 6:** Commit `feat(personal): the flight runs: a rising nağme on the climb, a falling one on the descent`.
