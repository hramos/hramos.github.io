import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildScene, objects } from './scene.js';
import { initGame, tickGame } from './game.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

buildScene(scene);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;

// ---------- named inspection views ----------
const VIEWS = {
  hero:     { pos: [0.5, 0.55, 0.95], target: [0, 0.18, -0.05] },
  overhead: { pos: [0, 1.05, 0.12], target: [0, 0, 0.05] },
  front:    { pos: [0, 0.16, 0.85], target: [0, 0.05, 0] },
  plate:    { pos: [0.12, 0.22, 0.38], target: [-0.02, 0.01, 0.10] },
  jars:     { pos: [0.38, 0.16, 0.22], target: [0.375, 0.06, -0.11] },
  bag:      { pos: [-0.45, 0.22, 0.28], target: [-0.48, 0.06, -0.10] },
  knife:    { pos: [0.26, 0.18, 0.32], target: [0.26, 0.0, 0.13] },
  hands:    { pos: [0.0, 0.22, 0.58], target: [0.0, 0.02, 0.27] },
  low:      { pos: [-0.35, 0.08, 0.55], target: [0, 0.05, 0] },
  shelf:    { pos: [0, 0.64, 0.62], target: [0, 0.60, -0.33] },
};

initGame(scene, { camera, controls });

function setView(name) {
  const v = VIEWS[name];
  if (!v) return false;
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
  return true;
}
setView('hero');

// hooks for the screenshot harness
window.__views = Object.keys(VIEWS);
window.__setView = setView;
window.__objects = objects;
window.__THREE = THREE;
window.__scene = scene;
window.__camera = camera;
window.__ready = false;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let frames = 0;
let lastFrame = 0;
const clock = new THREE.Clock();
function renderFrame() {
  lastFrame = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05);
  tickGame(dt);
  controls.update();
  renderer.render(scene, camera);
  frames++;
  if (frames === 3) window.__ready = true;
}
renderer.setAnimationLoop(renderFrame);
// rAF can stall in headless or heavily-throttled tabs — keep the world ticking
setInterval(() => { if (performance.now() - lastFrame > 200) renderFrame(); }, 100);
