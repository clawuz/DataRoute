# World instruments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the 67-instrument "world" sample pack on the personal site, let the music use it by the share of each destination region, load only the instruments a piece plays, and write a credits page for every source (generated and kept in `docs/`; it is NOT published on the site).

**Architecture:** An export script turns the staged pack (`tmp-music-v1/pack-full/`) into `globe/public/samples/world/` plus a generated TypeScript module (`world-pack.ts`: names, synth stand-ins, playable ranges, NSynth families). The sampler gets a catalogue of manifests and an `ensure(names)` call that decodes only the files of the named instruments; the player calls it before a piece starts. `planCards` stops using "every third route" and allocates a colour budget by the share of each destination card; cards get new voices through an overlay table. A generator script builds `docs/credits.html` from the ledgers; it is deliberately outside `globe/public`, so no build or deploy contains it, and nothing on the site links to it.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Web Audio, Python 3 (export and credits scripts).

## Global Constraints

- The music stays deterministic: a function of the routes (and mode) only. No `Math.random` in composition.
- `globe/public/samples/lite/` is not touched. A name present in both packs plays from lite (lite is registered first).
- World instruments are NOT added to the `Instrument` union in `globe/src/audio/theory.ts` (it has exhaustive tables); they are a separate type `WorldInstrument` and the notes' type becomes `PlayInstrument = Instrument | WorldInstrument`.
- Every world instrument has a synthesised stand-in (`baseOf`) so the piece still plays when a sample has not arrived or the user is offline.
- Colour budget: `round(0.6 × n)` routes (at least 1 when n ≥ 2), never more routes than there are candidates; each colour present gets at least one route; the longest routes of a colour are taken first.
- Chords/progression stay in the main card's scale; only a hook route's melody uses its own card's scale.
- The synthesised ORGAN of the site must not be shadowed: the world pack's Renaissance organ is exported as `RENORGAN`.
- The credits page is NOT published: it lives in `docs/credits.html`, never in `globe/public/`, and no page or code links to it. (Publishing later is a one-line change: generate it into `globe/public/` and add a link.)
- No deploy. Deploying is only ever `firebase deploy --only hosting:main --project omerkilavuz-9ad41` and only when the user says "canlıya al". Do not touch the `test` target or create preview channels.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/ui-v2` (already checked out). Run commands from the repository root `/Users/okilavuz/Desktop/omer_works/DataRoute`.
- Known flaky test: `globe/test/groove.test.ts` (times out now and then; unrelated).

## File Structure

| File | Responsibility |
|---|---|
| `scripts/samples/export_world_pack.py` (create) | staged pack → `globe/public/samples/world/`, `globe/src/audio/world-pack.ts`, `docs/music-pack-world-ledger.json` |
| `scripts/samples/{fetch_world,build_world_pack,build_extra_pack,add_bagpipe,prune_pack,serve-dir}…`, `freesound_search.py` (commit as they are) | reproducibility of the pack |
| `globe/public/samples/world/**` (create, generated) | mp3 files + `manifest.json` |
| `globe/src/audio/world-pack.ts` (create, generated) | `WORLD_INSTRUMENTS`, `WorldInstrument`, `WORLD_STAND_IN`, `WORLD_RANGE`, `WORLD_FAMILIES` |
| `globe/src/audio/theory.ts` (modify) | `PlayInstrument`, `baseOf` for world instruments |
| `globe/src/audio/instruments.ts` (modify) | `SynthNote.instrument: PlayInstrument` |
| `globe/src/audio/sampler.ts` (modify) | `use(urls)`, `ensure(names, timeoutMs)` |
| `globe/src/personal/world-voices.ts` (create) | `Voice` type, `resolveVoice`, the overlay table `WORLD_VOICES` |
| `globe/src/personal/genres.ts` (modify) | `GenreCard` uses `Voice`, overlay applied, `allocateColour`, new `planCards` |
| `globe/src/personal/compose.ts` (modify) | `PlayInstrument` notes, voice resolution, world ranges, per-route hook scale, `card.bass` |
| `globe/src/personal/player.ts` (modify) | `use` at start, `ensure` before the loop starts, loading callback |
| `globe/src/personal/Experience.tsx` (modify) | passes the loading callback (toast) |
| `scripts/samples/make_credits.py` (create) | ledgers → `docs/credits.html` |
| `docs/credits.html` (create, generated) | the credits page (not published) |
| `docs/music-genre-cards.md`, `docs/music-libraries.md` (modify) | document voices and the pack |
| `globe/test/world-pack.test.ts`, `sampler.test.ts`, `personal-world.test.ts`, `credits.test.ts` | tests |

---

### Task 1: Export the pack and generate `world-pack.ts`

**Files:**
- Create: `scripts/samples/export_world_pack.py`
- Create (generated, committed): `globe/src/audio/world-pack.ts`, `globe/public/samples/world/**`, `docs/music-pack-world-ledger.json`
- Test: `globe/test/world-pack.test.ts`
- Commit also (already on disk, untracked): `scripts/samples/fetch_world.py`, `build_world_pack.py`, `build_extra_pack.py`, `add_bagpipe.py`, `prune_pack.py`, `serve-dir.mjs`, and the modified `scripts/samples/freesound_search.py`. Do NOT commit `generate-instrument-samples.mjs`, `generate_tulum_ai.py`, `measure-instrument-samples.py` (rejected experiments) or `.claude/`, `tmp-music-v1/`.

**Interfaces:**
- Produces (`world-pack.ts`):
  - `export const WORLD_INSTRUMENTS: readonly [...]` (string literals) and `export type WorldInstrument`
  - `export const WORLD_STAND_IN: Record<WorldInstrument, Instrument>`
  - `export const WORLD_RANGE: Partial<Record<WorldInstrument, readonly [number, number]>>` (Hz: floor, ceiling)
  - `export const WORLD_FAMILIES: Record<string, readonly WorldInstrument[]>` (keys `GUITAR_AC`, `GUITAR_EL`, `EKEYS`, `KEYS_AC`, `ORGAN_EL`, `BASS_EL`)
  - `export type WorldFamily = keyof typeof WORLD_FAMILIES`

- [ ] **Step 1: Write the failing test** — `globe/test/world-pack.test.ts`

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WORLD_FAMILIES, WORLD_INSTRUMENTS, WORLD_RANGE, WORLD_STAND_IN } from "../src/audio/world-pack";

const pub = (p: string): string => fileURLToPath(new URL(`../public/samples/${p}`, import.meta.url));
const world = JSON.parse(readFileSync(pub("world/manifest.json"), "utf8")) as { instruments: Record<string, { zones: { root: number; file: string }[]; unpitched?: boolean }> };
const lite = JSON.parse(readFileSync(pub("lite/manifest.json"), "utf8")) as { instruments: Record<string, unknown> };

describe("world pack", () => {
  it("lists exactly the instruments of its manifest", () => {
    expect([...WORLD_INSTRUMENTS].sort()).toEqual(Object.keys(world.instruments).sort());
    expect(WORLD_INSTRUMENTS.length).toBeGreaterThanOrEqual(60);
  });
  it("has every file of every zone", () => {
    for (const [name, inst] of Object.entries(world.instruments)) {
      expect(inst.zones.length, name).toBeGreaterThan(0);
      for (const z of inst.zones) expect(existsSync(pub(`world/${z.file}`)), `${name}: ${z.file}`).toBe(true);
    }
  });
  it("does not shadow the lite pack or the synthesised ORGAN", () => {
    for (const name of WORLD_INSTRUMENTS) expect(name in lite.instruments, name).toBe(false);
    expect((WORLD_INSTRUMENTS as readonly string[]).includes("ORGAN")).toBe(false);
    expect((WORLD_INSTRUMENTS as readonly string[]).includes("RENORGAN")).toBe(true);
  });
  it("gives every instrument a stand-in and every pitched one a range around its zones", () => {
    for (const name of WORLD_INSTRUMENTS) {
      expect(WORLD_STAND_IN[name], name).toBeTruthy();
      const inst = world.instruments[name];
      if (inst.unpitched) {
        expect(WORLD_RANGE[name], name).toBeUndefined();
        continue;
      }
      const [floor, cap] = WORLD_RANGE[name]!;
      expect(floor).toBeLessThan(cap);
      const lo = 440 * 2 ** ((Math.min(...inst.zones.map((z) => z.root)) - 69) / 12);
      const hi = 440 * 2 ** ((Math.max(...inst.zones.map((z) => z.root)) - 69) / 12);
      expect(floor).toBeLessThan(lo);
      expect(cap).toBeGreaterThan(hi);
    }
  });
  it("groups the NSynth variants into families of real instruments", () => {
    expect(Object.keys(WORLD_FAMILIES).sort()).toEqual(["BASS_EL", "EKEYS", "GUITAR_AC", "GUITAR_EL", "KEYS_AC", "ORGAN_EL"]);
    for (const [fam, list] of Object.entries(WORLD_FAMILIES)) {
      expect(list.length, fam).toBeGreaterThan(0);
      for (const n of list) expect(WORLD_INSTRUMENTS).toContain(n);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm --prefix globe test -- world-pack`
Expected: FAIL (cannot resolve `../src/audio/world-pack`).

- [ ] **Step 3: Write the export script** — `scripts/samples/export_world_pack.py`

```python
#!/usr/bin/env python3
"""
Export the staged world pack to the site:
  globe/public/samples/world/{manifest.json, <instrument>/*.mp3}
  globe/src/audio/world-pack.ts            (names, synth stand-ins, playable ranges, NSynth families)
  docs/music-pack-world-ledger.json        (who made every file, under which licence)
  python3 scripts/samples/export_world_pack.py tmp-music-v1/pack-full globe/public/samples/world globe/src/audio/world-pack.ts docs/music-pack-world-ledger.json
Re-run it after changing the staged pack (prune_pack.py): it rebuilds the folder from scratch.
"""
import json, os, re, shutil, sys

PACK, PUB, TS, LEDGER_OUT = sys.argv[1:5]
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
LITE = os.path.join(ROOT, "globe", "public", "samples", "lite", "manifest.json")
RENAME = {"ORGAN": "RENORGAN"}  # "ORGAN" is a synthesised voice of the site and must not be shadowed

# the synthesised voice that plays while a sample has not arrived (names of the Instrument union in globe/src/audio/theory.ts)
STAND_IN = [
    (r"^(BASSGUITAR|UPRIGHTBASS|NS_BASS_EL_\d+)$", "BASS"),
    (r"^(RENORGAN|NS_ORGAN_EL_\d+)$", "ORGAN"),
    (r"^(RHODES|NS_EKEYS_\d+)$", "EP"),
    (r"^(STEINWAY|KAWAI|UPRIGHTPNO|KNIGHTPNO|HARPSICHORD|NS_KEYS_AC_\d+)$", "PNO"),
    (r"^(NYLONGUITAR|EGUITAR|NS_GUITAR_(AC|EL)_\d+)$", "GUITAR"),
    (r"^(ACCORDION|HARMONICA|TENORSAX|BAGPIPE)$", "CLA"),
    (r"^(ERHU|KEMENCE_MAKAM)$", "VIOLIN"),
    (r"^(SHAKUHACHI|TINWHISTLE|PANPIPE)$", "FLUTE"),
    (r"^(NEY_MAKAM|KAVAL|DUDUK)$", "NEY"),
    (r"^(SANTUR|KAYAGEUM|KOTO|DANTRANH|PSALTERY)$", "KANUN"),
    (r"^(BAGLAMA_MAKAM|BAGLAMA_EXTRA|TANPURA)$", "SAZ"),
    (r"^FOLKHARP$", "HARP"),
    (r"^(KALIMBA|MBIRA)$", "AFR"),
    (r"^(STEELDRUM|VIBES)$", "EUR"),
    (r"^BAGPIPE_DRONE$", "STR"),
    (r"^(TABLA|BENDIR|FRAMEDRUM|FRAMEDRUM_FS|DARBUKA_VCSL)$", "DARBUKA"),
    (r"^DJEMBE$", "TOM"),
    (r"^DRUMKIT$", "SNARE"),
]
FAMILY = re.compile(r"^NS_(GUITAR_AC|GUITAR_EL|EKEYS|KEYS_AC|ORGAN_EL|BASS_EL)_\d+$")
SEMITONES_AROUND = 6  # notes further than this from every recorded zone are folded by octaves (compose.ts)

def stand_in(name):
    for rx, synth in STAND_IN:
        if re.match(rx, name):
            return synth
    sys.exit(f"no synth stand-in for {name}: add it to STAND_IN")

def hz(midi):
    return round(440 * 2 ** ((midi - 69) / 12), 1)

def main():
    man = json.load(open(os.path.join(PACK, "manifest.json")))
    ledger = json.load(open(os.path.join(PACK, "ledger.json")))
    lite = set(json.load(open(LITE))["instruments"])
    insts = {RENAME.get(k, k): v for k, v in man["instruments"].items()}
    clash = sorted(set(insts) & lite)
    if clash:
        sys.exit(f"names also in the lite pack: {clash}")
    shutil.rmtree(PUB, ignore_errors=True)
    files = set()
    for name, inst in insts.items():
        for z in inst["zones"]:
            src, dst = os.path.join(PACK, z["file"]), os.path.join(PUB, z["file"])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
            files.add(z["file"])
    json.dump({"name": "World pack (CC0 and CC BY)", "instruments": insts}, open(os.path.join(PUB, "manifest.json"), "w"), indent=1)
    renamed_from = {v: k for k, v in RENAME.items()}
    rows = []
    for l in ledger:
        if l["file"] in files:
            rows.append({**l, "instrument": RENAME.get(l["instrument"], l["instrument"])})
    json.dump(rows, open(LEDGER_OUT, "w"), indent=1)

    names = sorted(insts)
    families = {}
    for n in names:
        m = FAMILY.match(n)
        if m:
            families.setdefault(m.group(1), []).append(n)
    lines = [
        "// Generated by scripts/samples/export_world_pack.py — do not edit by hand.",
        'import type { Instrument } from "./theory";',
        "",
        "/** the instruments of the world pack (public/samples/world/manifest.json) */",
        "export const WORLD_INSTRUMENTS = " + json.dumps(names) + " as const;",
        "export type WorldInstrument = (typeof WORLD_INSTRUMENTS)[number];",
        "",
        "/** the synthesised voice that plays while a recording has not arrived */",
        "export const WORLD_STAND_IN: Record<WorldInstrument, Instrument> = {",
        *[f'  {n}: "{stand_in(n)}",' for n in names],
        "};",
        "",
        f"/** playable range (Hz, floor and ceiling): {SEMITONES_AROUND} semitones around the recorded zones; drums have none */",
        "export const WORLD_RANGE: Partial<Record<WorldInstrument, readonly [number, number]>> = {",
    ]
    for n in names:
        if insts[n].get("unpitched"):
            continue
        roots = [z["root"] for z in insts[n]["zones"]]
        lines.append(f"  {n}: [{hz(min(roots) - SEMITONES_AROUND)}, {hz(max(roots) + SEMITONES_AROUND)}],")
    lines += [
        "};",
        "",
        "/** NSynth variants: a card names the family, the route hash picks one of its instruments */",
        "export const WORLD_FAMILIES = {",
        *[f"  {k}: {json.dumps(v)} as readonly WorldInstrument[]," for k, v in sorted(families.items())],
        "} as const satisfies Record<string, readonly WorldInstrument[]>;",
        "export type WorldFamily = keyof typeof WORLD_FAMILIES;",
        "",
    ]
    open(TS, "w").write("\n".join(lines))
    print(f"{len(names)} instruments, {len(files)} files, {len(families)} families; renamed {renamed_from or '-'}")

