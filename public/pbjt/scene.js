// Builds the PB&J mise-en-place scene. Every object is registered by name
// so the game layer can grab and move things.
import * as THREE from 'three';
import {
  woodTexture, crumbTexture, crustTexture, labelTexture, tileTexture,
  jellyTexture, peanutButterTexture, bagPrintTexture, rng,
} from './textures.js';

export const objects = {}; // name -> Object3D

function register(name, obj) {
  obj.userData.name = name;
  objects[name] = obj;
  return obj;
}

function shadowed(obj) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return obj;
}

// ---------- bread ----------

function breadShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.045, 0);
  s.quadraticCurveTo(-0.055, 0, -0.055, 0.012);
  s.lineTo(-0.056, 0.072);
  s.bezierCurveTo(-0.059, 0.100, -0.048, 0.117, -0.030, 0.114);
  s.quadraticCurveTo(-0.012, 0.109, 0, 0.105);
  s.quadraticCurveTo(0.012, 0.109, 0.030, 0.114);
  s.bezierCurveTo(0.048, 0.117, 0.059, 0.100, 0.056, 0.072);
  s.lineTo(0.055, 0.012);
  s.quadraticCurveTo(0.055, 0, 0.045, 0);
  s.closePath();
  return s;
}

let breadMats = null;
function getBreadMats() {
  if (breadMats) return breadMats;
  const crumb = crumbTexture();
  crumb.repeat.set(8.5, 8.2);
  crumb.offset.set(0.5, 0.02);
  const crumbMat = new THREE.MeshStandardMaterial({ map: crumb, roughness: 0.95 });
  const crust = crustTexture();
  crust.repeat.set(10, 8);
  const crustMat = new THREE.MeshStandardMaterial({ map: crust, roughness: 0.85 });
  breadMats = [crumbMat, crustMat];
  return breadMats;
}

export function makeBreadSlice() {
  const geo = new THREE.ExtrudeGeometry(breadShape(), {
    depth: 0.012, bevelEnabled: true, bevelThickness: 0.002,
    bevelSize: 0.002, bevelSegments: 3, curveSegments: 24,
  });
  geo.center();
  const mesh = new THREE.Mesh(geo, getBreadMats());
  return mesh; // faces point ±z; thickness ~0.016 along z
}

function makeSpreadMesh(kind /* 'pb' | 'jelly' */) {
  // a thin, slightly-inset copy of the bread face, sitting on the top face
  const geo = new THREE.ExtrudeGeometry(breadShape(), {
    depth: 0.003, bevelEnabled: true, bevelThickness: 0.0012,
    bevelSize: 0.0012, bevelSegments: 2, curveSegments: 20,
  });
  geo.center();
  geo.scale(0.88, 0.88, 1);
  const mat = kind === 'pb'
    ? new THREE.MeshPhysicalMaterial({
        map: peanutButterTexture(), color: 0xb97f3e, roughness: 0.5,
        clearcoat: 0.5, clearcoatRoughness: 0.4,
      })
    : new THREE.MeshPhysicalMaterial({
        map: jellyTexture(), color: 0x8e2c80, roughness: 0.12,
        clearcoat: 1, clearcoatRoughness: 0.1,
      });
  if (mat.map) { mat.map.repeat.set(8, 8); }
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  return m;
}

export function makeBreadSliceFlat() {
  const g = new THREE.Group();
  const slice = makeBreadSlice();
  slice.rotation.x = -Math.PI / 2; // lie flat, face up
  slice.position.y = 0.008;
  g.add(slice);
  const pb = makeSpreadMesh('pb');
  pb.position.y = 0.0175;
  g.add(pb);
  const jelly = makeSpreadMesh('jelly');
  jelly.position.y = 0.0175;
  g.add(jelly);
  g.userData.spreads = { pb, jelly };
  g.userData.state = { spread: null, faceUp: true };
  return g;
}

// ---------- plate ----------

function makePlate() {
  const pts = [
    new THREE.Vector2(0.0005, 0.006),
    new THREE.Vector2(0.045, 0.006),
    new THREE.Vector2(0.075, 0.007),
    new THREE.Vector2(0.098, 0.017),
    new THREE.Vector2(0.124, 0.027),
    new THREE.Vector2(0.129, 0.0235),
    new THREE.Vector2(0.122, 0.018),
    new THREE.Vector2(0.094, 0.009),
    new THREE.Vector2(0.07, 0.002),
    new THREE.Vector2(0.052, 0.0008),
    new THREE.Vector2(0.0005, 0.0008),
  ];
  const geo = new THREE.LatheGeometry(pts, 64);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf4f1ea, roughness: 0.22, metalness: 0.0, side: THREE.DoubleSide,
  });
  const plate = new THREE.Mesh(geo, mat);
  return register('plate', shadowed(plate));
}

