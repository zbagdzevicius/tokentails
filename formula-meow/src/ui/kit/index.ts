/**
 * Menu UI kit (iteration 2 contract: the API is frozen, the look belongs to the audio-ui lane through tokens.css).
 * Plain DOM helpers that every lane's screens build from, so they all restyle together and all work with touch,
 * keyboard and gamepad: `focusNav(root)` moves focus with arrows / D-pad / left stick, A or Enter or Space confirms,
 * B or Esc goes back (Esc is routed by the screen stack), Start pauses and Select restarts (the race input).
 *
 * Every visible string should come from `t()` (src/ui/i18n.ts); the kit never adds text of its own except ARIA
 * defaults passed in by the caller.
 */
import '../tokens.css';

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

/** Create an element: `h('button', { class: 'x', onclick: fn }, ['Go'])`. `on*` attrs become listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: Child[] | Child = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of Array.isArray(children) ? children : [children]) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export interface ButtonOpts {
  primary?: boolean;
  disabled?: boolean;
  aria?: string;
  /** data-act for tests and the shell */
  act?: string;
}

export function button(label: string, onClick: () => void, o: ButtonOpts = {}): HTMLButtonElement {
  const b = h('button', { class: `fm-btn fm-ui-btn${o.primary ? ' primary' : ''}`, type: 'button', 'aria-label': o.aria, 'data-act': o.act, disabled: !!o.disabled }, [label]);
  b.addEventListener('click', () => {
    if (!b.disabled) onClick();
  });
  return b;
}

export interface TileOpts {
  sub?: string;
  icon?: string;
  locked?: boolean;
  /** what unlocks it, shown on a locked tile */
  lockText?: string;
}

export function tile(label: string, onClick: () => void, o: TileOpts = {}): HTMLButtonElement {
  const b = h('button', { class: 'fm-ui-tile', type: 'button', 'aria-disabled': o.locked ? 'true' : null }, [
    o.icon ? h('span', { class: 'i', 'aria-hidden': 'true' }, [o.icon]) : null,
    h('span', {}, [label]),
    o.locked && o.lockText ? h('small', {}, [`🔒 ${o.lockText}`]) : o.sub ? h('small', {}, [o.sub]) : null,
  ]);
  b.addEventListener('click', () => {
    if (!o.locked) onClick();
  });
  return b;
}

/** A sticker panel with a title. */
export function panel(title: string | null, children: Child[] = [], cls = ''): HTMLDivElement {
  return h('div', { class: `fm-panel fm-sticker ${cls}`.trim(), role: 'dialog', 'aria-label': title ?? undefined }, [title ? h('h1', {}, [title]) : null, ...children]);
}

export function list(items: Array<Node | string>): HTMLUListElement {
  return h('ul', { class: 'fm-ui-list' }, items.map((i) => h('li', {}, [i])));
}

