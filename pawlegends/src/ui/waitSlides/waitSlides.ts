/**
 * While-you-wait slideshow (founder, Nov 20): one comic panel at a time next to the queue card (Short wait and the
 * search, every queue), so a wait has something to read. LAZY: the party client imports this chunk the first time a
 * queue card shows.
 *
 * Auto-advances every SLIDE_MS with a dot strip; tap or swipe the panel, the arrows, a dot, or ← → keys to step; a
 * hover, a finger on it or a hidden tab pauses it. Reduced motion: no slide animation and no moving progress fill.
 * Never covers the card: it is its own flex column (party.css lays the two side by side, or stacks them on a narrow
 * screen). Content: ./content.ts (true, from the game's data); order: ./deck.ts.
 */
import './waitSlides.css';
import { staticSlides, type Slide } from './content';
import { ROUND, SLIDE_MS, Stepper, buildDeck, liveSlides, type LiveInfo } from './deck';
import { heroFaceUrl } from '../art';
import { iconSvg } from '../icons';
import { HEROES, type HeroId } from '../../data/heroes';
import { levelOf } from '../../meta/accountLevel';

export interface WaitSlidesOpts {
  /** Finished matches (the account level and the level-aware tips). */
  matches: number;
  /** The player's own numbers; resolves null (or rejects) offline: the live panels are skipped. */
  live?(): Promise<LiveInfo | null>;
  /** A slide was shown (once per slide per wait; consent is the caller's analytics' job). */
  track?(props: Record<string, string | number | boolean>): void;
  /** Test seams. */
  rand?: () => number;
  every?: number;
}

export interface WaitSlidesHandle {
  readonly el: HTMLElement;
  /** Show (a wait began: a fresh deck) or hide (the wait ended). */
  show(on: boolean, matches?: number): void;
  destroy(): void;
}

const SEEN_KEY = 'pl.waitSlides.seen';

const readSeen = (): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-400) : []);
  } catch {
    return new Set();
  }
};
const writeSeen = (s: Set<string>): void => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-400)));
  } catch {
    /* storage blocked: this session only */
  }
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const reducedMotion = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const device = (): 'mouse' | 'touch' => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches ? 'mouse' : 'touch';
  } catch {
    return 'touch';
  }
};

// --------------------------------------------------------------------------------------------------------- art
/** Small top-down sketches of the five 3v3 maps (lanes, river, the objective), drawn inline: no image to load. */
const BASES = '<circle class="b0" cx="7" cy="32" r="5"/><circle class="b1" cx="57" cy="32" r="5"/>';
const MAP_ART: Readonly<Record<string, string>> = Object.freeze({
  // two lanes, the river down the middle with Pudding in it, a rat camp on each side
  crossing: `<path class="rv" d="M32 2 V62"/><path class="ln" d="M7 32 L16 12 H48 L57 32 M7 32 L16 52 H48 L57 32"/><circle class="camp" cx="21" cy="32" r="3.5"/><circle class="camp" cx="43" cy="32" r="3.5"/><circle class="pud" cx="32" cy="32" r="5"/>${BASES}`,
  // one lane; the Fish Mill in the woods above it
  ridge: `<path class="ln" d="M7 32 Q32 52 57 32"/><circle class="obj" cx="32" cy="20" r="7"/><path class="mill" d="M32 14 V26 M26 20 H38"/>${BASES}`,
  // two lanes, a Paw Shrine on each half
  thicket: `<path class="rv" d="M32 2 V62"/><path class="ln" d="M7 32 L16 12 H48 L57 32 M7 32 L16 52 H48 L57 32"/><path class="obj" d="M22 25 l5 7 l-5 7 l-5 -7 z M42 25 l5 7 l-5 7 l-5 -7 z"/>${BASES}`,
  // two lanes, the Geode in the middle
  quarry: `<path class="ln" d="M7 32 L16 12 H48 L57 32 M7 32 L16 52 H48 L57 32"/><path class="gem" d="M32 22 L40 32 L32 42 L24 32 Z"/>${BASES}`,
  // two lanes, the ball at the centre spot, a goal in front of each base
  pitch: `<path class="rv" d="M32 2 V62"/><path class="ln" d="M7 32 L16 12 H48 L57 32 M7 32 L16 52 H48 L57 32"/><rect class="goal" x="13" y="25" width="4" height="14"/><rect class="goal" x="47" y="25" width="4" height="14"/><circle class="obj" cx="32" cy="32" r="5"/>${BASES}`,
});

