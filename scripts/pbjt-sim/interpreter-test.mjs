// Drives the REAL server-dispatch path of the PB&J game with a stubbed fetch,
// plus unit-tests describeState(). Runs in one process (one world).
//
//   node scripts/pbjt-sim/interpreter-test.mjs
//
// Scenarios:
//   (a) fetch -> {commands:[open bag, take slices out]} : both run in order,
//       two slices out, state.busy false after.
//   (b) fetch rejects                                   : falls back to local parse.
//   (c) fetch returns a garbage shape                   : falls back to local parse.
//   (d) no server configured                            : fetch never called.
//   describeState(): after open bag / take slices / open PB / spread PB on left
//       slice, the summary truthfully mentions the open bag, two slices, the PB
//       spread, and the (empty) hands.

import { installEnv } from './stub-env.mjs';

installEnv();

// A localhost-style location so serverBase() can resolve to a real base when we
// set localStorage. Without this, the harness default is '' (local-only) — which
// is exactly what scenario (d) needs, so we toggle the configured base via
// localStorage rather than relying on hostname.
globalThis.location = { hostname: 'localhost', search: '' };

// --- stubbed fetch we can reprogram per scenario ----------------------------
let fetchCalls = 0;
let fetchBehavior = null; // (url, opts) => Promise<Response-ish> | throws
globalThis.fetch = (url, opts) => {
  fetchCalls++;
  if (!fetchBehavior) throw new Error('fetch called with no behavior set');
  return fetchBehavior(url, opts);
};
function jsonResponse(obj, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(obj) });
}

const THREE = await import('three');
const { buildScene } = await import('../../public/pbjt/scene.js');
const game = await import('../../public/pbjt/game.js');
const { initGame, tickGame, describeState, dispatch, instruct } = game;

const scene = new THREE.Scene();
buildScene(scene);
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 20);
const controls = { target: new THREE.Vector3(), update() {} };
initGame(scene, { camera, controls });

const state = globalThis.window.game.state;

// --- tick pump (awaited tweens only advance when tickGame runs) -------------
let pump = null;
function startPump() { if (!pump) pump = setInterval(() => { try { tickGame(0.05); } catch { /* */ } }, 1); }
function stopPump() { if (pump) { clearInterval(pump); pump = null; } }

// --- tiny assert harness ----------------------------------------------------
let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}`); }
}

function setServer(base) {
  if (base) localStorage.setItem('pbjt-server', base);
  else localStorage.removeItem('pbjt-server');
}

// Drive the REAL input path: set the input element's value and invoke the wired
// go() handler. go() fires dispatch() but doesn't return the promise, so for
// deterministic assertions we await dispatch() (the exact function go() calls).
async function play(text) {
  startPump();
  const input = document.getElementById('instruction');
  input.value = text;
  const result = await dispatch(text); // identical to what go() invokes
  stopPump();
  return result;
}

function sliceCount() { return state.slices.length; }

console.log('=== PB&J INTERPRETER TESTS ===\n');

// --- (a) two commands execute sequentially ----------------------------------
console.log('(a) server returns two commands -> both run in order');
setServer('http://test.local');
let capturedBody = null;
fetchBehavior = (_url, opts) => {
  capturedBody = JSON.parse(opts.body);
  // "open the bag gently" untwists the tie (no spill); "take the slices out"
  // then promotes exactly two slices.
  return jsonResponse({ commands: ['open the bag gently', 'take the slices out of the bag'] });
};
fetchCalls = 0;
const histLenBefore = state.history.length;
const r = await play('please get the bread ready for me');
ok(fetchCalls === 1, `fetch called exactly once (was ${fetchCalls})`);
ok(capturedBody && typeof capturedBody.instruction === 'string'
   && typeof capturedBody.state === 'string' && Array.isArray(capturedBody.history),
   'POST body has instruction/state/history shape');
ok(sliceCount() === 2, `two slices are out after the sequence (got ${sliceCount()})`);
ok(state.history.length === histLenBefore + 2, `two history entries appended (got ${state.history.length - histLenBefore})`);
ok(state.busy === false, 'state.busy is false after the sequence');
ok(typeof r === 'string' && r.length > 0, 'dispatch returned a combined response string');
console.log('');

// --- (b) fetch rejects -> local fallback ------------------------------------
console.log('(b) fetch rejects -> falls back to local parse of raw');
fetchBehavior = () => Promise.reject(new Error('network down'));
fetchCalls = 0;
const histB = state.history.length;
// Raw string the LOCAL parser understands on its own: open the PB jar.
const rb = await play('open the peanut butter jar');
ok(fetchCalls === 1, `fetch was attempted once (was ${fetchCalls})`);
ok(state.history.length === histB + 1, 'exactly one history entry from the local fallback');
ok(/peanut butter/i.test(rb) && objectsPbOpen(), 'local parse opened the peanut butter jar');
ok(state.busy === false, 'state.busy false after fallback');
console.log('');

// --- (c) garbage shape -> local fallback ------------------------------------
console.log('(c) server returns garbage shape -> falls back to local parse');
fetchBehavior = () => jsonResponse({ commands: 'not-an-array', foo: 42 });
fetchCalls = 0;
const histC = state.history.length;
const rc = await play('open the jelly jar');
ok(fetchCalls === 1, `fetch was attempted once (was ${fetchCalls})`);
ok(state.history.length === histC + 1, 'one history entry from the local fallback');
ok(/jelly/i.test(rc) && objectsJellyOpen(), 'local parse opened the jelly jar');
console.log('');

// --- (d) no server configured -> fetch never called -------------------------
// Clear storage AND move off localhost so serverBase() resolves to '' (the
// exact static-deploy / GitHub Pages situation).
console.log('(d) no server configured -> fetch never called');
setServer('');
globalThis.location = { hostname: 'example.com', search: '' };
fetchBehavior = () => { throw new Error('should not be reached'); };
fetchCalls = 0;
const histD = state.history.length;
await play('flip the left slice over');
ok(fetchCalls === 0, `fetch never called (was ${fetchCalls})`);
ok(state.history.length === histD + 1, 'one history entry, behaving exactly like today');
console.log('');

// --- describeState() unit test ----------------------------------------------
// Fresh-ish sequence on the live world: bag + slices are already out from (a);
// PB jar already open from (b). Make sure describeState reflects reality after a
// scripted spread of PB on the left slice. Drive with NO server so these are
// plain local instruct() calls.
console.log('describeState() after scripted actions');
setServer('');
startPump();
await instruct('spread peanut butter on the left slice');
stopPump();
const summary = describeState();
console.log('--- describeState() output ---');
console.log(summary);
console.log('------------------------------');
ok(/bread bag: open/i.test(summary), 'summary says the bread bag is open');
ok(/peanut butter jar: open/i.test(summary), 'summary says the PB jar is open');
ok(/2 slices out|two slices/i.test(summary), 'summary reports two slices out');
ok(/peanut butter side/i.test(summary), 'summary reports the peanut butter spread on a slice');
ok(/left hand: empty/i.test(summary) && /right hand: empty/i.test(summary),
   'summary truthfully reports both hands empty');
console.log('');

// --- helpers reading live object state --------------------------------------
function objectsPbOpen() { return !!window.game.objects.peanutButterJar.userData.state.open; }
function objectsJellyOpen() { return !!window.game.objects.jellyJar.userData.state.open; }

// --- summary -----------------------------------------------------------------
console.log(`=== INTERPRETER TESTS COMPLETE: ${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass}/${pass + fail}) ===`);
stopPump();
process.exit(fail === 0 ? 0 : 1);