/** An accessible on/off switch row (B42: a real control, not a whole-row tap target). */
export function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLDivElement {
  const sw = h('button', { class: 'fm-ui-switch', type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': label });
  sw.addEventListener('click', () => {
    const v = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return h('div', { class: 'fm-ui-toggle' }, [h('span', {}, [label]), sw]);
}

export function slider(label: string, value: number, onChange: (v: number) => void, o: { min?: number; max?: number; step?: number; format?: (v: number) => string } = {}): HTMLLabelElement {
  const min = o.min ?? 0;
  const max = o.max ?? 1;
  const fmt = o.format ?? ((v: number) => `${Math.round(v * 100)} %`);
  const out = h('span', {}, [fmt(value)]);
  const input = h('input', { type: 'range', min, max, step: o.step ?? 0.05, value, 'aria-label': label });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    onChange(v);
  });
  return h('label', { class: 'fm-ui-slider' }, [h('span', {}, [label]), out, input]);
}

export function tabs(names: string[], onPick: (i: number) => void, selected = 0): HTMLDivElement {
  const row = h('div', { class: 'fm-ui-tabs', role: 'tablist' });
  const btns = names.map((n, i) =>
    h('button', { class: 'fm-btn fm-ui-btn', type: 'button', role: 'tab', 'aria-selected': String(i === selected) }, [n]),
  );
  btns.forEach((b, i) =>
    b.addEventListener('click', () => {
      btns.forEach((x, j) => x.setAttribute('aria-selected', String(i === j)));
      onPick(i);
    }),
  );
  row.append(...btns);
  return row;
}

/** Sticky action row at the bottom of a panel (B39: Again / Next never scroll off on a small phone). */
export function actionFooter(buttons: Node[]): HTMLDivElement {
  return h('div', { class: 'fm-ui-footer fm-res-main' }, buttons);
}

/** Stat bars (garage, kart select): values 1..max. */
export function statBars(rows: Array<{ label: string; value: number; max?: number }>): HTMLDivElement {
  const el = h('div', { class: 'fm-ui-bars' });
  for (const r of rows) {
    const pct = Math.max(0, Math.min(1, r.value / (r.max ?? 5))) * 100;
    const bar = h('div', { class: 'fm-ui-bar', role: 'meter', 'aria-label': r.label, 'aria-valuenow': r.value, 'aria-valuemin': 0, 'aria-valuemax': r.max ?? 5 }, [h('i', { style: `width:${pct}%` })]);
    el.append(h('span', {}, [r.label]), bar);
  }
  return el;
}

let toastHost: HTMLDivElement | null = null;

/** A short message at the bottom of the screen. */
export function toast(text: string, ms = 2600): void {
  if (typeof document === 'undefined') return;
  if (!toastHost || !toastHost.isConnected) {
    toastHost = h('div', { class: 'fm-ui-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const t = h('div', { class: 'fm-ui-toast' }, [text]);
  toastHost.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/** A blocking question. Resolves to the index of the chosen button (or -1 on Esc / B). */
export function modal(title: string, text: string, buttons: string[]): Promise<number> {
  return new Promise((resolve) => {
    const wrap = h('div', { class: 'fm-ui-modal', 'data-ui-layer': '' });
    // focus moves into the modal (an Enter on the button that opened it used to open a second one) and back after
    const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    let closed = false;
    const done = (i: number) => {
      if (closed) return;
      closed = true;
      stop();
      window.removeEventListener('keydown', onKey, true);
      wrap.remove();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      resolve(i);
    };
    const btns = buttons.map((b, i) => button(b, () => done(i), { primary: i === 0 }));
    const row = actionFooter(btns);
    wrap.append(panel(title, [h('p', { class: 'fm-line' }, [text]), row]));
    document.body.appendChild(wrap);
    const stop = focusNav(wrap, { back: () => done(-1), modal: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(-1);
    };
    window.addEventListener('keydown', onKey, true);
    btns[0]?.focus({ preventScroll: true });
  });
}

// ------------------------------------------------------------------------------------------------
// focus navigation (B31: menus with a gamepad and the keyboard)
// ------------------------------------------------------------------------------------------------

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
}

/** Pick the focusable nearest in direction (dx, dy) from the current one (spatial navigation). */
export function nextFocus(items: readonly { x: number; y: number }[], from: number, dx: number, dy: number): number {
  if (from < 0) return items.length ? 0 : -1;
  const a = items[from];
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < items.length; i++) {
    if (i === from) continue;
    const vx = items[i].x - a.x;
    const vy = items[i].y - a.y;
    const along = vx * dx + vy * dy;
    if (along <= 1) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best < 0 ? from : best;
}

export interface FocusNavOpts {
  /** gamepad B (Esc is routed by the screen stack / modal) */
  back?: () => void;
  /** a dialog over the screens (kit modal, the cat maker, the dare name): while one is up, only it takes input */
  modal?: boolean;
}

/**
 * Arrow keys, D-pad and the left stick move focus between the controls in `root`; gamepad A clicks the focused
 * control. The first control gets focus when a key or pad is used (never on touch, so no focus ring on phones).
 * Returns a stop function.
 */
/**
 * Live modal focusNav roots, oldest first. While one is connected and shown, only the newest of them takes input, so
 * a dialog over a screen no longer moves focus (or handles pad B) in both at once. Screen layers are not tracked:
 * the stack already hides every layer but the top one.
 */
const modalStack: HTMLElement[] = [];
function isTopNav(root: HTMLElement): boolean {
  for (let i = modalStack.length - 1; i >= 0; i--) {
    const r = modalStack[i];
    if (!r.isConnected || r.hidden) continue;
    return r === root;
  }
  return true;
}

export function focusNav(root: HTMLElement, o: FocusNavOpts = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  let alive = true;
  if (o.modal) modalStack.push(root);
  const move = (dx: number, dy: number) => {
    if (root.hidden) return;
    const els = focusables(root);
    if (!els.length) return;
    const cur = els.indexOf(document.activeElement as HTMLElement);
    const pts = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const i = nextFocus(pts, cur, dx, dy);
    if (i >= 0) els[i].focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (root.hidden || !root.isConnected || !isTopNav(root)) return;
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
    const dir: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dir[e.key];
    if (!d || (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) return;
    if (a && (a as HTMLInputElement).type === 'range') return;
    e.preventDefault();
    root.classList.add('fm-nav-pad');
    move(d[0], d[1]);
  };
  window.addEventListener('keydown', onKey);
  // gamepad: edge-triggered, with a repeat for a held direction
  const prev: Record<string, boolean> = {};
  let held = 0;
  const sample = (): Record<string, boolean> | null => {
    if (!navigator.getGamepads) return null;
    for (const p of navigator.getGamepads()) {
      if (!p || !p.connected) continue;
      const b = (i: number) => !!p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      return {
        up: b(12) || ay < -0.6,
        down: b(13) || ay > 0.6,
        left: b(14) || ax < -0.6,
        right: b(15) || ax > 0.6,
        a: b(0),
        b: b(1),
      };
    }
    return null;
  };
  // [integrator] a button still held from the previous screen is not a new press: read the pad at mount, and keep
  // reading it while this layer is hidden under another one (one A press used to click through two screens)
  Object.assign(prev, sample() ?? {});
  const poll = () => {
    if (!alive) return;
    requestAnimationFrame(poll);
    if (root.hidden || !root.isConnected || !isTopNav(root)) {
      Object.assign(prev, sample() ?? {});
      held = 0;
      return;
    }
    const dirs = sample();
    if (dirs) {
      let any = false;
      for (const [k, on] of Object.entries(dirs)) {
        const edge = on && !prev[k];
        if (on && (k === 'up' || k === 'down' || k === 'left' || k === 'right')) any = true;
        if (edge || (on && held > 24 && held % 6 === 0 && k !== 'a' && k !== 'b')) {
          root.classList.add('fm-nav-pad');
          if (k === 'up') move(0, -1);
          else if (k === 'down') move(0, 1);
          else if (k === 'left') move(-1, 0);
          else if (k === 'right') move(1, 0);
          else if (k === 'a' && edge) {
            const a = document.activeElement as HTMLElement | null;
            // nothing focused yet in this layer: the first press focuses the first control instead of clicking
            if (a && root.contains(a)) a.click();
            else move(0, 1);
          }
          else if (k === 'b' && edge) o.back?.();
        }
        prev[k] = on;
      }
      held = any ? held + 1 : 0;
    }
  };
  requestAnimationFrame(poll);
  return () => {
    alive = false;
    window.removeEventListener('keydown', onKey);
    const i = modalStack.indexOf(root);
    if (i >= 0) modalStack.splice(i, 1);
  };
}
