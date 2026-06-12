// The sandwich maker: follows the player's instructions LITERALLY,
// within the limits of cartoon physics and two human arms.
import * as THREE from 'three';
import { objects, makeBreadSliceFlat } from './scene.js';
import { sfx, sayAloud, audioEnabled, setAudioEnabled } from './sounds.js';

let scene, camera, controls;
const state = {
  busy: false,
  held: { leftHand: null, rightHand: null },
  heldLabels: { leftHand: null, rightHand: null },
  knifeBlob: null,        // { mesh, kind }
  lastJar: 'peanutButterJar',
  lastThing: null,
  lastSlice: null,
  slices: [],             // spreadable slice groups out on the counter
  looseBits: [],          // splats, blobs, oats — cleanable, settleable
  sandwichDone: false,
  notes: [],              // physics commentary collected during an action
  history: [],
};
const homes = new Map(); // obj -> { pos, quat, scale }

// physics tuning
const MAX_REACH = 1.12;          // arm length from shoulder anchor, meters
const COUNTER = { x: 0.78, zMin: -0.34, zMax: 0.33 };
const SHELF = { y: 0.5925, xMax: 0.73, zMin: -0.42, zMax: -0.25 };

// thrown/slid items stay on the counter
function clampToCounter(v) {
  v.x = Math.max(-COUNTER.x, Math.min(COUNTER.x, v.x));
  v.z = Math.max(COUNTER.zMin, Math.min(COUNTER.zMax, v.z));
  return v;
}

// ---------- tween engine ----------
const active = [];

function ts() { return window.__timeScale || 1; }

function tween(obj, { pos, rot, scale } = {}, dur = 0.6, opts = {}) {
  return new Promise((resolve) => {
    const startPos = obj.position.clone();
    const startQuat = obj.quaternion.clone();
    const startScale = obj.scale.clone();
    const endPos = pos ? pos.clone() : startPos.clone();
    const endQuat = rot ? new THREE.Quaternion().setFromEuler(rot) : startQuat.clone();
    const endScale = scale ? scale.clone() : startScale.clone();
    active.push({ obj, startPos, startQuat, startScale, endPos, endQuat, endScale, dur: Math.max(dur * ts(), 0.016), t: 0, arc: opts.arc || 0, resolve });
  });
}

export function tickGame(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const t = tw.t;
    const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    tw.obj.position.lerpVectors(tw.startPos, tw.endPos, e);
    tw.obj.position.y += Math.sin(Math.PI * e) * tw.arc;
    tw.obj.quaternion.slerpQuaternions(tw.startQuat, tw.endQuat, e);
    tw.obj.scale.lerpVectors(tw.startScale, tw.endScale, e);
    if (tw.t >= 1) { active.splice(i, 1); tw.resolve(); }
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms * ts()));

// ---------- physics refusals ----------

class CantDo extends Error {}

const IMMOVABLE = new Set(['counter', 'shelf']);

function nameOf(obj) {
  for (const [k, v] of Object.entries(objects)) if (v === obj) return k;
  return null;
}

const LABELS = {
  peanutButterJar: 'jar of peanut butter', jellyJar: 'jar of jelly', knife: 'knife',
  pbLid: 'peanut butter lid', jellyLid: 'jelly lid', plate: 'plate', breadBag: 'bag of bread',
  mustard: 'mustard bottle', ketchup: 'ketchup bottle', mayo: 'jar of mayo', honey: 'jar of honey',
  butterDish: 'butter dish', banana: 'banana', apple: 'apple', salt: 'salt shaker',
  pepper: 'pepper shaker', cerealBox: 'box of cereal', mug: 'mug', crock: 'utensil crock',
  whisk: 'whisk', spatula: 'spatula', rollingPin: 'rolling pin', shelf: 'pantry shelf',
  counter: 'counter', leftHand: 'left hand', rightHand: 'right hand',
};

function labelOf(obj) {
  const n = nameOf(obj);
  if (n) return LABELS[n] || n;
  if (obj.userData?.spreads) return 'slice of bread';
  return 'thing';
}

function ensureMovable(obj, label) {
  const n = nameOf(obj);
  if (IMMOVABLE.has(n)) {
    throw new CantDo(`The ${label} is fixed in place — I can't move it.`);
  }
  if (n === 'leftHand' || n === 'rightHand') {
    throw new CantDo(`That is my own ${label}.`);
  }
}

// Choose a hand honestly: nearest-side hand if free, otherwise the other hand
// (with crossed-arm commentary), and refuse when out of reach or out of hands.
function acquireHand(targetPos) {
  const l = objects.leftHand, r = objects.rightHand;
  const lFree = !state.held.leftHand, rFree = !state.held.rightHand;
  if (!lFree && !rFree) {
    throw new CantDo(`Both hands are full (left: ${state.heldLabels.leftHand}, right: ${state.heldLabels.rightHand}). Say "put down" first.`);
  }
  const natural = targetPos.x < 0 ? l : r;
  const other = natural === l ? r : l;
  const naturalFree = natural === l ? lFree : rFree;
  const hand = naturalFree ? natural : other;

  // reach check from the shoulder (just off the counter edge behind the hand's home)
  const anchor = homes.get(hand).pos.clone();
  anchor.z += 0.18;
  const dist = anchor.distanceTo(targetPos);
  if (dist > MAX_REACH) {
    const side = hand === l ? 'left' : 'right';
    throw new CantDo(`I can't reach — it is ${dist.toFixed(2)}m away and my ${side} arm reaches ${MAX_REACH.toFixed(2)}m. My other hand is holding the ${state.heldLabels[handName(other)] || 'air'}.`);
  }
  if (!naturalFree) {
    const side = hand === l ? 'left' : 'right';
    const busySide = hand === l ? 'right' : 'left';
    state.notes.push(`(Used my ${side} hand — the ${busySide} one is holding the ${state.heldLabels[handName(natural)]}.)`);
  }
  return hand;
}

// ---------- geometry helpers ----------

function worldBox(obj) { return new THREE.Box3().setFromObject(obj); }

function topOf(obj) {
  const b = worldBox(obj);
  const c = b.getCenter(new THREE.Vector3());
  return new THREE.Vector3(c.x, b.max.y, c.z);
}

function baseOffset(obj) {
  const b = worldBox(obj);
  return obj.getWorldPosition(new THREE.Vector3()).y - b.min.y;
}

function handName(hand) { return hand === objects.leftHand ? 'leftHand' : 'rightHand'; }

function heldHeight(hand) {
  const obj = state.held[handName(hand)];
  if (!obj) return 0;
  const b = worldBox(obj);
  return b.max.y - b.min.y;
}

// keep a held object's bottom above the counter, whatever the hand does
function clampHandY(hand, y) {
  const h = heldHeight(hand);
  return h ? Math.max(y, h + 0.04) : y;
}

async function handTo(hand, worldPos, dur = 0.55, hover = 0.045) {
  const p = worldPos.clone(); p.y += hover;
  p.y = clampHandY(hand, p.y);
  await tween(hand, { pos: p }, dur, { arc: 0.06 });
}

async function handHome(hand) {
  const h = homes.get(hand);
  const dest = h.pos.clone();
  dest.y = clampHandY(hand, dest.y);
  await tween(hand, { pos: dest }, 0.55, { arc: 0.05 });
  hand.quaternion.copy(h.quat);
}

// tuck a just-attached object snugly under the palm so it travels predictably:
// bbox centered under the hand, top just below it (hands are unrotated here)
function snugGrip(hand, obj) {
  const box = worldBox(obj);
  const origin = obj.getWorldPosition(new THREE.Vector3());
  obj.position.set(
    origin.x - (box.min.x + box.max.x) / 2,
    -0.015 - (box.max.y - origin.y),
    origin.z - (box.min.z + box.max.z) / 2 - 0.005,
  );
}

function takeFromHands(obj) {
  for (const h of ['leftHand', 'rightHand']) {
    if (state.held[h] === obj) { state.held[h] = null; state.heldLabels[h] = null; }
  }
}

// objects acted on must live in scene space — a held object's .position is
// hand-local and poisons any math that treats it as world coordinates
function ensureOnScene(obj) {
  if (obj.parent && obj.parent !== scene) {
    scene.attach(obj);
    takeFromHands(obj);
  }
}

async function carry(obj, destPos, { dur = 0.8, settleRot = null } = {}) {
  ensureMovable(obj, labelOf(obj));
  takeFromHands(obj);
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5);
  hand.attach(obj);
  sfx('swoosh');
  const handDest = destPos.clone();
  handDest.y += 0.05 + (topOf(obj).y - obj.getWorldPosition(new THREE.Vector3()).y);
  await tween(hand, { pos: handDest }, dur, { arc: 0.12 });
  scene.attach(obj);
  const settleTween = tween(obj, { pos: destPos, rot: settleRot }, 0.25).then(() => sfx('thud'));
  await Promise.all([settleTween, handHome(hand)]);
}

async function wiggle(obj, amp = 0.015, times = 3, dur = 0.12) {
  for (let i = 0; i < times; i++) {
    await tween(obj, { pos: obj.position.clone().add(new THREE.Vector3(amp, 0, 0)) }, dur);
    await tween(obj, { pos: obj.position.clone().add(new THREE.Vector3(-amp * 2, 0, 0)) }, dur);
    await tween(obj, { pos: obj.position.clone().add(new THREE.Vector3(amp, 0, 0)) }, dur);
  }
}

function spawnBits(center, color, count = 8, size = 0.0018, spreadR = 0.05) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  for (let i = 0; i < count; i++) {
    const bit = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 5), mat);
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * spreadR;
    bit.position.set(center.x + Math.cos(a) * d, Math.max(center.y, 0.002), center.z + Math.sin(a) * d);
    bit.scale.y = 0.5;
    scene.add(bit);
    state.looseBits.push(bit);
  }
}

function makeBlob(color, r = 0.013) {
  const blob = new THREE.Mesh(
    new THREE.SphereGeometry(r, 16, 12),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8 }),
  );
  blob.scale.set(1, 0.5, 1);
  blob.castShadow = true;
  return blob;
}

function dropBlob(color, at, r = 0.014) {
  const blob = makeBlob(color, r);
  blob.position.copy(at);
  scene.add(blob);
  state.looseBits.push(blob);
  return blob;
}

// ---------- gravity / support ----------

function movables() {
  const list = new Set();
  for (const [n, o] of Object.entries(objects)) {
    if (IMMOVABLE.has(n) || n === 'leftHand' || n === 'rightHand') continue;
    if (o.parent === scene) list.add(o);
  }
  for (const sl of state.slices) if (sl.parent === scene) list.add(sl);
  for (const b of state.looseBits) if (b.parent === scene) list.add(b);
  return [...list];
}

function footprintOverlap(a, b) {
  const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (ox <= 0 || oz <= 0) return 0;
  const areaA = (a.max.x - a.min.x) * (a.max.z - a.min.z);
  return (ox * oz) / Math.max(areaA, 1e-6);
}

