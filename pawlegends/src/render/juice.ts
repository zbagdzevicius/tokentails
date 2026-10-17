/**
 * Juice (render only, POC.md §3): hitstop, camera shake, announcer banners and "Purrfect!" style call-outs. The sim
 * never waits for any of this: hitstop only slows the render clock for a few frames, and the interpolation catches
 * up right after.
 */
import { CameraShake } from './camera/CameraShake.js';

export interface Banner {
  title: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'gold' | 'info';
}

export class Juice {
  readonly shake = new CameraShake({ decay: 1.8, pitch: 0.035, yaw: 0.03, roll: 0.025, pos: 0.25, kick: 0.22 });
  private stopLeft = 0;
  private stopScale = 0;
  /** Settings: 0..1. */
  shakeScale = 1;
  private bannerEl: HTMLElement | null = null;
  private queue: Banner[] = [];
  private bannerT = 0;
  private calloutLayer: HTMLElement | null = null;

  constructor(root: HTMLElement | null) {
    if (root && typeof document !== 'undefined') {
      this.bannerEl = document.createElement('div');
      this.bannerEl.className = 'pl-banner';
      root.appendChild(this.bannerEl);
      this.calloutLayer = document.createElement('div');
      this.calloutLayer.className = 'pl-callouts';
      root.appendChild(this.calloutLayer);
    }
  }

  /** Freeze the render clock for `ms` (scale 0) or slow it (`scale` > 0). The longest active request wins. */
  hitstop(ms: number, scale = 0): void {
    const s = ms / 1000;
    if (s > this.stopLeft) {
      this.stopLeft = s;
      this.stopScale = scale;
    }
  }

  /** Trauma 0..1. */
  kick(trauma: number): void {
    this.shake.add(trauma * this.shakeScale);
  }

  /** Render-clock scale for this frame (call once per frame with the real dt). */
  timeScale(dt: number): number {
    if (this.stopLeft <= 0) return 1;
    this.stopLeft -= dt;
    return this.stopScale;
  }

  banner(b: Banner): void {
    if (this.queue.length > 3) this.queue.shift();
    this.queue.push(b);
  }

  /** A short word over the middle of the screen ("Purrfect!", "Takedown!"). */
  callout(text: string, tone: Banner['tone'] = 'gold'): void {
    const layer = this.calloutLayer;
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `pl-callout tone-${tone}`;
    el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  update(dt: number): void {
    const el = this.bannerEl;
    if (!el) return;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) el.classList.remove('on');
      return;
    }
    const b = this.queue.shift();
    if (!b) return;
    el.className = `pl-banner tone-${b.tone ?? 'info'}`;
    el.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'pl-banner-title';
    t.textContent = b.title;
    el.appendChild(t);
    if (b.sub) {
      const s = document.createElement('div');
      s.className = 'pl-banner-sub';
      s.textContent = b.sub;
      el.appendChild(s);
    }
    void el.offsetWidth;
    el.classList.add('on');
    this.bannerT = 2.1;
  }

  clear(): void {
    this.queue = [];
    this.bannerT = 0;
    this.bannerEl?.classList.remove('on');
    this.shake.reset();
    this.stopLeft = 0;
  }

  dispose(): void {
    this.bannerEl?.remove();
    this.calloutLayer?.remove();
  }
}