// ---------- jars ----------

function jarBodyGeometry(radius, height) {
  // cylinder with rounded shoulder
  const pts = [];
  pts.push(new THREE.Vector2(0.0005, 0));
  pts.push(new THREE.Vector2(radius * 0.85, 0));
  pts.push(new THREE.Vector2(radius, 0.012));
  const shoulderY = height - 0.022;
  pts.push(new THREE.Vector2(radius, shoulderY));
  pts.push(new THREE.Vector2(radius * 0.86, height - 0.006));
  pts.push(new THREE.Vector2(radius * 0.72, height));
  return new THREE.LatheGeometry(pts, 48);
}

function ridgedLid(radius, height, color, metalness = 0.1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 48), mat);
  body.position.y = height / 2;
  g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.97, radius * 0.97, 0.002, 48), mat);
  top.position.y = height + 0.001;
  g.add(top);
  // knurling ridges
  for (let i = 0; i < 36; i++) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.0012, height * 0.85, 0.0012), mat);
    const a = (i / 36) * Math.PI * 2;
    ridge.position.set(Math.cos(a) * radius, height / 2, Math.sin(a) * radius);
    ridge.rotation.y = -a;
    g.add(ridge);
  }
  return g;
}

function makePeanutButterJar() {
  const g = new THREE.Group();
  const r = 0.042, h = 0.125;
  const pbTex = peanutButterTexture();
  // amber plastic jar filled with PB — reads as solid PB color through the plastic
  const body = new THREE.Mesh(jarBodyGeometry(r, h), new THREE.MeshPhysicalMaterial({
    map: pbTex, color: 0xc8924f, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.25,
  }));
  g.add(body);
  const label = labelTexture({
    title: 'PEANUT', sub: 'BUTTER  ·  CREAMY',
    bg: '#f5e6c8', accent: '#1f4d8f', text: '#7a4a12',
  });
  const labelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r + 0.0012, r + 0.0012, 0.062, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: label, roughness: 0.5 }),
  );
  labelMesh.position.y = 0.052;
  labelMesh.rotation.y = Math.PI; // texture center faces +z (toward camera)
  g.add(labelMesh);
  // PB surface visible when the lid comes off
  const surface = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.68, r * 0.68, 0.005, 32),
    new THREE.MeshStandardMaterial({ map: pbTex, color: 0xb97f3e, roughness: 0.55 }),
  );
  surface.position.y = h - 0.012;
  g.add(surface);
  const lid = ridgedLid(r * 0.96, 0.022, 0xb02e2e);
  lid.position.y = h - 0.002;
  g.add(lid);
  register('pbLid', lid);
  g.userData.state = { open: false, contents: 'pb' };
  return register('peanutButterJar', shadowed(g));
}

function makeJellyJar() {
  const g = new THREE.Group();
  const r = 0.037, h = 0.115;
  // jelly inside
  const jelly = new THREE.Mesh(
    new THREE.CylinderGeometry(r - 0.004, r - 0.004, 0.085, 32),
    new THREE.MeshPhysicalMaterial({
      map: jellyTexture(), color: 0xa84a98, roughness: 0.15,
      clearcoat: 1.0, clearcoatRoughness: 0.1,
    }),
  );
  jelly.position.y = 0.085 / 2 + 0.004;
  g.add(jelly);
  // glass
  const glass = new THREE.Mesh(jarBodyGeometry(r, h), new THREE.MeshPhysicalMaterial({
    color: 0xdfe8ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28,
    clearcoat: 1.0, clearcoatRoughness: 0.05, side: THREE.DoubleSide,
  }));
  g.add(glass);
  const label = labelTexture({
    title: 'GRAPE', sub: 'JELLY',
    bg: '#f3eef7', accent: '#5b2a86', text: '#4a1d6e',
  });
  const labelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r + 0.0014, r + 0.0014, 0.052, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: label, roughness: 0.5 }),
  );
  labelMesh.position.y = 0.048;
  labelMesh.rotation.y = Math.PI;
  g.add(labelMesh);
  const lid = ridgedLid(r * 0.88, 0.018, 0xd4af37, 0.7);
  lid.position.y = h - 0.002;
  g.add(lid);
  register('jellyLid', lid);
  g.userData.state = { open: false, contents: 'jelly' };
  return register('jellyJar', shadowed(g));
}

