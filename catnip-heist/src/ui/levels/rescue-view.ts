/**
 * DOM for the real shelter cat of a heist: the shelter's photo next to the animated pixel cat the
 * player frees, the real name, a status chip, the shelter line and (owned channels only, when the
 * build has a site link) a "Meet <name>" link. Used by the level select's brief panel and the
 * Results screen. Data comes from ./rescue-cats (never invented here).
 */
import type { SheetEntry } from '../../types';
import { h } from '../dom';
import { icon } from '../icons';
import { needsBodyFont } from '../pink-paw';
import { drawPortrait } from '../portraits';
import { fallbackRescueCat, RESCUE_SHELTER_LINE, rescueStatusLabel, type RescueCat } from './rescue-cats';
import { ensureLevelStyles } from './styles';

/** Status without the "as of" date (the chip); the date goes on the shelter line. */
export function rescueChipText(cat: RescueCat): string | null {
  return rescueStatusLabel({ status: cat.status, source: 'live' });
}

/** "as of 4 Oct 2026" for a local copy, else null. */
export function rescueAsOf(cat: RescueCat): string | null {
  const full = rescueStatusLabel(cat);
  const chip = rescueChipText(cat);
  return full && chip && full !== chip ? full.slice(chip.length).trim() : null;
}

export interface AnimatedSprite {
  el: HTMLCanvasElement;
  stop(): void;
}

/**
 * The level's pixel cat, cycling its IDLE row (about 8 fps). Static on reduced motion. Stops on its
 * own once the canvas leaves the document, or when `stop()` is called.
 */
export function animatedSprite(entry: SheetEntry, opts: { size?: number; base?: string; row?: string; reduced?: boolean } = {}): AnimatedSprite {
  const size = opts.size ?? 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.setAttribute('aria-hidden', 'true');
  const rowName = (opts.row ?? 'IDLE').toUpperCase();
  const frames = entry.rows.find((r) => r.name === rowName)?.frames ?? 1;
  let frame = 0;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const draw = () => drawPortrait(c, entry, { base: opts.base, row: rowName, frame }).catch(() => undefined);
  void draw();
  if (!opts.reduced && frames > 1 && typeof setInterval === 'function') {
    let seen = false;
    timer = setInterval(() => {
      if (stopped) return;
      if (c.isConnected) seen = true;
      else if (seen) return stop();
      if (typeof document !== 'undefined' && document.hidden) return;
      frame = (frame + 1) % frames;
      void draw();
    }, 125);
  }
  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }
  return { el: c, stop };
}

/**
 * The bundled photo for this exact cat, or null. Only the level's pinned cat has a local copy; a live
 * replacement cat (the pinned one was adopted or is gone) has none, and must never borrow another
 * cat's photo under its own name.
 */
export function localPhotoFor(cat: RescueCat, base?: string): string | null {
  const pinned = fallbackRescueCat(cat.levelId, base);
  return pinned.id === cat.id ? pinned.photo : null;
}

/**
 * The shelter photo as an <img> that shows a soft placeholder until it loads, falls back to the
 * bundled copy of the same cat if the CDN fails (only the pinned cats have one), and to a paw.
 */
export function rescuePhoto(cat: RescueCat, opts: { base?: string; className?: string; eager?: boolean } = {}): HTMLElement {
  const wrap = h(`span.${opts.className ?? 'ch-lv-rc-photo'}`, { 'data-state': 'loading' });
  const img = h('img', {
    src: cat.photo,
    alt: `Photo of ${cat.name} at the Pink Paw shelter`,
    loading: opts.eager ? 'eager' : 'lazy',
    decoding: 'async',
    draggable: 'false',
    width: 336,
    height: 448,
  });
  const local = localPhotoFor(cat, opts.base);
  img.addEventListener('load', () => (wrap.dataset.state = 'ready'));
  img.addEventListener('error', () => {
    if (local && img.getAttribute('src') !== local) {
      img.src = local;
      return;
    }
    wrap.dataset.state = 'error';
    img.remove();
    wrap.appendChild(icon('paw'));
  });
  if (img.complete && img.naturalWidth > 0) wrap.dataset.state = 'ready';
  wrap.appendChild(img);
  return wrap;
}

/** Combining marks the display face lacks, drawn in CSS over the base letter it does have. */
const MARKS: Record<string, string> = { '\u0307': 'dot', '\u030C': 'caron', '\u0328': 'ogonek', '\u0304': 'macron' };

