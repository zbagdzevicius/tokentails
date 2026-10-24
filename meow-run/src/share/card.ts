// The share card (SHARE lane): a 1080x1350 PNG (4:5, the feed format) drawn on a 2D canvas over a snapshot of the
// scene. Built when the results show, so SHARE is instant (iOS needs the file ready inside the tap).
import * as THREE from 'three';
import { camera, renderer, scene } from '../core/engine';
import { P } from '../core/player';
import type { StyleSummary } from '../ugc/contract';
import { WATERMARK } from '../ugc/sharekit';
import { fmtInt } from '../ui/format';
import type { Look } from '../wardrobe/look';
import { drawLookOr } from './portrait';

export const CARD_W = 1080;
export const CARD_H = 1350;
const INK = '#2a1c14';
const CREAM = '#fff7ea';
const GOLD = '#ffc21a';
const GOLD2 = '#ffe066';
const ROSE = '#ff4f7b';
const ORANGE = '#ff8a2a';
/** where Mochi sits on the card (the open band between the score and the player row) */
const MOCHI_Y = 820;

export interface CardInfo {
  stage: string;
  score: number;
  kind: 'stars' | 'distance' | 'trail';
  stars: readonly boolean[];
  distance: number;
  trailName: string;
  look: Look;
  name: string;
  style: StyleSummary;
  /** 'BEAT MIA!' sticker (a won challenge), '' = none */
  sticker: string;
  /** a new best */
  best: boolean;
}

let snap: HTMLCanvasElement | null = null;
const proj = new THREE.Vector3();
/** grab the scene now (render + drawImage in the same task: preserveDrawingBuffer is off) */
export function snapshotScene(): void {
  // phones render at pixel ratio 1 on LOW: render this one frame sharper (long edge <= 2048 px), then restore
  const pr0 = renderer.getPixelRatio();
  const want = Math.min(2.5, 2048 / Math.max(innerWidth, innerHeight), Math.max(CARD_W / innerWidth, CARD_H / innerHeight));
  const sharpen = want > pr0 * 1.15;
  try {
    if (sharpen) renderer.setPixelRatio(want);
    renderer.render(scene, camera);
    const src = renderer.domElement;
    if (!src.width || !src.height) return;
    snap ??= document.createElement('canvas');
    snap.width = CARD_W;
    snap.height = CARD_H;
    const c = snap.getContext('2d');
    if (!c) return;
    // cover-crop framed on Mochi: she lands at the card's open middle (between the score and the player row)
    const k = Math.max(CARD_W / src.width, CARD_H / src.height);
    const w = src.width * k;
    const h = src.height * k;
    proj.copy(P.world.pos).addScaledVector(P.world.up, 0.6).project(camera);
    const mx = Number.isFinite(proj.x) && Math.abs(proj.z) <= 1 ? ((proj.x + 1) / 2) * w : w / 2;
    const my = Number.isFinite(proj.y) && Math.abs(proj.z) <= 1 ? ((1 - proj.y) / 2) * h : h * 0.7;
    const ox = Math.max(CARD_W - w, Math.min(0, CARD_W / 2 - mx));
    const oy = Math.max(CARD_H - h, Math.min(0, MOCHI_Y - my));
    c.drawImage(src, ox, oy, w, h);
  } catch (err) {
    console.warn('share card snapshot failed', err);
  } finally {
    if (sharpen) renderer.setPixelRatio(pr0);
  }
}
export const hasSnapshot = () => !!snap;

let fontStack = '';
const font = (w: number, px: number) => `${w} ${px}px ${(fontStack ||= getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif')}`;

