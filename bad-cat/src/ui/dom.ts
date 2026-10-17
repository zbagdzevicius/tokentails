/** Tiny DOM helpers (no framework). */

type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (k === 'text') e.textContent = String(v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

/** A button that fires on click (keyboard accessible) with a press class for touch feedback. */
export function btn(label: string, onClick: () => void, cls = 'bc-cta', disabled = false): HTMLButtonElement {
  const b = h('button', { class: cls, type: 'button' }, label);
  if (disabled) b.disabled = true;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) onClick();
  });
  return b;
}

export function toast(host: HTMLElement, text: string, ms = 2200): void {
  const t = h('div', { class: 'bc-toast', role: 'status' }, text);
  host.appendChild(t);
  setTimeout(() => t.classList.add('is-out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      // A pending permission (some webviews, headless) never settles: fall back after 1.5 s instead of hanging.
      const ok = await Promise.race([
        navigator.clipboard.writeText(text).then(() => true),
        new Promise<boolean>((res) => setTimeout(() => res(false), 1500)),
      ]);
      if (ok) return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = h('textarea', {}, text);
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
