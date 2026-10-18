/**
 * Overhead bars: one 2D canvas over the game draws every visible unit's health (and shield) bar, hero levels and
 * names. Zero WebGL draw calls; one clear + a few dozen rects per frame. Colours by relation, one encoding with the
 * rings and the minimap (self gold, allies rose, enemies blue, wild sand); minion bars are thinner, shorter and paler.
 *
 * Layering and declutter (teamfights): minion and structure bars draw first, then hero plates (enemies, allies, and
 * the player's own plate last, always on top). Hero plates are laid out in screen space: the player's plate stays on
 * its hero, and any other plate that would overlap one already placed moves up by a plate height (two heroes on one
 * spot get two readable plates, plus a "×2" chip on the lower one). Status (Rooted, Challenged...) is a small chip
 * right of the bar, not a text line under it, so a stacked plate never runs into the one below.
 *
 * Names: the player's plate reads "You"; when the same hero plays on both sides (bots may mirror a pick, POC.md
 * §6.8), the enemy copy carries its team name ("Woof Sage"), so two Sages never share one label.
 */
import * as THREE from 'three';
import { BuffFlag } from '../sim/api';
import type { ViewEntity, ViewFrame } from '../render/interp';
import { MINION_BAR_CSS, RELATION_CSS, TEAM } from '../render/palette';
import { HERO_TEXT } from './heroText';

const LIFT: Record<ViewEntity['kind'], number> = { hero: 1.62, minion: 1.9, tower: 6.4, core: 5.2, fountain: 0, camp: 1.05, pudding: 3.8, pickup: 0 };
const SIZE: Record<ViewEntity['kind'], [number, number]> = { hero: [70, 9], minion: [24, 3], tower: [86, 8], core: [120, 10], fountain: [0, 0], camp: [44, 5], pudding: [110, 9], pickup: [0, 0] };

interface Plate {
  e: ViewEntity;
  sx: number;
  sy: number;
  /** Draw order: 0 minions / camps, 1 structures, 2 enemy heroes, 3 ally heroes, 4 the player. */
  layer: number;
  /** Screen-space offset (px) from the declutter pass. */
  dy: number;
  stacked: number;
  /** Another hero's plate was lifted off this one (draw the ×2 chip). */
  chip: boolean;
}

/** Hero plate box (px, relative to the bar centre) used by the declutter pass: name above, level badge left. */
export function plateBox(scale: number): { left: number; right: number; top: number; bottom: number } {
  const bw = SIZE.hero[0] * scale;
  const r = 9 * scale;
  return { left: -bw / 2 - 2 * r - 4, right: bw / 2 + 2, top: -SIZE.hero[1] * scale / 2 - 16 * scale, bottom: SIZE.hero[1] * scale / 2 + 3 };
}

/**
 * Screen-space stacking (pure): plates in priority order (the first stays put); each later plate moves up by the
 * plate height above the plate it overlaps until it overlaps none placed before it. Returns the offsets (px, negative = up) and stack depths.
 */
export function declutter(pts: readonly { x: number; y: number }[], scale: number, maxSteps = 4): { dy: number; depth: number }[] {
  const b = plateBox(scale);
  const h = b.bottom - b.top + 2;
  const placed: { x: number; y: number }[] = [];
  const out: { dy: number; depth: number }[] = [];
  for (const p of pts) {
    let y = p.y;
    let depth = 0;
    for (let step = 0; step < maxSteps; step++) {
      const hit = placed.find((q) => Math.abs(q.x - p.x) < b.right - b.left && Math.abs(q.y - y) < h);
      if (!hit) break;
      // sit right above the plate it overlaps
      y = hit.y - h;
      depth++;
    }
    placed.push({ x: p.x, y });
    out.push({ dy: y - p.y, depth });
  }
  return out;
}