function fitFont(c: CanvasRenderingContext2D, text: string, w: number, px: number, max: number, min = 20): number {
  c.font = font(w, px);
  while (px > min && c.measureText(text).width > max) c.font = font(w, (px -= 2));
  return px;
}
/** chunky outlined text (the game's comic style) */
function outlined(c: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string | CanvasGradient, stroke = INK, lw = 12, drop = 8): void {
  c.lineJoin = 'round';
  c.miterLimit = 2;
  if (drop) {
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.lineWidth = lw;
    c.strokeText(text, x, y + drop);
    c.fillText(text, x, y + drop);
  }
  c.strokeStyle = stroke;
  c.lineWidth = lw;
  c.strokeText(text, x, y);
  c.fillStyle = fill;
  c.fillText(text, x, y);
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 10;
  c.strokeStyle = INK;
  c.fillStyle = on ? GOLD : 'rgba(42,28,20,.45)';
  c.save();
  c.translate(0, 7);
  c.stroke();
  c.restore();
  c.stroke();
  c.fill();
  if (on) {
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.beginPath();
    c.ellipse(x - r * 0.18, y - r * 0.28, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2);
    c.fill();
  }
}
function burstShape(c: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number, rot: number): void {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.62);
  }
  c.closePath();
}
function pawIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y + s * 0.18, s * 0.34, s * 0.28, 0, 0, Math.PI * 2);
  c.fill();
  for (const [dx, dy] of [
    [-0.36, -0.12],
    [-0.13, -0.34],
    [0.13, -0.34],
    [0.36, -0.12],
  ]) {
    c.beginPath();
    c.ellipse(x + dx * s, y + dy * s, s * 0.12, s * 0.15, 0, 0, Math.PI * 2);
    c.fill();
  }
}
function pill(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, lw = 8): void {
  c.beginPath();
  c.roundRect(x, y + 6, w, h, h / 2);
  c.fillStyle = INK;
  c.fill();
  c.beginPath();
  c.roundRect(x, y, w, h, h / 2);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = INK;
  c.stroke();
}

