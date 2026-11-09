/**
 * The ping wheel (GAPS B1): six slices around a point. Desktop: hold G, point the cursor at a slice, release G
 * (`openAt` + `aim` + `commit`). Touch: the paw button opens it centred on screen and a tap on a slice sends it; a
 * tap anywhere else closes it. The wheel only names a kind; the session builds and sends the ping.
 */
import { PING_KINDS } from '../data/pings';
import { icon } from './icons';
import { PING_TEXT, wheelKinds, wheelSlice } from './pingText';
import { MAP } from '../data/map';

export class PingWheel {
  readonly root: HTMLElement;
  private cx = 0;
  private cy = 0;
  private hot = -1;
  private readonly slices: HTMLButtonElement[] = [];
  /** Sim v19: the bound map's slices (built with the session, after app/mapBinding.ts useMap). */
  private readonly kinds = wheelKinds(MAP.point === 1);
  /** A slice was chosen: the PING_KIND. */
  onPick: ((kind: number) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'pl-pingwheel';
    this.root.setAttribute('role', 'menu');
    this.root.setAttribute('aria-label', 'Tell your team');
    const n = this.kinds.length;
    if (n !== 6) this.root.dataset.slices = String(n);
    this.kinds.forEach((kind, i) => {
      const t = PING_TEXT[PING_KINDS[kind]];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slice';
      b.dataset.kind = PING_KINDS[kind];
      b.setAttribute('role', 'menuitem');
      b.style.setProperty('--a', `${(360 / n) * i}deg`);
      b.style.setProperty('--c', t.color);
      b.innerHTML = `${icon(t.icon)}<span></span>`;
      (b.querySelector('span') as HTMLElement).textContent = t.label;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.pick(kind);
      });
      this.root.appendChild(b);
      this.slices.push(b);
    });
    // a tap outside the slices closes it (touch)
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.close();
    });
    parent.appendChild(this.root);
  }

  get open(): boolean {
    return this.root.classList.contains('on');
  }

  /** Open centred on (x, y) in px (clamped so every slice stays on screen). */
  openAt(x: number, y: number): void {
    const pad = this.kinds.length > 6 ? 132 : 110;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cx = Math.max(pad, Math.min(w - pad, x));
    this.cy = Math.max(pad, Math.min(h - pad, y));
    this.root.style.setProperty('--x', `${this.cx}px`);
    this.root.style.setProperty('--y', `${this.cy}px`);
    this.setHot(-1);
    this.root.classList.add('on');
    document.documentElement.dataset.pingWheel = '1';
  }

  /** Desktop: the cursor moved while G is held; highlight the slice it points at. */
  aim(x: number, y: number): void {
    if (!this.open) return;
    this.setHot(wheelSlice(x - this.cx, y - this.cy, 26, this.kinds.length));
  }

  /** Desktop: G released; send the highlighted slice (none in the dead zone) and close. */
  commit(): void {
    const k = this.hot >= 0 ? this.kinds[this.hot] : -1;
    this.close();
    if (k >= 0) this.onPick?.(k);
  }

  close(): void {
    this.root.classList.remove('on');
    this.setHot(-1);
    delete document.documentElement.dataset.pingWheel;
  }

  private pick(kind: number): void {
    this.close();
    this.onPick?.(kind);
  }

  private setHot(i: number): void {
    this.hot = i;
    this.slices.forEach((s, k) => s.classList.toggle('hot', k === i));
  }
}
