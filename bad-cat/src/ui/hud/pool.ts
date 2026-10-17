/**
 * Pooled sticker DOM (60 fps): a fixed set of absolutely positioned slots reused round robin. A spawn sets the
 * slot's place once (left/top), then only transform and opacity animate (Web Animations API, CSS fallback).
 */
export interface StickerSpec {
  text: string;
  /** Extra classes on the slot ("bc-sticker is-gold"). */
  cls: string;
  /** 0..1 of the stage (y down). */
  x: number;
  y: number;
  tilt?: number;
  /** 'slap' (crime sticker) or 'rise' (points). */
  motion?: 'slap' | 'rise';
}

export interface StickerPool {
  spawn(spec: StickerSpec): HTMLElement;
  /** Live (still animating) slots. */
  readonly live: number;
  dispose(): void;
}

export const SLAP_MS = 1350;
export const RISE_MS = 1100;

/** Keyframes of the "sticker slapped on the screen" motion (scale punch, overshoot, hold, peel up). */
export function slapFrames(tilt: number): Keyframe[] {
  return [
    { transform: `translate(-50%, -50%) scale(2.1) rotate(${tilt - 12}deg)`, opacity: 0, easing: 'cubic-bezier(.2,.9,.3,1)' },
    { transform: `translate(-50%, -50%) scale(0.88) rotate(${tilt}deg)`, opacity: 1, offset: 0.1 },
    { transform: `translate(-50%, -50%) scale(1.06) rotate(${tilt}deg)`, opacity: 1, offset: 0.17 },
    { transform: `translate(-50%, -50%) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.24 },
    { transform: `translate(-50%, -50%) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.8, easing: 'ease-in' },
    { transform: `translate(-50%, -80%) scale(0.92) rotate(${tilt + 4}deg)`, opacity: 0 },
  ];
}

export function riseFrames(): Keyframe[] {
  return [
    { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 1, easing: 'ease-out' },
    { transform: 'translate(-50%, calc(-50% - 40px)) scale(1)', opacity: 1, offset: 0.55 },
    { transform: 'translate(-50%, calc(-50% - 48px)) scale(1)', opacity: 0 },
  ];
}

/**
 * Sticker centre x (0..1) kept fully on screen: a long sticker ("FRAMED THE ROOMBA +300") near an edge slides
 * inward. Without a measured size (no layout) only the 8..92 % band applies.
 */
export function clampX(x: number, stickerW: number, stageW: number, margin = 8): number {
  let lo = 0.08;
  let hi = 0.92;
  if (stickerW > 0 && stageW > 0) {
    lo = Math.min(0.5, (stickerW / 2 + margin) / stageW);
    hi = 1 - lo;
  }
  return Math.max(lo, Math.min(hi, x));
}

export function createStickerPool(parent: HTMLElement, size = 10, base = 'bc-sticker'): StickerPool {
  const slots: { el: HTMLElement; until: number; anim: Animation | null }[] = [];
  for (let i = 0; i < size; i++) {
    const el = document.createElement('div');
    el.className = base;
    el.setAttribute('aria-hidden', 'true');
    el.style.opacity = '0';
    parent.appendChild(el);
    slots.push({ el, until: 0, anim: null });
  }
  let next = 0;
  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  return {
    spawn(spec) {
      // the oldest slot (round robin) is recycled; a long frame never allocates
      const slot = slots[next];
      next = (next + 1) % slots.length;
      const el = slot.el;
      slot.anim?.cancel();
      el.className = `${base} ${spec.cls}`;
      el.textContent = spec.text;
      el.style.left = `${clampX(spec.x, el.offsetWidth, parent.clientWidth) * 100}%`;
      el.style.top = `${Math.max(0.12, Math.min(0.86, spec.y)) * 100}%`;
      const rise = spec.motion === 'rise';
      const ms = rise ? RISE_MS : SLAP_MS;
      slot.until = now() + ms;
      if (typeof el.animate === 'function') {
        el.style.opacity = '0';
        try {
          const anim = el.animate(rise ? riseFrames() : slapFrames(spec.tilt ?? 0), { duration: ms, easing: 'linear', fill: 'forwards' });
          // a recycled slot cancels its old animation: that rejects `finished`, which nobody awaits
          anim.finished?.catch(() => undefined);
          slot.anim = anim;
          return el;
        } catch {
          slot.anim = null;
        }
      }
      // fallback: restart a CSS animation (classes defined in hud.css)
      el.style.setProperty('--tilt', `${spec.tilt ?? 0}deg`);
      el.style.opacity = '';
      el.classList.remove('is-anim');
      void el.offsetWidth;
      el.classList.add('is-anim', rise ? 'is-rise' : 'is-slap');
      return el;
    },
    get live() {
      const t = now();
      return slots.filter((s) => s.until > t).length;
    },
    dispose() {
      for (const s of slots) {
        try {
          s.anim?.cancel();
        } catch {
          /* already gone */
        }
        s.el.remove();
      }
      slots.length = 0;
    },
  };
}
