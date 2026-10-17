/**
 * Briefing card (GDD 3.1): room, the human, 3 Must-Wreck targets, mode badge; tap anywhere to start.
 * The renderer warms up behind it (the app shell loads the room into the stage first).
 */
import type { RunMode } from '../../types';
import { COPY, propEmoji } from '../copy';
import { btn, h } from '../dom';

export interface BriefingProps {
  label: string;
  humanName: string;
  /** Persona icon (🧑‍🍳 Chef Dad, 🛋️ Couch Potato...). */
  humanIcon?: string;
  /** Written turn warning ("turns when the stove timer dings"). */
  warning: string;
  eventName: string;
  mode: RunMode;
  targets: { kind: number; name: string }[];
  touch: boolean;
  ready: boolean;
  /** Dare line, e.g. "Beat Mochi's ghost: 8,420". */
  dare?: string;
  /** FULL build lines: the weekday twist, today's Pink Paw accomplice and her wish, the sponsor, the community credit. */
  notes?: { icon: string; text: string }[];
  /** Boss banner ("BOSS ROOM · 90 s · two humans"). */
  banner?: string;
  /** Felony Friday chooser (GDD 3.5): your cat, today's Pink Paw cat, the week's guest star(s). */
  chooser?: { title: string; options: { id: string; label: string; sub?: string }[]; selected: string; onPick(id: string): void; line?: string };
  onStart(): void;
  onBack(): void;
}

export interface BriefingHandle {
  setReady(ready: boolean): void;
  /** Felony Friday: the line under the chooser ("Medutis commits the crime. Mochi cheers from the window."). */
  setChooserLine?(text: string): void;
  /** Replace the chooser (guest stars arrive with the cameo bundle). */
  setChooser?(c: BriefingProps['chooser'] | null): void;
  dispose(): void;
}

export function mountBriefing(host: HTMLElement, p: BriefingProps): BriefingHandle {
  const badge = p.mode === 'ranked' ? COPY.ranked : p.mode === 'ftue' ? COPY.ftue : COPY.practice;
  const go = h('div', { class: 'bc-tap' }, p.touch ? COPY.tapToStart : COPY.pressToStart);
  const chooserSlot = h('div', { class: 'bc-chooser-slot' }, p.chooser ? chooserEl(p.chooser) : null);
  const card = h(
    'div',
    { class: 'bc-brief-card' },
    h('div', { class: 'bc-brief-head' }, h('div', { class: `bc-mode bc-mode-${p.mode}` }, badge), btn(`‹ ${COPY.back}`, p.onBack, 'bc-link')),
    p.banner ? h('div', { class: 'bc-boss-banner' }, p.banner) : null,
    h('h2', {}, p.label),
    p.dare ? h('p', { class: 'bc-dare-note' }, p.dare) : null,
    h('p', { class: 'bc-human' }, h('span', { 'aria-hidden': 'true' }, `${p.humanIcon ?? '🧍'} `), p.humanName, h('small', {}, ` · ${p.warning}`)),
    p.notes?.length
      ? h('ul', { class: 'bc-brief-notes' }, ...p.notes.map((n) => h('li', {}, h('span', { 'aria-hidden': 'true' }, `${n.icon} `), n.text)))
      : null,
    chooserSlot,
    h('div', { class: 'bc-kicker' }, COPY.mustWreck),
    h(
      'ul',
      { class: 'bc-targets' },
      ...p.targets.map((t) => h('li', {}, h('span', { class: 'bc-t-ico', 'aria-hidden': 'true' }, propEmoji(t.kind)), t.name)),
    ),
    h('p', { class: 'bc-muted bc-small' }, `${p.eventName} gives you a free window. Freeze when they turn.`),
    go,
  );
  const root = h('div', { class: 'bc-screen bc-briefing' }, card);
  let ready = p.ready;
  const setReady = (r: boolean): void => {
    ready = r;
    root.classList.toggle('is-loading', !r);
    go.textContent = r ? (p.touch ? COPY.tapToStart : COPY.pressToStart) : COPY.loading;
  };
  setReady(ready);
  let started = false;
  const start = (): void => {
    if (!ready || started) return;
    started = true;
    p.onStart();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      start();
    }
  };
  root.addEventListener('click', start);
  window.addEventListener('keydown', onKey);
  host.appendChild(root);
  return {
    setReady,
    setChooser(c) {
      chooserSlot.innerHTML = '';
      if (c) chooserSlot.append(chooserEl(c));
    },
    setChooserLine(text) {
      const el = root.querySelector('.bc-chooser-line');
      if (el) el.textContent = text;
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}

/** Felony Friday: who commits today's crime. Taps on the chips never start the run. */
function chooserEl(c: NonNullable<BriefingProps['chooser']>): HTMLElement {
  const line = h('p', { class: 'bc-muted bc-small bc-chooser-line' }, c.line ?? '');
  const row = h('div', { class: 'bc-chooser-row', role: 'radiogroup', 'aria-label': c.title });
  for (const o of c.options) {
    const b = btn(o.label, () => {
      row.querySelectorAll('.bc-chip').forEach((x) => {
        x.classList.toggle('is-on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      c.onPick(o.id);
    }, `bc-chip${o.id === c.selected ? ' is-on' : ''}`);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(o.id === c.selected));
    b.dataset.choice = o.id;
    if (o.sub) b.title = o.sub;
    row.append(b);
  }
  const box = h('div', { class: 'bc-chooser' }, h('div', { class: 'bc-kicker' }, c.title), row, line);
  box.addEventListener('click', (e) => e.stopPropagation());
  return box;
}