// the height of whatever is under this object's footprint
function supportHeightFor(obj, boxes) {
  const box = boxes.get(obj);
  const c = box.getCenter(new THREE.Vector3());
  let support = -1;
  // counter
  if (Math.abs(c.x) <= COUNTER.x + 0.05 && c.z >= COUNTER.zMin - 0.05 && c.z <= COUNTER.zMax + 0.06) support = 0;
  // shelf plank
  if (Math.abs(c.x) <= SHELF.xMax && c.z >= SHELF.zMin && c.z <= SHELF.zMax && box.min.y >= SHELF.y - 0.05) {
    support = Math.max(support, SHELF.y);
  }
  // other objects (and the bag/plate, which are not in movables but are surfaces)
  const surfaces = [...boxes.keys(), objects.breadBag, objects.plate];
  for (const other of surfaces) {
    if (other === obj) continue;
    const ob = boxes.get(other) || worldBox(other);
    if (ob.max.y > box.min.y + 0.012) continue;            // not below it
    if (footprintOverlap(box, ob) < 0.18) continue;        // not under it
    support = Math.max(support, ob.max.y);
  }
  return support;
}

// after every action: anything floating falls. Returns labels of what fell.
async function settlePhysics() {
  const fell = [];
  for (let pass = 0; pass < 3; pass++) {
    const list = movables();
    const boxes = new Map(list.map((o) => [o, worldBox(o)]));
    const drops = [];
    for (const obj of list) {
      const box = boxes.get(obj);
      if (!isFinite(box.min.y)) continue;
      const support = supportHeightFor(obj, boxes);
      if (support < -0.5) continue;
      const gap = box.min.y - support;
      if (gap > 0.008) {
        const dest = obj.position.clone();
        dest.y -= gap;
        drops.push(tween(obj, { pos: dest }, Math.min(0.18 + gap * 0.6, 0.5)).then(async () => {
          // tiny bounce
          const up = obj.position.clone(); up.y += Math.min(gap * 0.12, 0.02);
          await tween(obj, { pos: up }, 0.08);
          await tween(obj, { pos: dest }, 0.08);
        }));
        if (!state.looseBits.includes(obj)) { fell.push(labelOf(obj)); drops[drops.length - 1].then(() => sfx('thud')); }
      }
    }
    if (!drops.length) break;
    await Promise.all(drops);
  }
  return [...new Set(fell)];
}

// ---------- speech / history ----------

function speak(text) {
  sayAloud(text);
  const el = document.getElementById('speech');
  if (el) {
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(speak._t);
    speak._t = setTimeout(() => { el.style.display = 'none'; }, 8000);
  }
  return text;
}

function addHistory(prompt, heard, did) {
  state.history.push({ prompt, heard, did });
  const list = document.getElementById('history-list');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'entry';
  const esc = (t) => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
  div.innerHTML = `<div class="you">🗣 “${esc(prompt)}”</div>`
    + `<div class="heard">🧠 ${esc(heard)}</div>`
    + `<div class="did">🤲 ${esc(did)}</div>`;
  list.prepend(div);
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- slices ----------

function sortedSlices() {
  const plate = objects.plate;
  const onPlate = state.slices.filter((sl) =>
    Math.hypot(sl.position.x - plate.position.x, sl.position.z - plate.position.z) < 0.11);
  const pool = onPlate.length ? onPlate : state.slices;
  return [...pool].sort((a, b) => a.position.x - b.position.x);
}

function promoteSlice(raw, rotY) {
  const g = makeBreadSliceFlat();
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(raw.position.x, 0.001, raw.position.z);
  g.rotation.y = rotY;
  scene.add(g);
  raw.removeFromParent();
  const bagList = objects.breadBag.userData.loafSlices;
  const idx = bagList.indexOf(raw);
  if (idx >= 0) bagList.splice(idx, 1);
  state.slices.push(g);
  return g;
}

function sliceLabelFor(slice) {
  const sl = sortedSlices();
  if (sl.length < 2) return 'slice';
  return slice === sl[0] ? 'left slice' : slice === sl[sl.length - 1] ? 'right slice' : 'middle slice';
}

// ---------- thing resolution ----------

const THING_WORDS = [
  { re: /peanut\s*butter\s*(jar\s*)?lid|lid.*peanut/, name: 'pbLid', label: 'peanut butter lid' },
  { re: /jelly\s*(jar\s*)?lid|lid.*jelly/, name: 'jellyLid', label: 'jelly lid' },
  { re: /peanut\s*butter|\bpb\b|peanut/, name: 'peanutButterJar', label: 'jar of peanut butter' },
  { re: /jelly|jam/, name: 'jellyJar', label: 'jar of jelly' },
  { re: /butter\s*knife|knife/, name: 'knife', label: 'knife' },
  { re: /mustard/, name: 'mustard', label: 'mustard bottle' },
  { re: /ketchup|catsup/, name: 'ketchup', label: 'ketchup bottle' },
  { re: /mayo(nnaise)?/, name: 'mayo', label: 'jar of mayo' },
  { re: /honey/, name: 'honey', label: 'jar of honey' },
  { re: /\bbutter\b/, name: 'butterDish', label: 'butter dish (real butter — you said butter)' },
  { re: /banana/, name: 'banana', label: 'banana' },
  { re: /apple/, name: 'apple', label: 'apple' },
  { re: /\bsalt\b/, name: 'salt', label: 'salt shaker' },
  { re: /pepper/, name: 'pepper', label: 'pepper shaker' },
  { re: /cereal|oat/, name: 'cerealBox', label: 'box of cereal' },
  { re: /\bmug\b|\bcup\b/, name: 'mug', label: 'mug' },
  { re: /whisk/, name: 'whisk', label: 'whisk' },
  { re: /spatula/, name: 'spatula', label: 'spatula' },
  { re: /rolling\s*pin|\broller\b|\bpin\b/, name: 'rollingPin', label: 'rolling pin' },
  { re: /crock|utensil holder/, name: 'crock', label: 'utensil crock' },
  { re: /shelf|pantry/, name: 'shelf', label: 'pantry shelf' },
  { re: /counter|table/, name: 'counter', label: 'counter' },
  { re: /plate|dish/, name: 'plate', label: 'plate' },
  { re: /bag|loaf/, name: 'breadBag', label: 'bag of bread' },
  { re: /bread/, name: 'breadBag', label: 'bread (the whole bag — that IS the bread)' },
  { re: /left hand/, name: 'leftHand', label: 'left hand' },
  { re: /right hand/, name: 'rightHand', label: 'right hand' },
];

function resolveThing(str) {
  if (/\b(it|that|this)\b/.test(str) && state.lastThing
      && !/slice|bread|jar|knife|bag|butter|jelly|peanut|plate|banana|apple/.test(str)) {
    return state.lastThing;
  }
  if (/slice|piece of bread|piece of toast|sandwich/.test(str) && !/bag|loaf/.test(str)) {
    const sl = sortedSlices();
    if (!sl.length) return { missing: 'slice', label: 'slice of bread' };
    const plural = /slices|both|pieces/.test(str) && !/(left|right|first|second|other|one)\b/.test(str);
    if (plural && state.slices.length >= 2) {
      const all = [...state.slices].sort((a, b) => a.position.x - b.position.x);
      return { plural: true, objs: all, label: 'both slices' };
    }
    let obj;
    if (/left|first|1st/.test(str)) obj = sl[0];
    else if (/right|second|2nd/.test(str)) obj = sl[sl.length - 1];
    else if (/other|another/.test(str)) obj = sl.find((o) => o !== state.lastSlice) || sl[0];
    else if (/peanut/.test(str)) obj = sl.find((o) => o.userData.state.spread === 'pb') || sl[0];
    else if (/jelly|jam/.test(str)) obj = sl.find((o) => o.userData.state.spread === 'jelly') || sl[0];
    else obj = state.lastSlice && state.slices.includes(state.lastSlice) ? state.lastSlice : sl[0];
    state.lastSlice = obj;
    const thing = { obj, name: 'slice', label: sliceLabelFor(obj), isSlice: true };
    state.lastThing = thing;
    return thing;
  }
  for (const t of THING_WORDS) {
    if (t.re.test(str)) {
      const thing = { obj: objects[t.name], name: t.name, label: t.label };
      state.lastThing = thing;
      return thing;
    }
  }
  return null;
}

// most verbs operate on one object — collapse a plural match to the left slice
function R(str) {
  const t = resolveThing(str);
  if (t && t.plural) return { obj: t.objs[0], name: 'slice', label: 'left slice', isSlice: true };
  return t;
}

function thingsMentioned(s) {
  const found = [];
  if (/slice|sandwich/.test(s)) found.push('the bread slices');
  for (const t of THING_WORDS) if (t.re.test(s)) found.push(t.label.split(' (')[0]);
  return [...new Set(found)].slice(0, 4);
}

function spreadKind(str) {
  if (/peanut|\bpb\b/.test(str)) return 'pb';
  if (/jelly|jam/.test(str)) return 'jelly';
  return null;
}

const CONDIMENT_GAGS = {
  mustard: 'mustard', ketchup: 'ketchup', mayo: 'mayo', honey: 'honey', butter: 'butterDish',
};
function condimentIn(str) {
  for (const word of Object.keys(CONDIMENT_GAGS)) {
    if (word === 'butter' && /peanut\s*butter/.test(str)) continue;
    if (new RegExp(`\\b${word}`).test(str)) return { word, name: CONDIMENT_GAGS[word] };
  }
  return null;
}

function openHelp() {
  const el = document.getElementById('help');
  if (el) el.style.display = 'block';
}

const NO_SLICES = 'There are no slices of bread out here. All the bread is sealed inside the bag. (You could open the bag… and take some out… just saying.)';

const HEAVY = () => new Set([
  objects.peanutButterJar, objects.jellyJar, objects.mayo, objects.honey,
  objects.cerealBox, objects.mug, objects.rollingPin, objects.apple, objects.crock,
]);

// ---------- literal actions ----------

async function ripBag(gentle = false) {
  const bag = objects.breadBag;
  if (bag.userData.state.open) return 'The bag is already open.';
  const { twist, tie } = bag.userData.bagParts;
  const hand = acquireHand(bag.position);
  await handTo(hand, topOf(bag), 0.5);
  scene.attach(tie);
  if (gentle) {
    sfx('pop');
    await tween(tie, {
      pos: new THREE.Vector3(bag.position.x + 0.22, 0.004, bag.position.z + 0.12),
      rot: new THREE.Euler(Math.PI / 2, 0, 0),
    }, 0.6, { arc: 0.08 });
    twist.visible = false;
    bag.userData.state.open = true;
    await handHome(hand);
    return '*untwists the tie and opens the bag* Open.';
  }
  tween(tie, {
    pos: new THREE.Vector3(bag.position.x - 0.2, 0.004, bag.position.z + 0.28),
    rot: new THREE.Euler(1.2, 0.5, 2.2),
  }, 0.9, { arc: 0.25 });
  sfx('rip');
  twist.visible = false;
  const spill = bag.userData.loafSlices.slice(-3);
  const bagPos = bag.position;
  const jobs = [];
  let i = 0;
  for (const slice of spill) {
    scene.attach(slice);
    const rz = 0.5 - i * 0.6;
    const dest = new THREE.Vector3(bagPos.x + 0.16 + i * 0.085, 0.009, bagPos.z + 0.13 + (i % 2) * 0.06);
    jobs.push(
      tween(slice, { pos: dest, rot: new THREE.Euler(-Math.PI / 2, 0, rz) }, 0.7 + i * 0.15, { arc: 0.12 })
        .then(() => promoteSlice(slice, rz)),
    );
    i++;
  }
  bag.userData.state.open = true;
  await Promise.all(jobs);
  await handHome(hand);
  return '*rips the bag open* Bread spilled out — you did not say to be gentle.';
}

async function openJar(jarName) {
  const jar = objects[jarName];
  const isPB = jarName === 'peanutButterJar';
  const lid = objects[isPB ? 'pbLid' : 'jellyLid'];
  const label = isPB ? 'peanut butter' : 'jelly';
  if (jar.userData.state.open) return `The ${label} jar is already open.`;
  const hand = acquireHand(jar.position);
  await handTo(hand, topOf(jar), 0.5);
  scene.attach(lid);
  sfx('pop');
  const up = lid.position.clone(); up.y += 0.12;
  await tween(lid, { pos: up, rot: new THREE.Euler(0, Math.PI * 2, 0) }, 0.6);
  const side = clampToCounter(new THREE.Vector3(jar.position.x + 0.09, 0.0, jar.position.z + 0.07));
  await tween(lid, { pos: side, rot: new THREE.Euler(0, 0.4, 0) }, 0.5, { arc: 0.06 });
  jar.userData.state.open = true;
  state.lastJar = jarName;
  await handHome(hand);
  return `*unscrews the ${label} lid* Open.`;
}

async function closeJar(jarName) {
  const jar = objects[jarName];
  const isPB = jarName === 'peanutButterJar';
  const lid = objects[isPB ? 'pbLid' : 'jellyLid'];
  const label = isPB ? 'peanut butter' : 'jelly';
  if (!jar.userData.state.open) return `The ${label} jar is already closed.`;
  const t = topOf(jar);
  await carry(lid, new THREE.Vector3(t.x, t.y - 0.018, t.z));
  jar.attach(lid);
  sfx('clink');
  jar.userData.state.open = false;
  return `*screws the ${label} lid back on* Closed.`;
}

async function grab(obj, label) {
  ensureMovable(obj, label);
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.55);
  hand.attach(obj);
  sfx('tap');
  // if the other hand was holding this, it just got taken
  for (const h of ['leftHand', 'rightHand']) {
    if (state.held[h] === obj) { state.held[h] = null; state.heldLabels[h] = null; }
  }
  state.held[handName(hand)] = obj;
  state.heldLabels[handName(hand)] = label;
  snugGrip(hand, obj);
  const lift = hand.position.clone(); lift.y = clampHandY(hand, lift.y + 0.06);
  await tween(hand, { pos: lift }, 0.4);
  return `*grabs the ${label}* Holding it.`;
}

