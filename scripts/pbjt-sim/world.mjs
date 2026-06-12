// One PB&J world per process. Module state in game.js (`state`) and scene.js
// (`objects`) is global, so a world cannot be reset in-process — the browser's
// "reset" is location.reload(). Build exactly one world here; the orchestrator
// spawns a fresh worker process for each fresh world.
import { installEnv } from './stub-env.mjs';

installEnv();

// Imported AFTER installEnv so the modules see the stubbed browser globals.
const THREE = await import('three');
const { buildScene, objects } = await import('../../public/pbjt/scene.js');
const { initGame, tickGame, instruct } = await import('../../public/pbjt/game.js');

const scene = new THREE.Scene();
buildScene(scene);

// initGame wires DOM listeners (all absorbed by the stub elements) and snapshots
// every object's home transform.
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 20);
const controls = { target: new THREE.Vector3(), update() {} };
initGame(scene, { camera, controls });

// --- the tick pump ---------------------------------------------------------
// Awaited tween/fall/wait promises only resolve when tickGame advances them.
// We pump on a fast interval so any `await` inside instruct() makes progress.
// dt is clamped to 0.05 exactly as the browser does.
// The pump is a ref'd timer: while an action is in flight it both advances the
// animation/gravity queues AND keeps the Node event loop alive (an unref'd
// timer would let Node exit while an awaited tween promise is still pending).
let pump = null;
function startPump() {
  if (pump) return;
  pump = setInterval(() => { try { tickGame(0.05); } catch { /* surfaced via instruct */ } }, 1);
}
function stopPump() {
  if (pump) { clearInterval(pump); pump = null; }
}

// Run one instruction with a wall-clock budget. Resolves to:
//   { ok:true, response }                 — instruct resolved with a string
//   { ok:false, kind:'throw', error }     — instruct rejected (real bug)
//   { ok:false, kind:'timeout' }          — exceeded budget (a hang)
export function runInstruction(raw, budgetMs = 5000) {
  startPump();
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stopPump(); // release the loop between actions
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, kind: 'timeout' }), budgetMs);

    Promise.resolve()
      .then(() => instruct(raw))
      .then((response) => finish({ ok: true, response }))
      .catch((error) => finish({ ok: false, kind: 'throw', error: error && (error.stack || String(error)) }));
  });
}

// --- render-readiness check (no GL) ----------------------------------------
// After an action settles: every object's transform must be finite,
// updateMatrixWorld must complete, and tracked movable objects must sit within
// sane world bounds. Returns { finite, matrixOk, bounds:[...violations] }.
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

function vecFinite(v) { return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
function quatFinite(q) {
  return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

export function checkScene() {
  let finite = true;
  const nonFinite = [];
  scene.traverse((o) => {
    if (!vecFinite(o.position) || !quatFinite(o.quaternion) || !vecFinite(o.scale)) {
      finite = false;
      nonFinite.push(o.userData?.name || o.type || 'object');
    }
  });

  let matrixOk = true;
  try {
    scene.updateMatrixWorld(true);
  } catch {
    matrixOk = false;
  }

  // Bounds: only the named movable objects the game actually relocates, plus
  // tracked slices and loose bits, evaluated by world-space bounding box.
  // (Fixed scenery like the wall/shelf legitimately sits outside the play box.)
  const bounds = [];
  const tracked = trackedObjects();
  for (const o of tracked) {
    const box = new THREE.Box3().setFromObject(o);
    if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) continue; // empty/degenerate
    o.getWorldPosition(tmpV);
    const name = o.userData?.name || labelGuess(o);
    if (!(tmpV.y >= -0.5 && tmpV.y <= 3)) bounds.push(`${name}.y=${tmpV.y.toFixed(3)}`);
    if (!(Math.abs(tmpV.x) < 5)) bounds.push(`${name}.x=${tmpV.x.toFixed(3)}`);
    if (!(Math.abs(tmpV.z) < 5)) bounds.push(`${name}.z=${tmpV.z.toFixed(3)}`);
  }

  return { finite, nonFinite: [...new Set(nonFinite)], matrixOk, bounds };
}

function labelGuess(o) {
  if (o.userData?.spreads) return 'slice';
  return 'loose';
}

// The set of objects we hold to play-box bounds: registered movables (skip the
// two immovables and the hands, which the game parks off-counter), plus slices
// and loose bits that live directly in the scene.
const IMMOVABLE = new Set(['counter', 'shelf']);
function trackedObjects() {
  const out = new Set();
  for (const [name, o] of Object.entries(objects)) {
    if (IMMOVABLE.has(name)) continue;
    if (name === 'leftHand' || name === 'rightHand') continue;
    if (o.parent) out.add(o);
  }
  // slices + loose bits are tracked on game state; reach them via the live world
  const gameState = globalThis.window?.game?.state;
  if (gameState) {
    for (const sl of gameState.slices || []) if (sl.parent) out.add(sl);
    for (const b of gameState.looseBits || []) if (b.parent) out.add(b);
  }
  return [...out];
}

export function gameState() { return globalThis.window?.game?.state; }
export function isBusy() { return !!gameState()?.busy; }
export function cleanup() { stopPump(); }
export { scene, objects, THREE };