export class Overhead {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private readonly v = new THREE.Vector3();
  private plates: Plate[] = [];
  mySlot = 0;
  myTeam = 0;
  scale = 1;
  /** Heroes picked on both teams this frame (their enemy copy gets a team prefix). */
  private mirrored = new Set<string>();
  /** Tower-to-hero warning beams (a tower is hitting the player): src and dst ids, seconds left. */
  private beams: { src: number; dst: number; t: number }[] = [];
  private lastDraw = 0;

  /** First match: a chevron trail on the ground from the player toward this point (sim mm), or null. */
  guide: { x: number; y: number } | null = null;

  /** Bounty crown per hero slot (fun plan F2 item 11): > 0 draws a gold crown over the plate. */
  bounty: (slot: number) => number = () => 0;

  /** Tower lock-ons (fun plan S5 / F2 item 9): src tower → dst hero, seconds left of `total`. */
  private locks: { src: number; dst: number; t: number; total: number }[] = [];

  /** An enemy tower is aiming at `dst` for `seconds`: a red line that thickens, and a ring under the hero. */
  lockOn(src: number, dst: number, seconds: number): void {
    const s = Math.max(0.2, seconds);
    const l = this.locks.find((q) => q.src === src && q.dst === dst);
    if (l) {
      l.t = s;
      l.total = s;
    } else this.locks.push({ src, dst, t: s, total: s });
  }

  /** Drop every lock-on aimed at `dst` (the player died, respawned or walked away). */
  clearLocks(dst: number): void {
    this.locks = this.locks.filter((l) => l.dst !== dst);
  }