main()
```

- [ ] **Step 4: Run it**

Run:
```bash
python3 scripts/samples/export_world_pack.py tmp-music-v1/pack-full globe/public/samples/world globe/src/audio/world-pack.ts docs/music-pack-world-ledger.json
```
Expected: one line like `67 instruments, 5xx files, 6 families; renamed {'RENORGAN': 'ORGAN'}`. If it exits with `no synth stand-in for X`, add X to `STAND_IN` with a valid synth name from `theory.ts` and re-run.

- [ ] **Step 5: Run the test and see it pass**

Run: `npm --prefix globe test -- world-pack`
Expected: PASS (5 tests). `npm --prefix globe exec tsc -- --noEmit -p globe` may already show errors until Task 2; ignore for now.

- [ ] **Step 6: Commit**

```bash
git add scripts/samples/export_world_pack.py scripts/samples/fetch_world.py scripts/samples/build_world_pack.py scripts/samples/build_extra_pack.py scripts/samples/add_bagpipe.py scripts/samples/prune_pack.py scripts/samples/serve-dir.mjs scripts/samples/freesound_search.py globe/src/audio/world-pack.ts globe/public/samples/world docs/music-pack-world-ledger.json globe/test/world-pack.test.ts
git commit -m "feat(personal): export the world sample pack (67 instruments) with generated names, stand-ins, ranges

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The `PlayInstrument` type and stand-ins