async function releaseHeld() {
  const entries = Object.entries(state.held).filter(([, o]) => o);
  if (!entries.length) return 'My hands are already empty.';
  for (const [hName, obj] of entries) {
    const hand = objects[hName];
    scene.attach(obj);
    state.held[hName] = null;
    state.heldLabels[hName] = null;
    await handHome(hand);
  }
  return '*lets go* Dropped.';
}

async function putOn(objX, objY, labelX, labelY) {
  if (objX === objY) return "I can't put it on itself.";
  ensureMovable(objX, labelX);
  const t = topOf(objY);
  const dest = new THREE.Vector3(t.x, t.y + baseOffset(objX), t.z);
  for (const h of ['leftHand', 'rightHand']) {
    if (state.held[h] === objX) { state.held[h] = null; state.heldLabels[h] = null; }
  }
  await carry(objX, dest);
  let extra = '';

  if (HEAVY().has(objX) && objY.userData?.spreads) {
    const sq = objY.scale.clone(); sq.y = Math.max(objY.scale.y * 0.55, 0.25);
    await tween(objY, { scale: sq }, 0.25);
    extra += ` The slice flattened under its weight.`;
  } else if ((objX === objects.peanutButterJar || objX === objects.jellyJar) && objY !== objects.plate) {
    extra += ' The whole jar.';
  }
  return `*places the ${labelX} on top of the ${labelY}*${extra}`;
}

async function putSlicesOnPlate() {
  const plate = objects.plate;
  const offs = [-0.045, 0.05];
  let i = 0;
  for (const sl of state.slices.slice(-2)) {
    const t = topOf(plate);
    const dest = new THREE.Vector3(plate.position.x + offs[i], t.y + baseOffset(sl) - 0.004, plate.position.z);
    await carry(sl, dest);
    i++;
  }
  return '*puts both slices on the plate*';
}

async function rubJarOn(jar, target, jarLabel, targetLabel) {
  ensureOnScene(jar);
  const t = topOf(target);
  const start = jar.position.clone();
  const startQuat = jar.quaternion.clone();
  const dest = new THREE.Vector3(t.x, t.y + baseOffset(jar) + 0.005, t.z);
  await carry(jar, dest);
  for (let i = 0; i < 3; i++) {
    await tween(jar, { pos: dest.clone().add(new THREE.Vector3(0.02, 0, 0.01)) }, 0.16);
    await tween(jar, { pos: dest.clone().add(new THREE.Vector3(-0.02, 0, -0.01)) }, 0.16);
  }
  await tween(jar, { pos: dest }, 0.12);
  await carry(jar, start);
  jar.quaternion.copy(startQuat);
  return `*rubs the ${jarLabel} on the ${targetLabel}* Nothing spread — it is still sealed in the container.`;
}

async function dipKnife(jarName) {
  const jar = objects[jarName];
  const knife = objects.knife;
  ensureOnScene(knife);
  const kind = jar.userData.state.contents;
  const label = kind === 'pb' ? 'peanut butter' : 'jelly';
  if (!jar.userData.state.open) {
    const t = topOf(jar);
    const start = knife.position.clone();
    await carry(knife, new THREE.Vector3(t.x, t.y + 0.01, t.z));
    await wait(200);
    await carry(knife, start);
    return `*taps the knife on the lid* The ${label} jar is closed.`;
  }
  const t = topOf(jar);
  const hand = acquireHand(knife.position);
  await handTo(hand, topOf(knife), 0.45);
  hand.attach(knife);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.10, t.z) }, 0.6, { arc: 0.1 });
  const down = hand.position.clone(); down.y -= 0.07;
  await tween(hand, { pos: down }, 0.3);
  await tween(hand, { pos: down.clone().add(new THREE.Vector3(0, 0.07, 0)) }, 0.3);
  if (state.knifeBlob) state.knifeBlob.mesh.removeFromParent();
  const blob = makeBlob(kind === 'pb' ? 0xb97f3e : 0x8e2c80, 0.011);
  blob.scale.set(1, 0.55, 1.2);
  blob.position.set(0.075, 0.006, 0);
  knife.add(blob);
  state.knifeBlob = { mesh: blob, kind };
  sfx('squish');
  scene.attach(knife);
  await Promise.all([
    tween(knife, { pos: new THREE.Vector3(0.20, 0.003, 0.16), rot: new THREE.Euler(0, -0.3, 0) }, 0.6, { arc: 0.08 }),
    handHome(hand),
  ]);
  return `*dips the knife into the ${label}* The knife has ${label} on it.`;
}

async function knifeSweep(target, passes = 2) {
  const knife = objects.knife;
  ensureOnScene(knife);
  const t = topOf(target);
  const start = knife.position.clone();
  const hand = acquireHand(knife.position);
  await handTo(hand, topOf(knife), 0.45);
  hand.attach(knife);
  await tween(hand, { pos: new THREE.Vector3(t.x - 0.03, t.y + 0.055, t.z) }, 0.5);
  sfx('squish');
  for (let i = 0; i < passes; i++) {
    await tween(hand, { pos: new THREE.Vector3(t.x + 0.03, t.y + 0.05, t.z + 0.01) }, 0.35);
    await tween(hand, { pos: new THREE.Vector3(t.x - 0.03, t.y + 0.055, t.z - 0.01) }, 0.35);
  }
  scene.attach(knife);
  await Promise.all([
    tween(knife, { pos: start, rot: new THREE.Euler(0, -0.3, 0) }, 0.5, { arc: 0.06 }),
    handHome(hand),
  ]);
}

function sliceBuried(slice) {
  // is something resting on top of this slice?
  const box = worldBox(slice);
  for (const other of movables()) {
    if (other === slice || state.looseBits.includes(other)) continue;
    const ob = worldBox(other);
    if (ob.min.y > box.max.y - 0.02 && ob.min.y < box.max.y + 0.03 && footprintOverlap(ob, box) > 0.25) {
      return labelOf(other);
    }
  }
  return null;
}

async function spreadOn(kind, target, targetLabel, mentionsKnife) {
  const jarName = kind === 'pb' ? 'peanutButterJar' : 'jellyJar';
  const jar = objects[jarName];
  const label = kind === 'pb' ? 'peanut butter' : 'jelly';
  if (!target.userData.spreads) return rubJarOn(jar, target, `${label} jar`, targetLabel);
  if (!jar.userData.state.open) return rubJarOn(jar, target, `${label} jar`, targetLabel);
  const blocker = sliceBuried(target);
  if (blocker) {
    throw new CantDo(`I can't — there is a ${blocker} on the ${targetLabel}. Remove it first.`);
  }

  if (state.knifeBlob && state.knifeBlob.kind === kind) {
    await knifeSweep(target);
    target.userData.spreads[kind].visible = true;
    target.userData.state.spread = kind;
    state.knifeBlob.mesh.removeFromParent();
    state.knifeBlob = null;
    return `*spreads the ${label} on the ${targetLabel}*`;
  }
  if (mentionsKnife) {
    await knifeSweep(target);
    return `*wipes the clean knife across the ${targetLabel}* Nothing spread — there was no ${label} on the knife.`;
  }
  const hand = acquireHand(jar.position);
  await handTo(hand, topOf(jar), 0.5);
  const dip = hand.position.clone(); dip.y -= 0.05;
  await tween(hand, { pos: dip }, 0.3);
  await tween(hand, { pos: dip.clone().add(new THREE.Vector3(0, 0.05, 0)) }, 0.3);
  const t = topOf(target);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.04, t.z) }, 0.6, { arc: 0.1 });
  for (let i = 0; i < 2; i++) {
    await tween(hand, { pos: new THREE.Vector3(t.x + 0.025, t.y + 0.04, t.z) }, 0.3);
    await tween(hand, { pos: new THREE.Vector3(t.x - 0.025, t.y + 0.04, t.z) }, 0.3);
  }
  target.userData.spreads[kind].visible = true;
  target.userData.state.spread = kind;
  await handHome(hand);
  return `*smears ${label} on the ${targetLabel} with my fingers* You did not mention the knife.`;
}

async function flipSlice(slice, sliceLabel) {
  ensureOnScene(slice);
  const blocker = sliceBuried(slice);
  if (blocker) throw new CantDo(`I can't flip the ${sliceLabel} — a ${blocker} is on it.`);
  const up = slice.position.clone(); up.y += 0.1;
  await tween(slice, { pos: up }, 0.3);
  const newFaceUp = !slice.userData.state.faceUp;
  await tween(slice, { rot: new THREE.Euler(newFaceUp ? 0 : Math.PI, slice.rotation.y, 0) }, 0.4);
  await tween(slice, { pos: new THREE.Vector3(slice.position.x, 0.018, slice.position.z) }, 0.3);
  slice.userData.state.faceUp = newFaceUp;
  return `*flips the ${sliceLabel} over* The ${slice.userData.state.spread ? slice.userData.state.spread === 'pb' ? 'peanut butter' : 'jelly' : 'top'} side now faces ${newFaceUp ? 'up' : 'down'}.`;
}

