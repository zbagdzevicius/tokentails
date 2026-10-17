/**
 * Overhead bars: one 2D canvas over the game draws every visible unit's health (and shield) bar, hero levels and
 * names. Zero WebGL draw calls; one clear + a few dozen rects per frame. Colours by relation (self gold, ally teal,
 * enemy red, wild sand).
 */
import * as THREE from 'three';
import { BuffFlag } from '../sim/api';
import type { ViewEntity, ViewFrame } from '../render/interp';
import { RELATION_CSS } from '../render/palette';
import { HERO_TEXT } from './heroText';

const LIFT: Record<ViewEntity['kind'], number> = { hero: 1.62, minion: 1.9, tower: 6.4, core: 5.2, fountain: 0, camp: 1.05, pudding: 3.8 };
const SIZE: Record<ViewEntity['kind'], [number, number]> = { hero: [70, 9], minion: [30, 4], tower: [86, 8], core: [120, 10], fountain: [0, 0], camp: [44, 5], pudding: [110, 9] };

export class Overhead {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private readonly v = new THREE.Vector3();
  mySlot = 0;
  myTeam = 0;
  scale = 1;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pl-overhead';
    parent.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.scale = Math.max(0.75, Math.min(1.1, Math.min(w, h) / 720));
  }

  private color(e: ViewEntity): string {
    if (e.id === this.mySlot) return RELATION_CSS.self;
    if (e.team === 2) return RELATION_CSS.neutral;
    return e.team === this.myTeam ? (e.kind === 'hero' ? RELATION_CSS.ally : '#8fd66b') : RELATION_CSS.enemy;
  }

  draw(frame: ViewFrame | null, camera: THREE.Camera, heroScale: (e: ViewEntity) => number): void {
    this.resize();
    const g = this.g;
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!frame) return;
    const v = this.v;
    for (const e of frame.entities) {
      if (e.kind === 'fountain' || e.state === 'dead' || e.maxHp <= 0) continue;
      const lift = LIFT[e.kind] * (e.kind === 'hero' ? heroScale(e) : 1);
      v.set(e.fx / 1000, lift, -e.fy / 1000).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.w;
      const sy = (-v.y * 0.5 + 0.5) * this.h;
      if (sx < -80 || sx > this.w + 80 || sy < -40 || sy > this.h + 40) continue;
      const [bw0, bh0] = SIZE[e.kind];
      const bw = bw0 * this.scale;
      const bh = bh0 * this.scale;
      const x = sx - bw / 2;
      const y = sy - bh / 2;
      const total = Math.max(e.maxHp, e.hp + e.shield);
      const hpW = (Math.max(0, e.hp) / total) * bw;
      const shW = (Math.max(0, e.shield) / total) * bw;
      g.fillStyle = 'rgba(42,26,34,0.82)';
      roundRect(g, x - 2, y - 2, bw + 4, bh + 4, 3);
      g.fill();
      g.fillStyle = this.color(e);
      g.fillRect(x, y, hpW, bh);
      if (shW > 0) {
        g.fillStyle = '#f4f8ff';
        g.fillRect(x + hpW, y, shW, bh);
      }
      if (e.kind === 'hero' || e.kind === 'tower' || e.kind === 'core') {
        // tick marks every 100 HP (heroes) / 500 HP (structures)
        const step = e.kind === 'hero' ? 100 : 500;
        g.fillStyle = 'rgba(42,26,34,0.5)';
        for (let k = step; k < total; k += step) g.fillRect(x + (k / total) * bw, y, 1, k % (step * 5) === 0 ? bh : bh * 0.55);
      }
      if ((e.buffs & BuffFlag.Invulnerable) !== 0 && e.kind !== 'hero') {
        g.strokeStyle = '#9fd3ff';
        g.lineWidth = 1.5;
        g.strokeRect(x - 1, y - 1, bw + 2, bh + 2);
      }
      if (e.kind === 'hero') {
        const lv = String(e.level ?? 1);
        const r = 9 * this.scale;
        g.fillStyle = 'rgba(42,26,34,0.92)';
        g.beginPath();
        g.arc(x - r - 2, sy, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff3dc';
        g.font = `700 ${Math.round(11 * this.scale)}px Fredoka, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(lv, x - r - 2, sy + 0.5);
        const name = e.hero ? HERO_TEXT[e.hero].title : '';
        g.font = `600 ${Math.round(11 * this.scale)}px Fredoka, system-ui, sans-serif`;
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(42,26,34,0.85)';
        g.strokeText(name, sx, y - 9 * this.scale);
        g.fillStyle = this.color(e);
        g.fillText(name, sx, y - 9 * this.scale);
        const status = statusWord(e.buffs);
        if (status) {
          g.font = `700 ${Math.round(10 * this.scale)}px Fredoka, system-ui, sans-serif`;
          g.strokeText(status, sx, y + bh + 10 * this.scale);
          g.fillStyle = '#ffe066';
          g.fillText(status, sx, y + bh + 10 * this.scale);
        }
      }
    }
  }
}

function statusWord(b: number): string {
  if (b & BuffFlag.Stunned) return 'Stunned';
  if (b & BuffFlag.Rooted) return 'Rooted';
  if (b & BuffFlag.Feared) return 'Scared';
  if (b & BuffFlag.Channeling) return 'Napping';
  if (b & BuffFlag.Tethered) return 'Challenged';
  if (b & BuffFlag.Slowed) return 'Slowed';
  return '';
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