**Files:**
- Modify: `globe/src/audio/theory.ts:19-24`
- Modify: `globe/src/audio/instruments.ts` (`SynthNote.instrument`, any `Set<Instrument>.has` of it)
- Modify: `globe/src/personal/compose.ts` (`PersonalNote.instrument`, `choose`, `voiceOf`, `push`, `fit`, `fitPitch`, `CEILING`, `FLOOR`)
- Test: `globe/test/world-pack.test.ts` (append)

**Interfaces:**
- Consumes: `WorldInstrument`, `WORLD_STAND_IN`, `WORLD_RANGE` from Task 1.
- Produces: `export type PlayInstrument = Instrument | WorldInstrument` and `baseOf(i: PlayInstrument): Instrument` in `theory.ts`; `limitsOf(inst: PlayInstrument): { cap?: number; floor?: number }` (module-private in `compose.ts`).

- [ ] **Step 1: Write the failing test** — append to `globe/test/world-pack.test.ts`

```ts
import { baseOf } from "../src/audio/theory";

describe("baseOf", () => {
  it("maps a world instrument to its synthesised stand-in and leaves the others alone", () => {
    expect(baseOf("SANTUR")).toBe("KANUN");
    expect(baseOf("STEINWAY")).toBe("PNO");
    expect(baseOf("RENORGAN")).toBe("ORGAN");
    expect(baseOf("OUD")).toBe("MEA"); // lite stand-ins keep working
    expect(baseOf("CELLO")).toBe("CELLO");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm --prefix globe test -- world-pack`
Expected: FAIL (`baseOf("SANTUR")` returns `"SANTUR"`, and tsc-free vitest still runs).

- [ ] **Step 3: Edit `theory.ts`**

Add after the `Instrument` union (before `STAND_IN`):

```ts
import { WORLD_STAND_IN, type WorldInstrument } from "./world-pack";

/** what a note may name: a synthesised voice, or a recording of the world pack (which has a synthesised stand-in) */
export type PlayInstrument = Instrument | WorldInstrument;
```
(put the `import` line with the other imports at the top of the file) and replace the last line of the `STAND_IN` block:

```ts
export const baseOf = (i: PlayInstrument): Instrument =>
  i in WORLD_STAND_IN ? WORLD_STAND_IN[i as WorldInstrument] : STAND_IN[i as Instrument] ?? (i as Instrument);
```

- [ ] **Step 4: Type the notes and the composer**

In `globe/src/audio/instruments.ts` change `import { baseOf, type Instrument } from "./theory";` to also import `type PlayInstrument`, and `SynthNote.instrument: Instrument;` to `instrument: PlayInstrument;`.

In `globe/src/personal/compose.ts`:
- `import type { Instrument } from "../audio/theory";` → `import type { Instrument, PlayInstrument } from "../audio/theory";` and add `import { WORLD_RANGE, type WorldInstrument } from "../audio/world-pack";`
- `PersonalNote.instrument: Instrument;` → `PlayInstrument`.
- `const push = (…, instrument: Instrument, …)` → `PlayInstrument`; `const fit = (f: number, inst: Instrument)` → `PlayInstrument`; `const voiceOf: Instrument[]` → `PlayInstrument[]`; `function fitPitch(f: number, inst: Instrument)` → `PlayInstrument`.
- Replace the two `const cap = CEILING[inst]; const floor = FLOOR[inst];` pairs (in `fit` and `fitPitch`) with `const { cap, floor } = limitsOf(inst);` and add, below the `FLOOR` table:

```ts
/** the pitch limits of an instrument: the world pack's range around its recordings, else the tables above */
const limitsOf = (inst: PlayInstrument): { cap?: number; floor?: number } => {
  const w = (WORLD_RANGE as Partial<Record<string, readonly [number, number]>>)[inst];
  return w ? { floor: w[0], cap: w[1] } : { cap: CEILING[inst as Instrument], floor: FLOOR[inst as Instrument] };
};
```

- [ ] **Step 5: Let the compiler find the rest and fix each the same way**

Run: `npm --prefix globe exec tsc -- --noEmit -p globe`
For every error where a `PersonalNote.instrument` / `SynthNote.instrument` (type `PlayInstrument`) reaches code that wants an `Instrument` (a `Set<Instrument>.has(x)`, a `Record<Instrument,…>[x]`, a function parameter) wrap it: `baseOf(x)`. In `instruments.ts` the value `r = baseOf(n.instrument)` is already computed: use `r` for `SUSTAINED.has`, `PLUCKED.has`, `releaseOf`. Repeat until the command prints nothing.

