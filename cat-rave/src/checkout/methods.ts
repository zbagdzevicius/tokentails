/**
 * Card | Crypto selector shared by the Add-a-cat sheet and the Advertise sheet. Both methods are
 * always shown; a closed one is disabled with a short reason, so the buyer sees the choice exists.
 * Card is the default whenever it is open. Crypto is USDC on Arc only.
 */
import type { RaveMethod } from './types';

export interface MethodAvailability {
  card: boolean;
  usdc: boolean;
  reasons?: { card: string | null; usdc: string | null };
}

export const METHOD_LABELS: Readonly<Record<RaveMethod, { main: string; sub: string }>> = Object.freeze({
  card: { main: '💳 Card', sub: 'Apple Pay · Google Pay' },
  usdc: { main: '🪙 Crypto', sub: 'USDC on Arc' },
});

/** Card when it is open, else crypto (the sheet only opens when one of them is). */
export function defaultMethod(a: MethodAvailability): RaveMethod {
  return a.card || !a.usdc ? 'card' : 'usdc';
}

/** One short line under a closed method. */
export function methodOffText(m: RaveMethod, reason: string | null | undefined): string {
  if (m === 'card') {
    switch (reason) {
      case 'keeper':
        return 'Card is paused while the shelter payout wallet refills.';
      case 'cap':
        return 'Today’s card quota is full. Crypto still works.';
      case 'mode':
      case 'stripe':
      default:
        return 'Card is not available right now.';
    }
  }
  return 'Crypto (USDC on Arc) is not available right now.';
}

export interface MethodTabs {
  el: HTMLDivElement;
  card: HTMLButtonElement;
  usdc: HTMLButtonElement;
  /** Line under the tabs naming why a method is closed (empty when both are open). */
  note: HTMLParagraphElement;
  render(selected: RaveMethod, busy: boolean): void;
  /** Fresh availability (a status refresh); call render() after. */
  setAvailability(a: MethodAvailability): void;
}

let tabsSeq = 0;

/**
 * Builds the two-way selector: a radiogroup (arrow keys move between the two, one tab stop). A closed
 * method stays focusable with `aria-disabled` and points at the note that says why (a `title` alone is
 * invisible on touch and to screen readers). `onPick` fires only for an open method that is not already
 * selected.
 */
export function createMethodTabs(initial: MethodAvailability, onPick: (m: RaveMethod) => void, ariaLabel = 'Pay with'): MethodTabs {
  let a = initial;
  let current: RaveMethod = defaultMethod(initial);
  let isBusy = false;
  const id = `rvc-tabs-${++tabsSeq}`;
  const el = document.createElement('div');
  el.className = 'rvc-tabs';
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', ariaLabel);
  const note = document.createElement('p');
  note.className = 'rvc-hint rvc-tabs-note';
  note.id = `${id}-note`;
  note.setAttribute('aria-live', 'polite');
  const isOpen = (m: RaveMethod) => (m === 'card' ? a.card : a.usdc);
  const pick = (m: RaveMethod) => {
    if (isBusy || !isOpen(m) || m === current) return;
    onPick(m);
  };
  const make = (m: RaveMethod) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rvc-tab';
    b.setAttribute('role', 'radio');
    b.id = `${id}-${m}`;
    b.dataset.method = m;
    const main = document.createElement('b');
    main.className = 'rvc-tab-main';
    main.textContent = METHOD_LABELS[m].main;
    const sub = document.createElement('small');
    sub.className = 'rvc-tab-sub';
    sub.textContent = METHOD_LABELS[m].sub;
    b.append(main, sub);
    b.addEventListener('click', () => pick(m));
    b.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const other: RaveMethod = m === 'card' ? 'usdc' : 'card';
      (other === 'card' ? card : usdc).focus();
      pick(other);
    });
    return b;
  };
  const card = make('card');
  const usdc = make('usdc');
  el.append(card, usdc);
  return {
    el,
    card,
    usdc,
    note,
    render(selected, busy) {
      current = selected;
      isBusy = busy;
      el.setAttribute('aria-busy', String(busy));
      for (const [b, m] of [
        [card, 'card'],
        [usdc, 'usdc'],
      ] as const) {
        const open = isOpen(m);
        b.setAttribute('aria-checked', String(selected === m));
        // Kept for the stylesheet (the selected look).
        b.setAttribute('aria-selected', String(selected === m));
        b.tabIndex = selected === m ? 0 : -1;
        // Never `disabled`: that drops focus while busy and hides a closed method's reason.
        b.setAttribute('aria-disabled', String(!open || busy));
        b.classList.toggle('rvc-tab-off', !open);
        b.classList.toggle('rvc-tab-busy', busy);
        if (open) b.removeAttribute('aria-describedby');
        else b.setAttribute('aria-describedby', note.id);
        b.removeAttribute('title');
      }
      const closed = (['card', 'usdc'] as const).filter((m) => !isOpen(m));
      note.textContent = closed.map((m) => methodOffText(m, a.reasons?.[m])).join(' ');
      note.hidden = !note.textContent;
    },
    setAvailability(next) {
      a = next;
    },
  };
}
