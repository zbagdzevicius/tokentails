/**
 * Juice (render only, POC.md §3): hitstop, camera shake, announcer banners and "Purrfect!" style call-outs. The sim
 * never waits for any of this: hitstop only slows the render clock for a few frames, and the interpolation catches
 * up right after.
 */
import { CameraShake } from './camera/CameraShake.js';
import type { Stage } from '../ui/stage';

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Round 1: a queued ordinary banner older than this is dropped (a "First Blood!" after five knockouts is stale). */
export const BANNER_STALE_MS = 3000;
/** Global slow motion never runs longer than this (ms) unless asked for the match end (ANIM-SPEC §6). */
export const SLOWMO_CAP_MS = 110;

export interface Banner {
  title: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'gold' | 'info';
  /** Kills of structures, the core, the result: shown before ordinary banners. */
  urgent?: boolean;
  /** When it was queued (ms; set by `banner`). */
  at?: number;
  /** Seconds on screen (render time) for a long text such as the match-2 ping tip; default 2.1 (1.4 with a queue). */
  hold?: number;
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
  /** Seconds left of the fade-out before the banner's text is cleared. */
  private bannerGone = 0;
  private calloutLayer: HTMLElement | null = null;
  private popLayer: HTMLElement | null = null;
  private flashEl: HTMLElement | null = null;
  private popTimes: number[] = [];
  /** Callouts and pops shown (e2e telemetry and tests). */
  readonly said: string[] = [];
  /** The centre-screen arbiter (ui/stage.ts); null in tests and the lobby. */
  stage: Stage | null = null;
  /** Render-time scale for the stale check (the match speed in e2e runs). */
  speed = 1;
  /** The stage kind the banner on screen holds. */
  private bannerKind: 'urgent' | 'banner' = 'banner';
  private bannerTitle = '';

