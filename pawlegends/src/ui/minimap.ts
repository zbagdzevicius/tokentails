/**
 * Minimap (POC.md §3, §9): lanes, river, structures, units and the camera's view on a small 2D canvas. Desktop:
 * left-click looks there, right-click moves there. Touch: tap to peek for a moment.
 */
import { NX, NY, createGrid } from '../sim/map/grid';
import { BUSHES, CORE, FOUNTAIN, LANE_WAYPOINTS, MAP, mirrorX } from '../data/map';
import type { ViewFrame } from '../render/interp';
import { RELATION_CSS } from '../render/palette';

export interface MinimapHost {
  lookAt(xM: number, zM: number): void;
  moveTo(xMm: number, yMm: number): void;
  /** Ground corners (m, three.js X/Z) of the camera view, or null. */
  viewQuad(): { x: number; z: number }[] | null;
  mySlot(): number;
  myTeam(): number;
}

export class Minimap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private bg: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null;
  private w = 220;
  private h = 132;
  private dpr = 1;
  private n = 0;

  constructor(
    parent: HTMLElement,
    private readonly host: MinimapHost,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pl-minimap';
    this.canvas = document.createElement('canvas');
    this.root.appendChild(this.canvas);
    parent.appendChild(this.root);
    this.g = this.canvas.getContext('2d');
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (e) => this.click(e));
  }

  private toMap(e: PointerEvent): { xMm: number; yMm: number } {
    const r = this.canvas.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    return { xMm: u * MAP.width, yMm: (1 - v) * MAP.height };
  }

  private click(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const p = this.toMap(e);
    if (e.button === 2) this.host.moveTo(p.xMm, p.yMm);
    else this.host.lookAt(p.xMm / 1000, -p.yMm / 1000);
  }

  private size(): void {
    const r = this.root.getBoundingClientRect();
    const w = Math.round(r.width) || 220;
    const h = Math.round(r.height) || 132;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && dpr === this.dpr && this.bg) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.bg = this.paintBg();
  }

  private X = (xMm: number): number => (xMm / MAP.width) * this.w;
  private Y = (yMm: number): number => (1 - yMm / MAP.height) * this.h;

  private paintBg(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w * this.dpr;
    c.height = this.h * this.dpr;
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    g.fillStyle = '#7fb86a';
    g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = '#6fb7e0';
    g.fillRect(this.X(MAP.riverX[0]), 0, this.X(MAP.riverX[1]) - this.X(MAP.riverX[0]), this.h);
    // sim v5: the forest outside the playfield (the nav grid's blocked cells), darker, so a right-click there reads as
    // "not walkable"
    const wall = createGrid().walls;
    g.fillStyle = '#3d6e3a';
    const cw = this.w / NX;
    const ch = this.h / NY;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (wall[j * NX + i]) g.fillRect(i * cw, this.h - (j + 1) * ch, cw + 0.5, ch + 0.5);
    g.strokeStyle = '#e6cf98';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = (MAP.laneWidth / MAP.width) * this.w * 0.7;
    for (const lane of ['sunny', 'puddle'] as const) {
      const pts = LANE_WAYPOINTS[lane];
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
      for (let i = pts.length - 2; i >= 0; i--) g.lineTo(this.X(mirrorX(pts[i][0])), this.Y(pts[i][1]));
      g.stroke();
    }
    g.fillStyle = '#3f8a46';
    for (const b of BUSHES)
      for (const x of [b.x, mirrorX(b.x)]) g.fillRect(this.X(x - b.w / 2), this.Y(b.y + b.h / 2), (b.w / MAP.width) * this.w, (b.h / MAP.height) * this.h);
    for (const team of [0, 1]) {
      const cx = team === 0 ? CORE.x : mirrorX(CORE.x);
      g.fillStyle = team === 0 ? 'rgba(255,111,145,0.35)' : 'rgba(61,90,158,0.45)';
      g.beginPath();
      g.arc(this.X(cx), this.Y(CORE.y), (10000 / MAP.width) * this.w, 0, Math.PI * 2);
      g.fill();
      const fx = team === 0 ? FOUNTAIN.x : mirrorX(FOUNTAIN.x);
      g.fillStyle = '#bfe8ff';
      g.beginPath();
      g.arc(this.X(fx), this.Y(FOUNTAIN.y), 3, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  /** Pulsing rings on the minimap (core under attack), sim mm, until `until` (ms, performance clock). */
  private pings: { x: number; y: number; color: string; until: number }[] = [];
  ping(xMm: number, yMm: number, color: string, ms = 3000): void {
    this.pings.push({ x: xMm, y: yMm, color, until: performance.now() + ms });
  }

  /** Pickups on the ground (sim mm): a glowing dot each (fun plan F2 item 8). Set by the match session. */
  pickups: () => readonly { x: number; y: number; kind: 'frenzy' | 'snack' }[] = () => [];

  draw(frame: ViewFrame | null): void {
    if ((this.n++ & 1) === 1) return;
    this.size();
    const g = this.g;
    if (!g || !this.bg) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!frame) return;
    const me = this.host.mySlot();
    const team = this.host.myTeam();
    const col = (t: number, id: number): string => (id === me ? RELATION_CSS.self : t === 2 ? RELATION_CSS.neutral : t === team ? RELATION_CSS.ally : RELATION_CSS.enemy);
    for (const e of frame.entities) {
      if (e.state === 'dead' || e.kind === 'fountain' || e.kind === 'hero' || (e.kind as string) === 'pickup') continue;
      const x = this.X(e.fx);
      const y = this.Y(e.fy);
      g.fillStyle = col(e.team, e.id);
      if (e.kind === 'tower' || e.kind === 'core') {
        const s = e.kind === 'core' ? 9 : 6;
        g.fillStyle = 'rgba(42,26,34,0.9)';
        g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
        g.fillStyle = col(e.team, e.id);
        g.fillRect(x - s / 2, y - s / 2, s, s);
      } else if (e.kind === 'pudding') {
        g.beginPath();
        g.arc(x, y, 4.5, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const glow = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    for (const p of this.pickups()) {
      const x = this.X(p.x);
      const y = this.Y(p.y);
      g.fillStyle = p.kind === 'frenzy' ? `rgba(125,255,138,${(0.35 * glow).toFixed(3)})` : `rgba(255,166,77,${(0.3 * glow).toFixed(3)})`;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = p.kind === 'frenzy' ? '#7dff8a' : '#ffa64d';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    for (const e of frame.entities) {
      if (e.kind !== 'hero' || e.state === 'dead') continue;
      const x = this.X(e.fx);
      const y = this.Y(e.fy);
      g.fillStyle = 'rgba(42,26,34,0.95)';
      g.beginPath();
      g.arc(x, y, e.id === me ? 6 : 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col(e.team, e.id);
      g.beginPath();
      g.arc(x, y, e.id === me ? 4.5 : 3.6, 0, Math.PI * 2);
      g.fill();
    }
    const now = performance.now();
    this.pings = this.pings.filter((p) => p.until > now);
    for (const p of this.pings) {
      const k = ((now / 700) % 1);
      g.strokeStyle = p.color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(this.X(p.x), this.Y(p.y), 5 + k * 12, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    const q = this.host.viewQuad();
    if (q) {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 1.2;
      g.beginPath();
      q.forEach((p, i) => (i ? g.lineTo(this.X(p.x * 1000), this.Y(-p.z * 1000)) : g.moveTo(this.X(p.x * 1000), this.Y(-p.z * 1000))));
      g.closePath();
      g.stroke();
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
