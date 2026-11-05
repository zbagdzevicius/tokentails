/**
 * Card reveals for the hero lifecycle (stable API, used by the HUD and the respawn sequence):
 *
 * - `cardReveal(parent, opts)`: a hero card that lies face down, flips face up with a reveal-sparkle flash (and a
 *   golden or white burst behind it), holds, then fades. Centred, or anchored to a screen point that a callback
 *   updates every frame (a hero's head in the world: project it and return `{x, y}` in CSS px of `parent`).
 *   DOM only: no textures, materials or draw calls in the 3D scene.
 * - `RespawnCard`: the HUD's face-down card that counts down while the player is out, and flips to the portrait at 0.
 *
 * Reduced motion (OS setting): no 3D turn, no spin; a 200 ms cross-fade from back to front, and the flash is a still
 * glow. Every timer and frame callback is cleared on dispose; disposing twice is safe.
 */
import type { HeroId } from '../../sim/api';
import type { CatTier } from '../../meta/roster';
import { fxUrl, heroElement } from './art';
import { flipCard, heroCard } from './hero';

const reduced = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export interface CardRevealOpts {
  hero: HeroId;
  /** Portrait data URL (render/portraits.ts portraitUrl(hero, look)); default: the hero's default portrait. */
  portrait?: string | null;
  /** The label under the portrait (default: the hero's title; '' for none). */
  name?: string;
  /** A small ribbon over the card ("Back in the fight!", "MVP"). */
  ribbon?: string;
  /** The worn card skin's rung: the foil and glow. */
  tier?: CatTier | null;
  /** Card width in px (default 112). */
  size?: number;
  /** Screen anchor (px inside `parent`), called every frame; null hides it for that frame. Default: centred. */
  anchor?: (() => { x: number; y: number } | null) | null;
  /** Face-down time before the flip (ms, default 120). */
  delayMs?: number;
  /** Face-up time before the fade (ms, default 900). */
  holdMs?: number;
  /** The burst behind the card (default 'gold'). */
  burst?: 'gold' | 'white' | 'none';
  /** Extra class on the overlay root. */
  cls?: string;
}

export interface CardRevealHandle {
  /** The overlay root (`.tt-reveal`). */
  readonly el: HTMLElement;
  /** Flip now (if not yet). */
  flip(): void;
  /** Remove at once. */
  dispose(): void;
  /** Resolves when the reveal has faded out or was disposed. */
  readonly done: Promise<void>;
}

/** The flip, the flash and the fade timings (ms). Exported for tests and for callers that sync sounds. */
export const REVEAL_MS = Object.freeze({ flip: 480, flash: 520, fade: 260, reducedFade: 200 });

/** Mount a card reveal. Never throws; returns a handle whose `done` always resolves. */
export function cardReveal(parent: HTMLElement, o: CardRevealOpts): CardRevealHandle {
  const calm = reduced();
  const el = document.createElement('div');
  el.className = `tt-reveal${o.anchor ? ' anchored' : ''}${calm ? ' calm' : ''}${o.cls ? ` ${o.cls}` : ''}`;
  el.setAttribute('aria-hidden', 'true');
  const w = Math.max(40, o.size ?? 112);
  el.style.setProperty('--tt-w', `${w}px`);
  el.dataset.ttEl = heroElement(o.hero);
  const burst = o.burst ?? 'gold';
  const front = heroCard(o.hero, { portrait: o.portrait, name: o.name, tier: o.tier ?? null, sparkles: true, foil: 'sweep' });
  el.innerHTML = `${burst !== 'none' ? `<i class="tt-burst" style="background-image:url(${fxUrl(burst === 'gold' ? 'golden-burst' : 'white-burst')})"></i>` : ''}<i class="tt-flash" style="background-image:url(${fxUrl('reveal-sparkle')})"></i>${flipCard(front)}${o.ribbon ? `<span class="tt-ribbon"></span>` : ''}`;
  const rib = el.querySelector<HTMLElement>('.tt-ribbon');
  if (rib) rib.textContent = o.ribbon ?? '';
  parent.appendChild(el);
  const flipEl = el.querySelector<HTMLElement>('.tt-flip') as HTMLElement;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let raf = 0;
  let resolve: () => void = () => undefined;
  const done = new Promise<void>((r) => (resolve = r));
  let gone = false;
  const dispose = (): void => {
    if (gone) return;
    gone = true;
    for (const t of timers) clearTimeout(t);
    if (raf) cancelAnimationFrame(raf);
    el.remove();
    resolve();
  };
  const place = (): void => {
    raf = 0;
    if (gone || !o.anchor) return;
    const p = o.anchor();
    if (p) {
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      el.style.visibility = '';
    } else el.style.visibility = 'hidden';
    raf = requestAnimationFrame(place);
  };
  if (o.anchor) place();
  let flipped = false;
  const flip = (): void => {
    if (flipped || gone) return;
    flipped = true;
    flipEl.classList.add('up');
    el.classList.add('up');
    const hold = Math.max(0, o.holdMs ?? 900);
    const turn = calm ? REVEAL_MS.reducedFade : REVEAL_MS.flip;
    timers.push(setTimeout(() => el.classList.add('out'), turn + hold));
    timers.push(setTimeout(dispose, turn + hold + (calm ? REVEAL_MS.reducedFade : REVEAL_MS.fade) + 40));
  };
  // two frames face down so the transition runs (and a 0 ms delay still shows the turn)
  requestAnimationFrame(() => {
    el.classList.add('in');
    timers.push(setTimeout(flip, Math.max(0, o.delayMs ?? 120)));
  });
  return { el, flip, dispose, done };
}