/**
 * The name in the display face even when it lacks a letter (Passion One / Cat Paw have no ė, č, ą,
 * ū...): each such letter shows its base letter in the display face with the mark drawn over it
 * (.ch-dia), while the real letter stays in the DOM (invisible) for text, copy and screen readers.
 * Letters that do not decompose that way fall back to the body face for that letter only.
 */
export function displayName(name: string, cls = 'ch-lv-dname'): HTMLElement {
  const el = h(`span.${cls}`);
  if (!needsBodyFont(name)) {
    el.textContent = name;
    return el;
  }
  let run = '';
  const flush = () => {
    if (run) el.append(run);
    run = '';
  };
  for (const ch of name) {
    if (!needsBodyFont(ch)) {
      run += ch;
      continue;
    }
    flush();
    const [base, ...marks] = Array.from(ch.normalize('NFD'));
    const mark = marks.length === 1 ? MARKS[marks[0]] : undefined;
    const upper = ch !== ch.toLowerCase();
    if (base && mark && !needsBodyFont(base)) {
      el.append(h(`span.ch-dia.ch-dia-${mark}${upper ? '.ch-dia-up' : ''}`, { 'data-base': base }, h('span.ch-dia-ch', null, ch)));
    } else el.append(h('span.ch-lv-body-font', null, ch));
  }
  flush();
  return el;
}

/** The rescue name, always in the display face (see `displayName`). */
export function rescueNameEl(name: string, tag: 'b' | 'strong' | 'span' = 'b'): HTMLElement {
  return h(`${tag}.ch-lv-rc-name`, null, displayName(name));
}

/**
 * The HUD's rescue chip: the real cat's photo (round) with its name, beside the objective for the
 * whole run, so the cat being freed stays a real cat on screen. `freed` marks it once rescued.
 */
export function rescueHudChip(cat: RescueCat, opts: { base?: string } = {}): HTMLElement {
  ensureLevelStyles();
  return h(
    'div.ch-lv-hudcat',
    { role: 'img', 'aria-label': `Rescue ${cat.name}, a real cat at the Pink Paw shelter`, title: `${cat.name}: ${RESCUE_SHELTER_LINE}`, 'data-testid': 'hud-rescue-cat' },
    rescuePhoto(cat, { base: opts.base, className: 'ch-lv-hudcat-photo', eager: true }),
    h('span.ch-lv-hudcat-name', { 'aria-hidden': 'true' }, cat.name),
  );
}

export interface RescueBlock {
  el: HTMLElement;
  /** Stop the sprite animation (the block is being replaced). */
  stop(): void;
}

/** The brief panel's rescue block: photo + pixel cat side by side, name, chip, shelter line, link. */
export function rescueBlock(cat: RescueCat, entry: SheetEntry | undefined, opts: { base?: string; reduced?: boolean; loading?: boolean } = {}): RescueBlock {
  const sprite = entry ? animatedSprite(entry, { size: 96, base: opts.base, reduced: opts.reduced }) : null;
  const chip = rescueChipText(cat);
  const asOf = rescueAsOf(cat);
  const el = h(
    'section.ch-lv-rc',
    { 'aria-label': `Rescue ${cat.name}`, 'data-testid': 'rescue-cat', 'data-source': cat.source, 'data-loading': opts.loading ? 'true' : null },
    h(
      'div.ch-lv-rc-pics',
      null,
      rescuePhoto(cat, { base: opts.base }),
      h('span.ch-lv-rc-link', { 'aria-hidden': 'true' }, icon('paw')),
      h('span.ch-lv-rc-sprite', null, sprite?.el ?? null),
    ),
    h(
      'div.ch-lv-rc-text',
      null,
      h('small.ch-lv-rc-kick', null, 'Rescue'),
      rescueNameEl(cat.name),
      chip ? h('span.ch-lv-rc-chip', { 'data-status': cat.status ?? '' }, chip) : null,
      h('small.ch-lv-rc-line', null, asOf ? `${RESCUE_SHELTER_LINE} · ${asOf}` : RESCUE_SHELTER_LINE),
      cat.profileUrl
        ? h('a.ch-lv-rc-meet', { href: cat.profileUrl, target: '_blank', rel: 'noopener', 'data-testid': 'rescue-cat-meet' }, `Meet ${cat.name} ›`)
        : null,
    ),
  );
  return { el, stop: () => sprite?.stop() };
}
