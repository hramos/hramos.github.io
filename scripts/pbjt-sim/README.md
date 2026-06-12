# PB&J literal-instructions game — headless simulation harness

A headless fuzzer for the Three.js PB&J game in `public/pbjt/`. It runs the real
`game.js` parser and physics in Node (no WebGL) by stubbing the browser globals
the game touches, generates seeded-random instructions across the full verb ×
object cross product (sensible recipes, absurd permutations, misspellings,
degenerate input), and checks every action for render-readiness: the instruction
resolves without throwing/hanging, the scene stays finite, `updateMatrixWorld`
completes, tracked objects stay in world bounds, `state.busy` clears, and a
non-empty response string comes back.

## Prerequisite

Three.js is resolved as a bare specifier (the browser uses an importmap). Install
it at the **repo root** without touching the manifests:

```sh
npm i --no-save three@0.184.0
```

Do not commit `package.json` / `package-lock.json` changes. If `--no-save` still
dirties the lockfile, restore it: `git checkout -- package-lock.json`.

## Usage

```sh
# full run: 10,000 actions, fresh world per 400-action worker, 6 in parallel
node scripts/pbjt-sim/run.mjs --total=10000 --per=400 --parallel=6 --seed=1337

# quick smoke test
node scripts/pbjt-sim/run.mjs --total=600 --per=200 --parallel=3 --seed=1337

# one world, inline (debugging)
node scripts/pbjt-sim/worker.mjs <seed> <count> <budgetMs>
```

`run.mjs` prints a JSON report to stdout (pass/fail, failure signatures, verb ×
object coverage, wall-clock, seed) and a human summary to stderr. Same `--seed`
reproduces the same instruction stream.

## How it works

- `stub-env.mjs` — installs `window`/`document`/`localStorage`/canvas stubs.
  `AudioContext` and `speechSynthesis` are left undefined so the game's own
  guards make all audio/speech a no-op. `window.__timeScale = 0.01` fast-forwards
  every duration.
- `world.mjs` — builds one scene, calls `initGame`, and pumps `tickGame(0.05)` on
  an interval while awaiting `instruct()` (awaited tween/fall/wait promises only
  resolve when the tick loop advances them). One world per process — module state
  in `game.js`/`scene.js` is global and the browser's only reset is a reload.
- `vocab.mjs` / `generate.mjs` — the verb and noun vocabulary (extracted from the
  parser) and the seeded generator.
- `worker.mjs` — runs N actions in one world, applies the pass/fail criteria,
  emits a JSON summary.
- `run.mjs` — spawns workers (one fresh world each) in a small parallel pool until
  the total is reached, then aggregates.
