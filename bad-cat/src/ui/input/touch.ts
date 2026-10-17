/**
 * Mobile controls (GDD 5.1): a floating stick on the left 55 % of the stage (24 px dead strips at the
 * screen edges so Safari's edge swipe never fires), SWAT (large) + JUMP (above it) fixed on the right.
 * Buttons fire on pointerdown and are latched until the next sim tick reads them. A mouse click on the
 * stage (desktop) latches SWAT too (GDD 5.2 "J or left click").
 */
import { BTN_GRAB, BTN_JUMP, BTN_SWAT } from '../../types';

export interface StickRaw {
  active: boolean;
  dx: number;
  dy: number;
  radius: number;
}

export interface TouchInput {
  readRaw(): StickRaw;
  take(): number;
  setGrabHint(on: boolean): void;
  /** Label/icon only: 'pull' shows PULL (the press stays SWAT). Grab still goes through setGrabHint. */
  setSwatHint(hint: 'swat' | 'grab' | 'pull'): void;
  setEnabled(on: boolean): void;
  /** Touch controls become visible after the first touch even when the env said "no touch". */
  readonly visible: boolean;
  dispose(): void;
}

export const EDGE_DEAD_PX = 24;
export const STICK_ZONE = 0.55;

/** Pure: may a stick start at clientX inside a stage of the given rect and viewport width? */
export function stickZoneHit(x: number, stageLeft: number, stageWidth: number, viewportWidth: number): boolean {
  if (x < EDGE_DEAD_PX || x > viewportWidth - EDGE_DEAD_PX) return false;
  const rel = x - stageLeft;
  return rel >= 0 && rel <= stageWidth * STICK_ZONE;
}

function el(tag: string, cls: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function createTouch(stage: HTMLElement, showInitially: boolean): TouchInput {
  const layer = el('div', 'bc-touch');
  const base = el('div', 'bc-stick');
  const knob = el('div', 'bc-stick-knob');
  base.appendChild(knob);
  const jump = el('button', 'bc-btn bc-btn-jump', '<span class="bc-btn-ico">⤒</span><span class="bc-btn-lbl">JUMP</span>');
  const swat = el('button', 'bc-btn bc-btn-swat', '<span class="bc-btn-ico">🐾</span><span class="bc-btn-lbl">SWAT</span>');
  jump.setAttribute('aria-label', 'Jump');
  swat.setAttribute('aria-label', 'Swat');
  layer.append(base, jump, swat);
  stage.appendChild(layer);

  let visible = showInitially;
  let enabled = true;
  let grab = false;
  let pull = false;
  let latched = 0;
  const paintSwat = (): void => {
    swat.classList.toggle('is-grab', grab);
    swat.classList.toggle('is-pull', pull);
    swat.querySelector('.bc-btn-ico')!.textContent = grab ? '🫳' : pull ? '🧶' : '🐾';
    swat.querySelector('.bc-btn-lbl')!.textContent = grab ? 'GRAB' : pull ? 'PULL' : 'SWAT';
  };
  let stickId = -1;
  let ox = 0;
  let oy = 0;
  let cx = 0;
  let cy = 0;
  let radius = 60;

  const setVisible = (v: boolean): void => {
    visible = v;
    layer.classList.toggle('is-visible', v);
  };
  setVisible(showInitially);

  const drawStick = (): void => {
    if (stickId < 0) {
      base.classList.remove('is-on');
      return;
    }
    base.classList.add('is-on');
    base.style.left = `${ox}px`;
    base.style.top = `${oy}px`;
    base.style.width = base.style.height = `${radius * 2}px`;
    let dx = cx - ox;
    let dy = cy - oy;
    const m = Math.hypot(dx, dy);
    if (m > radius) {
      dx = (dx / m) * radius;
      dy = (dy / m) * radius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const press = (bit: number, btn: HTMLElement) => (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType !== 'mouse') setVisible(true);
    if (!enabled) return;
    latched |= bit === BTN_SWAT && grab ? BTN_GRAB : bit;
    btn.classList.add('is-down');
  };
  const release = (btn: HTMLElement) => (): void => btn.classList.remove('is-down');
  const onSwat = press(BTN_SWAT, swat);
  const onJump = press(BTN_JUMP, jump);
  const offSwat = release(swat);
  const offJump = release(jump);
  swat.addEventListener('pointerdown', onSwat);
  jump.addEventListener('pointerdown', onJump);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    swat.addEventListener(ev, offSwat);
    jump.addEventListener(ev, offJump);
  }

  const onDown = (e: PointerEvent): void => {
    if (!enabled) return;
    const rect = stage.getBoundingClientRect();
    if (e.pointerType === 'mouse') {
      // Desktop: left click = swat (the touch stick is for touch/pen only).
      if (e.button === 0) latched |= grab ? BTN_GRAB : BTN_SWAT;
      return;
    }
    e.preventDefault();
    setVisible(true);
    if (stickId >= 0) return;
    if (!stickZoneHit(e.clientX, rect.left, rect.width, window.innerWidth)) return;
    stickId = e.pointerId;
    radius = Math.max(40, Math.min(70, rect.width * 0.15));
    ox = cx = e.clientX - rect.left;
    oy = cy = e.clientY - rect.top;
    try {
      layer.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    drawStick();
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    cx = e.clientX - rect.left;
    cy = e.clientY - rect.top;
    drawStick();
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== stickId) return;
    stickId = -1;
    drawStick();
  };
  const block = (e: Event): void => e.preventDefault();

  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('pointercancel', onUp);
  layer.addEventListener('lostpointercapture', onUp);
  layer.addEventListener('contextmenu', block);
  layer.addEventListener('touchstart', block, { passive: false });
  layer.addEventListener('touchmove', block, { passive: false });
  layer.addEventListener('dblclick', block);

  return {
    readRaw() {
      if (stickId < 0 || !enabled) return { active: false, dx: 0, dy: 0, radius };
      return { active: true, dx: cx - ox, dy: cy - oy, radius };
    },
    take() {
      const b = latched;
      latched = 0;
      return b;
    },
    setGrabHint(on) {
      if (on === grab) return;
      grab = on;
      if (on) pull = false;
      paintSwat();
    },
    setSwatHint(hint) {
      const p = hint === 'pull' && !grab;
      if (p === pull) return;
      pull = p;
      paintSwat();
    },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        stickId = -1;
        latched = 0;
        drawStick();
      }
      layer.classList.toggle('is-disabled', !on);
    },
    get visible() {
      return visible;
    },
    dispose() {
      layer.remove();
    },
  };
}