- [ ] **Step 6: Run the tests**

Run: `npm --prefix globe test -- world-pack personal`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add globe/src globe/test/world-pack.test.ts
git commit -m "feat(personal): notes may name world-pack instruments (PlayInstrument, stand-ins, playable ranges)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sampler `use` and `ensure` (load only what plays)

**Files:**
- Modify: `globe/src/audio/sampler.ts` (the `Sampler` interface and `createSampler`)
- Test: `globe/test/sampler.test.ts` (append)

**Interfaces:**
- Produces on `Sampler`: `use(manifestUrls: string[]): Promise<void>` (reads manifests once into a catalogue; the first manifest to name an instrument wins) and `ensure(names: string[], timeoutMs?: number): Promise<void>` (awaits the catalogue, decodes the files of the named instruments that are not decoded yet, resolves when they are all present or after `timeoutMs`, default 4000; never rejects). `has(name)` is true once all zones of the instrument are decoded. `load()` stays as it is.

- [ ] **Step 1: Write the failing tests** — append to `globe/test/sampler.test.ts`

```ts
import { afterEach, vi } from "vitest";

describe("sampler: use and ensure", () => {
  const MANIFEST = {
    name: "t",
    instruments: {
      A: { zones: [{ root: 60, lo: 0, hi: 127, file: "a/a1.mp3" }, { root: 72, lo: 0, hi: 127, file: "a/a2.mp3" }] },
      B: { zones: [{ root: 60, lo: 0, hi: 127, file: "b/b1.mp3" }] },
      C: { use: "A", zones: [] },
    },
  };
  const ctx = { decodeAudioData: async () => ({ duration: 1 }) as unknown as AudioBuffer } as unknown as AudioContext;
  const fetched: string[] = [];
  const stub = (never?: string): void => {
    fetched.length = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      if (never && url.endsWith(never)) return new Promise(() => {});
      return url.endsWith("manifest.json") ? { ok: true, json: async () => MANIFEST } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    });
  };
  afterEach(() => vi.unstubAllGlobals());

  it("downloads only the files of the instruments asked for", async () => {
    stub();
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json"]);
    expect(fetched).toEqual(["/x/manifest.json"]);
    await s.ensure(["A"]);
    expect(fetched.sort()).toEqual(["/x/a/a1.mp3", "/x/a/a2.mp3", "/x/manifest.json"].sort());
    expect(s.has("A")).toBe(true);
    expect(s.has("B")).toBe(false);
  });
  it("does not fetch twice and builds an instrument that uses another one", async () => {
    stub();
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json", "/x/manifest.json"]);
    await s.ensure(["A", "C"]);
    await s.ensure(["A"]);
    expect(fetched.filter((u) => u.endsWith("a1.mp3")).length).toBe(1);
    expect(fetched.filter((u) => u.endsWith("manifest.json")).length).toBe(1);
    expect(s.has("C")).toBe(true);
  });
  it("lets an unknown name through and gives up on a file that never arrives", async () => {
    stub("b1.mp3");
    const s = createSampler(ctx);
    await s.use(["/x/manifest.json"]);
    const t0 = Date.now();
    await s.ensure(["NOPE", "B"], 40);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(s.has("NOPE")).toBe(false);
    expect(s.has("B")).toBe(false);
  });
  it("waits for the catalogue before looking names up", async () => {
    stub();
    const s = createSampler(ctx);
    const loading = s.use(["/x/manifest.json"]);
    await s.ensure(["B"]); // called before `use` has finished
    await loading;
    expect(s.has("B")).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm --prefix globe test -- sampler`
Expected: FAIL (`s.use is not a function`).

- [ ] **Step 3: Implement** — in `sampler.ts`

Extend the interface:

```ts
export interface Sampler {
  /** fetch a manifest and decode its files (in the background; resolves with how many files arrived) */
  load(manifestUrl: string): Promise<number>;
  /** read manifests into a catalogue (nothing is decoded); the first manifest to name an instrument wins */
  use(manifestUrls: string[]): Promise<void>;
  /** decode the recordings of these instruments (only those); resolves when present or after `timeoutMs`, never rejects */
  ensure(names: string[], timeoutMs?: number): Promise<void>;
  has(instrument: string): boolean;
  /** schedules a note; false when the instrument is not loaded (play the synth instead) */
  play(dest: AudioNode, instrument: string, freq: number, vel: number, when: number, durSec: number, onEnd?: () => void): boolean;
  dispose(): void;
}
```

Inside `createSampler`, after `const loading = new Set<string>();` add:

```ts
  const catalogue = new Map<string, { inst: SampleInstrument; base: string }>();
  const seenManifests = new Set<string>();
  const inflight = new Map<string, Promise<boolean>>();
  let catalogueReady: Promise<void> = Promise.resolve();

  /** decode one instrument's recordings and register it; false when a file did not arrive */
  function fetchInstrument(name: string): Promise<boolean> {
    if (defs.has(name)) return Promise.resolve(true);
    const known = catalogue.get(name);
    if (!known) return Promise.resolve(false);
    const running = inflight.get(name);
    if (running) return running;
    const job = (async () => {
      const { inst, base } = known;
      if (inst.use) {
        const ok = await fetchInstrument(inst.use);
        const from = defs.get(inst.use);
        if (!ok || !from) return false;
        defs.set(name, { ...from, ...inst, zones: from.zones });
        return true;
      }
      const urls = [...new Set(inst.zones.map((z) => base + z.file))];
      const ok = await Promise.all(
        urls.map(async (u) => {
          if (buffers.has(u)) return true;
          const b = await decode(u);
          if (b) buffers.set(u, b);
          return !!b;
        }),
      );
      if (!ok.every(Boolean)) return false;
      defs.set(name, { ...inst, zones: inst.zones.map((z) => ({ ...z, file: base + z.file })) });
      return true;
    })().finally(() => inflight.delete(name));
    inflight.set(name, job);
    return job;
  }
```

And in the returned object add (next to `load`):

```ts
    use(manifestUrls) {
      const run = async (): Promise<void> => {
        for (const url of manifestUrls) {
          if (seenManifests.has(url)) continue;
          seenManifests.add(url);
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const man = (await res.json()) as SampleManifest;
            const base = url.slice(0, url.lastIndexOf("/") + 1);
            for (const [name, inst] of Object.entries(man.instruments)) if (!catalogue.has(name)) catalogue.set(name, { inst, base });
          } catch {
            /* offline or a bad manifest: the synth plays */
          }
        }
      };
      catalogueReady = catalogueReady.then(run);
      return catalogueReady;
    },
    async ensure(names, timeoutMs = 4000) {
      await catalogueReady;
      const wanted = [...new Set(names)].filter((n) => !defs.has(n) && catalogue.has(n));
      if (wanted.length === 0) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const gaveUp = new Promise<void>((r) => {
        timer = setTimeout(r, timeoutMs);
      });
      await Promise.race([Promise.all(wanted.map(fetchInstrument)).then(() => undefined), gaveUp]);
      clearTimeout(timer);
    },
```
Also clear the new maps in `dispose()`: add `catalogue.clear(); inflight.clear(); seenManifests.clear();`.

- [ ] **Step 4: Run the tests**

