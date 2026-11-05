/**
 * Card reveals for the hero lifecycle (stable API, used by the HUD and the respawn sequence):
 *
 * - `cardReveal(parent, opts)`: a hero card that lies face down, flips face up with a reveal-sparkle flash (and a
 *   golden or white burst behind it), holds, then fades. Centred, or anchored to a screen point that a callback
 *   updates every frame (a hero's head in the world: project it and return `{x, y}` in CSS px of `parent`).
 *   DOM only: no textures, materials or draw calls in the 3D scene.
 * - `RespawnCard`: the HUD's face-down card while the player is out (a paw on its back); it flips up big at 0 and
 *   shrinks into the HUD portrait.
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

/** A paw on the face-down card's back (the HUD's "Back in N" chip is the one countdown: feel QA saw two). */
const BACK_PAW =
  '<svg class="tt-back-paw" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.5" rx="5.2" ry="4.3"/><ellipse cx="5.6" cy="10" rx="2.1" ry="2.6"/><ellipse cx="9.6" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="14.4" cy="6.4" rx="2.1" ry="2.6"/><ellipse cx="18.4" cy="10" rx="2.1" ry="2.6"/></svg>';

/** Respawn card timings (ms): the big face-up moment with the flash, then the flight into the HUD portrait. */
export const RESPAWN_CARD_MS = Object.freeze({ big: 560, fly: 440 });

/**
 * The HUD respawn card: face down (a paw on the back, no number) while the player is out; `reveal()` flips it face up
 * where it sits (LoL pass, lane A: beside the self portrait on phones, top-left on desktop, never at the centre; cards.css)
 * with a sparkle flash for half a second, then it shrinks into the HUD portrait. `down()` puts it face
 * down again (the next knockout). Hidden, it is `visibility: hidden` with its animations paused (perf QA: a Legendary
 * card's glow kept repainting under opacity 0).
 */
export class RespawnCard {
  readonly el: HTMLElement;
  private flipEl: HTMLElement;
  private state: 'idle' | 'down' | 'up' = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly calm: boolean;

  constructor(parent: HTMLElement, hero: HeroId, portrait: string | null, tier: CatTier | null = null) {
    const el = document.createElement('div');
    this.calm = reduced();
    el.className = `tt-respawn${this.calm ? ' calm' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.dataset.ttEl = heroElement(hero);
    el.innerHTML = `<i class="tt-flash" style="background-image:url(${fxUrl('reveal-sparkle')})"></i>${flipCard(heroCard(hero, { portrait, name: '', tier, sparkles: true }), { back: BACK_PAW })}`;
    parent.appendChild(el);
    this.el = el;
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

  /** Dead: face down (`_secs` is kept for the API; the HUD chip shows the seconds). No DOM write when unchanged. */
  down(_secs?: number): void {
    if (this.state === 'down') return;
    this.clear();
    this.state = 'down';
    this.flipEl.classList.remove('up');
    this.flipEl.style.removeProperty('--tt-fly');
    this.el.classList.remove('up', 'out', 'fly');
    this.el.classList.add('on');
  }

  /** Back in the fight: flip face up big with the flash, then shrink into the HUD portrait. */
  reveal(): void {
    if (this.state !== 'down') return;
    this.state = 'up';
    this.overPortrait();
    this.flipEl.classList.add('up');
    this.el.classList.add('up');
    this.clear();
    this.timer = setTimeout(() => {
      this.fly();
      this.timer = setTimeout(() => {
        this.el.classList.remove('on', 'up', 'out', 'fly');
        this.flipEl.classList.remove('up');
        this.flipEl.style.removeProperty('--tt-fly');
        this.state = 'idle';
        this.timer = null;
      }, RESPAWN_CARD_MS.fly + 40);
    }, this.calm ? 700 : RESPAWN_CARD_MS.big);
  }

  /**
   * Phones (QA v2 #3): the face-down card is hidden while out (it covered the HP bar; the portrait shows the seconds),
   * and the flip-up happens right over the self portrait, so the card never sits on the HP bar. One layout read.
   */
  private overPortrait(): void {
    if (typeof document === 'undefined' || document.documentElement.dataset.touch !== '1') return;
    const port = this.el.parentElement?.querySelector<HTMLElement>('.pl-portrait');
    const box = this.el.offsetParent as HTMLElement | null;
    const pr = port?.getBoundingClientRect();
    if (!pr || pr.width <= 0 || !box) return;
    const br = box.getBoundingClientRect();
    const h = this.flipEl.offsetHeight || 56;
    this.el.style.left = `${(pr.left + pr.width / 2 - br.left).toFixed(1)}px`;
    this.el.style.top = `${Math.max(2, pr.top + pr.height / 2 - h / 2 - br.top).toFixed(1)}px`;
  }

  /** The flight into the HUD portrait (one layout read): a fade-out when there is no portrait or under reduced motion. */
  private fly(): void {
    const port = this.calm ? null : this.el.parentElement?.querySelector<HTMLElement>('.pl-portrait');
    const pr = port?.getBoundingClientRect();
    const cr = this.flipEl.getBoundingClientRect();
    if (pr && pr.width > 0 && cr.width > 0) {
      // the transform origin is the card's top centre: its top and its centre x do not move with the scale, so the
      // card's centre lands on the portrait's at scale k when its top moves to (portrait centre − k × half height)
      const base = this.flipEl.offsetWidth || 46;
      const k = pr.width / base;
      const dx = pr.left + pr.width / 2 - (cr.left + cr.width / 2);
      const dy = pr.top + pr.height / 2 - cr.top - (k * (this.flipEl.offsetHeight || base * 1.35)) / 2;
      this.flipEl.style.setProperty('--tt-fly', `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k.toFixed(3)})`);
      this.el.classList.add('fly');
    } else this.el.classList.add('out');
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Hide without a reveal (match end, menu). */
  hide(): void {
    this.clear();
    this.state = 'idle';
    this.el.classList.remove('on', 'up', 'out', 'fly');
    this.flipEl.classList.remove('up');
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
  }
}
