// Mochi's comic portrait, drawn on a 2D canvas (no image files). META-UI lane.
// Used by the HUD reaction panel, the title mascot and the results card. Moods follow GameEvents['react'].
export type Mood = 'nom' | 'wow' | 'ouch' | 'happy' | 'scared' | 'idle' | 'sleepy';

const INK = '#2a1c14';
const ORANGE = '#ff9a3c';
const ORANGE_D = '#e06a1c';
const CREAM = '#fff7ea';
const PINK = '#ff8fab';

const BG: Record<Mood, [string, string]> = {
  nom: ['#ffe680', '#ffb52e'],
  wow: ['#fff3a6', '#ffc21a'],
  ouch: ['#ff9aa8', '#ff4f7b'],
  happy: ['#bdf0ff', '#4cc3ff'],
  scared: ['#d9c8ff', '#8a6cff'],
  idle: ['#c8f5b0', '#7ccf5a'],
  sleepy: ['#ffd2a6', '#ff8a5a'],
};

function rays(c: CanvasRenderingContext2D, w: number, h: number, mood: Mood, t: number): void {
  const [a, b] = BG[mood];
  c.fillStyle = a;
  c.fillRect(0, 0, w, h);
  c.save();
  c.translate(w / 2, h * 0.55);
  c.rotate(t * 0.4);
  c.fillStyle = b;
  const n = 14;
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.moveTo(0, 0);
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + Math.PI / n;
    c.lineTo(Math.cos(a0) * w, Math.sin(a0) * w);
    c.lineTo(Math.cos(a1) * w, Math.sin(a1) * w);
    c.closePath();
    c.fill();
  }
  c.restore();
  // halftone dots in the corner
  c.fillStyle = 'rgba(42,28,20,.12)';
  for (let y = 0; y < h * 0.45; y += w * 0.07)
    for (let x = 0; x < w * 0.45; x += w * 0.07) {
      const r = w * 0.022 * (1 - (x + y) / (w * 0.9));
      if (r > 0.3) {
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
}

function eye(c: CanvasRenderingContext2D, x: number, y: number, r: number, mood: Mood, t: number, flip: number): void {
  c.lineWidth = r * 0.42;
  c.strokeStyle = INK;
  c.lineCap = 'round';
  if (mood === 'happy' || mood === 'nom') {
    // ^ ^ closed happy eyes
    c.beginPath();
    c.arc(x, y + r * 0.35, r * 0.8, Math.PI * 1.15, Math.PI * 1.85);
    c.stroke();
    return;
  }
  if (mood === 'ouch') {
    // > <
    c.beginPath();
    c.moveTo(x - r * 0.7 * flip, y - r * 0.6);
    c.lineTo(x + r * 0.5 * flip, y);
    c.lineTo(x - r * 0.7 * flip, y + r * 0.6);
    c.stroke();
    return;
  }
  if (mood === 'sleepy') {
    c.beginPath();
    c.moveTo(x - r * 0.8, y);
    c.quadraticCurveTo(x, y + r * 0.5, x + r * 0.8, y);
    c.stroke();
    return;
  }
  const big = mood === 'wow' ? 1.25 : mood === 'scared' ? 1.15 : 1;
  const blink = mood === 'idle' && (t % 3.2) > 3.05 ? 0.15 : 1;
  c.fillStyle = INK;
  c.beginPath();
  c.ellipse(x, y, r * big, r * 1.15 * big * blink, 0, 0, Math.PI * 2);
  c.fill();
  if (blink < 1) return;
  // sparkles
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(x - r * 0.35 * big, y - r * 0.4 * big, r * 0.38 * big, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(x + r * 0.3 * big, y + r * 0.35 * big, r * 0.16 * big, 0, Math.PI * 2);
  c.fill();
  if (mood === 'wow') {
    // a star glint
    c.fillStyle = '#ffe14d';
    star(c, x + r * 0.2, y - r * 0.1, r * 0.35, t * 3);
  }
  if (mood === 'scared') {
    c.fillStyle = INK;
    c.beginPath();
    c.arc(x, y, r * 0.3, 0, Math.PI * 2);
    c.fill();
  }
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

/** Draw Mochi's face filling a w x h canvas. t = seconds (animation). */
export function drawPortrait(c: CanvasRenderingContext2D, w: number, h: number, mood: Mood, t: number, opts: { bg?: boolean } = {}): void {
  c.clearRect(0, 0, w, h);
  if (opts.bg !== false) rays(c, w, h, mood, t);
  const u = w / 100;
  const bob = mood === 'nom' ? Math.sin(t * 18) * 1.5 * u : mood === 'scared' ? Math.sin(t * 40) * 0.8 * u : Math.sin(t * 3) * 0.8 * u;
  const tilt = mood === 'happy' ? Math.sin(t * 4) * 0.08 : mood === 'ouch' ? -0.12 : 0;
  c.save();
  c.translate(w / 2, h * 0.6 + bob);
  c.rotate(tilt);
  c.lineJoin = 'round';
  c.lineWidth = 3.2 * u;
  c.strokeStyle = INK;
  // ears
  for (const s of [-1, 1]) {
    c.fillStyle = ORANGE;
    c.beginPath();
    c.moveTo(s * 34 * u, -14 * u);
    c.lineTo(s * 30 * u, -50 * u + (mood === 'scared' ? 6 * u : 0));
    c.lineTo(s * 8 * u, -30 * u);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = PINK;
    c.beginPath();
    c.moveTo(s * 28 * u, -20 * u);
    c.lineTo(s * 27 * u, -40 * u);
    c.lineTo(s * 15 * u, -29 * u);
    c.closePath();
    c.fill();
  }
  // head
  c.fillStyle = ORANGE;
  c.beginPath();
  c.ellipse(0, 0, 40 * u, 33 * u, 0, 0, Math.PI * 2);
  c.fill();
  // tabby stripes
  c.fillStyle = ORANGE_D;
  for (const dx of [-9, 0, 9]) {
    c.beginPath();
    c.ellipse(dx * u, -27 * u, 3 * u, 7 * u, dx * 0.03, 0, Math.PI * 2);
    c.fill();
  }
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * 36 * u, -2 * u, 5 * u, 2.2 * u, 0, 0, Math.PI * 2);
    c.fill();
  }
  // white muzzle blaze
  c.fillStyle = CREAM;
  c.beginPath();
  c.moveTo(0, -24 * u);
  c.bezierCurveTo(10 * u, -8 * u, 28 * u, 6 * u, 24 * u, 18 * u);
  c.bezierCurveTo(14 * u, 34 * u, -14 * u, 34 * u, -24 * u, 18 * u);
  c.bezierCurveTo(-28 * u, 6 * u, -10 * u, -8 * u, 0, -24 * u);
  c.fill();
  // outline
  c.beginPath();
  c.ellipse(0, 0, 40 * u, 33 * u, 0, 0, Math.PI * 2);
  c.stroke();
  // eyes
  eye(c, -15 * u, -4 * u, 5.5 * u, mood, t, 1);
  eye(c, 15 * u, -4 * u, 5.5 * u, mood, t, -1);
  // blush
  c.fillStyle = 'rgba(255,110,140,.55)';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * 25 * u, 8 * u, 6 * u, 3.5 * u, 0, 0, Math.PI * 2);
    c.fill();
  }
  // nose
  c.fillStyle = PINK;
  c.beginPath();
  c.moveTo(-4 * u, 5 * u);
  c.lineTo(4 * u, 5 * u);
  c.lineTo(0, 9 * u);
  c.closePath();
  c.fill();
  c.lineWidth = 1.6 * u;
  c.stroke();
  // mouth
  c.lineWidth = 2.4 * u;
  c.beginPath();
  if (mood === 'nom' || mood === 'wow' || mood === 'scared') {
    const open = mood === 'nom' ? 5 + Math.abs(Math.sin(t * 18)) * 6 : mood === 'wow' ? 9 : 7;
    c.fillStyle = '#7a1f2e';
    c.ellipse(0, 15 * u, 6 * u, open * u * 0.7, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = PINK;
    c.beginPath();
    c.ellipse(0, (15 + open * 0.35) * u, 3.5 * u, 2 * u, 0, 0, Math.PI * 2);
    c.fill();
  } else if (mood === 'ouch') {
    c.moveTo(-7 * u, 16 * u);
    for (let i = 0; i < 4; i++) c.lineTo((-7 + (i + 0.5) * 3.5) * u, (i % 2 ? 16 : 13) * u);
    c.lineTo(7 * u, 16 * u);
    c.stroke();
  } else {
    c.moveTo(-8 * u, 11 * u);
    c.quadraticCurveTo(-4 * u, 16 * u, 0, 11 * u);
    c.quadraticCurveTo(4 * u, 16 * u, 8 * u, 11 * u);
    c.stroke();
  }
  // whiskers
  c.lineWidth = 1.4 * u;
  for (const s of [-1, 1])
    for (const k of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 20 * u, (10 + k * 2) * u);
      c.lineTo(s * 44 * u, (8 + k * 6) * u);
      c.stroke();
    }
  // mood extras
  if (mood === 'nom') {
    // a fish snack in the mouth
    c.fillStyle = '#7fd0ff';
    c.lineWidth = 2 * u;
    c.beginPath();
    c.ellipse(16 * u, 18 * u, 10 * u, 4.5 * u, -0.3, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(25 * u, 13 * u);
    c.lineTo(32 * u, 9 * u);
    c.lineTo(31 * u, 18 * u);
    c.closePath();
    c.fill();
    c.stroke();
  }
  if (mood === 'scared' || mood === 'ouch') {
    c.fillStyle = '#9fe2ff';
    c.lineWidth = 1.6 * u;
    c.beginPath();
    c.moveTo(36 * u, -26 * u);
    c.quadraticCurveTo(43 * u, -14 * u, 36 * u, -12 * u);
    c.quadraticCurveTo(29 * u, -14 * u, 36 * u, -26 * u);
    c.fill();
    c.stroke();
  }
  if (mood === 'ouch') {
    c.fillStyle = '#ffe14d';
    for (let i = 0; i < 3; i++) star(c, Math.cos(t * 5 + i * 2.1) * 30 * u, -40 * u + Math.sin(t * 5 + i * 2.1) * 5 * u, 5 * u, t * 4);
  }
  if (mood === 'sleepy') {
    c.fillStyle = INK;
    c.font = `900 ${14 * u}px system-ui, sans-serif`;
    c.fillText('z', 30 * u, -36 * u - (t * 8 % 10) * u);
  }
  c.restore();
  // comic panel border
  if (opts.bg !== false) {
    c.lineWidth = 6 * u;
    c.strokeStyle = INK;
    c.strokeRect(0, 0, w, h);
  }
}

/** A canvas element with the portrait drawn once (HiDPI aware). */
export function portraitCanvas(size: number, mood: Mood, bg = true): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const c = cv.getContext('2d');
  if (c) drawPortrait(c, cv.width, cv.height, mood, 0, { bg });
  return cv;
}