function artHtml(s: Slide): string {
  const a = s.art;
  if (a.t === 'face') {
    const side = HEROES[a.hero]?.side ?? 'cat';
    return `<div class="pw-art pw-face" data-side="${side}"><img src="${esc(heroFaceUrl(a.hero))}" alt="" width="128" height="128" decoding="async" draggable="false"></div>`;
  }
  if (a.t === 'map') return `<div class="pw-art pw-map"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${MAP_ART[a.map] ?? MAP_ART.crossing}</svg></div>`;
  if (a.t === 'split') {
    const total = a.cat + a.dog;
    const c = total ? Math.round((a.cat / total) * 100) : 50;
    return `<div class="pw-art pw-split" style="--cat:${c}%" role="img" aria-label="Cats ${c}%, Dogs ${100 - c}%"><span class="c"><b>${c}%</b>Cats</span><span class="d"><b>${100 - c}%</b>Dogs</span></div>`;
  }
  return `<div class="pw-art pw-icon" data-tone="${a.tone}">${iconSvg(a.icon, 'currentColor')}</div>`;
}

function cardHtml(s: Slide): string {
  const sub = s.sub ? `<p class="pw-sub">${esc(s.sub)}</p>` : '';
  return `<article class="pw-card" data-kind="${s.kind}" data-id="${esc(s.id)}">${artHtml(s)}<div class="pw-copy"><span class="pw-tag">${esc(s.tag)}</span><h3>${esc(s.title)}</h3>${sub}<p class="pw-text">${esc(s.text)}</p></div></article>`;
}