  constructor(root: HTMLElement | null) {
    if (root && typeof document !== 'undefined') {
      this.bannerEl = document.createElement('div');
      this.bannerEl.className = 'pl-banner';
      root.appendChild(this.bannerEl);
      this.calloutLayer = document.createElement('div');
      this.calloutLayer.className = 'pl-callouts';
      root.appendChild(this.calloutLayer);
      this.popLayer = document.createElement('div');
      this.popLayer.className = 'pl-pops';
      root.appendChild(this.popLayer);
      this.flashEl = document.createElement('div');
      this.flashEl.className = 'pl-flash';
      root.appendChild(this.flashEl);
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

  /**
   * Slow motion: the render clock runs at `scale` (0..1) for `ms`. Capped at SLOWMO_CAP_MS (ANIM-SPEC D5, §6: a long
   * global slow-mo left the snapshot clock behind and the catch-up rushed every hero); `long` is for the match end
   * only (the core falling), where nothing plays on after it.
   */
  slowmo(ms: number, scale: number, long = false): void {
    this.hitstop(long ? ms : Math.min(ms, SLOWMO_CAP_MS), Math.max(0.05, Math.min(1, scale)));
  }

  /** Record a text as said (a moment shown by another layer, e.g. the ult banner; e2e reads data-said). */
  note(text: string): void {
    this.remember(text);
  }

  /** Is slow motion (or a hitstop) running? */
  get slowed(): boolean {
    return this.stopLeft > 0;
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

  /** Queue a banner (one at a time, ≤ 2.5 s each unless it sets `hold`). `urgent` ones (core, towers, the result) go to the front, and a
   *  full queue drops its oldest ordinary banner first. */
  banner(b: Banner): void {
    this.remember(b.title);
    if (this.queue.some((q) => q.title === b.title)) return;
    if (this.queue.length > 2) {
      const k = this.queue.findIndex((q) => !q.urgent);
      this.queue.splice(k >= 0 ? k : 0, 1);
    }
    const q = { ...b, at: nowMs() };
    if (b.urgent) this.queue.unshift(q);
    else this.queue.push(q);
  }

  /** The title of the banner on screen now ('' when none). */
  get showing(): string {
    return this.bannerT > 0 ? this.bannerTitle : '';
  }

  /** Is a banner with this title waiting in the queue? (The queue drops stale and overflow banners.) */
  queued(title: string): boolean {
    return this.queue.some((q) => q.title === title);
  }

  /** A short word over the middle of the screen ("Purrfect!", "Takedown!"). */
  callout(text: string, tone: Banner['tone'] = 'gold'): void {
    const layer = this.calloutLayer;
    this.remember(text);
    if (!layer) return;
    // round 1: one at a time, and only when nothing more important holds the centre band (it is dropped, not queued:
    // a callout is a reaction to this very moment)
    const now = nowMs();
    if (this.stage && !this.stage.allows('callout', now)) return;
    while (layer.firstElementChild) layer.firstElementChild.remove();
    this.stage?.claim('callout', 1300, now);
    const el = document.createElement('div');
    el.className = `pl-callout tone-${tone}`;
    el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  /** Floating text at a screen point (px): "+40 XP", "Combo x2", "+FRENZY". Rises and fades in ~1 s. */
  pop(text: string, x: number, y: number, tone: Banner['tone'] = 'gold', big = false): void {
    this.remember(text);
    const layer = this.popLayer;
    if (!layer || !Number.isFinite(x) || !Number.isFinite(y)) return;
    while (layer.childElementCount > 8) layer.firstElementChild?.remove();
    // pops that come close together stack upward and alternate sides, so "+40 XP" never covers "Combo x2"
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.popTimes = this.popTimes.filter((t) => now - t < 600);
    const k = this.popTimes.length;
    this.popTimes.push(now);
    const el = document.createElement('div');
    el.className = `pl-pop tone-${tone}${big ? ' big' : ''}`;
    el.textContent = text;
    el.style.left = `${Math.round(x + (k % 2 ? 46 : -46) * Math.min(1, k))}px`;
    el.style.top = `${Math.round(y - k * 26)}px`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  /** A full-screen rim flash: white (Nine Lives), gold (level up, a multikill), red (low health). */
  flash(kind: 'white' | 'gold' | 'red'): void {
    const el = this.flashEl;
    if (!el) return;
    el.className = 'pl-flash';
    void el.offsetWidth;
    el.className = `pl-flash on ${kind}`;
  }

  private remember(text: string): void {
    this.said.push(text);
    if (this.said.length > 40) this.said.shift();
    try {
      document.documentElement.dataset.said = this.said.slice(-12).join('|');
    } catch {
      /* node */
    }
  }

  update(dt: number): void {
    const el = this.bannerEl;
    if (!el) return;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      // round 2: hold the centre band while the banner is up, however slow the frames (a clamped dt on a slow
      // device kept it on screen past its claim, and a callout showed beside it)
      if (this.bannerT > 0) this.stage?.claim(this.bannerKind, 150, nowMs());
      if (this.bannerT <= 0) {
        el.classList.remove('on');
        // gone means gone: no stale text for a reader, test or screen reader (it lingered for 30 s+ before)
        this.bannerGone = 0.3;
      }
      return;
    }
    if (this.bannerGone > 0) {
      this.bannerGone -= dt;
      if (this.bannerGone <= 0 && !this.queue.length) {
        el.innerHTML = '';
        try {
          delete document.documentElement.dataset.banner;
        } catch {
          /* node */
        }
      }
      if (this.bannerGone > 0) return;
    }
    // round 1: wait while a death recap or a tower warning holds the centre band; drop stale ordinary banners
    const now = nowMs();
    const stale = BANNER_STALE_MS / Math.max(1, this.speed);
    this.queue = this.queue.filter((q) => q.urgent || now - (q.at ?? now) <= stale);
    const head = this.queue[0];
    if (!head || (this.stage && !this.stage.allows(head.urgent ? 'urgent' : 'banner', now))) return;
    const b = this.queue.shift() as Banner;
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
    this.bannerT = b.hold ?? (this.queue.length > 1 ? 1.4 : 2.1);
    this.bannerTitle = b.title;
    // round 2: the banner shows for bannerT seconds of render time (update's dt is not sped up), so it holds the centre
    // band exactly that long; dividing by the match speed let a callout show beside it (the e2e one-at-a-time check)
    this.bannerKind = b.urgent ? 'urgent' : 'banner';
    this.stage?.claim(this.bannerKind, this.bannerT * 1000 + 50, now);
    try {
      document.documentElement.dataset.banner = b.title;
    } catch {
      /* node */
    }
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
    this.popLayer?.remove();
    this.flashEl?.remove();
  }
}