/** draw the card (sync) */
export function drawCard(cv: HTMLCanvasElement, info: CardInfo): void {
  cv.width = CARD_W;
  cv.height = CARD_H;
  const c = cv.getContext('2d')!;
  const W = CARD_W;
  const H = CARD_H;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  // ---- background: the scene, warmed, with a vignette and a dark foot for the text
  if (snap) c.drawImage(snap, 0, 0);
  else {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#8fd3ff');
    g.addColorStop(0.55, '#ffd9a0');
    g.addColorStop(1, '#ff8a5a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  c.fillStyle = 'rgba(255,150,60,.14)';
  c.fillRect(0, 0, W, H);
  const v = c.createRadialGradient(W / 2, H * 0.42, H * 0.22, W / 2, H * 0.5, H * 0.78);
  v.addColorStop(0, 'rgba(42,28,20,0)');
  v.addColorStop(1, 'rgba(42,20,10,.62)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  const foot = c.createLinearGradient(0, H * 0.55, 0, H);
  foot.addColorStop(0, 'rgba(36,22,14,0)');
  foot.addColorStop(0.35, 'rgba(36,22,14,.55)');
  foot.addColorStop(1, 'rgba(30,18,10,.9)');
  c.fillStyle = foot;
  c.fillRect(0, H * 0.55, W, H * 0.45);

  // ---- logo
  c.save();
  c.translate(W / 2, 128);
  c.rotate(-0.045);
  c.font = font(900, 118);
  const lg = c.createLinearGradient(0, -100, 0, 10);
  lg.addColorStop(0, GOLD2);
  lg.addColorStop(1, '#ff9a1c');
  outlined(c, 'MEOW RUN!', 0, 0, lg, INK, 18, 12);
  c.restore();

  // ---- score on a comic burst (the stage pill sits on its top spikes)
  c.save();
  burstShape(c, W / 2, 400, 400, 320, 16, 0.12);
  c.fillStyle = 'rgba(255,138,42,.9)';
  c.fill();
  c.lineWidth = 10;
  c.strokeStyle = INK;
  c.stroke();
  c.restore();
  const stagePx = fitFont(c, info.stage, 800, 42, 640);
  const sw = Math.min(760, c.measureText(info.stage).width + 80);
  pill(c, (W - sw) / 2, 170, sw, 68, CREAM);
  c.font = font(800, stagePx);
  c.fillStyle = INK;
  c.fillText(info.stage, W / 2, 218);
  c.font = font(900, 42);
  outlined(c, info.best ? 'NEW BEST!' : 'SCORE', W / 2, 315, info.best ? GOLD2 : CREAM, INK, 10, 5);
  const scoreTxt = fmtInt(info.score);
  const sPx = fitFont(c, scoreTxt, 900, 150, 740, 60);
  c.font = font(900, sPx);
  outlined(c, scoreTxt, W / 2, 315 + sPx * 0.95, CREAM, INK, 20, 12);

  // ---- stars / distance / trail (on the burst's lower edge)
  if (info.kind === 'stars') {
    for (let i = 0; i < 3; i++) star(c, W / 2 + (i - 1) * 140, 575 - (i === 1 ? 16 : 0), i === 1 ? 62 : 52, !!info.stars[i]);
  } else {
    const t = info.kind === 'distance' ? `${fmtInt(info.distance)} m` : `Trail: ${info.trailName || 'my trail'}`;
    const px = fitFont(c, t, 900, 58, 700);
    const w = Math.min(780, c.measureText(t).width + 90);
    pill(c, (W - w) / 2, 528, w, 90, '#24324a');
    c.font = font(900, px);
    c.fillStyle = GOLD2;
    c.fillText(t, W / 2, 592);
  }

  // ---- the player: portrait in a ring, name, style
  const cx = 190;
  const cy = 1048;
  const R = 112;
  c.beginPath();
  c.arc(cx, cy + 8, R + 12, 0, Math.PI * 2);
  c.fillStyle = INK;
  c.fill();
  c.beginPath();
  c.arc(cx, cy, R + 12, 0, Math.PI * 2);
  c.fillStyle = GOLD;
  c.fill();
  c.lineWidth = 8;
  c.strokeStyle = INK;
  c.stroke();
  c.save();
  c.beginPath();
  c.arc(cx, cy, R, 0, Math.PI * 2);
  c.clip();
  const bg = c.createRadialGradient(cx, cy - 30, 16, cx, cy, R);
  bg.addColorStop(0, '#fff7ea');
  bg.addColorStop(1, '#ffd79a');
  c.fillStyle = bg;
  c.fillRect(cx - R, cy - R, R * 2, R * 2);
  drawLookOr(c, info.look, cx - R * 0.98, cy - R * 0.98, R * 1.96);
  c.restore();
  c.textAlign = 'left';
  const name = info.name || 'A Mochi fan';
  const nPx = fitFont(c, name, 900, 72, 640, 34);
  c.font = font(900, nPx);
  outlined(c, name, 340, 1036, CREAM, INK, 12, 6);
  const st = info.style;
  const bits: string[] = [];
  if (st.bestChain > 0) bits.push(`Best combo ${fmtInt(st.bestChain)}`);
  if (st.tricks > 0) bits.push(`${fmtInt(st.tricks)} trick${st.tricks === 1 ? '' : 's'}`);
  if (st.rank && st.rank !== 'C') bits.push(`Rank ${st.rank}`); // shared cards only brag
  const styleTxt = bits.length ? bits.join('  ·  ') : 'Raced Mochi home';
  fitFont(c, styleTxt, 800, 38, 680, 24);
  c.fillStyle = GOLD2;
  c.fillText(styleTxt, 344, 1096);
  c.textAlign = 'center';

  // ---- the dare
  c.save();
  c.translate(W / 2, 1240);
  c.rotate(-0.05);
  c.font = font(900, 70);
  const dw = c.measureText('Can you beat me?').width + 110;
  pill(c, -dw / 2, -62, dw, 104, ROSE, 10);
  outlined(c, 'Can you beat me?', 0, 16, CREAM, INK, 10, 0);
  c.restore();

  // ---- sticker (a won challenge)
  if (info.sticker) {
    c.save();
    c.translate(W - 150, 690);
    c.rotate(0.22);
    burstShape(c, 0, 0, 150, 118, 12, 0);
    c.fillStyle = GOLD;
    c.fill();
    c.lineWidth = 9;
    c.strokeStyle = INK;
    c.stroke();
    const sp = fitFont(c, info.sticker, 900, 46, 220, 22);
    c.font = font(900, sp);
    c.fillStyle = INK;
    c.fillText(info.sticker, 0, sp * 0.35);
    c.restore();
  }

  // ---- footer
  c.font = font(800, 34);
  const fw = c.measureText(WATERMARK).width;
  pawIcon(c, W / 2 - fw / 2 - 30, 1312, 40, ORANGE);
  c.fillStyle = 'rgba(255,247,234,.9)';
  c.fillText(WATERMARK, W / 2 + 16, 1324);
}

export function cardBlob(info: CardInfo): Promise<Blob> {
  const cv = document.createElement('canvas');
  drawCard(cv, info);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}