function winConfetti(at) {
  const colors = [0xf4c531, 0x3a7bd5, 0xd63939, 0x3fa34d, 0x8e2c80];
  for (let i = 0; i < 26; i++) {
    const bit = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.001, 0.004),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }),
    );
    bit.position.set(at.x + (Math.random() - 0.5) * 0.1, at.y + 0.25 + Math.random() * 0.1, at.z + (Math.random() - 0.5) * 0.1);
    scene.add(bit);
    state.looseBits.push(bit);
    tween(bit, {
      pos: new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.3, 0.002, at.z + (Math.random() - 0.5) * 0.3),
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    }, 0.9 + Math.random() * 0.6);
  }
}

function sandwichVerdict(top, bottom) {
  const b = bottom.userData.state, t = top.userData.state;
  const bGood = b.spread && b.faceUp;
  const tGood = t.spread && !t.faceUp;
  if (bGood && tGood && b.spread !== t.spread) {
    state.sandwichDone = true;
    sfx('win');
    winConfetti(topOf(top));
    return ' Peanut butter and jelly face to face — a real PB&J. You did it! 🎉';
  }
  if (bGood && tGood) return ' Both spreads face each other, but they are the same flavor.';
  if (t.spread && t.faceUp) return ` The ${t.spread === 'pb' ? 'peanut butter' : 'jelly'} on the top slice faces up — outside the sandwich.`;
  if (!b.spread && !t.spread) return ' Two plain slices stacked — nothing inside.';
  return '';
}

async function stackSlices(top, bottom, topLabel, bottomLabel) {
  const t = topOf(bottom);
  await carry(top, new THREE.Vector3(t.x, t.y + baseOffset(top), t.z));
  return `*puts the ${topLabel} on top of the ${bottomLabel}*` + sandwichVerdict(top, bottom);
}

async function takeSlicesOut() {
  const bag = objects.breadBag;
  if (!bag.userData.state.open) {
    const hand = acquireHand(bag.position);
    await handTo(hand, topOf(bag), 0.5);
    await tween(hand, { pos: hand.position.clone().add(new THREE.Vector3(0, -0.03, 0)) }, 0.25);
    await tween(hand, { pos: hand.position.clone().add(new THREE.Vector3(0, 0.03, 0)) }, 0.25);
    await handHome(hand);
    return "*pats the bag* It is sealed. You haven't said to open it.";
  }
  const raws = bag.userData.loafSlices.slice(-2);
  if (!raws.length) return 'The bag is empty.';
  let i = 0;
  for (const raw of raws) {
    scene.attach(raw);
    const rz = 0.2 - i * 0.4;
    await tween(raw, {
      pos: new THREE.Vector3(bag.position.x + 0.16 + i * 0.11, 0.009, bag.position.z + 0.22),
      rot: new THREE.Euler(-Math.PI / 2, 0, rz),
    }, 0.6, { arc: 0.15 });
    promoteSlice(raw, rz);
    i++;
  }
  return '*takes two slices out of the bag*';
}

async function shake(obj, label) {
  ensureMovable(obj, label);
  ensureOnScene(obj);
  const isShaker = obj === objects.salt || obj === objects.pepper;
  const start = obj.position.clone();
  const startQuat = obj.quaternion.clone();
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5);
  hand.attach(obj);
  const mid = new THREE.Vector3(0, 0.12, 0.25);
  await tween(hand, { pos: mid }, 0.5, { arc: 0.08 });
  await wiggle(hand, 0.02, 4, 0.08);
  sfx('shake');
  if (isShaker) spawnBits(new THREE.Vector3(0, 0, 0.25), obj === objects.salt ? 0xffffff : 0x222222, 14, 0.0012, 0.06);
  scene.attach(obj);
  await Promise.all([tween(obj, { pos: start }, 0.5, { arc: 0.08 }), handHome(hand)]);
  obj.quaternion.copy(startQuat);
  if (isShaker) return `*shakes the ${label} over the counter* You did not say where.`;
  if (obj === objects.jellyJar && !obj.userData.state.open) return `*shakes the ${label}*`;
  return `*shakes the ${label}*`;
}

async function sprinkle(obj, label, target) {
  ensureOnScene(obj);
  const isShaker = obj === objects.salt || obj === objects.pepper;
  if (!isShaker) throw new CantDo(`The ${label} does not sprinkle.`);
  const t = target ? topOf(target.obj) : new THREE.Vector3(0, 0, 0.2);
  const start = obj.position.clone();
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5);
  hand.attach(obj);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.1, t.z) }, 0.6, { arc: 0.1 });
  await wiggle(hand, 0.015, 3, 0.08);
  spawnBits(new THREE.Vector3(t.x, t.y + 0.002, t.z), obj === objects.salt ? 0xffffff : 0x222222, 12, 0.0012, 0.04);
  scene.attach(obj);
  await Promise.all([tween(obj, { pos: start }, 0.5, { arc: 0.08 }), handHome(hand)]);
  return `*sprinkles ${label.replace(' shaker', '')} over the ${target ? target.label : 'counter'}*`;
}

async function drizzle(target) {
  const honey = objects.honey;
  ensureOnScene(honey);
  const t = target ? topOf(target.obj) : new THREE.Vector3(0, 0, 0.2);
  if (!honey.userData.state.open) {
    await rubJarOn(honey, target ? target.obj : objects.plate, 'honey jar', target ? target.label : 'plate');
    return 'The honey jar is sealed — nothing came out.';
  }
  const start = honey.position.clone();
  const hand = acquireHand(honey.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(honey), 0.5);
  hand.attach(honey);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.14, t.z) }, 0.6, { arc: 0.1 });
  await tween(hand, { rot: new THREE.Euler(0.9, 0, 0) }, 0.3);
  for (let i = 0; i < 3; i++) {
    dropBlob(0xd99a2b, new THREE.Vector3(t.x + (i - 1) * 0.018, t.y + 0.004, t.z + (i % 2) * 0.012), 0.008);
    await wait(120);
  }
  await tween(hand, { rot: new THREE.Euler(0, 0, 0) }, 0.25);
  scene.attach(honey);
  await Promise.all([tween(honey, { pos: start }, 0.5, { arc: 0.08 }), handHome(hand)]);
  return `*drizzles honey over the ${target ? target.label : 'counter'}*`;
}

async function squeeze(obj, label) {
  ensureOnScene(obj);
  const isBottle = obj === objects.mustard || obj === objects.ketchup;
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5);
  if (!isBottle) {
    await tween(hand, { pos: hand.position.clone().add(new THREE.Vector3(0, -0.02, 0)) }, 0.2);
    await tween(hand, { pos: hand.position.clone().add(new THREE.Vector3(0, 0.02, 0)) }, 0.2);
    await handHome(hand);
    return `*squeezes the ${label}* Nothing happened.`;
  }
  hand.attach(obj);
  const start = homes.get(obj)?.pos || obj.position.clone();
  const over = new THREE.Vector3(0.05, 0.16, 0.18);
  await tween(hand, { pos: over }, 0.6, { arc: 0.1 });
  await tween(hand, { pos: over.clone().add(new THREE.Vector3(0, -0.01, 0)) }, 0.15);
  sfx('splat');
  dropBlob(obj === objects.mustard ? 0xe0b424 : 0xc62f2f, new THREE.Vector3(0.05, 0.004, 0.18), 0.016);
  scene.attach(obj);
  await Promise.all([
    tween(obj, { pos: start }, 0.55, { arc: 0.1 }).then(() => {
      const h = homes.get(obj); if (h) obj.quaternion.copy(h.quat);
    }),
    handHome(hand),
  ]);
  return `*squeezes the ${label}* It splatted on the counter — you did not say where to aim.`;
}

async function pour(obj, label, target) {
  ensureMovable(obj, label);
  ensureOnScene(obj);
  const start = obj.position.clone();
  const startQuat = obj.quaternion.clone();
  const t = target ? topOf(target.obj) : new THREE.Vector3(0.0, 0, 0.2);
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5);
  hand.attach(obj);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.16, t.z) }, 0.6, { arc: 0.1 });
  await tween(hand, { rot: new THREE.Euler(0.9, 0, 0) }, 0.35);
  if (obj === objects.cerealBox) {
    sfx('rattle');
    spawnBits(t, 0xd9a45a, 16, 0.004, 0.07);
  } else if (obj.userData.state?.open || obj === objects.mug) {
    dropBlob(obj === objects.honey ? 0xd99a2b : 0x8e2c80, new THREE.Vector3(t.x, t.y + 0.004, t.z));
  }
  await tween(hand, { rot: new THREE.Euler(0, 0, 0) }, 0.3);
  scene.attach(obj);
  await Promise.all([tween(obj, { pos: start }, 0.55, { arc: 0.1 }), handHome(hand)]);
  obj.quaternion.copy(startQuat);
  if (obj === objects.cerealBox) return '*pours the cereal out onto the counter*';
  if (obj.userData.state && !obj.userData.state.open && obj !== objects.mug) return `*tips the ${label} over* Nothing came out — it is sealed.`;
  return `*pours the ${label}${target ? ` onto the ${target.label}` : ' onto the counter'}*`;
}

async function throwThing(obj, label) {
  ensureMovable(obj, label);
  ensureOnScene(obj);
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5);
  hand.attach(obj);
  const windup = hand.position.clone().add(new THREE.Vector3(0, 0.12, 0.1));
  await tween(hand, { pos: windup }, 0.35);
  scene.attach(obj);
  sfx('swoosh');
  const land = clampToCounter(new THREE.Vector3(
    (Math.random() - 0.5) * 1.5,
    baseOffset(obj),
    -0.15 + Math.random() * 0.45,
  ));
  for (const h of ['leftHand', 'rightHand']) {
    if (state.held[h] === obj) { state.held[h] = null; state.heldLabels[h] = null; }
  }
  await Promise.all([
    tween(obj, { pos: land, rot: new THREE.Euler(0, Math.random() * 6, 0) }, 0.7, { arc: 0.3 }),
    handHome(hand),
  ]);
  return `*throws the ${label}* It landed on the counter.`;
}

async function squish(obj, label) {
  ensureOnScene(obj);
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5, 0.06);
  const down = hand.position.clone(); down.y -= 0.05;
  const squashed = obj.scale.clone(); squashed.y = Math.max(obj.scale.y * 0.45, 0.15);
  sfx('squish');
  await Promise.all([
    tween(hand, { pos: down }, 0.3),
    tween(obj, { scale: squashed }, 0.3),
  ]);
  await handHome(hand);
  const isBread = obj.userData.spreads || obj === objects.breadBag;
  return `*squishes the ${label} flat*`;
}