// ---------- bread bag ----------

function makeBreadBag() {
  const g = new THREE.Group();
  // loaf: stack of slices along x
  const loaf = new THREE.Group();
  const rand = rng(23);
  const n = 11;
  const loafSlices = [];
  for (let i = 0; i < n; i++) {
    const slice = makeBreadSlice();
    slice.rotation.y = Math.PI / 2;
    slice.rotation.x = (rand() - 0.5) * 0.06;
    slice.position.set(-0.085 + i * 0.0165, 0.058, 0);
    slice.rotation.z = (rand() - 0.5) * 0.05;
    loaf.add(slice);
    loafSlices.push(slice);
  }
  g.add(shadowed(loaf));
  g.userData.loafSlices = loafSlices;
  // bag: stretched capsule, translucent with print
  const bagGeo = new THREE.CapsuleGeometry(0.066, 0.17, 8, 24);
  bagGeo.rotateZ(Math.PI / 2); // axis along x
  const print = bagPrintTexture();
  const bag = new THREE.Mesh(bagGeo, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.15, transparent: true, opacity: 0.22,
    clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide, depthWrite: false,
  }));
  bag.scale.set(1, 0.98, 0.92);
  bag.position.set(0.004, 0.062, 0);
  g.add(bag);
  // printed panel (front face of the bag)
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.1),
    new THREE.MeshStandardMaterial({ map: print, transparent: true, roughness: 0.3 }),
  );
  panel.position.set(0.004, 0.062, 0.0615);
  g.add(panel);
  // twisted end + tie at +x
  const twist = new THREE.Mesh(
    new THREE.ConeGeometry(0.024, 0.06, 16),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.55,
    }),
  );
  twist.rotation.z = -Math.PI / 2;
  twist.position.set(0.132, 0.05, 0);
  g.add(twist);
  const tie = new THREE.Mesh(
    new THREE.TorusGeometry(0.0085, 0.003, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.5 }),
  );
  tie.rotation.y = Math.PI / 2;
  tie.position.set(0.150, 0.05, 0);
  g.add(tie);
  g.userData.bagParts = { bag, panel, twist, tie };
  g.userData.state = { open: false };
  return register('breadBag', g);
}

// ---------- knife ----------

function makeKnife() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1.0, roughness: 0.22 });
  // blade (flat shape in xy, extruded thin, then laid flat)
  const s = new THREE.Shape();
  s.moveTo(0, -0.0095);
  s.lineTo(0.068, -0.0105);
  s.quadraticCurveTo(0.102, -0.0115, 0.111, -0.004);
  s.quadraticCurveTo(0.115, 0.0035, 0.104, 0.0085);
  s.lineTo(0.0, 0.0115);
  s.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(s, {
    depth: 0.0014, bevelEnabled: true, bevelThickness: 0.0005,
    bevelSize: 0.0008, bevelSegments: 2, curveSegments: 16,
  });
  bladeGeo.rotateX(-Math.PI / 2); // lie flat
  const blade = new THREE.Mesh(bladeGeo, steel);
  blade.position.y = 0.0024;
  g.add(blade);
  // handle
  const handleGeo = new THREE.CapsuleGeometry(0.0085, 0.075, 6, 16);
  handleGeo.rotateZ(Math.PI / 2);
  handleGeo.scale(1, 0.55, 1.4);
  const handle = new THREE.Mesh(handleGeo, steel);
  handle.position.set(-0.044, 0.0048, 0.0);
  g.add(handle);
  return register('knife', shadowed(g));
}

// ---------- hands ----------

const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0a784, roughness: 0.65 });