/**
 * The HUD respawn card: face down with the seconds left while the player is out; `reveal()` flips it to the hero's
 * portrait with a sparkle flash, and it slides away. `down()` puts it face down again (the next knockout).
 */
export class RespawnCard {
  readonly el: HTMLElement;
  private num: HTMLElement;
  private flipEl: HTMLElement;
  private last = '';
  private state: 'idle' | 'down' | 'up' = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement, hero: HeroId, portrait: string | null, tier: CatTier | null = null) {
    const el = document.createElement('div');
    el.className = `tt-respawn${reduced() ? ' calm' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.dataset.ttEl = heroElement(hero);
    el.innerHTML = `<i class="tt-flash" style="background-image:url(${fxUrl('reveal-sparkle')})"></i>${flipCard(heroCard(hero, { portrait, name: '', tier, sparkles: true }), { back: '<em class="tt-count"></em>' })}`;
    parent.appendChild(el);
    this.el = el;
    this.num = el.querySelector('.tt-count') as HTMLElement;
    this.flipEl = el.querySelector('.tt-flip') as HTMLElement;
  }

  /** Swap the face (the portrait was re-baked in a look). */
  setPortrait(url: string | null): void {
    const pic = this.el.querySelector<HTMLElement>('.tt-face-front .tt-pic');
    if (pic && url) {
      pic.classList.remove('none');
      pic.textContent = '';
      pic.style.backgroundImage = `url(${url}),var(--tt-grad)`;
    }
  }

  /** Dead: face down, `secs` left (no DOM write when nothing changed). */
  down(secs: number): void {
    if (this.state !== 'down') {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.state = 'down';
      this.flipEl.classList.remove('up');
      this.el.classList.remove('up', 'out');
      this.el.classList.add('on');
    }
    const t = String(Math.max(0, secs));
    if (t !== this.last) {
      this.last = t;
      this.num.textContent = t;
      this.num.classList.remove('tick');
      void this.num.offsetWidth;
      this.num.classList.add('tick');
    }
  }

  /** Back in the fight: flip face up, flash, then slide away. */
  reveal(): void {
    if (this.state !== 'down') return;
    this.state = 'up';
    this.last = '';
    this.flipEl.classList.add('up');
    this.el.classList.add('up');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.el.classList.add('out');
      this.timer = setTimeout(() => {
        this.el.classList.remove('on', 'up', 'out');
        this.flipEl.classList.remove('up');
        this.state = 'idle';
        this.timer = null;
      }, 320);
    }, 1100);
  }

  /** Hide without a reveal (match end, menu). */
  hide(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.state = 'idle';
    this.el.classList.remove('on', 'up', 'out');
    this.flipEl.classList.remove('up');
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
  }
}
