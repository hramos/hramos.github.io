// Procedural canvas textures — no external assets needed.
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Deterministic pseudo-random so renders are reproducible.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function woodTexture() {
  const [c, g] = makeCanvas(1024, 1024);
  const rand = rng(7);
  g.fillStyle = '#8a5a33';
  g.fillRect(0, 0, 1024, 1024);
  // planks
  const plankH = 1024 / 5;
  for (let p = 0; p < 5; p++) {
    const y0 = p * plankH;
    const base = 110 + rand() * 30;
    g.fillStyle = `rgb(${base + 30},${base - 18},${base - 60})`;
    g.fillRect(0, y0, 1024, plankH);
    // grain streaks
    for (let i = 0; i < 70; i++) {
      const y = y0 + rand() * plankH;
      const alpha = 0.05 + rand() * 0.12;
      const dark = rand() > 0.5;
      g.strokeStyle = dark ? `rgba(60,35,15,${alpha})` : `rgba(220,180,130,${alpha})`;
      g.lineWidth = 1 + rand() * 3;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 64) {
        g.lineTo(x, y + Math.sin(x * 0.01 + rand() * 6) * 6 + (rand() - 0.5) * 4);
      }
      g.stroke();
    }
    // plank seam
    g.fillStyle = 'rgba(40,22,8,0.6)';
    g.fillRect(0, y0 + plankH - 2, 1024, 2);
  }
  return toTexture(c, 2, 2);
}

export function crumbTexture(seed = 3) {
  // Bread interior: warm ivory with little air pockets.
  const [c, g] = makeCanvas(512, 512);
  const rand = rng(seed);
  const grad = g.createRadialGradient(256, 256, 60, 256, 256, 360);
  grad.addColorStop(0, '#f3dfb2');
  grad.addColorStop(1, '#e8cd93');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * 512, y = rand() * 512;
    const r = 0.6 + rand() * 2.6;
    g.fillStyle = `rgba(${190 + rand() * 30 | 0},${160 + rand() * 30 | 0},${110 + rand() * 30 | 0},${0.25 + rand() * 0.4})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // soft darker ring near the crust edge
  g.strokeStyle = 'rgba(150,95,40,0.75)';
  g.lineWidth = 40;
  g.strokeRect(8, 8, 496, 496);
  g.strokeStyle = 'rgba(120,70,25,0.5)';
  g.lineWidth = 14;
  g.strokeRect(4, 4, 504, 504);
  return toTexture(c);
}

export function crustTexture(seed = 5) {
  const [c, g] = makeCanvas(512, 128);
  const rand = rng(seed);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#b97a3c');
  grad.addColorStop(0.5, '#a8642a');
  grad.addColorStop(1, '#b97a3c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 900; i++) {
    const x = rand() * 512, y = rand() * 128;
    g.fillStyle = `rgba(${120 + rand() * 60 | 0},${70 + rand() * 40 | 0},${30 + rand() * 20 | 0},${0.15 + rand() * 0.3})`;
    g.beginPath(); g.arc(x, y, 0.5 + rand() * 1.8, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c, 4, 1);
}

export function labelTexture({ title, sub, bg, accent, text }) {
  const [c, g] = makeCanvas(1024, 512);
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 512);
  // bands
  g.fillStyle = accent;
  g.fillRect(0, 0, 1024, 56);
  g.fillRect(0, 456, 1024, 56);
  // title
  g.fillStyle = text;
  g.textAlign = 'center';
  g.font = 'bold 92px Georgia, serif';
  g.fillText(title, 512, 230);
  g.font = 'bold 54px Georgia, serif';
  g.fillText(sub, 512, 320);
  // ornament
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(312, 270); g.lineTo(712, 270); g.stroke();
  g.font = '36px Georgia, serif';
  g.fillText('NET WT 16 OZ (454g)', 512, 415);
  return toTexture(c);
}

export function tileTexture() {
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#dfe7e6';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#b8c4c2';
  g.lineWidth = 6;
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const p = (i * 512) / n;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke();
  }
  return toTexture(c, 6, 3);
}

export function jellyTexture() {
  const [c, g] = makeCanvas(256, 256);
  const rand = rng(11);
  g.fillStyle = '#4a1140';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(${120 + rand() * 60 | 0},${20 + rand() * 30 | 0},${100 + rand() * 60 | 0},${0.2 + rand() * 0.3})`;
    g.beginPath(); g.arc(rand() * 256, rand() * 256, 2 + rand() * 9, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c);
}

export function peanutButterTexture() {
  const [c, g] = makeCanvas(256, 256);
  const rand = rng(13);
  g.fillStyle = '#b97f3e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${160 + rand() * 50 | 0},${110 + rand() * 40 | 0},${50 + rand() * 30 | 0},${0.15 + rand() * 0.25})`;
    g.beginPath(); g.arc(rand() * 256, rand() * 256, 2 + rand() * 7, 0, Math.PI * 2); g.fill();
  }
  // swirl highlights
  g.strokeStyle = 'rgba(230,180,110,0.35)';
  g.lineWidth = 5;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc(128, 128, 18 + i * 14, rand() * 6, rand() * 6 + 2 + rand() * 2);
    g.stroke();
  }
  return toTexture(c);
}

export function bagPrintTexture() {
  // Bread-bag plastic print: mostly clear with brand blobs.
  const [c, g] = makeCanvas(1024, 512);
  g.clearRect(0, 0, 1024, 512);
  g.fillStyle = 'rgba(214,57,57,0.92)';
  g.beginPath();
  g.ellipse(512, 256, 250, 130, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fffdf5';
  g.textAlign = 'center';
  g.font = 'bold italic 120px Georgia, serif';
  g.fillText('Sunny', 512, 235);
  g.font = 'bold 70px Georgia, serif';
  g.fillText('WHITE BREAD', 512, 330);
  // little colored dots like a classic bread bag
  const rand = rng(17);
  const colors = ['#f4c531', '#3a7bd5', '#d63939', '#3fa34d'];
  for (let i = 0; i < 40; i++) {
    g.fillStyle = colors[i % colors.length];
    g.globalAlpha = 0.85;
    g.beginPath();
    g.arc(rand() * 1024, rand() * 512, 8 + rand() * 10, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = toTexture(c);
  return tex;
}
