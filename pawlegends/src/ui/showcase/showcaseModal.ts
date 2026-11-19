/**
 * What's New: the comic magazine page (founder Nov 19; design: a yellow masthead with the issue tab, a slanted art panel
 * with a type burst on the left, a plum info column with the headline, a speech bubble, the things strip, a live clock,
 * the button and Next on the right). One page per showcase item (meta/showcase.ts), highest priority first; swipe,
 * arrow keys, the dots or Next move between them, and the last page's Next reads "Got it".
 *
 * Its own chunk (loaded only when something is new). Each type has its own entrance, all transform and opacity, at
 * most 900 ms a page: a drop's coats slide in like panels under a NEW! burst, a season sweeps a gold ribbon and flashes a
 * bolt, an event pops its bubble and throws paws, a champion punches in over speed lines, a patch flips the page.
 * `prefers-reduced-motion` (or `reduced`) keeps a short fade only.
 *
 * Closing: the X, Esc, a tap outside the page. The button calls `onCta` (the caller opens the owning screen). Texts
 * come from the data module and are escaped here all the same.
 */
import './showcase.css';
import type { ShowcaseItem, ShowcaseThing, ShowcaseType } from '../../meta/showcase';
import { timeLine } from '../../meta/showcase';

export type ShowcaseClose = 'close' | 'esc' | 'outside' | 'done' | 'cta' | 'away';

export interface ShowcaseOpts {
  items: readonly ShowcaseItem[];
  now(): number;
  countdown(ms: number): string;
  /** Reduced motion (the OS setting is read here too). */
  reduced?: boolean;
  /** Low quality tier: no confetti or speed lines. */
  low?: boolean;
  /** A page came on screen (first one included): mark it seen, `showcase_page`. */
  onPage?(item: ShowcaseItem, index: number): void;
  /** The page's button: the caller closes nothing; the modal closes itself first ('cta'). */
  onCta?(item: ShowcaseItem, index: number): void;
  onClose?(how: ShowcaseClose, index: number): void;
  sound?(name: 'click' | 'magic' | 'horn'): void;
}