Run: `npm --prefix globe test -- sampler`
Expected: PASS (all old and 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add globe/src/audio/sampler.ts globe/test/sampler.test.ts
git commit -m "feat(audio): the sampler keeps a catalogue and decodes only the instruments a piece plays

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The player loads what the piece plays

**Files:**
- Modify: `globe/src/personal/player.ts` (`createPersonalPlayer`, `play`)
- Modify: `globe/src/personal/Experience.tsx:146` (the call that creates the player)

**Interfaces:**
- Consumes: `Sampler.use`, `Sampler.ensure`, `Sampler.has` (Task 3).
- Produces: `createPersonalPlayer(ctx: AudioContext, onLoading?: (loading: boolean) => void): PersonalPlayer`. `play()` keeps its signature; the loop starts when the piece's instruments have arrived (at most 4 s), or immediately when all are present.

- [ ] **Step 1: Edit `player.ts`**

Change the signature and the pack registration:

```ts
export function createPersonalPlayer(ctx: AudioContext, onLoading?: (loading: boolean) => void): PersonalPlayer {
```
Replace `void sampler.load("/samples/lite/manifest.json");` with:

```ts
  // the manifests are small: they are read now, the recordings of an instrument only when a piece plays it
  void sampler.use(["/samples/lite/manifest.json", "/samples/world/manifest.json"]);
```
Add next to the other `let` state: `let startToken = 0; // a newer play() or stop() cancels a start that is still waiting for samples`.

Replace the body of `play(p, cb, plan)` after `planNext = 0;` with:

```ts
      void ctx.resume();
      if (timer) clearInterval(timer);
      timer = null;
      const token = ++startToken;
      const start = (): void => {
        if (disposed || token !== startToken || piece !== p) return;
        loopStart = ctx.currentTime + 0.15;
        timer = setInterval(tick, TICK_MS);
      };
      const names = [...new Set(p.notes.map((n) => n.instrument))];
      if (names.every((n) => sampler.has(n))) {
        start();
        return;
      }
      onLoading?.(true);
      void sampler.ensure(names, 4000).then(() => {
        if (token === startToken) onLoading?.(false);
        start();
      });
```
In `stop()` add `startToken++;` and `onLoading?.(false);` as the first lines. In `dispose()` add `startToken++;`.

- [ ] **Step 2: Edit `Experience.tsx:146`**

`player = createPersonalPlayer(ctx);` → 

```ts
      player = createPersonalPlayer(ctx, (loading) => setToast(loading ? "LOADING INSTRUMENTS…" : ""));
```

- [ ] **Step 3: Type-check and run all tests**

Run: `npm --prefix globe exec tsc -- --noEmit -p globe && npm --prefix globe test`
Expected: no tsc output; tests PASS (a one-off `groove.test.ts` timeout is the known flake: re-run that file alone).

- [ ] **Step 4: Commit**

```bash
git add globe/src/personal/player.ts globe/src/personal/Experience.tsx
git commit -m "feat(personal): the piece starts when its instruments have arrived (4 s at most), only those are downloaded

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Colour by the share of each region (`planCards`)

**Files:**
- Modify: `globe/src/personal/genres.ts` (`planCards` and a new exported `allocateColour`)
- Test: `globe/test/personal-world.test.ts` (create)

**Interfaces:**
- Produces: `export const COLOUR_SHARE = 0.6` and

```ts
export function allocateColour(ids: string[], eligible: boolean[], dist: number[], keys: string[], budget: number): number[]
```
returns the indices (ascending) of the routes that play the card of their own destination. `ids[i]` = card id of route i's destination; `eligible[i]` = false for routes whose destination card is the main card; `dist[i]` = route length (km); `keys[i]` = route key (tie-break by hash).

- [ ] **Step 1: Write the failing tests** — `globe/test/personal-world.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { allocateColour, cardsOfAirport, planCards } from "../src/personal/genres";
import { buildRoutes } from "../src/personal/routes";
import { composePiece } from "../src/personal/compose";

const keys = (n: number): string[] => Array.from({ length: n }, (_, i) => `R${i}`);
const all = (n: number): boolean[] => Array(n).fill(true);

describe("allocateColour", () => {
  it("gives nothing when there is no candidate or no budget", () => {
    expect(allocateColour(["a", "a"], [false, false], [1, 2], keys(2), 2)).toEqual([]);
    expect(allocateColour(["a", "a"], all(2), [1, 2], keys(2), 0)).toEqual([]);
  });
  it("takes the longest routes of the only colour first", () => {
    const got = allocateColour(["a", "a", "a", "a", "a"], all(5), [10, 50, 30, 40, 20], keys(5), 3);
    expect(got).toEqual([1, 2, 3]);
  });
  it("shares the budget in proportion to the routes going to each colour", () => {
    // six routes to colour a, two to b: a budget of 4 is 3 + 1
    const ids = ["a", "a", "a", "a", "a", "a", "b", "b"];
    const got = allocateColour(ids, all(8), [9, 8, 7, 6, 5, 4, 3, 2], keys(8), 4);
    expect(got.filter((i) => ids[i] === "a").length).toBe(3);
    expect(got.filter((i) => ids[i] === "b").length).toBe(1);
  });
  it("gives every colour present at least one route, even beyond the budget", () => {
    const got = allocateColour(["a", "b", "c"], all(3), [1, 2, 3], keys(3), 2);
    expect(got).toEqual([0, 1, 2]);
  });
  it("never takes an ineligible route and never more than there are candidates", () => {
    const got = allocateColour(["a", "a", "a"], [true, false, true], [1, 2, 3], keys(3), 5);
    expect(got).toEqual([0, 2]);
  });
  it("is deterministic", () => {
    const a = allocateColour(["a", "b", "a", "b", "a"], all(5), [5, 5, 5, 5, 5], keys(5), 3);
    const b = allocateColour(["a", "b", "a", "b", "a"], all(5), [5, 5, 5, 5, 5], keys(5), 3);
    expect(a).toEqual(b);
  });
});

describe("planCards", () => {
  const places = ["JFK", "NRT", "DPS", "LOS", "GRU", "LHR", "DEL", "NBO", "SYD", "CAI"];
  it("colours about 60% of the routes, each from the cards of its own destination", () => {
    const routes = buildRoutes(places, "IST");
    const plan = planCards("visited", routes);
    expect(plan.perRoute.length).toBe(routes.length);
    const coloured = plan.perRoute.map((c, i) => ({ c, i })).filter((x) => x.c !== plan.main);
    expect(coloured.length).toBeGreaterThanOrEqual(1);
    expect(coloured.length).toBeLessThanOrEqual(Math.max(Math.round(0.6 * routes.length), 1 + new Set(coloured.map((x) => x.c.id)).size));
    for (const { c, i } of coloured) {
      const r = routes[i];
      const far = r.to === "IST" ? r.from : r.to;
      expect(cardsOfAirport(far, r.region).map((x) => x.id)).toContain(c.id);
    }
  });
  it("stays the same for the same selection", () => {
    const routes = buildRoutes(places, "IST");
    expect(planCards("wish", routes).perRoute.map((c) => c.id)).toEqual(planCards("wish", routes).perRoute.map((c) => c.id));
  });
  it("keeps a two-route piece on the main card unless a destination colour exists", () => {
    const routes = buildRoutes(["NRT", "DPS"], "IST");
    const plan = planCards("visited", routes);
    expect(plan.perRoute.some((c) => c !== plan.main)).toBe(true);
  });
  it("composes a piece with these cards", () => {
    const routes = buildRoutes(places, "IST");
    const a = composePiece("visited", routes);
    const b = composePiece("visited", routes);
    expect(a.notes.length).toBeGreaterThan(100);
    expect(JSON.stringify(a.notes)).toBe(JSON.stringify(b.notes));
  });
});
```
(The third `planCards` test assumes IST→NRT/DPS destination cards are not the main card; if the main card of that selection happens to be the Asian card, change the two places to `["LOS", "GRU"]`.)

- [ ] **Step 2: Run them and see them fail**

Run: `npm --prefix globe test -- personal-world`
Expected: FAIL (`allocateColour` is not exported).

- [ ] **Step 3: Implement** — in `genres.ts` replace the `perRoute` computation of `planCards` and add the function

```ts
/** the share of the routes (rounded) that play the card of their own destination; the rest play the main card */
export const COLOUR_SHARE = 0.6;

/**
 * Which routes play the card of their own destination. Each colour (card) present gets at least one route; the rest of the
 * budget is shared in proportion to how many routes go to each colour (the remainder goes to the larger colours first);
 * inside a colour the longest routes go first. Returns the indices, ascending.
 */
export function allocateColour(ids: string[], eligible: boolean[], dist: number[], keys: string[], budget: number): number[] {
  const groups = new Map<string, number[]>();
  ids.forEach((id, i) => {
    if (eligible[i]) groups.set(id, [...(groups.get(id) ?? []), i]);
  });
  const total = [...groups.values()].reduce((s, g) => s + g.length, 0);
  if (total === 0 || budget <= 0) return [];
  const cap = Math.min(budget, total);
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || routeHash(a[0]) - routeHash(b[0]));
  const alloc = new Map<string, number>(ordered.map(([id, g]) => [id, Math.min(g.length, Math.max(1, Math.floor((g.length / total) * cap)))]));
  let left = cap - [...alloc.values()].reduce((s, x) => s + x, 0);
  while (left > 0) {
    let grew = false;
    for (const [id, g] of ordered) {
      if (left > 0 && (alloc.get(id) ?? 0) < g.length) {
        alloc.set(id, (alloc.get(id) ?? 0) + 1);
        left--;
        grew = true;
      }
    }
    if (!grew) break;
  }
  const out: number[] = [];
  for (const [id, g] of ordered) {
    const byLength = [...g].sort((a, b) => dist[b] - dist[a] || routeHash(keys[a]) - routeHash(keys[b]));
    out.push(...byLength.slice(0, alloc.get(id) ?? 0));
  }
  return out.sort((a, b) => a - b);
}
```

In `planCards`, replace from `const perRoute = routes.map(` to its closing `});` with:

```ts
  const far = (r: PersonalRoute): string => (r.to === "IST" ? r.from : r.to);
  const colourOf = routes.map((r, i) => {
    const list = cardsOfAirport(far(r), r.region);
    return list[(routeHash(r.key + i) >>> 3) % list.length];
  });
  const budget = n >= 2 ? Math.max(1, Math.round(COLOUR_SHARE * n)) : 0;
  const chosen = new Set(
    allocateColour(colourOf.map((c) => c.id), colourOf.map((c) => c.id !== main.id), routes.map((r) => r.distKm), routes.map((r) => r.key), budget),
  );
  const perRoute = routes.map((_, i) => (chosen.has(i) ? colourOf[i] : main));
