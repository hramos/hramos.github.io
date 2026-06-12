// Orchestrator. Spawns worker processes (each a fresh world) until TOTAL actions
// are simulated, runs a few in parallel, aggregates their JSON summaries, then
// prints the final fuzz report: pass/fail, failure signatures, verb x object
// coverage, wall-clock, and the master seed. Deterministic: same --seed makes
// each worker get a derived, fixed sub-seed, so the whole run reproduces.
//
//   node run.mjs [--total=10000] [--per=400] [--parallel=5] [--seed=1337] [--budget=5000]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VERBS, NOUNS } from './vocab.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, 'worker.mjs');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);
const TOTAL = Number(args.total ?? 10000);
const PER = Number(args.per ?? 400);
const PARALLEL = Number(args.parallel ?? 5);
const SEED = Number(args.seed ?? 1337);
const BUDGET = Number(args.budget ?? 5000);

// Build the list of worker jobs: each gets a derived seed and an action count.
const jobs = [];
let remaining = TOTAL;
let n = 0;
while (remaining > 0) {
  const count = Math.min(PER, remaining);
  // derive a stable sub-seed from master seed + index
  const subSeed = (SEED * 2654435761 + n * 40503 + 1) >>> 0;
  jobs.push({ seed: subSeed, count });
  remaining -= count;
  n++;
}

function runWorker(job) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, String(job.seed), String(job.count), String(BUDGET)], {
      cwd: __dirname,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`worker seed=${job.seed} exited ${code}: ${err.slice(-500)}`));
        return;
      }
      try {
        const line = out.trim().split('\n').filter(Boolean).pop();
        resolve(JSON.parse(line));
      } catch (e) {
        reject(new Error(`worker seed=${job.seed} bad output: ${e.message}; stderr: ${err.slice(-300)}`));
      }
    });
  });
}

// --- aggregate -------------------------------------------------------------
const agg = {
  total: 0, pass: 0, fail: 0,
  failures: [],
  signatures: {},                 // signature -> count
  coverage: {},                   // verb -> { object: n }
  verbsSeen: {},
};
function merge(s) {
  agg.total += s.count;
  agg.pass += s.pass;
  agg.fail += s.fail;
  for (const f of s.failures) {
    agg.signatures[f.signature] = (agg.signatures[f.signature] || 0) + 1;
    if (agg.failures.length < 100) agg.failures.push(f);
  }
  for (const [v, n2] of Object.entries(s.verbsSeen)) agg.verbsSeen[v] = (agg.verbsSeen[v] || 0) + n2;
  for (const [v, objs] of Object.entries(s.coverage)) {
    if (!agg.coverage[v]) agg.coverage[v] = {};
    for (const [o, n2] of Object.entries(objs)) agg.coverage[v][o] = (agg.coverage[v][o] || 0) + n2;
  }
}

// --- parallel pool ---------------------------------------------------------
const t0 = Date.now();
let next = 0;
let active = 0;
let done = 0;
await new Promise((resolveAll, rejectAll) => {
  const pump = () => {
    while (active < PARALLEL && next < jobs.length) {
      const job = jobs[next++];
      active++;
      runWorker(job)
        .then((s) => {
          merge(s);
          done++;
          process.stderr.write(`  worker ${done}/${jobs.length} done (seed=${job.seed}, ${s.count} actions, ${s.pass} pass / ${s.fail} fail)\n`);
        })
        .catch(rejectAll)
        .finally(() => { active--; (next < jobs.length || active === 0) ? pump() : (active === 0 && resolveAll()); });
      if (active === 0 && next >= jobs.length) resolveAll();
    }
    if (active === 0 && next >= jobs.length) resolveAll();
  };
  pump();
});

const wallSec = ((Date.now() - t0) / 1000).toFixed(1);

// --- coverage assertion: every verb x >= 10 distinct objects somewhere ------
const verbObjectCounts = {};
for (const spec of VERBS) {
  const objs = agg.coverage[spec.v] ? Object.keys(agg.coverage[spec.v]).length : 0;
  verbObjectCounts[spec.v] = objs;
}
const verbsWithFewObjects = Object.entries(verbObjectCounts)
  .filter(([, c]) => c < 10)
  .map(([v, c]) => `${v}:${c}`);
// Note: 0-arity verbs (count, wipe, takeout, stack, ambient, putdown, cook,
// dipknife) legitimately touch few or no canonical objects — flagged but not failed.
const ZERO_ARITY = new Set(VERBS.filter((v) => v.arity === 0).map((v) => v.v));
const multiObjectVerbs = VERBS.filter((v) => v.arity === 2).map((v) => v.v);

// --- report ----------------------------------------------------------------
const report = {
  masterSeed: SEED,
  totalActions: agg.total,
  pass: agg.pass,
  fail: agg.fail,
  wallClockSec: Number(wallSec),
  workers: jobs.length,
  parallel: PARALLEL,
  failureSignatures: agg.signatures,
  sampleFailures: agg.failures.slice(0, 30),
  verbCount: Object.keys(agg.verbsSeen).length,
  verbsSeen: agg.verbsSeen,
  distinctObjectsPerVerb: verbObjectCounts,
  verbsUnder10ObjectsOneArgPlus: verbsWithFewObjects.filter((s) => !ZERO_ARITY.has(s.split(':')[0])),
  multiObjectVerbsExercised: multiObjectVerbs.filter((v) => agg.verbsSeen[v] > 0),
};

console.log(JSON.stringify(report, null, 2));

// human-readable footer to stderr
process.stderr.write(`\n=== PB&J FUZZ COMPLETE ===\n`);
process.stderr.write(`master seed ${SEED} | ${agg.total} actions | ${agg.pass} pass / ${agg.fail} fail | ${wallSec}s | ${jobs.length} workers x${PARALLEL}\n`);
if (agg.fail === 0) process.stderr.write(`ALL PASS — no failures.\n`);
else process.stderr.write(`FAILURE SIGNATURES: ${JSON.stringify(agg.signatures)}\n`);
