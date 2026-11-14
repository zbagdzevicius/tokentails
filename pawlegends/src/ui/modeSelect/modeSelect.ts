/**
 * Mode Select (docs/plans/moba/HOME-MODES.md §5): the one play path's first two steps, opened by Home's PLAY.
 *
 * 1. **Mode.** A row of round, gold-framed mode tiles (painted art in a CSS/SVG ring, a crest at 12 o'clock, an "i" at
 *    4 o'clock). A tap selects a tile; Next, a double tap or Enter on the tile goes on. A locked or coming-soon tile
 *    shakes and says why.
 * 2. **Variant.** The same overlay, second stage: VS BOTS (with the bots difficulty, remembered), CO-OP, PVP and WITH
 *    FRIENDS, only the variants the mode supports; one this build cannot start (no party server, no PvP sim, the PvP
 *    match lock) shows locked with its reason. The action button names what comes next: "Choose champion" (bots: the
 *    champion select's LOCK IN starts the match), "Find match" (co-op and PvP: the queue; the champion select follows
 *    the match found) or "Open party" (friends: the party lobby). A double tap or Enter on a variant goes too.
 *
 * Back (or Esc) steps back one stage, then closes. The choice is remembered (`onConfirm`) when the player goes.
 * Never scrolls vertically; with more tiles than fit, the tile row scrolls sideways with snap (its only scroll).
 * Low tier or reduced motion: no stagger, no rune rotation. Mode art loads lazily when the overlay opens.
 */
import './modeSelect.css';
import type { Difficulty } from '../../sim/api';
import { DIFFICULTY_HINT, DIFFICULTY_TEXT } from '../heroText';
import { crestSvg } from './crest';
import { countdownText, effectiveState, metaLine, playable, queueFor, QUEUE_LABEL, VARIANT_LINE, variantLock, type ModeChoice, type ModeDef, type Queue } from './modes';