async function rollOver(target, label) {
  const pin = objects.rollingPin;
  ensureOnScene(pin);
  const t = topOf(target);
  const start = pin.position.clone();
  const startQuat = pin.quaternion.clone();
  const hand = acquireHand(pin.position);
  await handTo(hand, topOf(pin), 0.5);
  hand.attach(pin);
  await tween(hand, { pos: new THREE.Vector3(t.x - 0.05, t.y + 0.055, t.z) }, 0.6, { arc: 0.12 });
  sfx('squish');
  const flat = target.scale.clone(); flat.y = Math.max(target.scale.y * 0.35, 0.12);
  const wide = flat.clone(); wide.x *= 1.12; wide.z *= 1.12;
  for (let i = 0; i < 2; i++) {
    await tween(hand, { pos: new THREE.Vector3(t.x + 0.05, t.y + 0.05, t.z) }, 0.35);
    await tween(hand, { pos: new THREE.Vector3(t.x - 0.05, t.y + 0.05, t.z) }, 0.35);
  }
  tween(target, { scale: wide }, 0.3);
  scene.attach(pin);
  await Promise.all([tween(pin, { pos: start }, 0.55, { arc: 0.1 }), handHome(hand)]);
  pin.quaternion.copy(startQuat);
  return `*rolls the rolling pin over the ${label}* It is flat now.`;
}

async function stab(target, label) {
  const knife = objects.knife;
  ensureOnScene(knife);
  const t = topOf(target);
  const hand = acquireHand(knife.position);
  await handTo(hand, topOf(knife), 0.45);
  hand.attach(knife);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.16, t.z) }, 0.5);
  scene.attach(knife);
  sfx('thud'); sfx('clink');
  await Promise.all([
    tween(knife, {
      pos: new THREE.Vector3(t.x - 0.02, t.y - 0.004, t.z),
      rot: new THREE.Euler(0, 0, -1.1),
    }, 0.22),
    handHome(hand),
  ]);
  return `*stabs the ${label}* The knife is stuck in it.`;
}

async function stir(jar, label) {
  const t = topOf(jar);
  if (jar.userData.state && !jar.userData.state.open) {
    return `The ${label} is closed — I can't stir it.`;
  }
  const knife = objects.knife;
  ensureOnScene(knife);
  const start = knife.position.clone();
  const hand = acquireHand(knife.position);
  await handTo(hand, topOf(knife), 0.45);
  hand.attach(knife);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.06, t.z) }, 0.5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 3) * Math.PI;
    await tween(hand, { pos: new THREE.Vector3(t.x + Math.cos(a) * 0.012, t.y + 0.05, t.z + Math.sin(a) * 0.012) }, 0.12);
  }
  scene.attach(knife);
  await Promise.all([tween(knife, { pos: start, rot: new THREE.Euler(0, -0.3, 0) }, 0.5, { arc: 0.06 }), handHome(hand)]);
  return `*stirs the ${label} with the knife*`;
}

async function spin(obj, label) {
  ensureMovable(obj, label);
  ensureOnScene(obj);
  await tween(obj, { rot: new THREE.Euler(0, obj.rotation.y + Math.PI * 4, 0) }, 1.0);
  return `*spins the ${label}*`;
}

async function tipOver(obj, label) {
  ensureMovable(obj, label);
  ensureOnScene(obj);
  const b = worldBox(obj);
  const h = b.max.y - b.min.y;
  const w = (b.max.x - b.min.x);
  if (h < w * 0.7) return `The ${label} is already lying down.`;
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5, 0.03);
  await tween(obj, {
    pos: new THREE.Vector3(obj.position.x + h * 0.35, obj.position.y + w * 0.25, obj.position.z),
    rot: new THREE.Euler(0, obj.rotation.y, -Math.PI / 2),
  }, 0.4);
  await handHome(hand);
  return `*tips the ${label} over*`;
}

async function standUp(obj, label) {
  const h = homes.get(obj);
  if (!h) return `I don't know its original position.`;
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5, 0.03);
  const dest = obj.position.clone(); dest.y = h.pos.y >= SHELF.y - 0.05 && obj.position.y < SHELF.y - 0.1 ? 0 : obj.position.y;
  await tween(obj, { pos: new THREE.Vector3(dest.x, Math.max(dest.y, 0), dest.z), rot: new THREE.Euler(0, obj.rotation.y, 0) }, 0.45);
  obj.quaternion.setFromEuler(new THREE.Euler(0, obj.rotation.y, 0));
  sfx('boing');
  await handHome(hand);
  return `*stands the ${label} up*`;
}

async function swap(a, b, la, lb) {
  ensureMovable(a, la); ensureMovable(b, lb);
  const pa = a.position.clone(), pb = b.position.clone();
  await carry(a, clampToCounter(new THREE.Vector3(pa.x, pa.y, pa.z + 0.12)));
  await carry(b, pa);
  await carry(a, pb);
  return `*swaps the ${la} and the ${lb}*`;
}

async function hide(obj, label) {
  ensureMovable(obj, label);
  const bag = objects.breadBag;
  const dest = new THREE.Vector3(bag.position.x + 0.05, baseOffset(obj), bag.position.z - 0.14);
  await carry(obj, dest);
  return `*puts the ${label} behind the bread bag*`;
}

async function giveMe(obj, label) {
  ensureMovable(obj, label);
  await carry(obj, new THREE.Vector3(0, baseOffset(obj), 0.30));
  return `*slides the ${label} to the counter edge*`;
}

async function putBack(obj, label) {
  const h = homes.get(obj);
  if (!h) return `I don't remember where the ${label} goes.`;
  for (const k of ['leftHand', 'rightHand']) {
    if (state.held[k] === obj) { state.held[k] = null; state.heldLabels[k] = null; }
  }
  await carry(obj, h.pos);
  obj.quaternion.copy(h.quat);
  await tween(obj, { scale: h.scale }, 0.3);
  return `*puts the ${label} back*`;
}

async function juggle() {
  const a = objects.apple, b = objects.banana;
  const la = labelOf(a), lb = labelOf(b);
  await carry(a, new THREE.Vector3(-0.08, 0, 0.2));
  await carry(b, new THREE.Vector3(0.08, 0, 0.2));
  for (let i = 0; i < 3; i++) {
    const pa = a.position.clone(), pb = b.position.clone();
    await Promise.all([
      tween(a, { pos: pb }, 0.45, { arc: 0.22 }),
      tween(b, { pos: pa }, 0.45, { arc: 0.14 }),
    ]);
  }
  await Promise.all([
    tween(a, { pos: clampToCounter(new THREE.Vector3(-0.2 + Math.random() * 0.1, baseOffset(a), 0.25)) }, 0.3, { arc: 0.08 }),
    tween(b, { pos: clampToCounter(new THREE.Vector3(0.15 + Math.random() * 0.1, baseOffset(b), 0.24)) }, 0.35, { arc: 0.1 }),
  ]);
  return `*juggles the ${la} and the ${lb}* Dropped both.`;
}

async function tearThing(target, label) {
  ensureOnScene(target);
  if (!target.userData.spreads) {
    await wiggle(objects.rightHand, 0.02, 2, 0.1);
    throw new CantDo(`The ${label} does not tear.`);
  }
  const half = makeBreadSliceFlat();
  half.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  half.scale.set(0.5, target.scale.y, target.scale.z);
  half.position.set(target.position.x + 0.045, target.position.y, target.position.z);
  half.rotation.y = target.rotation.y + 0.3;
  if (target.userData.state.spread) {
    half.userData.spreads[target.userData.state.spread].visible = true;
    half.userData.state.spread = target.userData.state.spread;
  }
  scene.add(half);
  state.slices.push(half);
  sfx('rip');
  const sq = target.scale.clone(); sq.x *= 0.52;
  const hand = acquireHand(target.position);
  await handTo(hand, topOf(target), 0.5, 0.03);
  await Promise.all([
    tween(target, { scale: sq, pos: target.position.clone().add(new THREE.Vector3(-0.03, 0, 0)) }, 0.3),
    handHome(hand),
  ]);
  return `*tears the ${label} in half*`;
}

async function foldThing(target, label) {
  ensureOnScene(target);
  if (!target.userData.spreads) {
    throw new CantDo(`The ${label} does not fold.`);
  }
  const hand = acquireHand(target.position);
  await handTo(hand, topOf(target), 0.5, 0.03);
  const folded = target.scale.clone(); folded.z *= 0.52; folded.y *= 1.9;
  await Promise.all([tween(target, { scale: folded }, 0.4), handHome(hand)]);
  return `*folds the ${label} over*`;
}

async function biteThing(target, label) {
  ensureOnScene(target);
  const edible = target.userData?.spreads || target === objects.banana || target === objects.apple;
  if (!edible) return `I'm not biting the ${label}.`;
  const hand = acquireHand(target.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(target), 0.5);
  const sq = target.scale.clone(); sq.x *= 0.88; sq.z *= 0.88;
  await tween(target, { scale: sq }, 0.25);
  await handHome(hand);
  return `*bites the ${label}*`;
}

async function useOn(toolThing, targetThing, s) {
  const tool = toolThing.obj, target = targetThing.obj;
  if (tool === objects.knife) {
    if (target === objects.peanutButterJar || target === objects.jellyJar) return dipKnife(nameOf(target));
    return cutThing(target, targetThing.label);
  }
  if (tool === objects.rollingPin) return rollOver(target, targetThing.label);
  if (tool === objects.whisk) {
    ensureOnScene(objects.whisk);
    const t = topOf(target);
    const start = objects.whisk.parent === scene ? objects.whisk.position.clone() : null;
    const hand = acquireHand(t);
    await handTo(hand, topOf(objects.whisk), 0.5);
    hand.attach(objects.whisk);
    await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.08, t.z) }, 0.5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 3) * Math.PI;
      await tween(hand, { pos: new THREE.Vector3(t.x + Math.cos(a) * 0.015, t.y + 0.07, t.z + Math.sin(a) * 0.015) }, 0.1);
    }
    scene.attach(objects.whisk);
    await Promise.all([
      tween(objects.whisk, { pos: start || clampToCounter(new THREE.Vector3(t.x + 0.12, 0, t.z + 0.1)), rot: new THREE.Euler(0, 0, 0) }, 0.4),
      handHome(hand),
    ]);
    return `*whisks the ${targetThing.label}*`;
  }
  if (tool === objects.spatula && target.userData?.spreads) {
    await flipSlice(target, targetThing.label);
    return `*flips the ${targetThing.label} with the spatula*`;
  }
  return rubJarOn(tool, target, toolThing.label, targetThing.label);
}

async function pokeThing(obj, label) {
  sfx('tap');
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5, 0.05);
  for (let i = 0; i < 2; i++) {
    await tween(hand, { pos: hand.position.clone().add(new THREE.Vector3(0, -0.03, 0)) }, 0.15);
    await tween(hand, { pos: hand.position.clone().add(new THREE.Vector3(0, 0.03, 0)) }, 0.15);
  }
  await handHome(hand);
  return `*pokes the ${label}*`;
}

async function slapThing(obj, label) {
  ensureMovable(obj, label);
  ensureOnScene(obj);
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.4, 0.06);
  const dest = clampToCounter(obj.position.clone().add(new THREE.Vector3(0.09, 0, 0.02)));
  await Promise.all([
    tween(hand, { pos: hand.position.clone().add(new THREE.Vector3(0.06, -0.02, 0)) }, 0.12),
    tween(obj, { pos: dest }, 0.18),
  ]);
  await handHome(hand);
  return `*slaps the ${label}* It slid sideways.`;
}

async function sniff(obj, label) {
  const hand = acquireHand(obj.getWorldPosition(new THREE.Vector3()));
  await handTo(hand, topOf(obj), 0.5);
  await wait(500);
  await handHome(hand);
  return `*sniffs the ${label}*`;
}