  /** Draw a red beam from a tower to the hero it hits, for a moment. */
  beam(src: number, dst: number, seconds = 0.7): void {
    const b = this.beams.find((q) => q.src === src && q.dst === dst);
    if (b) b.t = seconds;
    else this.beams.push({ src, dst, t: seconds });
  }

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
    const ours = e.team === this.myTeam;
    if (e.kind === 'minion') return ours ? MINION_BAR_CSS.ally : MINION_BAR_CSS.enemy;
    return ours ? RELATION_CSS.ally : RELATION_CSS.enemy;
  }

  private layerOf(e: ViewEntity): number {
    if (e.kind !== 'hero') return e.kind === 'tower' || e.kind === 'core' || e.kind === 'pudding' ? 1 : 0;
    if (e.id === this.mySlot) return 4;
    return e.team === this.myTeam ? 3 : 2;
  }

  draw(frame: ViewFrame | null, camera: THREE.Camera, heroScale: (e: ViewEntity) => number): void {
    this.resize();
    const g = this.g;
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (!frame) return;
    const v = this.v;
    const plates = this.plates;
    plates.length = 0;
    const seen: [Set<string>, Set<string>] = [new Set(), new Set()];
    this.mirrored.clear();
    for (const e of frame.entities) if (e.kind === 'hero' && e.hero && (e.team === 0 || e.team === 1)) seen[e.team].add(e.hero);
    for (const h of seen[0]) if (seen[1].has(h)) this.mirrored.add(h);
    for (const e of frame.entities) {
      if (e.kind === 'fountain' || e.state === 'dead' || e.maxHp <= 0 || !SIZE[e.kind] || SIZE[e.kind][0] === 0) continue;
      const lift = LIFT[e.kind] * (e.kind === 'hero' ? heroScale(e) : 1);
      v.set(e.fx / 1000, lift, -e.fy / 1000).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const sx = (v.x * 0.5 + 0.5) * this.w;
      const sy = (-v.y * 0.5 + 0.5) * this.h;
      if (sx < -80 || sx > this.w + 80 || sy < -40 || sy > this.h + 40) continue;
      plates.push({ e, sx, sy, layer: this.layerOf(e), dy: 0, stacked: 0, chip: false });
    }
    // heroes: the player's plate first (stays on its hero), then allies, then enemies; lower plates on screen first
    const heroes = plates.filter((p) => p.layer >= 2).sort((a, b) => b.layer - a.layer || b.sy - a.sy);
    const lay = declutter(
      heroes.map((p) => ({ x: p.sx, y: p.sy })),
      this.scale,
    );
    heroes.forEach((p, i) => {
      p.dy = lay[i].dy;
      p.stacked = lay[i].depth;
    });
    // ×2 chips: a plate that had to move marks the plate it sits over
    for (let i = 0; i < heroes.length; i++) {
      if (heroes[i].stacked === 0) continue;
      const below = heroes.find((q, k) => k < i && Math.abs(q.sx - heroes[i].sx) < 40 * this.scale && Math.abs(q.sy - heroes[i].sy) < 30 * this.scale);
      if (below) below.chip = true;
    }
    plates.sort((a, b) => a.layer - b.layer);
    this.drawBeams(g, frame, camera, heroScale);
    this.drawLocks(g, frame, camera, heroScale);
    this.drawGuide(g, frame, camera);
    for (const p of plates) this.plate(g, p);
    for (const p of heroes) if (this.bounty(p.e.id) > 0) this.crown(g, p.sx, p.sy + p.dy - 15 * this.scale);
  }

  /** A small gold crown (bounty). */
  private crown(g: CanvasRenderingContext2D, x: number, y: number): void {
    const s = 9 * this.scale;
    const bob = Math.sin(performance.now() / 220) * 1.5;
    g.save();
    g.translate(x, y + bob);
    g.fillStyle = '#ffd34d';
    g.strokeStyle = '#4a2a1f';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-s, s * 0.5);
    g.lineTo(-s, -s * 0.4);
    g.lineTo(-s * 0.5, s * 0.05);
    g.lineTo(0, -s * 0.7);
    g.lineTo(s * 0.5, s * 0.05);
    g.lineTo(s, -s * 0.4);
    g.lineTo(s, s * 0.5);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }

  private drawLocks(g: CanvasRenderingContext2D, frame: ViewFrame, camera: THREE.Camera, heroScale: (e: ViewEntity) => number): void {
    if (!this.locks.length) return;
    const dt = 1 / 60;
    for (const l of this.locks) {
      l.t -= dt;
      const s = frame.byId.get(l.src);
      const d = frame.byId.get(l.dst);
      if (!s || !d || s.state === 'dead' || d.state === 'dead') {
        l.t = -1;
        continue;
      }
      // out of the tower's reach (it re-targets): the lock-on is over
      if (Math.hypot(s.fx - d.fx, s.fy - d.fy) > 10000) {
        l.t = -1;
        continue;
      }
      const p0 = this.v.set(s.fx / 1000, s.kind === 'core' ? 4.5 : 5.6, -s.fy / 1000).project(camera);
      const x0 = (p0.x * 0.5 + 0.5) * this.w;
      const y0 = (-p0.y * 0.5 + 0.5) * this.h;
      const p1 = this.v.set(d.fx / 1000, 0.9 * (d.hero ? heroScale(d) : 1), -d.fy / 1000).project(camera);
      const x1 = (p1.x * 0.5 + 0.5) * this.w;
      const y1 = (-p1.y * 0.5 + 0.5) * this.h;
      const k = 1 - Math.max(0, l.t) / l.total;
      const blink = 0.65 + 0.35 * Math.sin(performance.now() / (k > 0.7 ? 40 : 90));
      g.strokeStyle = `rgba(255,59,77,${(0.55 + 0.4 * k) * blink})`;
      g.lineWidth = (2 + 5 * k) * this.scale;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      // a ground ring under the hero that closes in as the shot comes
      const r = (1.8 - 0.9 * k) * 1000;
      g.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const q = this.v.set((d.fx + Math.cos(a) * r) / 1000, 0.1, -(d.fy + Math.sin(a) * r) / 1000).project(camera);
        const qx = (q.x * 0.5 + 0.5) * this.w;
        const qy = (-q.y * 0.5 + 0.5) * this.h;
        if (i) g.lineTo(qx, qy);
        else g.moveTo(qx, qy);
      }
      g.lineWidth = 3 * this.scale;
      g.stroke();
      if (l.dst === this.mySlot) {
        const fs = Math.round(15 * this.scale);
        g.font = `700 ${fs}px Fredoka, system-ui, sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(42,26,34,0.9)';
        g.strokeText('Tower aiming at you!', x1, y1 + 34 * this.scale);
        g.fillStyle = '#ff6b78';
        g.fillText('Tower aiming at you!', x1, y1 + 34 * this.scale);
        g.textAlign = 'start';
      }
    }
    this.locks = this.locks.filter((l) => l.t > -0.15);
  }

  private drawGuide(g: CanvasRenderingContext2D, frame: ViewFrame, camera: THREE.Camera): void {
    const me = frame.byId.get(this.mySlot);
    const to = this.guide;
    if (!to || !me || me.state === 'dead') return;
    const dx = to.x - me.fx;
    const dy = to.y - me.fy;
    const d = Math.hypot(dx, dy);
    if (d < 3000) return;
    const ux = dx / d;
    const uy = dy / d;
    const t = (performance.now() / 1000) % 1;
    g.lineWidth = 5 * this.scale;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let k = 0; k < 4; k++) {
      const along = 1500 + (k + t) * 1500;
      if (along > d - 800) break;
      const cx = me.fx + ux * along;
      const cy = me.fy + uy * along;
      const tip = this.v.set((cx + ux * 500) / 1000, 0.15, -(cy + uy * 500) / 1000).project(camera);
      const tx = (tip.x * 0.5 + 0.5) * this.w;
      const ty = (-tip.y * 0.5 + 0.5) * this.h;
      const l = this.v.set((cx - uy * 600) / 1000, 0.15, -(cy + ux * 600) / 1000).project(camera);
      const lx = (l.x * 0.5 + 0.5) * this.w;
      const ly = (-l.y * 0.5 + 0.5) * this.h;
      const r = this.v.set((cx + uy * 600) / 1000, 0.15, -(cy - ux * 600) / 1000).project(camera);
      const rx = (r.x * 0.5 + 0.5) * this.w;
      const ry = (-r.y * 0.5 + 0.5) * this.h;
      const a = Math.min(1, (k + 1 - t) / 1.5) * 0.85;
      g.strokeStyle = `rgba(255,211,77,${a.toFixed(3)})`;
      g.beginPath();
      g.moveTo(lx, ly);
      g.lineTo(tx, ty);
      g.lineTo(rx, ry);
      g.stroke();
    }
    g.lineCap = 'butt';
  }

  private drawBeams(g: CanvasRenderingContext2D, frame: ViewFrame, camera: THREE.Camera, heroScale: (e: ViewEntity) => number): void {
    const now = performance.now();
    const dt = this.lastDraw ? Math.min(0.1, (now - this.lastDraw) / 1000) : 0;
    this.lastDraw = now;
    if (!this.beams.length) return;
    const at = (e: ViewEntity, lift: number): [number, number] | null => {
      const v = this.v.set(e.fx / 1000, lift, -e.fy / 1000).project(camera);
      if (v.z > 1 || v.z < -1) return null;
      return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
    };
    for (const b of this.beams) {
      b.t -= dt;
      const s = frame.byId.get(b.src);
      const d = frame.byId.get(b.dst);
      if (!s || !d || s.state === 'dead' || d.state === 'dead') continue;
      const p0 = at(s, s.kind === 'core' ? 4.5 : 5.6);
      const p1 = at(d, 0.9 * (d.hero ? heroScale(d) : 1));
      if (!p0 || !p1) continue;
      const a = Math.max(0, Math.min(1, b.t / 0.35));
      g.strokeStyle = `rgba(255,77,94,${(0.85 * a).toFixed(3)})`;
      g.lineWidth = 4 * this.scale;
      g.setLineDash([10 * this.scale, 6 * this.scale]);
      g.beginPath();
      g.moveTo(p0[0], p0[1]);
      g.lineTo(p1[0], p1[1]);
      g.stroke();
      g.setLineDash([]);
    }
    this.beams = this.beams.filter((b) => b.t > 0);
  }

  private plate(g: CanvasRenderingContext2D, p: Plate): void {
    const e = p.e;
    const sx = p.sx;
    const sy = p.sy + p.dy;
    const [bw0, bh0] = SIZE[e.kind];
    const bw = bw0 * this.scale;
    const bh = bh0 * this.scale;
    const x = sx - bw / 2;
    const y = sy - bh / 2;
    const total = Math.max(e.maxHp, e.hp + e.shield);
    const hpW = (Math.max(0, e.hp) / total) * bw;
    const shW = (Math.max(0, e.shield) / total) * bw;
    if (p.dy < 0 && e.kind === 'hero') {
      // a short leader line from a lifted plate down to its hero
      g.strokeStyle = 'rgba(42,26,34,0.7)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(sx, sy + bh / 2 + 2);
      g.lineTo(sx, p.sy - bh / 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(42,26,34,0.82)';
    roundRect(g, x - (e.kind === 'minion' ? 1 : 2), y - (e.kind === 'minion' ? 1 : 2), bw + (e.kind === 'minion' ? 2 : 4), bh + (e.kind === 'minion' ? 2 : 4), e.kind === 'minion' ? 2 : 3);
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
    if (e.kind !== 'hero') return;
    if (e.id === this.mySlot) {
      // the player's own plate: a gold frame so it is found first in a pile
      g.strokeStyle = RELATION_CSS.self;
      g.lineWidth = 1.5;
      roundRect(g, x - 3, y - 3, bw + 6, bh + 6, 4);
      g.stroke();
    }
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
    const name = plateName(e, this.mySlot, this.myTeam, this.mirrored);
    g.font = `600 ${Math.round(11 * this.scale)}px Fredoka, system-ui, sans-serif`;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(42,26,34,0.85)';
    g.strokeText(name, sx, y - 9 * this.scale);
    g.fillStyle = this.color(e);
    g.fillText(name, sx, y - 9 * this.scale);
    if (p.chip) {
      // another hero's plate sits right above this one: say so (left of the level badge; status takes the right)
      const cx = x - 2 * r - 16 * this.scale;
      g.fillStyle = 'rgba(42,26,34,0.92)';
      roundRect(g, cx - 11 * this.scale, sy - 7 * this.scale, 22 * this.scale, 14 * this.scale, 6);
      g.fill();
      g.fillStyle = '#fff3dc';
      g.font = `700 ${Math.round(10 * this.scale)}px Fredoka, system-ui, sans-serif`;
      g.fillText('×2', cx, sy + 0.5);
    }
    const status = statusWord(e.buffs);
    if (status) {
      g.font = `700 ${Math.round(9 * this.scale)}px Fredoka, system-ui, sans-serif`;
      const tw = g.measureText(status).width + 8 * this.scale;
      const cx = x + bw + 4 * this.scale;
      g.fillStyle = 'rgba(255,224,102,0.95)';
      roundRect(g, cx, sy - 7 * this.scale, tw, 14 * this.scale, 6);
      g.fill();
      g.fillStyle = '#2a1a22';
      g.textAlign = 'left';
      g.fillText(status, cx + 4 * this.scale, sy + 0.5);
      g.textAlign = 'center';
    }
  }
}

/** The label over a hero: "You" for the player, a team prefix on the enemy copy of a mirrored hero. Pure. */
export function plateName(e: Pick<ViewEntity, 'id' | 'team' | 'hero'>, mySlot: number, myTeam: number, mirrored: ReadonlySet<string>): string {
  if (e.id === mySlot) return 'You';
  if (!e.hero) return '';
  const title = HERO_TEXT[e.hero].title;
  if (e.team !== myTeam && mirrored.has(e.hero) && (e.team === 0 || e.team === 1)) return `${TEAM[e.team].name} ${title}`;
  return title;
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
