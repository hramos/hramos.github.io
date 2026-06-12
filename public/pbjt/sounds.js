// Procedural audio: every sound is synthesized with WebAudio — no asset files.
// Also: the chef speaks responses aloud via the SpeechSynthesis API.

let ctx = null;
let enabled = (typeof localStorage !== 'undefined' && localStorage.getItem('pbj-audio') !== 'off');

function ac() {
  if (!ctx && typeof AudioContext !== 'undefined') ctx = new AudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function audioEnabled() { return enabled; }
export function setAudioEnabled(on) {
  enabled = on;
  try { localStorage.setItem('pbj-audio', on ? 'on' : 'off'); } catch { /* private mode */ }
  if (!on && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

function noiseBuffer(c, seconds = 0.5) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(c, { freq = 440, type = 'sine', dur = 0.15, gain = 0.2, slideTo = null, delay = 0 }) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(c, { dur = 0.2, gain = 0.15, filterType = 'lowpass', freq = 800, slideTo = null, delay = 0 }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, Math.min(dur + 0.1, 1));
  const f = c.createBiquadFilter();
  f.type = filterType;
  const t0 = c.currentTime + delay;
  f.frequency.setValueAtTime(freq, t0);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 10), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const RECIPES = {
  thud:   (c) => { tone(c, { freq: 90, dur: 0.12, gain: 0.3, slideTo: 50 }); noise(c, { dur: 0.06, gain: 0.1, freq: 300 }); },
  tap:    (c) => { noise(c, { dur: 0.03, gain: 0.15, filterType: 'highpass', freq: 1200 }); tone(c, { freq: 600, dur: 0.04, gain: 0.08 }); },
  pop:    (c) => { tone(c, { freq: 320, slideTo: 700, dur: 0.09, gain: 0.25 }); noise(c, { dur: 0.04, gain: 0.1, freq: 2000, filterType: 'highpass' }); },
  clink:  (c) => { tone(c, { freq: 1800, dur: 0.1, gain: 0.12 }); tone(c, { freq: 2712, dur: 0.08, gain: 0.06 }); },
  rip:    (c) => { noise(c, { dur: 0.35, gain: 0.3, filterType: 'bandpass', freq: 900, slideTo: 2400 }); },
  swoosh: (c) => { noise(c, { dur: 0.25, gain: 0.12, filterType: 'bandpass', freq: 400, slideTo: 1600 }); },
  squish: (c) => { noise(c, { dur: 0.22, gain: 0.18, freq: 500, slideTo: 120 }); },
  splat:  (c) => { tone(c, { freq: 200, slideTo: 60, dur: 0.12, gain: 0.2 }); noise(c, { dur: 0.15, gain: 0.18, freq: 700, slideTo: 150 }); },
  shake:  (c) => { for (let i = 0; i < 3; i++) noise(c, { dur: 0.05, gain: 0.12, filterType: 'highpass', freq: 3000, delay: i * 0.09 }); },
  saw:    (c) => { for (let i = 0; i < 4; i++) noise(c, { dur: 0.08, gain: 0.1, filterType: 'bandpass', freq: 1100, delay: i * 0.12 }); },
  rattle: (c) => { for (let i = 0; i < 6; i++) tone(c, { freq: 700 + (i % 3) * 180, type: 'square', dur: 0.03, gain: 0.04, delay: i * 0.05 }); },
  win:    (c) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, { freq: f, type: 'triangle', dur: 0.18, gain: 0.14, delay: i * 0.12 })); },
  sad:    (c) => { tone(c, { freq: 300, slideTo: 150, type: 'triangle', dur: 0.4, gain: 0.1 }); },
  boing:  (c) => { tone(c, { freq: 150, slideTo: 500, type: 'sine', dur: 0.18, gain: 0.15 }); },
};

export function sfx(name) {
  if (!enabled) return;
  try {
    const c = ac();
    if (!c) return;
    (RECIPES[name] || RECIPES.tap)(c);
  } catch { /* audio is garnish, never break the game for it */ }
}

// ---------- the chef's voice ----------

let voice = null;
function pickVoice() {
  if (voice || typeof speechSynthesis === 'undefined') return voice;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => /en[-_]US/.test(v.lang) && /Google|Samantha|Alex|Daniel/.test(v.name))
    || vs.find((v) => /^en/.test(v.lang)) || null;
  return voice;
}
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function sayAloud(text) {
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.cancel();
    // asterisk stage directions read better with a beat: "*RIPS the bag open*" → "RIPS the bag open."
    const spoken = text.replace(/\*(.+?)\*/g, '$1.').replace(/[⟨⟩🎉]/g, '');
    const u = new SpeechSynthesisUtterance(spoken);
    u.rate = 1.06;
    u.pitch = 1.0;
    const v = pickVoice();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* same: garnish */ }
}