```
and update the doc comment above `planCards` to say: "…the routes that take the card of their own destination are chosen by the share of each destination colour (see `allocateColour`)".

- [ ] **Step 4: Run the tests**

Run: `npm --prefix globe test -- personal-world personal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add globe/src/personal/genres.ts globe/test/personal-world.test.ts
git commit -m "feat(personal): destination colours are shared by the share of each region (replaces every third route)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: World voices on the cards and a hook scale per route

**Files:**
- Create: `globe/src/personal/world-voices.ts`
- Modify: `globe/src/personal/genres.ts` (`GenreCard` fields, `CARDS` overlay)
- Modify: `globe/src/personal/compose.ts` (`choose`, `voiceOf`, hook scale)
- Modify: `docs/music-genre-cards.md`
- Test: `globe/test/personal-world.test.ts` (append)

**Interfaces:**
- Produces (`world-voices.ts`): `export type Voice = PlayInstrument | WorldFamily`; `export function resolveVoice(v: Voice, h: number): PlayInstrument` (a family name → `WORLD_FAMILIES[v][h % length]`, anything else unchanged); `export const WORLD_VOICES: Record<string, { held?: Voice[]; melody?: Voice[]; pluck?: Voice[]; bass?: Voice[]; perc?: Voice }>` keyed by card id.
- `GenreCard`: `held`, `melody`, `pluck: Voice[]`, `perc: Voice`, new optional `bass?: Voice[]`.

- [ ] **Step 1: Write the failing tests** — append to `globe/test/personal-world.test.ts`

```ts
import { WORLD_FAMILIES, WORLD_INSTRUMENTS } from "../src/audio/world-pack";
import { CARDS } from "../src/personal/genres";
import { WORLD_VOICES, resolveVoice, type Voice } from "../src/personal/world-voices";

const isWorld = (v: string): boolean => v in WORLD_FAMILIES || (WORLD_INSTRUMENTS as readonly string[]).includes(v);

describe("world voices", () => {
  it("turns a family into one of its instruments, by hash, and leaves other names alone", () => {
    expect(resolveVoice("PNO", 7)).toBe("PNO");
    expect(resolveVoice("SANTUR", 7)).toBe("SANTUR");
    const list = WORLD_FAMILIES.GUITAR_EL;
    expect(list).toContain(resolveVoice("GUITAR_EL", 5));
    expect(resolveVoice("GUITAR_EL", 5)).toBe(list[5 % list.length]);
  });
  it("only names cards and instruments that exist", () => {
    const ids = new Set(CARDS.map((c) => c.id));
    for (const [id, v] of Object.entries(WORLD_VOICES)) {
      expect(ids.has(id), id).toBe(true);
      for (const list of [v.held, v.melody, v.pluck, v.bass, v.perc ? [v.perc] : []]) for (const x of list ?? []) expect(isWorld(x), `${id}: ${x}`).toBe(true);
    }
  });
  it("puts the overlay voices into the cards", () => {
    const persian = CARDS.find((c) => c.id === "persian")!;
    expect(persian.pluck).toContain("SANTUR");
    expect(persian.perc).toBe("DARBUKA_VCSL");
    expect(CARDS.find((c) => c.id === "jazz")!.bass).toContain("UPRIGHTBASS");
  });
  it("lets a piece to Iran and Japan use their instruments, and only real instrument names reach the notes", () => {
    const routes = buildRoutes(["IKA", "NRT", "JFK", "LOS"], "IST");
    const piece = composePiece("visited", routes);
    for (const n of piece.notes) {
      expect(n.instrument in WORLD_FAMILIES, n.instrument).toBe(false);
      expect(typeof n.instrument).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm --prefix globe test -- personal-world`
Expected: FAIL (cannot resolve `../src/personal/world-voices`).