/** A page-relative asset path as an absolute URL (CSS custom properties need one). */
export const absUrl = (p: string): string => {
  try {
    return new URL(p, document.baseURI).href;
  } catch {
    return p;
  }
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export type ModeStage = 'mode' | 'variant';

export interface ModeSelectOpts {
  modes: readonly ModeDef[];
  choice: ModeChoice;
  /** Variants this build can start now (no relay: bots only; no PvP sim: no PvP). */
  available: readonly Queue[];
  /** PvP has a match-count lock for this mode (null: open). */
  pvpLock?(mode: ModeDef): string | null;
  difficulties: readonly Difficulty[];
  difficulty: Difficulty;
  difficultyNote?: string;
  onDifficulty?(d: Difficulty): void;
  /** The player went on with this mode and variant (remember it). */
  onConfirm?(c: ModeChoice): void;
  /** The action: start the champion select (bots), the queue (co-op, PvP) or the party (friends). */
  onGo(c: ModeChoice): void;
  /** Closed: `went` true after onGo, false on Back or Esc from the first stage. */
  onClose(went: boolean): void;
  /** Open at the variant stage of `choice.mode` (Back from the champion select). Default the mode stage. */
  stage?: ModeStage;
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
  stage(): ModeStage;
}

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
export const QUEUE_ICON: Readonly<Record<Queue, string>> = {
  bots: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><rect x="5" y="8" width="14" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="13" r="1.6" fill="currentColor"/><circle cx="14.5" cy="13" r="1.6" fill="currentColor"/><path d="M12 8V5M10 4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  coop: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  pvp: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><path d="M4 4l10 10M20 4L10 14M6 16l-2 2 2 2 2-2M18 16l2 2-2 2-2-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  friends:
    '<svg viewBox="0 0 24 24" aria-hidden="true" class="ms-ico"><circle cx="9" cy="8" r="3.2" fill="currentColor"/><circle cx="17" cy="9" r="2.6" fill="currentColor" opacity=".8"/><path d="M2.5 20c.6-4 3.3-6 6.5-6s5.9 2 6.5 6zM15 14.2c3 .1 5.6 1.8 6.5 5.8h-4.6" fill="currentColor"/></svg>',
};

/** The action button's word for a variant. Pure. */
export const goLabel = (q: Queue): string => (q === 'bots' ? 'Choose champion' : q === 'friends' ? 'Open party' : 'Find match');

/** One tile's markup. Pure (given `now`). */
export function tileHtml(m: ModeDef, o: { selected: boolean; now: number; base: string; low: boolean; i: number }): string {
  const st = effectiveState(m, o.now);
  const can = playable(m, o.now);
  // sim v28: a tile with one art size (`artPx`) uses it on every tier (the build's 10 MB budget)
  const art = `${o.base}assets/modes/${m.art}-${m.artPx ?? (o.low ? 256 : 512)}.webp`;
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
      ${m.rank ? `<span class="ms-rank">${esc(m.rank.tier)}${m.rank.lp !== undefined ? ` · ${m.rank.lp} pts` : ''}</span>` : ''}
      <span class="ms-meta">${esc(meta)}</span>
    </button>
    <button type="button" class="ms-info" data-info="${esc(m.id)}" aria-label="${esc(`About ${m.name}`)}" aria-haspopup="dialog"><i aria-hidden="true">i</i></button>
  </div>`;
}

/** One variant card's markup. `lock`: why it cannot start (shown instead of its line). Pure. */
export function variantHtml(q: Queue, o: { selected: boolean; lock: string | null; i: number; line?: string }): string {
  const line = o.lock ?? o.line ?? VARIANT_LINE[q];
  return `<button type="button" role="radio" class="ms-var${o.selected ? ' on' : ''}${o.lock ? ' locked' : ''}" aria-checked="${o.selected}" tabindex="${o.selected ? 0 : -1}" data-v="${q}" data-testid="variant-${q}"${o.lock ? ` aria-disabled="true" data-why="${esc(o.lock)}"` : ''} aria-label="${esc(`${QUEUE_LABEL[q]}. ${line}`)}" style="--i:${o.i}">
    <span class="ms-var-i" aria-hidden="true">${QUEUE_ICON[q]}${o.lock ? `<span class="ms-var-lk">${LOCK}</span>` : ''}</span>
    <b class="ms-var-n">${esc(QUEUE_LABEL[q])}</b>
    <small class="ms-var-l">${esc(line)}</small>
  </button>`;
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
  let stage: ModeStage = o.stage === 'variant' && modeOf(sel) && playable(modeOf(sel)!, now()) ? 'variant' : 'mode';
  const lockOf = (m: ModeDef | undefined, q: Queue): string | null => (m ? variantLock(q, o.available, q === 'pvp' && o.pvpLock ? o.pvpLock(m) : null) : 'Locked');
  const open = (m: ModeDef | undefined): Queue[] => (m ? m.queues.filter((q) => !lockOf(m, q)) : []);
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
      <button type="button" class="ms-btn ms-back" data-a="ms-back" data-testid="mode-back" aria-label="Back" aria-keyshortcuts="Escape">${BACK}</button>
      <div class="ms-ttl"><h2 id="ms-title" class="ms-title">Choose your battle</h2><p class="ms-sub"></p></div>
      <span class="ms-head-r"></span>
    </header>
    <div class="ms-rowwrap"><div class="ms-row" role="radiogroup" aria-label="Game mode">${tiles()}</div></div>
    <div class="ms-vwrap" hidden><div class="ms-vrow" role="radiogroup" aria-label="How to play"></div></div>
    <footer class="ms-foot">
      <div class="ms-diff"></div>
      <button type="button" class="ms-confirm" data-a="ms-next" data-testid="mode-next"><span>Next</span></button>
    </footer>
    <div class="ms-pop" role="dialog" aria-modal="false" hidden></div>
    <p class="ms-toast" role="status" aria-live="polite"></p>`;

  const diffHtml = (): string => {
    if (o.difficultyNote) return `<p class="ms-qline">${esc(o.difficultyNote)}</p>`;
    if (o.difficulties.length < 2) return '';
    return `<div class="ms-seg" role="radiogroup" aria-label="Bots difficulty"><span class="ms-seg-l" aria-hidden="true">Bots</span>${o.difficulties
      .map((x) => {
        const on = x === diff;
        const n = (DIFFICULTY_TEXT as Record<string, string>)[x]?.replace(' bots', '') ?? x;
        return `<button type="button" role="radio" class="${on ? 'on' : ''}" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-d="${x}" data-testid="bots-${x}" aria-label="${esc(`${n} bots`)}" title="${esc(DIFFICULTY_HINT[x] ?? '')}">${esc(n)}</button>`;
      })
      .join('')}</div>`;
  };

  /** Draws the footer, the header and which stage shows. */
  const render = (): void => {
    const m = modeOf(sel);
    const ok = !!m && playable(m, now());
    const title = el.querySelector<HTMLElement>('.ms-title')!;
    const sub = el.querySelector<HTMLElement>('.ms-sub')!;
    const row = el.querySelector<HTMLElement>('.ms-rowwrap')!;
    const vw = el.querySelector<HTMLElement>('.ms-vwrap')!;
    const c = el.querySelector<HTMLButtonElement>('.ms-confirm')!;
    const d = el.querySelector<HTMLElement>('.ms-diff')!;
    el.dataset.stage = stage;
    if (stage === 'mode') {
      title.textContent = 'Choose your battle';
      sub.textContent = '';
      row.hidden = false;
      vw.hidden = true;
      d.innerHTML = m ? `<p class="ms-qline ms-sum"><b>${esc(m.name)}${m.size ? ` ${esc(m.size)}` : ''}</b> · ${esc(metaLine(m, now()))}</p>` : '';
      c.dataset.a = 'ms-next';
      c.dataset.testid = 'mode-next';
      c.innerHTML = '<span>Next</span>';
      c.disabled = !ok;
      c.setAttribute('aria-label', m ? `Next: how to play ${m.name}` : 'Next');
      return;
    }
    // the variant stage: the mode's variants, the saved one when it can start, else the first that can
    const qs = m ? m.queues : [];
    const can = open(m);
    queue = can.includes(queue) ? queue : (can[0] ?? queueFor({ queues: qs.length ? qs : ['bots'] }, queue));
    title.textContent = m ? `${m.name}${m.size ? ` ${m.size}` : ''}` : 'How to play';
    sub.textContent = 'How do you want to play?';
    row.hidden = true;
    vw.hidden = false;
    // the cards are drawn once per mode (their pop-in plays once); a new pick only moves the selection
    const vrow = el.querySelector<HTMLElement>('.ms-vrow')!;
    if (vrow.dataset.mode !== sel) {
      vrow.dataset.mode = sel;
      // sim v27: the Practice ground's one card is the sandbox, not a bots match
      vrow.innerHTML = qs.map((q, i) => variantHtml(q, { selected: q === queue, lock: lockOf(m, q), i, ...(m?.practice ? { line: 'Solo with training dummies' } : {}) })).join('');
    } else
      for (const b of vrow.querySelectorAll<HTMLElement>('.ms-var')) {
        const on = b.dataset.v === queue;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      }
    d.innerHTML = m?.practice ? '<p class="ms-qline">Any champion · no rewards · leave any time</p>' : queue === 'bots' ? diffHtml() : `<p class="ms-qline"${m?.variantNote ? ' data-testid="mode-variant-note"' : ''}>${esc(m?.variantNote ?? VARIANT_LINE[queue])}</p>`;
    c.dataset.a = 'ms-go';
    c.dataset.testid = 'mode-go';
    c.innerHTML = `<span>${esc(goLabel(queue))}</span>`;
    c.disabled = !ok || !can.includes(queue);
    c.setAttribute('aria-label', m ? `${goLabel(queue)}: ${m.name}, ${QUEUE_LABEL[queue]}` : goLabel(queue));
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
  const focusStage = (): void => {
    const t = stage === 'mode' ? (el.querySelector<HTMLElement>('.ms-pick.on') ?? el.querySelector<HTMLElement>('.ms-pick')) : (el.querySelector<HTMLElement>('.ms-var.on') ?? el.querySelector<HTMLElement>('.ms-var'));
    t?.focus({ preventScroll: true });
    if (stage === 'mode') t?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  };
  const select = (id: string, focus = false): boolean => {
    const m = modeOf(id);
    if (!m) return false;
    if (!playable(m, now())) {
      const b = el.querySelector<HTMLElement>(`.ms-pick[data-mode="${CSS.escape(id)}"]`);
      if (b) shake(b);
      o.sound?.('click');
      toast(`${m.name}: ${metaLine(m, now())}.`);
      return false;
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
    render();
    return true;
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
  const toStage = (s: ModeStage): void => {
    if (s === 'variant') {
      const m = modeOf(sel);
      if (!m || !playable(m, now())) return;
    }
    o.sound?.('click');
    stage = s;
    closePop();
    render();
    focusStage();
  };
  const pickVariant = (q: Queue, b: HTMLElement | null): boolean => {
    const lock = lockOf(modeOf(sel), q);
    if (lock) {
      if (b) shake(b);
      o.sound?.('click');
      toast(lock);
      return false;
    }
    if (q !== queue) o.sound?.('click');
    queue = q;
    render();
    el.querySelector<HTMLElement>('.ms-var.on')?.focus({ preventScroll: true });
    return true;
  };
  let went = false;
  const go = (): void => {
    const m = modeOf(sel);
    if (!m || !playable(m, now()) || lockOf(m, queue)) return;
    o.sound?.('click');
    const c: ModeChoice = { mode: sel, queue };
    o.onConfirm?.(c);
    went = true;
    close();
    o.onGo(c);
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
  /** Back one step: the popover, the variant stage, then the overlay. */
  const back = (): void => {
    if (closePop()) return;
    if (stage === 'variant') toStage('mode');
    else close();
  };

  let lastTap = { id: '', t: 0 };
  const dbl = (id: string): boolean => {
    const at = performance.now();
    const yes = lastTap.id === id && at - lastTap.t < 350;
    lastTap = { id, t: at };
    return yes;
  };
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
      const twice = dbl(`m:${id}`) && id === sel;
      if (select(id) && twice) toStage('variant');
      return;
    }
    const v = t.closest<HTMLElement>('.ms-var');
    if (v) {
      const q = v.dataset.v as Queue;
      const twice = dbl(`v:${q}`) && q === queue;
      if (pickVariant(q, v) && twice) go();
      return;
    }
    const d = t.closest<HTMLElement>('[data-d]')?.dataset.d as Difficulty | undefined;
    if (d) {
      o.sound?.('click');
      diff = d;
      o.onDifficulty?.(d);
      render();
      el.querySelector<HTMLElement>('.ms-seg .on')?.focus({ preventScroll: true });
      return;
    }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'ms-back') back();
    else if (a === 'ms-next') toStage('variant');
    else if (a === 'ms-go') go();
    else if (a === 'ms-pop-x') closePop();
  });
  // arrow keys: the tile row, the variants and the bots are radio groups (one tab stop each); Enter on a tile or a
  // variant goes on (the press would only select it)
  el.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const pick = t.closest<HTMLElement>('.ms-pick');
      const v = t.closest<HTMLElement>('.ms-var');
      if (pick) {
        e.preventDefault();
        if (select(pick.dataset.mode!)) toStage('variant');
      } else if (v) {
        e.preventDefault();
        if (pickVariant(v.dataset.v as Queue, v)) go();
      }
      return;
    }
    if (step && t.closest('.ms-row')) {
      e.preventDefault();
      const ids = o.modes.filter((m) => playable(m, now())).map((m) => m.id);
      const i = ids.indexOf(sel);
      select(ids[(i + step + ids.length) % ids.length], true);
      el.querySelector<HTMLElement>('.ms-pick.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } else if (step && t.closest('.ms-vrow')) {
      e.preventDefault();
      const qs = open(modeOf(sel));
      const i = qs.indexOf(queue);
      if (qs.length) pickVariant(qs[(i + step + qs.length) % qs.length], null);
    } else if (step && t.closest('.ms-seg')) {
      e.preventDefault();
      const ds = o.difficulties;
      const i = ds.indexOf(diff);
      diff = ds[(i + step + ds.length) % ds.length];
      o.onDifficulty?.(diff);
      render();
      el.querySelector<HTMLElement>('.ms-seg .on')?.focus();
    }
  });
  const onKey = (e: KeyboardEvent): void => {
    if (!el.isConnected || overlayOpenElsewhere(el)) return;
    // Enter with no control focused (focus still on the page, or the overlay itself): the stage's own action
    if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && el.contains(t) && t.closest('button')) return;
      if (t && t !== document.body && t !== el && !el.contains(t)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!pop.hidden) closePop();
      else if (stage === 'mode') toStage('variant');
      else go();
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    back();
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
      o.onClose(went);
    };
    // going on: the next screen replaces Home at once, so no fade (it would show over the champion select)
    if (went || low || !el.animate) done();
    else {
      el.classList.add('out');
      setTimeout(done, 200);
    }
  }

  parent.appendChild(el);
  render();
  if (sel) row.classList.add('has-sel');
  requestAnimationFrame(() => {
    if (closed) return;
    edges();
    focusStage();
  });
  return { el, close, stage: () => stage };
}
