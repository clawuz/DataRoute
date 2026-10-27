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
