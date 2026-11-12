/**
 * Mode Select (docs/plans/moba/HOME-MODES.md §5): a full-screen overlay opened from Home's mode pill. A row of round,
 * gold-framed mode tiles (painted art in a CSS/SVG ring, a crest at 12 o'clock, an "i" at 4 o'clock), a queue segment
 * (Bots | Co-op | PvP, filtered by what the mode and this build offer), the bots difficulty when Bots is chosen, and
 * Confirm, which saves the choice and returns Home (PLAY stays the one play path). A double tap on a tile confirms too.
 *
 * Never scrolls vertically; with more tiles than fit, the tile row scrolls sideways with snap (its only scroll).
 * Low tier or reduced motion: no stagger, no rune rotation, no blur. Mode art loads lazily when the overlay opens.
 * Esc closes the info popover first, then the overlay (focus goes back to the pill).
 */
import './modeSelect.css';
import type { Difficulty } from '../../sim/api';
import { DIFFICULTY_HINT, DIFFICULTY_TEXT } from '../heroText';
import { crestSvg } from './crest';
import { countdownText, effectiveState, metaLine, playable, queueFor, QUEUE_LABEL, type ModeChoice, type ModeDef, type Queue } from './modes';

/** A page-relative asset path as an absolute URL (CSS custom properties need one). */
export const absUrl = (p: string): string => {
  try {
    return new URL(p, document.baseURI).href;
  } catch {
    return p;
  }
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface ModeSelectOpts {
  modes: readonly ModeDef[];
  choice: ModeChoice;
  /** Queues this build can start now (no relay: bots only; no PvP sim: no PvP). */
  available: readonly Queue[];
  /** PvP has a match-count lock for this mode (null: open). */
  pvpLock?(mode: ModeDef): string | null;
  difficulties: readonly Difficulty[];
  difficulty: Difficulty;
  difficultyNote?: string;
  onDifficulty?(d: Difficulty): void;
  onConfirm(c: ModeChoice): void;
  onClose(): void;
  sound?(name: 'click' | 'magic' | 'horn'): void;
  /** Asset base (import.meta.env.BASE_URL). */
  base: string;
  /** Low tier: no motion, 256 px art. */
  low?: boolean;
  /** Clock (tests). */
  now?(): number;
}

export interface ModeSelectHandle {
  readonly el: HTMLElement;
  close(): void;
}

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
const QUEUE_ICON: Readonly<Record<Queue, string>> = {
  bots: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><rect x="5" y="8" width="14" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="13" r="1.6" fill="currentColor"/><circle cx="14.5" cy="13" r="1.6" fill="currentColor"/><path d="M12 8V5M10 4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  coop: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  pvp: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><path d="M4 4l10 10M20 4L10 14M6 16l-2 2 2 2 2-2M18 16l2 2-2 2-2-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

/** One tile's markup. Pure (given `now`). */
export function tileHtml(m: ModeDef, o: { selected: boolean; now: number; base: string; low: boolean; i: number }): string {
  const st = effectiveState(m, o.now);
  const can = playable(m, o.now);
  const art = `${o.base}assets/modes/${m.art}-${o.low ? 256 : 512}.webp`;
  const chip =
    st === 'event' && typeof m.state === 'object'
      ? `<span class="ms-chip ev" data-ends="${m.state.event.endsAt}">⏱ ${esc(countdownText(m.state.event.endsAt - o.now))}</span>`
      : m.isNew && can
        ? '<span class="ms-chip new">NEW</span>'
        : '';
  const meta = metaLine(m, o.now);
  const name = `${m.name}${st === 'locked' ? ', locked' : st === 'soon' ? ', coming soon' : ''}`;
  return `<div class="ms-tile" role="presentation" data-state="${st}" style="--i:${o.i}">
    <button type="button" class="ms-pick${o.selected ? ' on' : ''}" role="radio" aria-checked="${o.selected}" tabindex="${o.selected ? 0 : -1}" data-mode="${esc(m.id)}"${can ? '' : ' aria-disabled="true"'} aria-label="${esc(`${name}. ${meta}`)}" data-testid="mode-${esc(m.id)}">
      <span class="ms-ring" aria-hidden="true">
        <span class="ms-runes"></span>
        <span class="ms-frame"><img class="ms-art" src="${esc(art)}" alt="" loading="lazy" decoding="async" draggable="false"></span>
        ${st === 'soon' ? '<span class="ms-band">SOON</span>' : ''}
        ${st === 'locked' ? `<span class="ms-lock">${LOCK}</span>` : ''}
        <span class="ms-crest">${crestSvg(m.id)}</span>
      </span>
      ${chip}
      <span class="ms-name">${esc(m.name)}</span>
      ${m.rank ? `<span class="ms-rank">${esc(m.rank.tier)}${m.rank.lp !== undefined ? ` · ${m.rank.lp} LP` : ''}</span>` : ''}
      <span class="ms-meta">${esc(meta)}</span>
    </button>
    <button type="button" class="ms-info" data-info="${esc(m.id)}" aria-label="${esc(`About ${m.name}`)}" aria-haspopup="dialog"><i aria-hidden="true">i</i></button>
  </div>`;
}

const overlayOpenElsewhere = (self: HTMLElement): boolean =>
  !!Array.from(document.querySelectorAll('.pl-menu, [aria-modal="true"], .pl-store, .pl-offer')).some((n) => n !== self && !self.contains(n));

export function openModeSelect(parent: HTMLElement, o: ModeSelectOpts): ModeSelectHandle {
  const now = (): number => (o.now ? o.now() : Date.now());
  const low = !!o.low;
  let sel = o.choice.mode;
  let queue: Queue = o.choice.queue;
  let diff = o.difficulty;
  const modeOf = (id: string): ModeDef | undefined => o.modes.find((m) => m.id === id);
  const offered = (m: ModeDef | undefined): Queue[] => (m ? m.queues.filter((q) => o.available.includes(q)) : []);
  const el = document.createElement('div');
  el.className = `ms-overlay${low ? ' low' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'ms-title');
  el.dataset.testid = 'mode-select';
  const w = (window.innerWidth || 1280) * Math.min(2, window.devicePixelRatio || 1);
  // absolute: a relative url() in a custom property resolves against the stylesheet that uses it (the CSS chunk)
  el.style.setProperty('--ms-bg', `url("${absUrl(`${o.base}assets/screens/modes-${!low && w > 1400 ? 1920 : 1280}.webp`)}")`);
  const tiles = (): string => o.modes.map((m, i) => tileHtml(m, { selected: m.id === sel, now: now(), base: o.base, low, i })).join('');
  el.innerHTML = `
    <div class="ms-bg" aria-hidden="true"></div>
    <header class="ms-head">
      <button type="button" class="ms-btn ms-back" data-a="ms-back" aria-label="Back">${BACK}</button>
      <h2 id="ms-title" class="ms-title">Choose your battle</h2>
      <span class="ms-head-r"></span>
    </header>
    <div class="ms-rowwrap"><div class="ms-row" role="radiogroup" aria-label="Game mode">${tiles()}</div></div>
    <footer class="ms-foot">
      <div class="ms-queues" role="radiogroup" aria-label="Queue"></div>
      <div class="ms-diff"></div>
      <button type="button" class="ms-confirm" data-a="ms-confirm" data-testid="mode-confirm"><span>Confirm</span></button>
    </footer>
    <div class="ms-pop" role="dialog" aria-modal="false" hidden></div>
    <p class="ms-toast" role="status" aria-live="polite"></p>`;

  const renderQueues = (): void => {
    const m = modeOf(sel);
    const qs = offered(m);
    queue = queueFor({ queues: qs.length ? qs : ['bots'] }, queue);
    const lockOf = (q: Queue): string | null => (q === 'pvp' && m && o.pvpLock ? o.pvpLock(m) : null);
    el.querySelector('.ms-queues')!.innerHTML = qs
      .map((q) => {
        const on = q === queue;
        const lock = lockOf(q);
        return `<button type="button" role="radio" class="${on ? 'on' : ''}" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-q="${q}" data-testid="queue-${q}"${lock ? ` aria-disabled="true" title="${esc(lock)}"` : ''}>${QUEUE_ICON[q]}<span>${QUEUE_LABEL[q]}</span>${lock ? '<i class="ms-qlock" aria-hidden="true">🔒</i>' : ''}</button>`;
      })
      .join('');
    const d = el.querySelector<HTMLElement>('.ms-diff')!;
    if (queue !== 'bots') d.innerHTML = `<p class="ms-qline">${queue === 'coop' ? 'Team up with players online vs bots' : 'Players vs players'}</p>`;
    else if (o.difficultyNote) d.innerHTML = `<p class="ms-qline">${esc(o.difficultyNote)}</p>`;
    else if (o.difficulties.length >= 2)
      d.innerHTML = `<div class="ms-seg" role="radiogroup" aria-label="Bots">${o.difficulties
        .map((x) => {
          const on = x === diff;
          const n = (DIFFICULTY_TEXT as Record<string, string>)[x]?.replace(' bots', '') ?? x;
          return `<button type="button" role="radio" class="${on ? 'on' : ''}" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-d="${x}" title="${esc(DIFFICULTY_HINT[x] ?? '')}">${esc(n)}</button>`;
        })
        .join('')}</div>`;
    else d.innerHTML = '';
    const ok = !!m && playable(m, now());
    const c = el.querySelector<HTMLButtonElement>('.ms-confirm')!;
    c.disabled = !ok;
    c.setAttribute('aria-label', m ? `Confirm ${m.name}, ${QUEUE_LABEL[queue]}` : 'Confirm');
  };

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const toast = (t: string): void => {
    const n = el.querySelector<HTMLElement>('.ms-toast')!;
    n.textContent = t;
    n.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => n.classList.remove('on'), 2600);
  };
  const shake = (b: HTMLElement): void => {
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  };
  const select = (id: string, focus = false): void => {
    const m = modeOf(id);
    if (!m) return;
    if (!playable(m, now())) {
      const b = el.querySelector<HTMLElement>(`.ms-pick[data-mode="${CSS.escape(id)}"]`);
      if (b) shake(b);
      o.sound?.('click');
      toast(`${m.name}: ${metaLine(m, now())}.`);
      return;
    }
    if (id !== sel) o.sound?.('magic');
    sel = id;
    for (const b of el.querySelectorAll<HTMLElement>('.ms-pick')) {
      const on = b.dataset.mode === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    el.querySelector('.ms-row')!.classList.add('has-sel');
    renderQueues();
  };
  const confirm = (): void => {
    const m = modeOf(sel);
    if (!m || !playable(m, now())) return;
    o.sound?.('click');
    o.onConfirm({ mode: sel, queue });
    close();
  };
  const pop = el.querySelector<HTMLElement>('.ms-pop')!;
  let popFor: HTMLElement | null = null;
  const closePop = (): boolean => {
    if (pop.hidden) return false;
    pop.hidden = true;
    popFor?.focus();
    popFor = null;
    return true;
  };
  const openPop = (id: string, btn: HTMLElement): void => {
    const m = modeOf(id);
    if (!m) return;
    popFor = btn;
    const facts = [m.map === 'hearthwood' ? 'Hearthwood Divide' : m.map === 'crossing' ? 'Purrhaven Crossing' : '', m.size, m.minutes].filter(Boolean).join(' · ');
    pop.innerHTML = `<h3>${esc(m.name)}</h3>${facts ? `<p class="ms-facts">${esc(facts)}</p>` : ''}<ul>${m.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><button type="button" class="ms-btn ms-pop-x" data-a="ms-pop-x" aria-label="Close">✕</button>`;
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const W = window.innerWidth || 844;
    const pw = Math.min(260, W - 32);
    pop.style.width = `${pw}px`;
    pop.style.left = `${Math.max(16, Math.min(W - pw - 16, r.left + r.width / 2 - pw / 2))}px`;
    pop.style.top = `${Math.max(8, r.top - 8)}px`;
    pop.querySelector<HTMLElement>('.ms-pop-x')?.focus();
  };

  let lastTap = { id: '', t: 0 };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (!pop.hidden && !pop.contains(t)) {
      closePop();
      if (!t.closest('[data-info]')) return;
    }
    const info = t.closest<HTMLElement>('[data-info]');
    if (info) {
      o.sound?.('click');
      openPop(info.dataset.info!, info);
      return;
    }
    const pick = t.closest<HTMLElement>('.ms-pick');
    if (pick) {
      const id = pick.dataset.mode!;
      const at = performance.now();
      const dbl = lastTap.id === id && at - lastTap.t < 350 && id === sel;
      lastTap = { id, t: at };
      select(id);
      if (dbl) confirm();
      return;
    }
    const q = t.closest<HTMLElement>('[data-q]');
    if (q) {
      const v = q.dataset.q as Queue;
      if (q.getAttribute('aria-disabled') === 'true') {
        shake(q);
        toast(q.title || 'Locked');
        return;
      }
      if (v !== queue) o.sound?.('click');
      queue = v;
      renderQueues();
      return;
    }
    const d = t.closest<HTMLElement>('[data-d]')?.dataset.d as Difficulty | undefined;
    if (d) {
      o.sound?.('click');
      diff = d;
      o.onDifficulty?.(d);
      renderQueues();
      return;
    }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'ms-back') close();
    else if (a === 'ms-confirm') confirm();
    else if (a === 'ms-pop-x') closePop();
  });
  // arrow keys: the tile row and the segments are radio groups (one tab stop each)
  el.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const t = e.target as HTMLElement;
    if (step && t.closest('.ms-row')) {
      e.preventDefault();
      const ids = o.modes.filter((m) => playable(m, now())).map((m) => m.id);
      const i = ids.indexOf(sel);
      select(ids[(i + step + ids.length) % ids.length], true);
      el.querySelector<HTMLElement>('.ms-pick.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } else if (step && t.closest('.ms-queues')) {
      e.preventDefault();
      const qs = Array.from(el.querySelectorAll<HTMLElement>('.ms-queues [data-q]:not([aria-disabled="true"])'));
      const i = qs.findIndex((b) => b.dataset.q === queue);
      queue = qs[(i + step + qs.length) % qs.length]?.dataset.q as Queue;
      renderQueues();
      el.querySelector<HTMLElement>('.ms-queues .on')?.focus();
    } else if (step && t.closest('.ms-seg')) {
      e.preventDefault();
      const ds = o.difficulties;
      const i = ds.indexOf(diff);
      diff = ds[(i + step + ds.length) % ds.length];
      o.onDifficulty?.(diff);
      renderQueues();
      el.querySelector<HTMLElement>('.ms-seg .on')?.focus();
    }
  });
  const onKey = (e: KeyboardEvent): void => {
    if (!el.isConnected) return;
    if (e.key !== 'Escape' || overlayOpenElsewhere(el)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!closePop()) close();
  };
  document.addEventListener('keydown', onKey, true);
  // event countdowns tick once a minute
  const tick = setInterval(() => {
    for (const c of el.querySelectorAll<HTMLElement>('.ms-chip.ev[data-ends]')) c.textContent = `⏱ ${countdownText(Number(c.dataset.ends) - now())}`;
  }, 60_000);
  // the row's edge fades follow its scroll position (only when it overflows)
  const row = el.querySelector<HTMLElement>('.ms-row')!;
  const edges = (): void => {
    const wrap = row.parentElement!;
    wrap.classList.toggle('fade-l', row.scrollLeft > 4);
    wrap.classList.toggle('fade-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  };
  row.addEventListener('scroll', edges, { passive: true });

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    clearInterval(tick);
    if (toastTimer) clearTimeout(toastTimer);
    const done = (): void => {
      el.remove();
      o.onClose();
    };
    if (low || !el.animate) done();
    else {
      el.classList.add('out');
      setTimeout(done, 200);
    }
  }

  parent.appendChild(el);
  renderQueues();
  if (sel) el.querySelector('.ms-row')!.classList.add('has-sel');
  requestAnimationFrame(() => {
    edges();
    const on = el.querySelector<HTMLElement>('.ms-pick.on') ?? el.querySelector<HTMLElement>('.ms-pick');
    on?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    on?.focus({ preventScroll: true });
  });
  return { el, close };
}