function makeHand(side /* 1 = right, -1 = left */) {
  const g = new THREE.Group();
  // palm
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.034, 24, 18), skinMat);
  palm.scale.set(1.15, 0.4, 1.35);
  palm.position.set(0, 0.014, 0);
  g.add(palm);
  // fingers (pointing -z, away from the player)
  const fingerLens = [0.030, 0.040, 0.044, 0.036];
  for (let i = 0; i < 4; i++) {
    const len = fingerLens[i];
    const f = new THREE.Group();
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0078, len, 6, 12), skinMat);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -(len / 2 + 0.004);
    f.add(seg);
    const x = side * (-0.027 + i * 0.018);
    f.position.set(x, 0.012, -0.038);
    f.rotation.x = 0.18; // slight downward curl
    f.rotation.y = side * (i - 1.5) * -0.05;
    g.add(f);
  }
  // thumb
  const thumb = new THREE.Group();
  const tseg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.03, 6, 12), skinMat);
  tseg.rotation.x = Math.PI / 2;
  tseg.position.z = -0.019;
  thumb.add(tseg);
  thumb.position.set(side * 0.04, 0.010, 0.012);
  thumb.rotation.y = side * -0.7;
  g.add(thumb);
  // wrist + sleeve cuff
  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.05, 6, 14), skinMat);
  wrist.rotation.x = Math.PI / 2;
  wrist.scale.set(1.1, 1, 0.62);
  wrist.position.set(side * -0.005, 0.016, 0.055);
  g.add(wrist);
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.027, 0.029, 0.035, 20),
    new THREE.MeshStandardMaterial({ color: 0x2e6f6c, roughness: 0.85 }),
  );
  cuff.rotation.x = Math.PI / 2;
  cuff.scale.set(1.05, 1, 0.7);
  cuff.position.set(side * -0.005, 0.018, 0.092);
  g.add(cuff);
  return shadowed(g);
}

// ---------- pantry shelf ----------

function smallLabel(tex, r, h) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 32, 1, true),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
  );
  m.rotation.y = Math.PI;
  return m;
}

function makeSqueezeBottle(name, label, bodyColor, accent) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.095, 24), mat);
  body.position.y = 0.0475;
  g.add(body);
  const shoulder = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.03, 24), mat);
  shoulder.position.y = 0.11;
  g.add(shoulder);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.018, 16),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }));
  cap.position.y = 0.132;
  g.add(cap);
  const tex = labelTexture({ title: label, sub: '', bg: '#fdf8ee', accent, text: accent });
  const band = smallLabel(tex, 0.0222, 0.05);
  band.position.y = 0.05;
  g.add(band);
  return register(name, shadowed(g));
}

function makeSmallJar(name, label, contentColor, lidColor, accent) {
  const g = new THREE.Group();
  const r = 0.027, h = 0.075;
  const body = new THREE.Mesh(jarBodyGeometry(r, h), new THREE.MeshPhysicalMaterial({
    color: contentColor, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2,
  }));
  g.add(body);
  const tex = labelTexture({ title: label, sub: '', bg: '#fdf8ee', accent, text: accent });
  const band = smallLabel(tex, r + 0.0012, 0.034);
  band.position.y = 0.032;
  g.add(band);
  const lid = ridgedLid(r * 0.88, 0.014, lidColor, 0.5);
  lid.position.y = h - 0.002;
  g.add(lid);
  g.userData.state = { open: false, contents: name };
  return register(name, shadowed(g));
}

function makeButterDish() {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(
    new THREE.BoxGeometry(0.105, 0.012, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.25 }),
  );
  dish.position.y = 0.006;
  g.add(dish);
  const stick = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.026, 0.038),
    new THREE.MeshStandardMaterial({ color: 0xf5d76e, roughness: 0.5 }),
  );
  stick.position.y = 0.025;
  g.add(stick);
  return register('butterDish', shadowed(g));
}

function makeShaker(name, capColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.015, 0.042, 16),
    new THREE.MeshPhysicalMaterial({
      color: name === 'salt' ? 0xf5f2ea : 0xdedad0, roughness: 0.2,
      transparent: true, opacity: 0.85,
    }),
  );
  body.position.y = 0.021;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.013, 0.014, 16),
    new THREE.MeshStandardMaterial({ color: capColor, metalness: 0.6, roughness: 0.35 }));
  cap.position.y = 0.049;
  g.add(cap);
  return register(name, shadowed(g));
}

function makeCerealBox() {
  const tex = labelTexture({
    title: 'OAT-Os', sub: 'CRUNCHY CEREAL',
    bg: '#f4a93c', accent: '#a33c1f', text: '#5a2a10',
  });
  const side = new THREE.MeshStandardMaterial({ color: 0xc97a28, roughness: 0.6 });
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.095, 0.205, 0.034),
    [side, side, side, side, front, front],
  );
  box.position.y = 0.1025;
  const g = new THREE.Group();
  g.add(box);
  return register('cerealBox', shadowed(g));
}

