// Headless browser-environment stub for the PB&J game.
//
// game.js / scene.js / sounds.js / textures.js / main.js assume a browser:
// window, document, localStorage, AudioContext, speechSynthesis, a 2D canvas,
// and DOM elements with addEventListener/value/style/textContent/etc. Nothing
// here renders — THREE.CanvasTexture wrapping a fake canvas is fine because no
// WebGL context is ever created. We absorb every DOM interaction initGame wires
// up and every audio/speech call sounds.js makes, so the game logic runs intact.

// --- a 2D canvas context where every method is a no-op and every prop is benign.
// textures.js calls fillRect/arc/createRadialGradient/strokeRect/etc. and reads
// nothing back, so a Proxy that returns a callable-and-indexable stub covers all.
function makeCtx2D() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const handler = {
    get(_t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient'
          || prop === 'createPattern') return () => gradient;
      if (prop === 'canvas') return null;
      // measureText is occasionally read; return a width.
      if (prop === 'measureText') return () => ({ width: 0 });
      // Any other property read: a function that is also indexable. Most are
      // methods (fillRect, arc, ...); a few are assigned (fillStyle, font...).
      return noopProxy;
    },
    set() { return true; },
  };
  const noopProxy = new Proxy(noop, handler);
  return new Proxy(noop, handler);
}

function makeCanvas() {
  return {
    width: 1, height: 1,
    getContext: () => makeCtx2D(),
    // toDataURL is read by some texture paths; harmless string.
    toDataURL: () => 'data:,',
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
  };
}

// --- inert DOM element: everything initGame and speak()/addHistory() touch.
function makeElement(tag = 'div') {
  if (tag === 'canvas') return makeCanvas();
  const el = {
    tagName: String(tag).toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    prepend(c) { this.children.unshift(c); return c; },
    setSelectionRange() {},
    focus() {},
    setAttribute() {},
    getAttribute() { return null; },
    remove() {},
  };
  return el;
}

export function installEnv() {
  const g = globalThis;

  // localStorage (sounds.js reads/writes 'pbj-audio')
  const store = new Map();
  g.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };

  // document
  const elements = new Map();
  g.document = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, makeElement('div'));
      return elements.get(id);
    },
    createElement: (tag) => makeElement(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    body: makeElement('body'),
  };

  // window === globalThis for the bits the game reads off `window.`
  g.window = g;
  g.__timeScale = 0.01; // fast-forward all durations
  g.addEventListener = () => {};
  g.removeEventListener = () => {};
  g.visualViewport = null;
  g.innerWidth = 1280;
  g.innerHeight = 720;
  g.devicePixelRatio = 1;
  g.SpeechRecognition = undefined;       // mic path disabled (mic.style.display = 'none')
  g.webkitSpeechRecognition = undefined;

  // performance (main.js uses it; we don't load main.js, but be safe)
  if (!g.performance) g.performance = { now: () => Date.now() };

  // Audio: sounds.js guards on `typeof AudioContext !== 'undefined'`. Leave it
  // undefined so ac() returns null and every sfx() is a guarded no-op. Cleanest.
  // (Do NOT define AudioContext — that would force us to stub the whole graph.)

  // Speech: sounds.js guards on `typeof speechSynthesis !== 'undefined'`. Leave
  // undefined so sayAloud() short-circuits. SpeechSynthesisUtterance likewise.

  // requestAnimationFrame isn't used by game.js (only main.js); stub anyway.
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}
