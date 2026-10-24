// Small UI helpers for the SHARE lane's overlays: a modal on the hub's overlay layer that owns the keyboard while it
// is open (the results screen maps Enter/R/Esc to RETRY/STAGES, the title maps Enter/Space to PLAY), plus button
// and text builders that never use innerHTML for untrusted text.
import { openOverlay } from '../ugc/hub';

interface Modal {
  el: HTMLElement;
  close(): void;
}
const stack: { m: Modal; onEsc?: () => void; onEnter?: () => void }[] = [];
let listening = false;

function onKey(e: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  if (!top) return;
  // everything stays inside the overlay; typing into an input still works (no preventDefault for text keys)
  e.stopPropagation();
  if (e.repeat) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    top.onEsc?.();
  } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && top.onEnter) {
    e.preventDefault();
    top.onEnter();
  }
}

export function modal(cls: string, opts: { onEsc?: () => void; onEnter?: () => void } = {}): Modal {
  const o = openOverlay(`share-ov ${cls}`);
  o.el.setAttribute('role', 'dialog');
  o.el.setAttribute('aria-modal', 'true');
  const entry = {
    m: {
      el: o.el,
      close: () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
        o.close();
        if (!stack.length && listening) {
          removeEventListener('keydown', onKey, true);
          listening = false;
        }
      },
    },
    ...opts,
  };
  stack.push(entry);
  if (!listening) {
    addEventListener('keydown', onKey, true);
    listening = true;
  }
  return entry.m;
}
export const modalOpen = (): boolean => stack.length > 0;

export function button(id: string, cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (id) b.id = id;
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