async function wipeClean() {
  const l = objects.leftHand;
  await handTo(l, new THREE.Vector3(0, 0.02, 0.15), 0.5);
  for (let i = 0; i < 3; i++) {
    await tween(l, { pos: new THREE.Vector3(0.15, 0.04, 0.15) }, 0.2);
    await tween(l, { pos: new THREE.Vector3(-0.15, 0.04, 0.18) }, 0.2);
  }
  sfx('swoosh');
  const n = state.looseBits.length;
  for (const bit of state.looseBits) bit.removeFromParent();
  state.looseBits = [];
  await handHome(l);
  return n ? `*wipes the counter* Cleaned up ${n} bits.` : '*wipes the counter* It was already clean.';
}

async function lookAt(obj, label) {
  const c = worldBox(obj).getCenter(new THREE.Vector3());
  const camDummy = { position: controls.target, quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) };
  await Promise.all([
    tween(camera, { pos: new THREE.Vector3(c.x + 0.12, c.y + 0.16, c.z + 0.28) }, 0.9),
    tween(camDummy, { pos: c }, 0.9),
  ]);
  controls.update();
  return `*looks at the ${label}* (Say "zoom out" to go back.)`;
}

async function zoomOut() {
  const camDummy = { position: controls.target, quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) };
  await Promise.all([
    tween(camera, { pos: new THREE.Vector3(0.5, 0.55, 0.95) }, 0.9),
    tween(camDummy, { pos: new THREE.Vector3(0, 0.18, -0.05) }, 0.9),
  ]);
  controls.update();
  return '*zooms out*';
}

async function danceParty() {
  const l = objects.leftHand, r = objects.rightHand;
  for (let i = 0; i < 3; i++) {
    await Promise.all([
      tween(l, { pos: l.position.clone().add(new THREE.Vector3(0, 0.1, 0)) }, 0.2),
      tween(r, { pos: r.position.clone().add(new THREE.Vector3(0, 0.02, 0)) }, 0.2),
    ]);
    await Promise.all([
      tween(l, { pos: l.position.clone().add(new THREE.Vector3(0, -0.1, 0)) }, 0.2),
      tween(r, { pos: r.position.clone().add(new THREE.Vector3(0, 0.08, 0)) }, 0.2),
    ]);
    await tween(r, { pos: r.position.clone().add(new THREE.Vector3(0, -0.1, 0)) }, 0.2);
  }
  await Promise.all([handHome(l), handHome(r)]);
  return '*dances*';
}

async function clap() {
  const l = objects.leftHand, r = objects.rightHand;
  if (state.held.leftHand || state.held.rightHand) {
    const what = Object.values(state.heldLabels).filter(Boolean).join(' and the ');
    throw new CantDo(`I can't clap — I'm holding the ${what}.`);
  }
  const mid = new THREE.Vector3(0, 0.1, 0.26);
  for (let i = 0; i < 2; i++) {
    await Promise.all([
      tween(l, { pos: mid.clone().add(new THREE.Vector3(-0.02, 0, 0)) }, 0.25),
      tween(r, { pos: mid.clone().add(new THREE.Vector3(0.02, 0, 0)) }, 0.25),
    ]);
    await Promise.all([
      tween(l, { pos: mid.clone().add(new THREE.Vector3(-0.12, 0, 0)) }, 0.25),
      tween(r, { pos: mid.clone().add(new THREE.Vector3(0.12, 0, 0)) }, 0.25),
    ]);
  }
  await Promise.all([handHome(l), handHome(r)]);
  return '*claps*';
}

async function washHands() {
  const l = objects.leftHand, r = objects.rightHand;
  if (state.held.leftHand || state.held.rightHand) {
    const what = Object.values(state.heldLabels).filter(Boolean).join(' and the ');
    throw new CantDo(`I can't wash my hands while holding the ${what}. Say "put it down" first.`);
  }
  const mid = new THREE.Vector3(0, 0.08, 0.26);
  await Promise.all([
    tween(l, { pos: mid.clone().add(new THREE.Vector3(-0.03, 0, 0)) }, 0.4),
    tween(r, { pos: mid.clone().add(new THREE.Vector3(0.03, 0, 0)) }, 0.4),
  ]);
  for (let i = 0; i < 3; i++) {
    await Promise.all([
      tween(l, { pos: mid.clone().add(new THREE.Vector3(0.02, 0.01, 0)) }, 0.15),
      tween(r, { pos: mid.clone().add(new THREE.Vector3(-0.02, -0.01, 0)) }, 0.15),
    ]);
    await Promise.all([
      tween(l, { pos: mid.clone().add(new THREE.Vector3(-0.03, 0, 0)) }, 0.15),
      tween(r, { pos: mid.clone().add(new THREE.Vector3(0.03, 0, 0)) }, 0.15),
    ]);
  }
  await Promise.all([handHome(l), handHome(r)]);
  return '*rubs hands together* There is no sink.';
}

async function highFive() {
  const r = objects.rightHand;
  await tween(r, { pos: new THREE.Vector3(0.16, 0.25, 0.30), rot: new THREE.Euler(-1.2, 0, 0) }, 0.5);
  await wait(1200);
  await handHome(r);
  return '*holds a hand up for a high five*';
}

async function cutThing(target, label) {
  const knife = objects.knife;
  ensureOnScene(knife);
  const t = topOf(target);
  const start = knife.position.clone();
  const hand = acquireHand(knife.position);
  await handTo(hand, topOf(knife), 0.45);
  hand.attach(knife);
  await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.06, t.z) }, 0.5);
  sfx('saw');
  for (let i = 0; i < 3; i++) {
    await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.03, t.z + 0.02) }, 0.2);
    await tween(hand, { pos: new THREE.Vector3(t.x, t.y + 0.05, t.z - 0.02) }, 0.2);
  }
  scene.attach(knife);
  await Promise.all([
    tween(knife, { pos: start, rot: new THREE.Euler(0, -0.35, 0) }, 0.5, { arc: 0.06 }),
    handHome(hand),
  ]);
  return `*saws at the ${label}* The butter knife did not cut much.`;
}

async function eat(targetThing) {
  const l = objects.leftHand, r = objects.rightHand;
  if (targetThing && (targetThing.obj === objects.banana || targetThing.obj === objects.apple)) {
    const obj = targetThing.obj;
    await carry(obj, new THREE.Vector3(0, baseOffset(obj), 0.28));
    await wait(400);
    return `*eats the ${targetThing.label}*`;
  }
  const target = sortedSlices()[0];
  if (!target) return 'Nothing is out to eat — the bread is in the bag.';
  await Promise.all([handTo(l, topOf(target), 0.5), handTo(r, topOf(target), 0.5)]);
  await wait(400);
  await Promise.all([handHome(l), handHome(r)]);
  return state.sandwichDone
    ? '*takes a bite* A perfect PB&J.'
    : "It isn't a sandwich yet.";
}

// ---------- the literal parser ----------

async function perform(prompt, heard, action) {
  state.notes = [];
  let did;
  try {
    did = await action();
  } catch (e) {
    if (e instanceof CantDo) {
      did = e.message;
      sfx('sad');
    } else {
      throw e;
    }
  }
  const fell = await settlePhysics();
  if (fell.length) {
    state.notes.push(`(The ${fell.join(', the ')} fell.)`);
  }
  if (state.notes.length) did += ' ' + state.notes.join(' ');
  speak(did);
  addHistory(prompt, heard, did);
  return did;
}

