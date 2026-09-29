/**
 * Touch controls: a floating virtual joystick in the left half of the screen and three round
 * buttons (Interact, Meow, Swap) bottom-right. Buttons are >= 62px, positioned inside the safe
 * area. They feed an InputController (press() edges, setStick() for the analog stick).
 */
import { h } from './dom';
import type { ButtonName, InputController } from './input';

export interface TouchControls {
  readonly el: HTMLElement;
  setVisible(on: boolean): void;
  readonly visible: boolean;
  dispose(): void;
}

export interface TouchOptions {
  /** Icon URLs (optional). */
  icons?: Partial<Record<ButtonName, string>>;
  /** Called on every virtual press (e.g. to unlock audio on first touch). */
  onPress?: (b: ButtonName) => void;
}

const RADIUS = 52;

export function createTouchControls(parent: HTMLElement, input: InputController, opts: TouchOptions = {}): TouchControls {
  const knob = h('div.ch-knob');
  const stick = h('div.ch-stick.ch-idle', null, knob);
  const zone = h('div.ch-stick-zone', { 'aria-hidden': 'true' }, stick);

  const mk = (b: ButtonName, cls: string, label: string, sub: string) => {
    const icon = opts.icons?.[b];
    const btn = h(`button.ch-btn.${cls}`, { type: 'button', 'aria-label': label, 'data-btn': b }, icon ? h('img', { src: icon, alt: '' }) : label, h('span', null, sub));
    return btn;
  };
  const act = mk('interact', 'ch-act.ch-primary', 'Act', 'free / use');
  const meow = mk('meow', 'ch-meow.ch-pink', 'Meow', 'lure');
  const swap = mk('swap', 'ch-swap', 'Swap', 'cat');
  const pad = h('div.ch-pad', null, swap, meow, act);
  const el = h('div.ch-touch', null, zone, pad);
  parent.appendChild(el);

  // ---- joystick ----
  let stickId: number | null = null;
  let ox = 0, oy = 0;
  // Idle position comes from CSS (bottom-left of the zone, safe-area aware), so it is right even
  // while the HUD is hidden (zero-size zone) and after any resize/orientation change.
  const rest = () => {
    stick.style.left = '';
    stick.style.top = '';
  };
  rest();
  const setKnob = (x: number, y: number) => {
    knob.style.transform = `translate(${x}px, ${y}px)`;
  };
  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    try {
      zone.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    const r = zone.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    stick.style.left = `${ox}px`;
    stick.style.top = `${oy}px`;
    stick.classList.remove('ch-idle');
    setKnob(0, 0);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob(dx, dy);
    input.setStick(dx / RADIUS, dy / RADIUS);
    e.preventDefault();
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    setKnob(0, 0);
    input.setStick(0, 0);
    stick.classList.add('ch-idle');
    rest();
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);

  // ---- buttons ----
  for (const btn of [act, meow, swap]) {
    const b = btn.dataset.btn as ButtonName;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('ch-down');
      const rip = document.createElement('span');
      rip.className = 'ch-ripple';
      rip.setAttribute('aria-hidden', 'true');
      btn.appendChild(rip);
      setTimeout(() => rip.remove(), 500);
      input.press(b);
      opts.onPress?.(b);
      try {
        navigator.vibrate?.(8);
      } catch {
        /* no vibration */
      }
    });
    const up = () => btn.classList.remove('ch-down');
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    // Keyboard / screen reader activation of the on-screen buttons.
    btn.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail === 0) input.press(b);
    });
  }
  const onResize = () => {
    if (stickId === null) rest();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  let visible = false;
  return {
    el,
    get visible() {
      return visible;
    },
    setVisible(on) {
      visible = on;
      el.classList.toggle('ch-on', on);
      if (on && stickId === null) rest();
      if (!on) input.setStick(0, 0);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      el.remove();
    },
  };
}