export interface ShowcaseHandle {
  el: HTMLElement;
  close(how?: ShowcaseClose): void;
  index(): number;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const cssUrl = (u: string): string => u.replace(/['"()\\\s]/g, (c) => encodeURIComponent(c));

const X =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
const CLOCK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 9v4.5l3 2M9.5 2.5h5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>';
const PAW =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><ellipse cx="32" cy="42" rx="14" ry="12"/><ellipse cx="15" cy="27" rx="6" ry="7.5" transform="rotate(-20 15 27)"/><ellipse cx="26" cy="17" rx="6" ry="8"/><ellipse cx="38" cy="17" rx="6" ry="8"/><ellipse cx="49" cy="27" rx="6" ry="7.5" transform="rotate(20 49 27)"/></g></svg>';
const GLYPH: Readonly<Record<NonNullable<ShowcaseThing['kind']>, string>> = Object.freeze({
  coat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 3l4 2 4-2 5 4-3 4-2-1v11H8V10l-2 1-3-4z"/></svg>',
  title: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 8h18v8H3zM1 10l2-2v8l-2-2zM23 10l-2-2v8l2-2z"/><path d="M7 12h10" stroke="#12091f" stroke-width="2"/></svg>',
  frame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" d="M4 4h16v16H4z"/><path fill="currentColor" d="M2 2h5v5H2zM17 2h5v5h-5zM2 17h5v5H2zM17 17h5v5h-5z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9h18v4H3zM5 13h14v8H5z"/><path d="M12 9v12M12 9c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1" stroke="#12091f" stroke-width="1.6" fill="none"/></svg>',
});

/** The type's word in the art panel corner when the art failed (and for screen readers). */
const TYPE_NAME: Readonly<Record<ShowcaseType, string>> = Object.freeze({
  'store-drop': 'New in the store',
  'pass-season': 'New season',
  event: 'Event',
  champion: 'New champion',
  patch: 'Patch notes',
  generic: 'News',
});

/** The art panel's type effects (spans only: the CSS animates them). */
function fxHtml(t: ShowcaseType, low: boolean): string {
  if (t === 'pass-season') return '<i class="sc-ribbon"></i><i class="sc-flash"></i>';
  if (t === 'event') return low ? '' : `<span class="sc-confetti">${Array.from({ length: 8 }, (_, i) => `<i style="--i:${i}">${PAW}</i>`).join('')}</span>`;
  if (t === 'champion') return `${low ? '' : '<i class="sc-speed"></i><i class="sc-speed sc-speed-2"></i>'}<i class="sc-flash"></i>`;
  if (t === 'patch') return '<i class="sc-curl"></i>';
  return '';
}

function thingsHtml(x: ShowcaseItem): string {
  const ts = (x.things ?? []).slice(0, 4);
  if (!ts.length) return '';
  return `<ul class="sc-things" data-n="${ts.length}" aria-label="${esc(x.type === 'pass-season' ? 'Free rewards' : x.type === 'store-drop' ? 'The coats' : 'Gifts')}">${ts
    .map(
      (t, i) =>
        `<li class="sc-thing" style="--i:${i}" title="${esc(t.sub ? `${t.label}: ${t.sub}` : t.label)}"><span class="sc-thing-pic${t.art ? '' : ' glyph'}"${t.art ? ` style="background-image:url('${esc(cssUrl(t.art))}')"` : ''}>${t.art ? '' : GLYPH[t.kind ?? 'gift']}</span><span class="sc-thing-txt"><b>${esc(t.label)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</span></li>`,
    )
    .join('')}</ul>`;
}

/** Caption boxes (patch notes, a champion's kit): "Passive: Valor" → a small "Passive" over "Valor". */
function notesHtml(x: ShowcaseItem): string {
  const ns = (x.notes ?? []).slice(0, 3);
  if (!ns.length || x.things?.length) return '';
  return `<ol class="sc-notes" aria-label="${esc(x.type === 'patch' ? 'What changed' : 'Highlights')}">${ns
    .map((n, i) => {
      const m = /^([^:]{1,14}):\s*(.+)$/.exec(n);
      return `<li class="sc-note" style="--i:${i}"><i aria-hidden="true">${i + 1}</i><span>${m ? `<small>${esc(m[1]!)}</small><b>${esc(m[2]!)}</b>` : `<b>${esc(n)}</b>`}</span></li>`;
    })
    .join('')}</ol>`;
}

/** One page's markup (pure; `n` pages, this is `i`). */
export function pageHtml(x: ShowcaseItem, i: number, n: number, now: number, countdown: (ms: number) => string, low = false): string {
  const time = timeLine(x, now, countdown);
  const last = i === n - 1;
  const info = x.cta.target.screen === 'none';
  const tid = `sc-t-${i}`;
  return `<article class="sc-page" data-type="${x.type}" data-id="${esc(x.id)}" aria-roledescription="page" aria-label="${esc(`${i + 1} of ${n}: ${x.title}`)}">
    <figure class="sc-art" aria-hidden="true"><span class="sc-art-in"><img src="${esc(x.art)}" alt="" decoding="async" draggable="false"><i class="sc-tone"></i>${fxHtml(x.type, low)}<span class="sc-type">${esc(TYPE_NAME[x.type])}</span></span>${x.burst ? `<span class="sc-burst"><b>${esc(x.burst)}</b></span>` : ''}</figure>
    <div class="sc-info">
      <h2 class="sc-title" id="${tid}">${esc(x.title)}</h2>
      ${x.kicker ? `<p class="sc-kicker">${esc(x.kicker)}</p>` : ''}
      <p class="sc-bubble">${esc(x.blurb)}</p>
      ${thingsHtml(x)}
      ${notesHtml(x)}
      ${time ? `<p class="sc-time" data-testid="showcase-time">${CLOCK}<b>${esc(time)}</b></p>` : ''}
      <div class="sc-acts">
        ${info ? '' : `<button type="button" class="sc-cta" data-sc="cta" data-testid="showcase-cta">${esc(x.cta.label)}</button>`}
        <button type="button" class="sc-next${info ? ' solo' : ''}" data-sc="next" data-testid="showcase-next">${last ? 'Got it' : 'Next'}</button>
      </div>
    </div>
  </article>`;
}

/** Open the modal on `parent` (the app root). */
export function openShowcase(parent: HTMLElement, o: ShowcaseOpts): ShowcaseHandle {
  const items = o.items.slice(0, 4);
  const n = items.length;
  const reduced = !!o.reduced || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const low = !!o.low;
  const ov = document.createElement('div');
  ov.className = `sc-ov${reduced ? ' reduced' : ''}${low ? ' low' : ''}`;
  ov.dataset.testid = 'showcase';
  // the page tabs are the only page count (numbered, so they read as pages and not as decoration)
  const dots = n > 1 ? `<span class="sc-dots" role="tablist" aria-label="Pages">${items.map((x, i) => `<button type="button" role="tab" class="sc-dot" data-sc="dot" data-i="${i}" aria-label="${esc(`Page ${i + 1} of ${n}: ${x.title}`)}"><i aria-hidden="true">${i + 1}</i></button>`).join('')}</span>` : '';
  ov.innerHTML = `<section class="sc-book" role="dialog" aria-modal="true" aria-label="What's new">
    <header class="sc-mast"><b class="sc-mast-t">What’s new</b>${dots}<button type="button" class="sc-x" data-sc="x" data-testid="showcase-close" aria-label="Close">${X}</button></header>
    <div class="sc-stage"></div>
  </section>`;
  const book = ov.querySelector<HTMLElement>('.sc-book')!;
  const stage = ov.querySelector<HTMLElement>('.sc-stage')!;
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let at = -1;
  let closed = false;
  let dir = 1;

  const tickClock = (): void => {
    const x = items[at];
    const b = stage.querySelector<HTMLElement>('.sc-time b');
    if (x && b) b.textContent = timeLine(x, o.now(), o.countdown);
  };
  const clock = setInterval(tickClock, 20_000);

  const show = (i: number, focus = true): void => {
    if (closed || i < 0 || i >= n || i === at) return;
    dir = i > at ? 1 : -1;
    at = i;
    const x = items[i]!;
    stage.innerHTML = pageHtml(x, i, n, o.now(), o.countdown, low);
    const page = stage.firstElementChild as HTMLElement;
    page.dataset.dir = dir > 0 ? 'f' : 'b';
    book.dataset.type = x.type;
    book.setAttribute('aria-labelledby', `sc-t-${i}`);
    book.removeAttribute('aria-label');
    // the art never blocks the page: a failed picture leaves the split-colour panel and the type name
    const img = page.querySelector<HTMLImageElement>('.sc-art img');
    img?.addEventListener('error', () => page.classList.add('noart'), { once: true });
    ov.querySelectorAll<HTMLElement>('.sc-dot').forEach((d, j) => {
      d.setAttribute('aria-selected', String(j === i));
      d.tabIndex = j === i ? 0 : -1;
    });
    if (focus) (page.querySelector<HTMLElement>('[data-sc="cta"]') ?? page.querySelector<HTMLElement>('[data-sc="next"]'))?.focus({ preventScroll: true });
    o.onPage?.(x, i);
  };

  const close = (how: ShowcaseClose = 'close'): void => {
    if (closed) return;
    closed = true;
    clearInterval(clock);
    document.removeEventListener('keydown', onKey, true);
    ov.classList.add('out');
    const done = (): void => ov.remove();
    if (reduced) done();
    else setTimeout(done, 180);
    if (how !== 'cta' && how !== 'away' && before?.isConnected) before.focus({ preventScroll: true });
    o.onClose?.(how, at);
  };

  const next = (): void => {
    o.sound?.('click');
    if (at >= n - 1) close('done');
    else show(at + 1);
  };

  ov.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === ov) return close('outside');
    const b = t.closest<HTMLElement>('[data-sc]');
    if (!b) return;
    const a = b.dataset.sc;
    if (a === 'x') close('close');
    else if (a === 'next') next();
    else if (a === 'dot') {
      o.sound?.('click');
      show(Number(b.dataset.i));
    } else if (a === 'cta') {
      const x = items[at];
      if (!x) return;
      o.sound?.('click');
      close('cta');
      o.onCta?.(x, at);
    }
  });

  // swipe between pages (a horizontal drag of 48 px or more)
  let sx = 0;
  let sy = 0;
  let sid = -1;
  stage.addEventListener('pointerdown', (e) => {
    sid = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
  });
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sid) return;
    sid = -1;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    o.sound?.('click');
    show(dx < 0 ? Math.min(n - 1, at + 1) : Math.max(0, at - 1));
  });
  stage.addEventListener('pointercancel', () => (sid = -1));

  const onKey = (e: KeyboardEvent): void => {
    if (closed || !ov.isConnected) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close('esc');
      return;
    }
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      const j = e.key === 'ArrowRight' ? at + 1 : at - 1;
      if (j >= 0 && j < n) {
        o.sound?.('click');
        show(j, !t?.classList.contains('sc-dot'));
        if (t?.classList.contains('sc-dot')) ov.querySelector<HTMLElement>(`.sc-dot[data-i="${j}"]`)?.focus();
      }
      return;
    }
    // the page is a modal: Tab cycles inside it; Enter on Home's PLAY never reaches Home
    if (e.key === 'Tab') {
      const f = Array.from(book.querySelectorAll<HTMLElement>('button:not([disabled])')).filter((b) => b.tabIndex >= 0);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      const j = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1;
      e.preventDefault();
      f[j]!.focus();
      return;
    }
    if (e.key === 'Enter' && (!t || !book.contains(t))) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener('keydown', onKey, true);

  parent.appendChild(ov);
  o.sound?.('magic');
  show(0);
  return { el: ov, close, index: () => at };
}