const CHEVRON = (d: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const BOLT = '<svg class="pw-bolt" viewBox="0 0 24 48" aria-hidden="true" focusable="false"><path d="M15 0 3 27h8L7 48l15-30h-9L19 0z"/></svg>';

/** Mount the slideshow (hidden) into `parent`. */
export function mountWaitSlides(parent: HTMLElement, o: WaitSlidesOpts): WaitSlidesHandle {
  const doc = parent.ownerDocument;
  const el = doc.createElement('section');
  el.className = 'pw';
  el.hidden = true;
  el.dataset.testid = 'wait-slides';
  el.setAttribute('aria-roledescription', 'carousel');
  el.setAttribute('aria-label', 'While you wait');
  el.innerHTML = `<header class="pw-head"><b class="pw-kicker">${BOLT}While you wait</b><span class="pw-dots" data-testid="wait-dots"></span><button type="button" class="pw-nav" data-w="prev" aria-label="Previous slide" data-testid="wait-prev">${CHEVRON('M15 5 L8 12 L15 19')}</button><button type="button" class="pw-nav" data-w="next" aria-label="Next slide" data-testid="wait-next">${CHEVRON('M9 5 L16 12 L9 19')}</button></header><div class="pw-stage" aria-live="off" data-testid="wait-stage"></div>`;
  parent.appendChild(el);
  const stage = el.querySelector<HTMLElement>('.pw-stage')!;
  const dots = el.querySelector<HTMLElement>('.pw-dots')!;
  const every = o.every ?? SLIDE_MS;
  const rand = o.rand ?? Math.random;

  let matches = Math.max(0, Math.floor(o.matches || 0));
  let deck: Slide[] = [];
  const step = new Stepper(0, every);
  let seen = readSeen();
  let tracked = new Set<string>();
  let shownN = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let last = 0;
  let liveSeq = 0;
  let destroyed = false;
  let drawn = -1;

  const fill = (): void => {
    const f = dots.querySelector<HTMLElement>('.pw-dot[aria-current="true"] i');
    if (f) f.style.transform = `scaleX(${reducedMotion() ? (step.progress >= 1 ? 1 : 0) : step.progress})`;
  };

  const drawDots = (): void => {
    const r = step.round(ROUND);
    let h = '';
    for (let i = 0; i < r.len; i++)
      h += `<button type="button" class="pw-dot" data-w="dot" data-i="${r.start + i}" aria-label="Slide ${r.start + i + 1} of ${deck.length}"${i === r.at ? ' aria-current="true"' : ''}><i></i></button>`;
    dots.innerHTML = h;
    fill();
  };

  const draw = (dir: 1 | -1, how: string): void => {
    const s = deck[step.index];
    if (!s) return;
    const old = stage.querySelector<HTMLElement>('.pw-card:not(.out)');
    const wrap = doc.createElement('div');
    wrap.innerHTML = cardHtml(s);
    const card = wrap.firstElementChild as HTMLElement;
    const img = card.querySelector('img');
    img?.addEventListener('error', () => card.querySelector('.pw-face')?.classList.add('noimg'), { once: true });
    if (old && !reducedMotion()) {
      card.classList.add(dir > 0 ? 'in-r' : 'in-l');
      old.classList.add('out', dir > 0 ? 'out-l' : 'out-r');
      old.addEventListener('animationend', () => old.remove(), { once: true });
      // a missed animationend (hidden tab) must not leave the old card behind
      setTimeout(() => old.remove(), 600);
    } else old?.remove();
    stage.appendChild(card);
    stage.dataset.id = s.id;
    stage.dataset.kind = s.kind;
    stage.dataset.index = String(step.index);
    drawn = step.index;
    drawDots();
    if (!seen.has(s.id)) {
      seen.add(s.id);
      writeSeen(seen);
    }
    if (!tracked.has(s.id) && tracked.size < 40) {
      tracked.add(s.id);
      shownN++;
      o.track?.({ kind: s.kind, slide: s.id, n: shownN, how });
    }
    // warm the next face so the next step does not pop in
    const nx = deck[(step.index + 1) % deck.length];
    if (nx?.art.t === 'face') {
      const pre = new Image();
      pre.decoding = 'async';
      pre.src = heroFaceUrl(nx.art.hero);
    }
  };

  const go = (i: number, how: string, dir?: 1 | -1): void => {
    const from = step.index;
    step.go(i);
    if (step.index !== drawn) draw(dir ?? (step.index >= from ? 1 : -1), how);
    else drawDots();
  };

  const loop = (): void => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (step.tick(dt)) draw(1, 'auto');
    else fill();
  };

  const startLive = (): void => {
    if (!o.live) return;
    const my = ++liveSeq;
    void o
      .live()
      .then((info) => {
        if (destroyed || my !== liveSeq || el.hidden || !info) return;
        const fresh = liveSlides(info).filter((s) => !deck.some((d) => d.id === s.id));
        if (!fresh.length) return;
        // the player's own panels come next (after the one on screen), not at the end of a long deck
        deck.splice(step.index + 1, 0, ...fresh);
        step.setCount(deck.length);
        drawDots();
      })
      .catch(() => undefined);
  };

  const show = (on: boolean, m?: number): void => {
    if (destroyed) return;
    if (typeof m === 'number') matches = Math.max(0, Math.floor(m));
    if (!on) {
      if (el.hidden) return;
      el.hidden = true;
      if (timer) clearInterval(timer);
      timer = null;
      liveSeq++;
      return;
    }
    if (!el.hidden) return;
    seen = readSeen();
    const built = buildDeck(staticSlides(), { level: levelOf(matches), device: device(), seen, rand });
    if (built.cycleDone) {
      seen = new Set();
      writeSeen(seen);
    }
    deck = built.deck;
    tracked = new Set();
    shownN = 0;
    step.setCount(deck.length);
    step.go(0);
    stage.textContent = '';
    drawn = -1;
    el.hidden = false;
    draw(1, 'auto');
    last = performance.now();
    timer = setInterval(loop, 100);
    startLive();
  };

  // ------------------------------------------------------------------------------------------- input
  let downX: number | null = null;
  let downY = 0;
  const onClick = (e: MouseEvent): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.w === 'prev') go(step.index - 1, 'arrow', -1);
    else if (b.dataset.w === 'next') go(step.index + 1, 'arrow', 1);
    else if (b.dataset.w === 'dot') go(Number(b.dataset.i), 'dot');
  };
  const onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') step.pause('touch');
    if ((e.target as HTMLElement).closest('button')) return;
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent): void => {
    step.resume('touch');
    if (downX === null) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    downX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(step.index + (dx < 0 ? 1 : -1), 'swipe', dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && (e.target as HTMLElement).closest('.pw-stage')) go(step.index + 1, 'tap', 1);
  };
  const onCancel = (): void => {
    downX = null;
    step.resume('touch');
  };
  const onEnter = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') step.pause('hover');
  };
  const onLeave = (): void => step.resume('hover');
  const onKey = (e: KeyboardEvent): void => {
    if (el.hidden || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    // the side chip (a radio group), text fields and other widgets keep their own arrows
    if (t && t !== doc.body && !el.contains(t) && (t.closest('input, textarea, select, [contenteditable], [role="radiogroup"], [role="radio"], [role="slider"], [role="tablist"]') || t.isContentEditable)) return;
    e.preventDefault();
    go(step.index + (e.key === 'ArrowRight' ? 1 : -1), 'key', e.key === 'ArrowRight' ? 1 : -1);
  };
  const onVis = (): void => {
    if (doc.hidden) step.pause('hidden');
    else {
      step.resume('hidden');
      last = performance.now();
    }
  };
  el.addEventListener('click', onClick);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('visibilitychange', onVis);

  return {
    el,
    show,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (timer) clearInterval(timer);
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('visibilitychange', onVis);
      el.remove();
    },
  };
}

export type { LiveInfo, LastMatch, SidesData } from './deck';
export type { HeroId };