function makeBanana() {
  const pts = [
    new THREE.Vector3(-0.055, 0.030, 0),
    new THREE.Vector3(-0.030, 0.011, 0),
    new THREE.Vector3(0.030, 0.011, 0),
    new THREE.Vector3(0.055, 0.030, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 24, 0.0125, 12),
    new THREE.MeshStandardMaterial({ color: 0xf2cf3a, roughness: 0.55 }),
  );
  const g = new THREE.Group();
  g.add(tube);
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x5a4222, roughness: 0.8 });
  for (const end of [pts[0], pts[3]]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 10, 8), tipMat);
    tip.position.copy(end);
    g.add(tip);
  }
  return register('banana', shadowed(g));
}

function makeApple() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 24, 18),
    new THREE.MeshPhysicalMaterial({ color: 0xc62f2f, roughness: 0.3, clearcoat: 0.8 }),
  );
  body.scale.set(1, 0.92, 1);
  body.position.y = 0.029;
  g.add(body);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0022, 0.003, 0.018, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a4222, roughness: 0.9 }),
  );
  stem.position.set(0.003, 0.064, 0);
  stem.rotation.z = 0.25;
  g.add(stem);
  return register('apple', shadowed(g));
}

function makeMug() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.07, 24, 1, true), mat);
  body.position.y = 0.035;
  g.add(body);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.004, 24), mat);
  bottom.position.y = 0.002;
  g.add(bottom);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0235, 0.068, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.3, side: THREE.BackSide }));
  inner.position.y = 0.036;
  g.add(inner);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0045, 10, 20, Math.PI), mat);
  handle.position.set(0.028, 0.037, 0);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
  return register('mug', shadowed(g));
}

function makeCrockWithTools() {
  const g = new THREE.Group();
  const crockMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.6 });
  const crock = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.085, 24, 1, true), crockMat);
  crock.material.side = THREE.DoubleSide;
  crock.position.y = 0.0425;
  g.add(crock);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.005, 24), crockMat);
  base.position.y = 0.0025;
  g.add(base);

  // spatula standing in the crock
  const spat = new THREE.Group();
  const spatHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.10, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.6 }));
  spatHandle.position.y = 0.06;
  spat.add(spatHandle);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.006),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5 }));
  blade.position.y = 0.15;
  spat.add(blade);
  spat.rotation.z = 0.14;
  spat.position.set(-0.008, 0.02, 0);
  g.add(spat);
  register('spatula', spat);

  // whisk standing in the crock
  const whisk = new THREE.Group();
  const wHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.075, 6, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.3 }));
  wHandle.position.y = 0.05;
  whisk.add(wHandle);
  const loopMat = new THREE.MeshStandardMaterial({ color: 0xc8cdd2, metalness: 0.9, roughness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0016, 6, 24), loopMat);
    loop.scale.set(1, 1.9, 1);
    loop.position.y = 0.124;
    loop.rotation.y = (i / 4) * Math.PI;
    whisk.add(loop);
  }
  whisk.rotation.z = -0.16;
  whisk.position.set(0.012, 0.02, 0);
  g.add(whisk);
  register('whisk', whisk);

  return register('crock', shadowed(g));
}

function makeRollingPin() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xd9b178, roughness: 0.5 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.16, 20), wood);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.y = 0.019;
  g.add(barrel);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0095, 0.05, 12), wood);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(s * 0.103, 0.019, 0);
    g.add(handle);
  }
  return register('rollingPin', shadowed(g));
}

function makeShelf(scene) {
  const shelf = new THREE.Group();
  const wood = woodTexture();
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.025, 0.17),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 }),
  );
  plank.position.set(0, 0.58, -0.335);
  shadowed(plank);
  shelf.add(plank);
  for (const s of [-1, 1]) {
    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.09, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5 }),
    );
    bracket.position.set(s * 0.55, 0.535, -0.345);
    shelf.add(bracket);
  }
  register('shelf', shelf);
  scene.add(shelf);

  const y = 0.5925, z = -0.335;
  const place = (obj, x, zOff = 0, rotY = 0) => {
    obj.position.set(x, y, z + zOff);
    obj.rotation.y = rotY;
    scene.add(obj);
  };

  place(makeSqueezeBottle('mustard', 'MUSTARD', 0xe0b424, '#7a5a10'), -0.60);
  place(makeSqueezeBottle('ketchup', 'KETCHUP', 0xc62f2f, '#7a1410'), -0.52);
  place(makeSmallJar('mayo', 'MAYO', 0xf2efe4, 0x3a6ea5, '#2a4a75'), -0.43);
  place(makeSmallJar('honey', 'HONEY', 0xd99a2b, 0xc9a227, '#7a5a10'), -0.33, 0.01);
  place(makeButterDish(), -0.19, 0.01, 0.15);
  place(makeShaker('salt', 0xc8cdd2), -0.085);
  place(makeShaker('pepper', 0x2b2b2b), -0.04, 0.02);
  place(makeCerealBox(), 0.07, -0.02, -0.08);
  place(makeBanana(), 0.21, 0.02, 0.5);
  place(makeApple(), 0.32, 0.01);
  place(makeMug(), 0.42, 0, 2.6);
  place(makeCrockWithTools(), 0.55, -0.01);
}