export async function instruct(raw) {
  if (state.busy) return 'Still doing the last thing.';
  state.busy = true;
  try {
    const s = raw.toLowerCase().replace(/[.,!?'"]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return speak('Say an instruction.');
    const P = (heard, action) => perform(raw, heard, action);

    if (/^help|what can (you|i)|how do i play|what (verbs|words)/.test(s)) {
      openHelp();
      return speak('Opening the help menu.');
    }

    if (/zoom out|look at everything|reset (the )?view|show me everything/.test(s)) {
      return P('Directive: retreat. Showing the full battlefield.', zoomOut);
    }

    // open (incl. "take the lid off", "unscrew")
    let m = s.match(/\b(open|unscrew|uncap|untwist)\b(.*)/) || s.match(/take (the )?lid off(.*)/) || s.match(/remove (the )?lid (off|from)?(.*)/);
    if (m) {
      const what = m[m.length - 1] || '';
      if (/bag|loaf|bread(?!.*(slice|jar))/.test(what)) {
        const gentle = /calm|gentl|careful|slow|soft|nice|untie|untwist|without ripping|don t rip|do not rip/.test(s);
        return P(gentle
          ? 'Directive: OPEN the bag, gently. Gentleness: detected and honored.'
          : 'Directive: OPEN the bag. Method: unspecified. Gentleness: not requested. Selecting MAXIMUM.',
          () => ripBag(gentle));
      }
      if (/peanut|\bpb\b/.test(what)) return P('Directive: OPEN the peanut butter jar. Scope: lid removal ONLY. Nobody said anything about knives or spreading.', () => openJar('peanutButterJar'));
      if (/jelly|jam/.test(what)) return P('Directive: OPEN the jelly jar. Scope: lid removal ONLY.', () => openJar('jellyJar'));
      if (/honey|mayo/.test(what)) {
        const c = condimentIn(what);
        return P(`Directive: OPEN the ${c.word}. Irrelevant to sandwiches, but you are the boss.`, async () => {
          const jar = objects[c.name];
          await pokeThing(jar, c.word);
          if (jar.userData.state) jar.userData.state.open = true;
          return `*loosens the ${c.word} lid* Open.`;
        });
      }
      if (/jar/.test(what)) return P('Directive: OPEN "the jar". Ambiguity detected. Resolving by personal preference.', async () => (await openJar(state.lastJar)) + ' (You did not say which jar.)');
      return speak('Open what?');
    }

    // close
    m = s.match(/\b(close|seal|shut|screw)\b(.*)/);
    if (m) {
      const what = m[2] || '';
      if (/peanut|\bpb\b/.test(what)) return P('Directive: CLOSE the peanut butter. Lid: reunited with jar.', () => closeJar('peanutButterJar'));
      if (/jelly|jam/.test(what)) return P('Directive: CLOSE the jelly.', () => closeJar('jellyJar'));
      if (/bag|bread|loaf/.test(what)) return speak("The bag was ripped open — it can't be closed.");
      return speak('Close what? Only the jars have lids.');
    }

    // take slices out of the bag
    if (/(take|get|pull|remove).*(out of|from|out).*(bag|loaf)/.test(s) || /(take|pull|get) (out )?(\w+ )?slices? out/.test(s)) {
      return P('Directive: EXTRACT slices from bag. Checking bag integrity first…', takeSlicesOut);
    }

    // dip / load the knife
    if (/(dip|stick|dunk|scoop|load)[^.]*knife/.test(s) || /knife[^.]*(in|into)[^.]*(peanut|jelly|jam)/.test(s) || /(put|get)[^.]*(peanut butter|jelly|jam)[^.]*on the knife/.test(s)) {
      const kind = spreadKind(s);
      if (kind) {
        const lbl = kind === 'pb' ? 'peanut butter' : 'jelly';
        return P(`Directive: insert knife INTO ${lbl}. Authorized payload: one (1) glob.`, () => dipKnife(kind === 'pb' ? 'peanutButterJar' : 'jellyJar'));
      }
      return speak('Dip the knife into what — peanut butter or jelly?');
    }

    // use X on Y
    m = s.match(/use (the )?(.*?) (on|to .*? the) (the )?(.*)/);
    if (m && !/spread/.test(s)) {
      const X = R(m[2]);
      const Y = R(m[5]);
      if (X?.missing || Y?.missing) return speak(NO_SLICES);
      if (X && Y && X.obj && Y.obj) return P(`Directive: APPLY ⟨${X.label}⟩ to ⟨${Y.label}⟩. Interpreting "use" with maximum literal creativity.`, () => useOn(X, Y, s));
    }

    // stir
    m = s.match(/\bstir\b(.*)/);
    if (m) {
      const X = R(m[1]);
      if (X && !X.missing) return P(`Directive: STIR the ${X.label}. Implement: butter knife. Why not.`, () => stir(X.obj, X.label));
      if (X?.missing) return speak(NO_SLICES);
      return speak('Stir what?');
    }

    // sprinkle
    m = s.match(/(sprinkle|season|dust)(.*?)(\bon(to)?\b(.*))?$/);
    if (m) {
      const X = R(m[2]) || R(s);
      const Y = m[5] ? R(m[5]) : null;
      if (Y?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: SPRINKLE ${X.label}${Y ? ` on the ${Y.label}` : ''}. Hole-count: checking.`, () => sprinkle(X.obj, X.label, Y));
      return speak('Sprinkle what?');
    }

    // drizzle
    m = s.match(/drizzle(.*?)(\bon(to)?\b(.*))?$/);
    if (m) {
      const Y = m[4] ? R(m[4]) : null;
      if (Y?.missing) return speak(NO_SLICES);
      return P(`Directive: DRIZZLE honey${Y ? ` on the ${Y.label}` : ''}. Stickiness: irreversible.`, () => drizzle(Y));
    }

    // spread
    m = s.match(/(spread|smear|slather)(.*?)\bon(to)?\b(.*)/);
    if (m) {
      const kind = spreadKind(m[2]);
      const target = resolveThing(m[4]);
      if (target?.missing) return speak(NO_SLICES);
      if (kind && target) {
        const lbl = kind === 'pb' ? 'peanut butter' : 'jelly';
        const tgt = target.plural ? { obj: target.objs[0], label: 'left slice' } : target;
        const jarOpen = objects[kind === 'pb' ? 'peanutButterJar' : 'jellyJar'].userData.state.open;
        const heard = !jarOpen
          ? `Directive: SPREAD ${lbl} on ${tgt.label}. Constraint: the ${lbl} is sealed inside its jar. Solution: rub the entire jar on it. Spreading is a MOTION, not a result.`
          : state.knifeBlob?.kind === kind
            ? 'Directive: SPREAD, with a loaded knife. All prerequisites met. Reluctantly doing this correctly.'
            : /knife/.test(s)
              ? `Directive: use knife to spread ${lbl}. Inventory check — ${lbl} currently on knife: 0 grams. Spreading it anyway.`
              : `Directive: SPREAD ${lbl}. Tool specified: none. Defaulting to: fingers.`;
        return P(heard, () => spreadOn(kind, tgt.obj, tgt.label, /knife/.test(s)));
      }
      const cond = condimentIn(m[2]);
      if (cond && target) {
        const tgt = target.plural ? { obj: target.objs[0], label: 'left slice' } : target;
        return P(`Directive: SPREAD ${cond.word} on the ${tgt.label}. This is a PB&J station, but rules are rules. Deploying the entire container.`,
          () => rubJarOn(objects[cond.name], tgt.obj, cond.word, tgt.label));
      }
      if (!kind && !cond && target) return speak(`Spread what on the ${target.label}?`);
      return speak('Spread it on what?');
    }

    // tear / rip
    m = s.match(/(tear|rip|split)(.*)/);
    if (m && !/bag|loaf/.test(m[2])) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: TEAR the ${X.label}. Halves requested: two. Symmetry: aspirational.`, () => tearThing(X.obj, X.label));
    }
    if (m && /bag|loaf/.test(m[2])) {
      return P('Directive: RIP the bag. Finally, an instruction written in my native language.', ripBag);
    }

    // fold
    m = s.match(/\bfold\b(.*)/);
    if (m) {
      const X = R(m[1]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: FOLD the ${X.label}. Origami mode: engaged.`, () => foldThing(X.obj, X.label));
      return speak('Fold what?');
    }

    // bite
    m = s.match(/\b(bite|nibble)\b(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: BITE the ${X.label}. Teeth: deployed.`, () => biteThing(X.obj, X.label));
    }

    // flip
    m = s.match(/(flip|turn over|turn)(.*)/);
    if (m && /slice|bread|piece|it\b/.test(m[2])) {
      const target = R(m[2]);
      if (target?.missing) return speak(NO_SLICES);
      if (target?.isSlice) return P('Directive: ROTATE slice 180°. Axis: the funny one.', () => flipSlice(target.obj, target.label));
      if (target) return P(`Directive: FLIP the ${target.label}. It is not bread, but gravity works on everything.`, () => spin(target.obj, target.label));
    }

    // stack / put together
    if (/(put|press|stick|squish|slap).*(together)|stack the slices|close the sandwich|make the sandwich|assemble/.test(s)) {
      const sl = sortedSlices();
      if (sl.length < 2) return speak(`I need two slices out on the counter to do that. Current count: ${sl.length}. The rest are in the bag.`);
      return P('Directive: UNITE slices. Orientation: EXACTLY as they currently sit. I will be checking nothing.', () => stackSlices(sl[sl.length - 1], sl[0], 'right slice', 'left slice'));
    }

    // squeeze
    m = s.match(/\bsqueeze\b(.*)/);
    if (m) {
      const X = R(m[1]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: SQUEEZE the ${X.label}. Target location: unspecified. Aiming: nowhere in particular.`, () => squeeze(X.obj, X.label));
      return speak('Squeeze what?');
    }

    // shake
    m = s.match(/\bshake\b(.*)/);
    if (m) {
      if (/hands?$/.test(s)) return P('Directive: HANDSHAKE. Formal greetings: initiated.', async () => {
        await wiggle(objects.rightHand, 0.015, 3, 0.1);
        return '*shakes my own hand*';
      });
      const X = R(m[1]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: SHAKE the ${X.label}. Vigor: maximum. Purpose: yours to know.`, () => shake(X.obj, X.label));
      return speak('Shake what?');
    }

    // pour
    m = s.match(/(pour|dump|tip out|empty)(.*?)(\bon(to)?\b(.*))?$/);
    if (m && !/tip over/.test(s)) {
      const X = R(m[2]);
      const Y = m[5] ? R(m[5]) : null;
      if (X?.missing || Y?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: POUR the ${X.label}${Y ? ` onto the ${Y.label}` : ''}. Volume control: not mentioned.`, () => pour(X.obj, X.label, Y));
      return speak('Pour what?');
    }

    // tip over / knock over
    m = s.match(/(tip over|knock over|tip|topple)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: TOPPLE the ${X.label}. Verticality: revoked.`, () => tipOver(X.obj, X.label));
      return speak('Tip over what?');
    }

    // stand up / upright
    m = s.match(/(stand|set|put)(.*?)(up|upright)\b/);
    if (m && !/give up/.test(s)) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: RESTORE verticality to the ${X.label}.`, () => standUp(X.obj, X.label));
    }

    // throw
    m = s.match(/(throw|toss|yeet|chuck|hurl|fling|lob)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: THROW the ${X.label}. Destination: "away". Trajectory: enthusiastic.`, () => throwThing(X.obj, X.label));
      return speak('Throw what?');
    }

    // stab
    m = s.match(/\bstab\b(.*)/);
    if (m) {
      const X = R(m[1]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: STAB the ${X.label}. With: the butter knife. Drama: included free of charge.`, () => stab(X.obj, X.label));
      return speak('Stab what?');
    }

    // roll
    m = s.match(/\broll\b(.*)/);
    if (m) {
      const X = R(m[1].replace(/rolling pin/, ''));
      if (X?.missing) return speak(NO_SLICES);
      if (X && X.obj !== objects.rollingPin) return P(`Directive: ROLL the ${X.label}. Tool: rolling pin. Outcome: flat.`, () => rollOver(X.obj, X.label));
      return speak('Roll it over what?');
    }

    // juggle
    if (/juggle/.test(s)) {
      return P('Directive: JUGGLE. Confidence: high. Skill: unverified.', juggle);
    }

    // squish / smash / flatten / press
    m = s.match(/(squish|smash|flatten|crush|press|mash)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: APPLY downward force to the ${X.label}. Amount: all of it.`, () => squish(X.obj, X.label));
      return speak('Squish what?');
    }

    // swap
    m = s.match(/(swap|switch|exchange)(.*?)\b(and|with|for)\b(.*)/);
    if (m) {
      const X = R(m[2]), Y = R(m[4]);
      if (X?.missing || Y?.missing) return speak(NO_SLICES);
      if (X && Y) return P(`Directive: SWAP ⟨${X.label}⟩ ⇄ ⟨${Y.label}⟩. Reason: unclear. Compliance: total.`, () => swap(X.obj, Y.obj, X.label, Y.label));
      return speak('Swap what with what?');
    }

    // spin
    m = s.match(/(spin|rotate|twirl)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: SPIN the ${X.label}. RPM: dealer's choice.`, () => spin(X.obj, X.label));
      return speak('Spin what?');
    }

    // hide
    m = s.match(/\bhide\b(.*)/);
    if (m) {
      const X = R(m[1]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: HIDE the ${X.label}. Stealth level: technically concealed.`, () => hide(X.obj, X.label));
      return speak('Hide what?');
    }

    // give me / hand me / pass me
    m = s.match(/(give|hand|pass)( me)?(.*)/);
    if (m) {
      const X = R(m[3]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: DELIVER the ${X.label} to you. Method: counter sliding. Like a saloon.`, () => giveMe(X.obj, X.label));
      return speak('Give you what?');
    }

    // put back
    m = s.match(/put (.*?) ?back\b/) || (/(put|move) it back/.test(s) ? [null, 'it'] : null);
    if (m) {
      const X = R(m[1] || 'it');
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: RETURN the ${X.label} to its original position. I memorized everything. I always do.`, () => putBack(X.obj, X.label));
      return speak('Put what back?');
    }

    // put X on Y
    m = s.match(/(put|place|set|lay|move|stick|balance|rest|drop)(.*?)\b(on top of|onto|on|in|into|inside)\b(.*)/);
    if (m) {
      const X = resolveThing(m[2]); // keep plural: "put the slices on the plate"
      const Y = R(m[4]);
      if (X?.missing || Y?.missing) return speak(NO_SLICES);
      if (X && Y) {
        if (X.plural && Y.obj === objects.plate) {
          return P('Directive: PUT both slices ON plate. Arrangement: side by side, because you did not request a pile.', putSlicesOnPlate);
        }
        const Xs = X.plural ? { obj: X.objs[0], label: 'left slice' } : X;
        if (Xs.isSlice && Y.isSlice && Xs.obj !== Y.obj) {
          return P('Directive: PLACE slice upon slice. Orientation: exactly as-is. Quality control: none.', () => stackSlices(Xs.obj, Y.obj, Xs.label, Y.label));
        }
        if (Xs.name === 'knife' && (Y.name === 'peanutButterJar' || Y.name === 'jellyJar') && /in|into|inside/.test(m[3])) {
          return P(`Directive: knife → INTO ${Y.label}.`, () => dipKnife(Y.name));
        }
        return P(`Directive: PUT ⟨${Xs.label}⟩ ON ⟨${Y.label}⟩. Definition of "on": physically on top of. Nothing more was said, so nothing more will happen.`, () => putOn(Xs.obj, Y.obj, Xs.label, Y.label));
      }
      if (X && /down/.test(s)) return P('Directive: RELEASE. Location: directly below hand. "Gently" was not specified.', releaseHeld);
      const things = thingsMentioned(s);
      return speak(`I couldn't work out both objects. I recognized: ${things.length ? things.join(', ') : 'nothing'}. Try "put the X on the Y".`);
    }

    // slide / push
    m = s.match(/(slide|push|shove|scoot|nudge)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) {
        const dir = /left/.test(m[2]) ? new THREE.Vector3(-0.15, 0, 0) : /right/.test(m[2]) ? new THREE.Vector3(0.15, 0, 0) : new THREE.Vector3(0, 0, 0.12);
        return P(`Directive: APPLY lateral force to the ${X.label}. Friction: dramatic.`, async () => {
          ensureMovable(X.obj, X.label);
          const hand = acquireHand(X.obj.getWorldPosition(new THREE.Vector3()));
          await handTo(hand, topOf(X.obj), 0.5, 0.02);
          await tween(X.obj, { pos: clampToCounter(X.obj.position.clone().add(dir)) }, 0.4);
          await handHome(hand);
          return `*pushes the ${X.label}*`;
        });
      }
      return speak('Push what?');
    }

    // grab
    m = s.match(/(pick up|grab|take|hold|snatch|yank|swipe)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) {
        const Xs = X.plural ? { obj: X.objs[0], label: X.label } : X;
        return P(`Directive: ACQUIRE the ${Xs.label}. Holding indefinitely. Next steps: unknown. You did not say.`, () => grab(Xs.obj, Xs.label));
      }
      return speak('Grab what? I know: bread, bag, slices, peanut butter, jelly, knife, plate, and the shelf items (mustard, ketchup, mayo, honey, butter, banana, apple, salt, pepper, cereal, mug, whisk, spatula, rolling pin).');
    }

    // put down / drop
    if (/(put|set).*(down)|^drop\b|let go|release/.test(s)) {
      return P('Directive: RELEASE. Location: directly below hand. "Gently" was not specified.', releaseHeld);
    }

    // cut
    m = s.match(/(cut|saw|halve)(.*)/);
    if (m) {
      const X = R(m[2]) || (sortedSlices().length ? { obj: sortedSlices()[0], label: 'sandwich-in-progress' } : null);
      if (X?.missing || !X) return speak(NO_SLICES);
      return P(`Directive: CUT the ${X.label}. Tool: butter knife (rounded, ceremonial). Sawing motion: guaranteed. Results: not.`, () => cutThing(X.obj, X.label));
    }

    // wipe / clean
    if (/wipe|clean|tidy|mop/.test(s)) {
      return P('Directive: SANITIZE. Tool: the flat of my hand. Health code: flexible.', wipeClean);
    }

    // smell / sniff
    m = s.match(/(smell|sniff)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: SMELL the ${X.label}. Nose: deployed.`, () => sniff(X.obj, X.label));
      return speak('Smell what?');
    }

    // lick / taste / kiss
    m = s.match(/(lick|taste|kiss)(.*)/);
    if (m) {
      const verb = m[1];
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: ${verb.toUpperCase()} the ${X.label}. Health code: not consulted.`, async () => {
        await pokeThing(X.obj, X.label);
        if (verb === 'kiss') return `*kisses the ${X.label}*`;
        return `*${verb}s the ${X.label}*`;
      });
      return speak(`${m[1][0].toUpperCase() + m[1].slice(1)} what?`);
    }

    // pat / pet
    m = s.match(/\b(pat|pet|boop)\b(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: GENTLE AFFECTION for the ${X.label}.`, async () => {
        await pokeThing(X.obj, X.label);
        return `*pats the ${X.label}*`;
      });
    }

    // slap
    m = s.match(/\bslap\b(.*)/);
    if (m) {
      const X = R(m[1]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: SLAP the ${X.label}. Disrespect: intentional.`, () => slapThing(X.obj, X.label));
    }

    // look at / inspect
    m = s.match(/(look at|inspect|examine|stare at|zoom in on|zoom to|show me)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: VISUALLY INSPECT the ${X.label}. Moving the camera, not the object. Eyes only.`, () => lookAt(X.obj, X.label));
      return speak('Look at what? (Or say "zoom out".)');
    }

    // point
    m = s.match(/point (at|to)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: INDICATE the ${X.label}.`, async () => {
        const hand = acquireHand(X.obj.getWorldPosition(new THREE.Vector3()));
        await handTo(hand, topOf(X.obj), 0.5, 0.07);
        await wait(700);
        await handHome(hand);
        return `*points at the ${X.label}*`;
      });
    }

    // count
    if (/count|how many/.test(s)) {
      const out = state.slices.length;
      const inBag = objects.breadBag.userData.loafSlices.length;
      return P('Directive: CENSUS of bread.', async () => {
        const hand = objects.rightHand;
        await handTo(hand, new THREE.Vector3(0, 0.05, 0.1), 0.4, 0.08);
        await wait(400);
        await handHome(hand);
        return `Slices out: ${out}. Still in the bag: ${inBag}. Sandwiches made: ${state.sandwichDone ? 1 : 0}.`;
      });
    }

    // weigh / measure
    m = s.match(/(weigh|measure)(.*)/);
    if (m) {
      const X = R(m[2]);
      if (X?.missing) return speak(NO_SLICES);
      if (X) return P(`Directive: ESTIMATE the mass of the ${X.label}. Equipment: vibes.`, async () => {
        await pokeThing(X.obj, X.label);
        return `*hefts the ${X.label}* About one banana's worth.`;
      });
    }

    // cooking appliances that don't exist
    if (/cook|bake|fry|grill|microwave|boil|saut|broil|freeze|refrigerat/.test(s)) {
      return P('Directive: APPLY heat/cold. Equipment audit in progress…', async () => {
        await wiggle(objects.rightHand, 0.015, 2, 0.1);
        return 'There is no stove, oven, or microwave in this kitchen.';
      });
    }

    // ambient verbs
    if (/\bwave\b/.test(s)) return P('Directive: WAVE. Recipient: unclear. Waving at the bread.', async () => { await wiggle(objects.rightHand, 0.02, 3, 0.1); return '*waves*'; });
    if (/\bclap\b|applaud/.test(s)) return P('Directive: APPLAUSE. Checking hand availability first…', clap);
    if (/dance|boogie|party/.test(s)) return P('Directive: DANCE. Sandwich progress: paused. Groove: initiated.', danceParty);
    if (/wash (your |my )?hands/.test(s)) return P('Directive: WASH hands. Available sink: none. Improvising.', washHands);
    if (/high five|high-five/.test(s)) return P('Directive: HIGH FIVE. Waiting for contact…', highFive);
    if (/\bwait\b|pause|hold on|do nothing|stand still/.test(s)) return P('Directive: NOTHING. Executing flawlessly.', async () => { await wait(1500); return '*waits*'; });
    if (/toast/.test(s)) return P('Directive: TOAST the bread. Toaster provided: none. Engaging ambient thermal radiation.', async () => {
      const sl = sortedSlices()[0];
      if (!sl) return 'No slices are out to toast.';
      await grab(sl, 'slice');
      await wait(800);
      await releaseHeld();
      return '*holds the slice up to the light* There is no toaster.';
    });
    if (/drink|sip/.test(s)) return P('Directive: DRINK. Vessel: the mug. Contents: confidence.', async () => {
      await carry(objects.mug, new THREE.Vector3(0.08, baseOffset(objects.mug), 0.26));
      await wait(500);
      await putBack(objects.mug, 'mug');
      return '*sips from the empty mug* It is empty.';
    });
    if (/eat|chomp|nom/.test(s)) {
      const X = R(s);
      return P('Directive: CONSUME. Checking if a sandwich legally exists…', () => eat(X));
    }

    // ---- nothing matched: explain exactly why ----
    const things = thingsMentioned(s);
    const why = things.length
      ? `I recognized ${things.join(' and ')}, but not what you want done with ${things.length > 1 ? 'them' : 'it'}.`
      : 'I did not recognize an action or an object in that.';
    return P(
      `Directive: "${raw}" → unparseable. Action taken: intense staring.`,
      async () => `*stares* ${why} (See the ❓ Help menu for hints.)`,
    );
  } finally {
    state.busy = false;
  }
}

