/** Tiny DOM helpers for the overlay UI (no framework). */

type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;
type Child = Node | string | null | undefined | false;

/** Create an element: h('button.btn.primary', { onclick: fn, 'aria-label': 'Play' }, 'Play'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | `${K}.${string}` | `${K}#${string}`, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(tag);
  const name = (m ? m[1] : tag) as K;
  const el = document.createElement(name);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className += (el.className ? ' ' : '') + String(v);
      else if (k === 'text') el.textContent = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Set textContent only when it changed (cheap per-frame HUD updates). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function isCoarsePointer(): boolean {
  try {
    return typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
  } catch {
    return false;
  }
}

/** Format ticks as m:ss. */
export function formatTime(ticks: number, hz = 30): string {
  const s = Math.max(0, Math.floor(ticks / hz));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function hashHex(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: ignore */
  }
}