// ---------- environment ----------

function makeCounter() {
  const g = new THREE.Group();
  const wood = woodTexture();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.04, 0.75),
    new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 }),
  );
  top.position.y = -0.02;
  top.receiveShadow = true;
  g.add(top);
  // cabinet front
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.56, 0.8, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x7b8b94, roughness: 0.7 }),
  );
  cab.position.set(0, -0.44, -0.02);
  g.add(cab);
  return register('counter', g);
}

function makeBackdrop(scene) {
  // backsplash tile
  const tiles = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.7),
    new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.35 }),
  );
  tiles.position.set(0, 0.3, -0.42);
  tiles.receiveShadow = true;
  scene.add(tiles);
  // wall above
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.9 }),
  );
  wall.position.set(0, 1.43, -0.425);
  scene.add(wall);
}

// ---------- assembly ----------

export function buildScene(scene) {
  scene.background = new THREE.Color(0xb9ada0);

  makeBackdrop(scene);
  scene.add(makeCounter());
  makeShelf(scene);

  const pin = makeRollingPin();
  pin.position.set(-0.66, 0, -0.20);
  pin.rotation.y = 0.45;
  scene.add(pin);

  const plate = makePlate();
  plate.position.set(-0.02, 0, 0.10);
  scene.add(plate);

  const bag = makeBreadBag();
  bag.position.set(-0.48, 0, -0.10);
  bag.rotation.y = 0.12;
  scene.add(bag);

  const pb = makePeanutButterJar();
  pb.position.set(0.30, 0, -0.13);
  scene.add(pb);

  const jelly = makeJellyJar();
  jelly.position.set(0.45, 0, -0.09);
  scene.add(jelly);

  const knife = makeKnife();
  knife.position.set(0.26, 0, 0.13);
  knife.rotation.y = -0.35;
  scene.add(knife);

  const leftHand = register('leftHand', makeHand(-1));
  leftHand.position.set(-0.18, 0, 0.27);
  scene.add(leftHand);
  const rightHand = register('rightHand', makeHand(1));
  rightHand.position.set(0.16, 0, 0.27);
  scene.add(rightHand);

  // crumbs scattered around the plate and bag
  const crumbRand = rng(41);
  const crumbMat = new THREE.MeshStandardMaterial({ color: 0xc89858, roughness: 0.9 });
  const crumbGeo = new THREE.SphereGeometry(0.0016, 6, 5);
  const spots = [[-0.02, 0.10, 0.16], [-0.48, -0.10, 0.14], [0.26, 0.13, 0.08]];
  for (const [cx, cz, spread] of spots) {
    for (let i = 0; i < 14; i++) {
      const crumb = new THREE.Mesh(crumbGeo, crumbMat);
      const a = crumbRand() * Math.PI * 2;
      const d = (0.4 + crumbRand() * 0.6) * spread + 0.1;
      crumb.position.set(cx + Math.cos(a) * d, 0.0012, cz + Math.sin(a) * d * 0.7);
      crumb.scale.set(1 + crumbRand(), 0.5, 1 + crumbRand());
      crumb.castShadow = true;
      scene.add(crumb);
    }
  }

  // lights
  const key = new THREE.DirectionalLight(0xfff2dd, 2.9);
  key.position.set(0.9, 1.5, 0.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -1; key.shadow.camera.right = 1;
  key.shadow.camera.top = 1; key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const fill = new THREE.HemisphereLight(0xfdf6ec, 0x6a5340, 0.45);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xdfeaff, 0.7);
  rim.position.set(-0.8, 0.9, -0.6);
  scene.add(rim);

  return objects;
}