// ---------- wiring ----------

export function initGame(theScene, opts = {}) {
  scene = theScene;
  camera = opts.camera;
  controls = opts.controls;
  for (const obj of Object.values(objects)) {
    homes.set(obj, { pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() });
  }

  const input = document.getElementById('instruction');
  const btn = document.getElementById('say');
  const mic = document.getElementById('mic');
  const histToggle = document.getElementById('history-toggle');
  const histPanel = document.getElementById('history');

  const promptLog = [];
  let promptIdx = -1;
  let draft = '';

  const go = () => {
    const v = input.value.trim();
    if (!v) return;
    promptLog.push(v);
    promptIdx = -1;
    draft = '';
    input.value = '';
    instruct(v);
  };
  btn?.addEventListener('click', go);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { go(); return; }
    if (e.key === 'ArrowUp') {
      if (!promptLog.length) return;
      e.preventDefault();
      if (promptIdx === -1) { draft = input.value; promptIdx = promptLog.length - 1; }
      else if (promptIdx > 0) promptIdx--;
      input.value = promptLog[promptIdx];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === 'ArrowDown') {
      if (promptIdx === -1) return;
      e.preventDefault();
      promptIdx++;
      if (promptIdx >= promptLog.length) { promptIdx = -1; input.value = draft; }
      else input.value = promptLog[promptIdx];
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  document.getElementById('reset')?.addEventListener('click', () => location.reload());

  const audioBtn = document.getElementById('audio');
  if (audioBtn) {
    audioBtn.textContent = audioEnabled() ? '🔊' : '🔇';
    audioBtn.addEventListener('click', () => {
      setAudioEnabled(!audioEnabled());
      audioBtn.textContent = audioEnabled() ? '🔊' : '🔇';
      if (audioEnabled()) sfx('pop');
    });
  }

  histToggle?.addEventListener('click', () => {
    const open = histPanel.style.display === 'block';
    histPanel.style.display = open ? 'none' : 'block';
  });

  const helpPanel = document.getElementById('help');
  document.getElementById('help-toggle')?.addEventListener('click', () => {
    helpPanel.style.display = helpPanel.style.display === 'block' ? 'none' : 'block';
  });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && mic) {
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let listening = false;
    mic.addEventListener('click', () => { listening ? rec.stop() : rec.start(); });
    rec.onstart = () => { listening = true; mic.classList.add('listening'); };
    rec.onend = () => { listening = false; mic.classList.remove('listening'); };
    rec.onerror = () => { listening = false; mic.classList.remove('listening'); };
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(' ').trim();
      input.value = text;
      if (e.results[e.results.length - 1].isFinal) go();
    };
  } else if (mic) {
    mic.style.display = 'none';
  }

  window.game = { instruct, state, objects };
}
