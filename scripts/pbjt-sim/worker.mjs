// One worker = one fresh PB&J world. Runs `count` generated actions from `seed`
// in that single world (module state can't be reset in-process), applies the
// four pass/fail criteria per action, and prints one JSON summary line to
// stdout. The orchestrator spawns many of these.
//
//   node worker.mjs <seed> <count> [budgetMs]
import { runInstruction, checkScene, isBusy, cleanup } from './world.mjs';
import { generate, canonObjects } from './generate.mjs';

const seed = Number(process.argv[2] ?? 1);
const count = Number(process.argv[3] ?? 100);
const budgetMs = Number(process.argv[4] ?? 5000);

const summary = {
  seed, count, pass: 0, fail: 0,
  failures: [],                 // { idx, raw, signature, detail }
  coverage: {},                 // verb -> { object: n }
  verbsSeen: {},                // verb token -> n
};

function recordCoverage(verb, raw) {
  const objs = canonObjects(raw);
  summary.verbsSeen[verb] = (summary.verbsSeen[verb] || 0) + 1;
  if (!summary.coverage[verb]) summary.coverage[verb] = {};
  for (const o of objs) summary.coverage[verb][o] = (summary.coverage[verb][o] || 0) + 1;
}

// Group failures into signatures so the report stays compact.
function signatureFor(raw, r, chk) {
  if (r.kind === 'timeout') return 'timeout';
  if (r.kind === 'throw') {
    const first = (r.error || '').split('\n')[0].slice(0, 120);
    return `throw: ${first}`;
  }
  if (!chk.finite) return `nonfinite: ${chk.nonFinite.join(',')}`;
  if (!chk.matrixOk) return 'matrix-update-failed';
  if (chk.bounds.length) return `bounds: ${chk.bounds.map((b) => b.split('=')[0]).join(',')}`;
  if (isBusy()) return 'busy-stuck';
  if (typeof r.response !== 'string' || r.response.length === 0) return 'empty-response';
  return 'unknown';
}

let idx = 0;
for (const action of generate(seed, count)) {
  idx++;
  recordCoverage(action.verb, action.raw);

  const r = await runInstruction(action.raw, budgetMs);
  const chk = r.ok ? checkScene() : { finite: true, matrixOk: true, bounds: [], nonFinite: [] };

  // Pass criteria:
  // 1. instruct resolved (no throw, no timeout) within budget
  // 2. scene finite + matrix update ok + tracked objects in bounds
  // 3. state.busy false after resolve
  // 4. response is a non-empty string
  const responseOk = r.ok && typeof r.response === 'string' && r.response.length > 0;
  const pass = r.ok && responseOk && chk.finite && chk.matrixOk
    && chk.bounds.length === 0 && !isBusy();

  if (pass) {
    summary.pass++;
  } else {
    summary.fail++;
    const sig = signatureFor(action.raw, r, chk);
    if (summary.failures.length < 50) {
      summary.failures.push({
        idx, seed, raw: action.raw, verb: action.verb, signature: sig,
        detail: r.kind === 'throw' ? (r.error || '').split('\n').slice(0, 4).join(' | ')
          : r.kind === 'timeout' ? 'exceeded budget'
            : !chk.finite ? `nonfinite on ${chk.nonFinite.join(',')}`
              : chk.bounds.length ? chk.bounds.join(',')
                : isBusy() ? 'busy still true'
                  : !responseOk ? `response=${JSON.stringify(r.response)}` : 'unknown',
      });
    }
  }
}

cleanup();
process.stdout.write(JSON.stringify(summary) + '\n');