- [ ] **Step 3: Create `globe/src/personal/world-voices.ts`**

```ts
import type { PlayInstrument } from "../audio/theory";
import { WORLD_FAMILIES, type WorldFamily } from "../audio/world-pack";

/** what a card may name: any instrument, or an NSynth family (the route hash picks the variant) */
export type Voice = PlayInstrument | WorldFamily;

export function resolveVoice(v: Voice, h: number): PlayInstrument {
  const fam = (WORLD_FAMILIES as Record<string, readonly PlayInstrument[]>)[v];
  return fam ? fam[Math.abs(h) % fam.length] : (v as PlayInstrument);
}

/**
 * The recordings of the world pack, by card: they are ADDED to the voices a card already has (those stay as the
 * fallback). `bass` is the list the bass route draws from (the chord pad never does). Cards that sit in a region
 * with no world recording are not listed. See docs/music-genre-cards.md.
 */
export const WORLD_VOICES: Record<string, { held?: Voice[]; melody?: Voice[]; pluck?: Voice[]; bass?: Voice[]; perc?: Voice }> = {
  anatolian: { melody: ["NEY_MAKAM", "KEMENCE_MAKAM", "BAGLAMA_MAKAM"], pluck: ["BAGLAMA_EXTRA", "BAGLAMA_MAKAM"] },
  karsilama: { melody: ["BAGPIPE", "KEMENCE_MAKAM"], pluck: ["BAGLAMA_EXTRA"] },
  arabic: { melody: ["NEY_MAKAM"], pluck: ["SANTUR"], perc: "DARBUKA_VCSL" },
  persian: { melody: ["SANTUR"], pluck: ["SANTUR"], perc: "DARBUKA_VCSL" },
  hindustani: { melody: ["NEY_MAKAM"], pluck: ["TANPURA"], perc: "TABLA" },
  eastasia: { melody: ["SHAKUHACHI", "ERHU", "KOTO"], pluck: ["KOTO", "KAYAGEUM", "DANTRANH"] },
  gamelan: { melody: ["STEELDRUM"], pluck: ["VIBES", "STEELDRUM"] },
  westafrica: { pluck: ["KALIMBA", "MBIRA"], perc: "DJEMBE" },
  eastafrica: { pluck: ["MBIRA", "KALIMBA"], perc: "DJEMBE" },
  salsa: { pluck: ["NYLONGUITAR"], bass: ["UPRIGHTBASS"] },
  mariachi: { pluck: ["NYLONGUITAR", "STEELDRUM"] },
  flamenco: { melody: ["NYLONGUITAR"], pluck: ["NYLONGUITAR"] },
  bossa: { pluck: ["NYLONGUITAR"], bass: ["UPRIGHTBASS"] },
  tango: { melody: ["ACCORDION"], held: ["ACCORDION"], bass: ["UPRIGHTBASS"] },
  celtic: { melody: ["TINWHISTLE", "BAGPIPE"], pluck: ["FOLKHARP"], perc: "FRAMEDRUM" },
  slavic: { melody: ["ACCORDION"], held: ["ACCORDION"], pluck: ["PSALTERY"] },
  centralasia: { pluck: ["PSALTERY"], perc: "BENDIR" },
  jazz: { melody: ["TENORSAX", "EKEYS"], pluck: ["EKEYS", "GUITAR_EL"], bass: ["UPRIGHTBASS"] },
  funk: { melody: ["EKEYS", "TENORSAX"], pluck: ["GUITAR_EL", "EKEYS"], bass: ["BASSGUITAR", "BASS_EL"] },
  pop: { melody: ["EKEYS", "GUITAR_EL"], pluck: ["GUITAR_EL"], bass: ["BASS_EL"] },
  romantic: { melody: ["STEINWAY"], pluck: ["STEINWAY", "KAWAI"] },
  baroque: { melody: ["HARPSICHORD"], pluck: ["HARPSICHORD"], held: ["RENORGAN"] },
};
```

- [ ] **Step 4: Edit `genres.ts`**

- Replace `import type { Instrument } from "../audio/theory";` with `import { WORLD_VOICES, type Voice } from "./world-voices";`.
- In `GenreCard` change `held: Instrument[]; melody: Instrument[]; pluck: Instrument[]; perc: Instrument;` to `held: Voice[]; melody: Voice[]; pluck: Voice[]; perc: Voice;` and add after `perc`: `/** the voices of the bass route (the chord pad does not draw from it); omitted: the held voices */ bass?: Voice[];`
- Rename `export const CARDS: GenreCard[] = [` to `const BASE_CARDS: GenreCard[] = [` and, directly after its closing `];`, add:

```ts
/** the cards with the recordings of the world pack added to their voices (the original voices stay as the fallback) */
export const CARDS: GenreCard[] = BASE_CARDS.map((c) => {
  const w = WORLD_VOICES[c.id];
  if (!w) return c;
  return {
    ...c,
    held: [...c.held, ...(w.held ?? [])],
    melody: [...c.melody, ...(w.melody ?? [])],
    pluck: [...c.pluck, ...(w.pluck ?? [])],
    perc: w.perc ?? c.perc,
    ...(w.bass ? { bass: w.bass } : {}),
  };
});
```

- [ ] **Step 5: Edit `compose.ts`**

- `import { planCards } from "./genres";` → also `import { resolveVoice, type Voice } from "./world-voices";`.
- `choose` becomes (only the signature, the two returns and the `taken` calls change):

```ts
  const choose = (list: Voice[], h: number, i: number, kind: "melody" | "pluck" | "other"): PlayInstrument => {
    if (list.includes("PNO") && pianos < 2 && kind !== "other" && (pianos === 0 || kind === "pluck")) {
      pianos++;
      return "PNO";
    }
    for (let o = 0; o < list.length; o++) {
      const c = list[(h + st.ensemble + i + o) % list.length];
      if (c !== "PNO" && !taken.has(c)) {
        taken.add(c);
        return resolveVoice(c, h);
      }
    }
    return resolveVoice(list[(h + st.ensemble + i) % list.length], h);
  };
```
- In `voiceOf` replace the `switch`:

```ts
    switch (role[i]) {
      case "pad": return choose(card.held, h, i, "other");
      case "bass": return choose(card.bass?.length ? card.bass : card.held.filter((x) => x !== "PNO"), h, i + 1, "other");
      case "hook": return choose(card.melody, h, i, "melody");
      case "pluck": return choose(card.pluck, h, i, "pluck");
      case "backbeat": return resolveVoice(card.perc, h);
      case "kick": return folkish ? resolveVoice(card.perc, h) : "TIMP";
      default: return folkish && card.perc !== "DARBUKA" ? resolveVoice(card.perc, h) : "TRI";
    }
```
- Hook scale per route. Replace line 242 `const scale = …` usage: keep `scale` (main) for `L` only if still used elsewhere, and add below it:

```ts
  /** the melody scale of each route: its own card's (a coloured route sings in the scale of its destination) */
  const scaleOf = routes.map((_, i) => (mode === "wish" ? plan.perRoute[i].scaleWish ?? plan.perRoute[i].scale : plan.perRoute[i].scale));
```
and in the hook note code (the line that computes `semis`, currently `KEY_ROOT + st.shift + scale[((total % L) + L) % L] + 12 * Math.floor(total / L)`) use the route's scale:

