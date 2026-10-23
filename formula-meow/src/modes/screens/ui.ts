/**
 * Shared bits of the modes lane's screens, built on the UI kit (src/ui/kit) so the audio-ui lane's look applies:
 * a panel with a header (back button, title, subtitle), a scrolling body and a sticky footer; choice chips; small
 * formatting helpers. Every visible string comes from `t()`.
 */
import { screens } from '../../core/app/screens';
import { CLASSES } from '../../tuning';
import { actionFooter, button, h } from '../../ui/kit';
import { t } from '../../ui/i18n';

export interface Frame {
  panel: HTMLDivElement;
  body: HTMLDivElement;
  footer: HTMLDivElement;
  sub: HTMLParagraphElement;
}

export interface FrameOpts {
  title: string;
  sub?: string;
  /** extra class on the panel */
  cls?: string;
  /** a bottom sheet over the showroom (portrait) / a side panel (landscape) */
  sheet?: boolean;
  /** hide the back button (the title and menu roots) */
  noBack?: boolean;
}

export function frame(root: HTMLElement, o: FrameOpts): Frame {
  if (o.sheet) root.classList.add('fm-m-sheet');
  const back = o.noBack ? null : h('button', { class: 'fm-m-back', type: 'button', 'aria-label': t('Back'), 'data-act': 'back' }, ['‹']);
  back?.addEventListener('click', () => screens.back());
  const sub = h('p', { class: 'fm-m-sub' }, [o.sub ?? '']);
  if (!o.sub) sub.hidden = true;
  const body = h('div', { class: 'fm-m-body' });
  const footer = actionFooter([]);
  footer.classList.add('fm-m-footer');
  const panel = h('div', { class: `fm-panel fm-sticker fm-m-panel ${o.cls ?? ''}`.trim(), role: 'dialog', 'aria-label': o.title }, [
    h('div', { class: 'fm-m-head' }, [back, h('h1', {}, [o.title])]),
    sub,
    body,
    footer,
  ]);
  root.append(panel);
  return { panel, body, footer, sub };
}

export interface ChipOpts {
  selected?: boolean;
  locked?: string | null;
  sub?: string;
  icon?: string;
  /** a colour swatch (paint) */
  swatch?: string[];
  aria?: string;
  act?: string;
}

/** A choice button (cats, bodies, paints, classes, tracks). A locked chip shows what unlocks it and does nothing. */
export function chip(label: string, onPick: () => void, o: ChipOpts = {}): HTMLButtonElement {
  const b = h(
    'button',
    {
      class: `fm-m-chip${o.selected ? ' sel' : ''}${o.locked ? ' locked' : ''}`,
      type: 'button',
      'aria-pressed': String(!!o.selected),
      'aria-disabled': o.locked ? 'true' : null,
      'aria-label': o.aria ?? null,
      'data-act': o.act ?? null,
    },
    [
      o.swatch ? h('span', { class: 'sw', 'aria-hidden': 'true' }, o.swatch.map((c) => h('i', { style: `background:${c}` }))) : null,
      o.icon ? h('span', { class: 'ic', 'aria-hidden': 'true' }, [o.icon]) : null,
      h('span', { class: 'lb' }, [label]),
      o.locked ? h('small', {}, [`🔒 ${o.locked}`]) : o.sub ? h('small', {}, [o.sub]) : null,
    ],
  );
  b.addEventListener('click', () => {
    if (!o.locked) onPick();
  });
  return b;
}

export function primary(label: string, run: () => void, act: string): HTMLButtonElement {
  return button(label, run, { primary: true, act });
}

export function plain(label: string, run: () => void, act: string): HTMLButtonElement {
  return button(label, run, { act });
}

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export const MEDAL = ['', '🥉', '🥈', '🥇'];
export const TROPHY = ['', '🥇', '🥈', '🥉'];

/** Touch device (labels say "tap" instead of "press"). */
export function touchUi(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

/** Focus the first control of a layer when a keyboard or pad is in use (never on touch: no ring on phones). */
export function focusFirst(root: HTMLElement, sel = 'button:not([disabled])'): void {
  if (touchUi()) return;
  // a pad button still held from the press that opened this layer would click the focused control at once
  // (focusNav sees it as a new press): leave the focus empty, the next press of A focuses the first control
  if (padHeld()) return;
  requestAnimationFrame(() => {
    // the player already moved the focus here (a quick arrow press): keep it
    if (root.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  });
}

/** Any gamepad button (or button `i`) down right now. */
export function padHeld(i?: number): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
  for (const p of navigator.getGamepads()) if (p?.connected && (i == null ? p.buttons.some((b) => b.pressed) : !!p.buttons[i]?.pressed)) return true;
  return false;
}

let shownAt = 0;
screens.onChange(() => (shownAt = typeof performance !== 'undefined' ? performance.now() : 0));

/**
 * The B press that closed the layer above is still held when this layer shows again; focusNav takes it for a new
 * press, so one press of B would fall back through every layer to the title. True = swallow this back.
 */
export function heldBack(): boolean {
  return padHeld(1) && performance.now() - shownAt < 500;
}

/** A back handler that swallows a held B and otherwise lets the stack pop the layer. */
export const guardedBack = (): boolean | void => (heldBack() ? true : undefined);

/** "50cc Kitten", …, "Mirror" for a class pick. */
/** A class as a menu tile reads it: "100cc", or "Mirror". */
export function shortClass(c: number): string {
  return c === 3 ? t('Mirror') : (CLASSES[c] ?? CLASSES[0]).cc;
}

export function classLabel(c: number): string {
  if (c === 3) return t('Mirror');
  const k = CLASSES[c] ?? CLASSES[0];
  return `${k.cc} ${t(k.name)}`;
}