```ts
          const sc = scaleOf[i];
          let semis = KEY_ROOT + st.shift + sc[((total % sc.length) + sc.length) % sc.length] + 12 * Math.floor(total / sc.length);
```
Delete `const L = scale.length;` and `const scale = …` if the compiler reports them unused.

- [ ] **Step 6: Type-check and run the tests**

Run: `npm --prefix globe exec tsc -- --noEmit -p globe && npm --prefix globe test -- personal`
Expected: no tsc output; PASS. If a test about an existing tune/card expectation fails because the card lists grew, update the expectation only when it counted list lengths; otherwise investigate.

- [ ] **Step 7: Document and commit**

In `docs/music-genre-cards.md` add a section "World pack voices" with the table of `WORLD_VOICES` (card → melody / pluck / held / bass / perc) exactly as in the code, and one sentence: "Instruments of the pack that no card names (`BAGPIPE_DRONE`, `KAVAL`, `DUDUK`, `NS_*` variants other than the family pick, `DRUMKIT`, `TENORSAX` outside jazz/funk, `HARMONICA`, `KNIGHTPNO`, `UPRIGHTPNO`) are on the site but not played yet."

```bash
git add globe/src/personal globe/test/personal-world.test.ts docs/music-genre-cards.md
git commit -m "feat(personal): cards play the world-pack recordings; a coloured route sings in the scale of its destination

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Credits page (generated into docs/, not published)

**Files:**
- Create: `scripts/samples/make_credits.py`
- Create (generated, committed): `docs/credits.html`
- Modify: `docs/music-libraries.md` (ledger table row for the world pack)
- Test: `globe/test/credits.test.ts` (create)

**Interfaces:**
- Consumes: `docs/music-pack-lite-ledger.json` (list of `{instrument,file,source,licence}`), `docs/music-pack-freesound-ledger.json` and `docs/music-pack-world-ledger.json` (lists of `{instrument,file,source,author,licence,title}`).
- Produces: `docs/credits.html`. It is not served by any build (it is outside `globe/public`) and nothing links to it.

- [ ] **Step 1: Write the failing test** — `globe/test/credits.test.ts`

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const html = read("../../docs/credits.html");
const world = JSON.parse(read("../../docs/music-pack-world-ledger.json")) as { author: string; licence: string; source: string }[];

describe("credits page", () => {
  it("names every CC BY author of the world pack with a link to the work", () => {
    const by = world.filter((r) => r.licence === "CC BY");
    expect(by.length).toBeGreaterThan(20);
    for (const r of by) {
      expect(html, r.author).toContain(r.author.replace(/&/g, "&amp;"));
      expect(html, r.source).toContain(r.source.replace(/&/g, "&amp;"));
    }
  });
  it("credits the sources that need it", () => {
    for (const s of ["VSCO 2 Community Edition", "VCSL", "NSynth", "CC BY 4.0", "adsb.fi", "NASA", "Julien Sulpis", "Freesound"]) expect(html, s).toContain(s);
  });
  it("is a complete page", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta name="viewport"');
  });
  it("is not published: it is not in public/ and no source links to it", () => {
    expect(existsSync(fileURLToPath(new URL("../public/credits.html", import.meta.url)))).toBe(false);
    expect(read("../src/personal/Landing.tsx")).not.toContain("credits");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm --prefix globe test -- credits`
Expected: FAIL (`credits.html` does not exist).

- [ ] **Step 3: Write the generator** — `scripts/samples/make_credits.py`

```python
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
<p><b>NSynth</b> by Google Magenta — electric and acoustic guitars, electric keyboards, organs and basses ({len(nsynth)} notes), <a href="https://magenta.tensorflow.org/datasets/nsynth" rel="noopener">magenta.tensorflow.org/datasets/nsynth</a>, licensed under Creative Commons Attribution 4.0 (CC BY 4.0). Notes were converted to mono MP3.</p>
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
```

- [ ] **Step 4: Generate and run the test**

Run: `python3 scripts/samples/make_credits.py && npm --prefix globe test -- credits`
Expected: a line like `credits.html: 5x KB; 14 CC BY authors, 30 CC0 authors`; test PASS. If the test says an author or link is missing, fix the generator (HTML-escape differences), not the test.

- [ ] **Step 5: Document and commit**

In `docs/music-libraries.md`, in the "Ledger of files in a published pack" table add the row: `| world | 67 instruments (guitars, basses, keyboards, regional instruments, NSynth) | see [music-pack-world-ledger.json](music-pack-world-ledger.json) | VSCO/VCSL (CC0), Freesound (CC0 and CC BY), Google NSynth (CC BY 4.0) | CC BY credits in docs/credits.html (not published) |`.

```bash
git add scripts/samples/make_credits.py docs/credits.html globe/test/credits.test.ts docs/music-libraries.md
git commit -m "docs: credits page for every sample source, generated from the ledgers (not published)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Build and check it in the browser (no deploy)

**Files:** none changed unless a check fails.

- [ ] **Step 1: Full test run and build**

Run: `npm --prefix globe test && npm --prefix globe run build:personal`
Expected: tests PASS (re-run `groove.test.ts` alone if it is the only failure); build finishes; `ls globe/dist-personal/samples/world | head -3` lists instrument folders; `ls globe/dist-personal/credits.html` must FAIL (the credits page is not part of the build).

- [ ] **Step 2: Start the personal dev server**

Add this entry to `.claude/launch.json` `configurations` (local tooling, not committed):

```json
    {
      "name": "personal-dev",
      "runtimeExecutable": "bash",
      "runtimeArgs": ["-c", "cd globe && VITE_PERSONAL=1 npx vite --port ${PORT:-5176} --strictPort"],
      "port": 5176,
      "autoPort": true
    }
```
Then `preview_start` `personal-dev`.

- [ ] **Step 3: Check three selections** (use the link codec: `?v=A,B,C&h=IST`)
  - One region: `/?v=NRT,ICN,PEK&h=IST` — start, then `read_network_requests` with `urlPattern: "samples"`: only `/samples/lite/manifest.json`, `/samples/world/manifest.json` and files of the instruments of this piece (e.g. `eastasia` ones: `erhu/`, `koto/`, `shakuhachi/`) are requested, not the whole pack.
  - Three regions: `/?v=NRT,LOS,GRU&h=IST` — notes of more than one card (the toast "LOADING INSTRUMENTS…" shows and clears; `read_console_messages` has no errors).
  - A long list: `/?w=NRT,DPS,JFK,LOS,GRU,LHR,DEL,NBO,SYD,CAI&h=IST` — piece starts within about 4 s; sound plays (the play ring is moving).
  - Offline fallback: block `/samples/world/` (DevTools offline or `form` not needed — simplest: temporarily rename `globe/public/samples/world` and reload) → the piece still plays with synthesised voices and no error; rename it back.
  - `/credits.html` is not served (the dev server returns the app, not a credits page) and the start page has no credits link. Open `docs/credits.html` as a file once to check it reads well (screenshot) and report it to the user.

- [ ] **Step 4: Report**

Tell the user what was verified (the network log of each selection, the credits page screenshot) and what was not (listening to the result is theirs). Do not deploy. If every check passed and nothing changed since the last commit, there is nothing more to commit; otherwise commit fixes with the same footer.
