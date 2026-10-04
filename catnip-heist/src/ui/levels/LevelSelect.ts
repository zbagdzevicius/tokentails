/**
 * Level select: 8 heist cards on a winding path, each with a still of the level (real gameplay) and
 * a short muted loop on the card in focus, lock state, best score and stars; plus a brief panel
 * (hero image, intro, par, the real shelter cat to rescue, star rules) and a Start button. DOM only;
 * owns no game state.
 *
 *   const ls = createLevelSelect(ui.root, { levels, progress, manifest, base, onPlay, onBack });
 *   ls.show();            // selects the next level to beat
 *   ls.show('heist-03');  // or a given one
 *
 * Motion budget: one <video> at most (the hovered, focused or selected card), created on demand,
 * paused off-screen or in a hidden tab, never on reduced motion or data saver.
 */
import { TICK_HZ, type AssetManifest, type LevelDef } from '../../types';
import { formatTime, h, prefersReducedMotion } from '../dom';
import { icon } from '../icons';
import { getLevelPreview } from './previews';
import { STAR_RULES, starCount, type ProgressStore } from './progress';
import { getRescueCatCached, loadRescueCats, withRescueName, type RescueCat } from './rescue-cats';
import { rescueBlock, rescuePhoto, type RescueBlock } from './rescue-view';
import { ensureLevelStyles } from './styles';

export interface LevelSelectOptions {
  levels: readonly LevelDef[];
  progress: ProgressStore;
  manifest?: AssetManifest;
  base?: string;
  onPlay(levelId: string): void;
  onBack?(): void;
  /** Any button click (for a UI click sound). */
  onClick?(): void;
  /** Load the real shelter cats from the API (default true; tests pass false to stay offline). */
  rescueCats?: boolean;
}

export interface LevelSelect {
  readonly el: HTMLElement;
  readonly visible: boolean;
  /** Currently selected level id. */
  readonly selected: string;
  show(levelId?: string): void;
  hide(): void;
  /** Re-read progress (after a run). */
  refresh(): void;
  dispose(): void;
}

/** Short display name for a level (meta.name, else the title without its "Heist 0N:" prefix). */
export function levelName(level: LevelDef): string {
  return level.meta.name ?? level.meta.title.replace(/^Heist \d+:\s*/, '');
}

/** Serpentine grid slots: `cols` per row, every other row right to left. */
export function pathSlot(i: number, cols: number): { col: number; row: number } {
  const row = Math.floor(i / cols);
  const k = i % cols;
  return { row: row + 1, col: (row % 2 === 0 ? k : cols - 1 - k) + 1 };
}

function starsRow(mask: number, size?: number): HTMLElement {
  const row = h('span.ch-lv-stars', { 'aria-label': `${starCount(mask)} of 3 stars` });
  if (size) row.style.fontSize = `${size}px`;
  for (const r of STAR_RULES) {
    const s = icon('star');
    if (mask & r.bit) s.classList.add('ch-on');
    row.appendChild(s);
  }
  return row;
}

export { starsRow };

/** True when the browser asks to save data (Network Information API, Chromium). */
export function saveData(): boolean {
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
  } catch {
    return false;
  }
}

/** The strip layout (phones): one horizontal row of cards instead of the serpentine grid. */
export const STRIP_QUERY = '(max-width: 760px), (max-height: 500px)';

function mq(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches;
  } catch {
    return false;
  }
}

interface CardParts {
  card: HTMLButtonElement;
  media: HTMLElement;
  num: HTMLElement;
  avatar: HTMLElement;
  info: HTMLElement;
}

export function createLevelSelect(parent: HTMLElement, opts: LevelSelectOptions): LevelSelect {
  ensureLevelStyles();
  const { levels, progress } = opts;
  const base = opts.base ?? 'assets/';
  const click = () => opts.onClick?.();
  const reduced = prefersReducedMotion();

  const total = h('span.ch-lv-total', { 'aria-label': 'Stars' });
  const back = h('button.ch-btn.ch-ghost.ch-icon', { type: 'button', 'aria-label': 'Back' }, icon('back'));
  back.addEventListener('click', () => {
    click();
    opts.onBack?.();
  });
  const head = h(
    'div.ch-lv-head',
    null,
    back,
    h('div', null, h('h2', null, 'Choose a heist'), h('p.ch-lv-sub', null, 'Every crate cat is a real cat at the shelter.')),
    total,
  );
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'ch-lv-path');
  svg.setAttribute('aria-hidden', 'true');
  const map = h('div.ch-lv-map', { role: 'list', 'aria-label': 'Heists' });
  map.appendChild(svg);
  const mapWrap = h('div.ch-lv-mapwrap', null, map);
  const detail = h('div.ch-lv-detail', { 'aria-live': 'polite' });
  const el = h('section.ch-lv', { 'aria-label': 'Choose a heist' }, head, h('div.ch-lv-body', null, mapWrap, detail));
  if (reduced) el.classList.add('ch-lv-reduced');
  parent.appendChild(el);

  const cards = new Map<string, CardParts>();
  let selected = levels[0]?.id ?? '';
  let visible = false;
  let rescueLoading = false;
  const rescue = (id: string): RescueCat => getRescueCatCached(id, { base });

  // ------------------------------------------------------------ cards (built once, painted often)
  levels.forEach((lv, i) => {
    const a = pathSlot(i, 4);
    const b = pathSlot(i, 2);
    const card = h('button.ch-lv-card', { type: 'button', role: 'listitem', 'data-level': lv.id, style: `--c4:${a.col};--r4:${a.row};--c2:${b.col};--r2:${b.row}` });
    const p = getLevelPreview(lv.id);
    const media = h('span.ch-lv-media', { 'data-state': p ? 'loading' : 'none' });
    if (p?.lqip) media.style.setProperty('--lqip', `url("${p.lqip}")`);
    if (p) {
      const img = h('img.ch-lv-thumb', {
        src: base + p.thumb,
        srcset: p.thumb2x ? `${base}${p.thumb} 1x, ${base}${p.thumb2x} 2x` : null,
        alt: '',
        width: p.width,
        height: p.height,
        loading: i < 4 ? 'eager' : 'lazy',
        decoding: 'async',
        draggable: 'false',
      });
      img.addEventListener('load', () => (media.dataset.state = 'ready'));
      img.addEventListener('error', () => {
        media.dataset.state = 'error';
        img.remove();
      });
      if (img.complete && img.naturalWidth > 0) media.dataset.state = 'ready';
      media.appendChild(img);
    }
    const num = h('span.ch-lv-num', { 'aria-hidden': 'true' });
    const avatar = h('span.ch-lv-avatar', { 'aria-hidden': 'true' });
    media.append(h('span.ch-lv-shade', { 'aria-hidden': 'true' }), num, avatar, h('span.ch-lv-lockover', { 'aria-hidden': 'true' }, icon('key')));
    const info = h('span.ch-lv-info');
    card.append(media, info);
    card.addEventListener('click', () => {
      if (card.disabled) return;
      click();
      if (selected === lv.id) opts.onPlay(lv.id);
      else select(lv.id);
    });
    card.addEventListener('focus', () => setFocus(lv.id));
    card.addEventListener('blur', () => setFocus(null));
    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && !card.disabled) setHover(lv.id);
    });
    card.addEventListener('pointerleave', () => {
      setHover(null);
      for (const v of ['--rx', '--ry', '--px', '--py']) card.style.removeProperty(v);
    });
    // A subtle tilt (and the still's parallax, in CSS) on desktop pointers only.
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || reduced || card.disabled || !mq('(hover: hover) and (pointer: fine)')) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
      card.style.setProperty('--px', `${(-x * 10).toFixed(1)}px`);
      card.style.setProperty('--py', `${(-y * 6).toFixed(1)}px`);
    });
    cards.set(lv.id, { card, media, num, avatar, info });
    map.appendChild(card);
  });

  function paintCard(lv: LevelDef, i: number) {
    const { card, num, avatar, info } = cards.get(lv.id)!;
    const rec = progress.get(lv.id);
    const open = progress.isUnlocked(lv.id);
    card.disabled = !open;
    card.dataset.locked = String(!open);
    card.dataset.won = String(rec.won);
    card.setAttribute('aria-current', String(lv.id === selected));
    const name = levelName(lv);
    const cat = rescue(lv.id);
    card.setAttribute(
      'aria-label',
      `Heist ${i + 1}: ${name}. Rescue ${cat.name}. ${open ? `${starCount(rec.stars)} of 3 stars${rec.won ? `, best ${rec.bestScore}` : ''}` : 'Locked'}`,
    );
    num.textContent = String(i + 1);
    const key = `${cat.id}|${cat.photo}`;
    if (avatar.dataset.cat !== key) {
      avatar.dataset.cat = key;
      avatar.replaceChildren(rescuePhoto(cat, { base, className: 'ch-lv-avatar-in' }));
    }
    info.replaceChildren(
      h('span.ch-lv-name', null, name),
      h(
        'span.ch-lv-row',
        null,
        starsRow(rec.stars),
        open
          ? h('span.ch-lv-best', null, rec.won ? `Best ${rec.bestScore} · ${formatTime(rec.bestTicks, TICK_HZ)}` : 'Not cracked yet')
          : h('span.ch-lv-lock', null, `Win heist ${i} to unlock`),
      ),
    );
  }

  // ------------------------------------------------------------ brief panel
  const hero = h('div.ch-lv-hero', { 'data-state': 'none' });
  const heroImg = h('img', { alt: '', decoding: 'async', draggable: 'false', width: 960, height: 540 });
  heroImg.addEventListener('load', () => (hero.dataset.state = 'ready'));
  heroImg.addEventListener('error', () => (hero.dataset.state = 'error'));
  const heroTitle = h('h3');
  const heroKick = h('small.ch-lv-kick');
  hero.append(heroImg, h('span.ch-lv-shade', { 'aria-hidden': 'true' }), h('div.ch-lv-herotext', null, heroKick, heroTitle));
  const dbody = h('div.ch-lv-dbody');
  const goWrap = h('div.ch-lv-gowrap');
  detail.append(hero, dbody, goWrap);
  let block: RescueBlock | null = null;
  let heroFor = '';

  function paintDetail() {
    const i = levels.findIndex((l) => l.id === selected);
    const lv = levels[i];
    if (!lv) {
      dbody.replaceChildren();
      goWrap.replaceChildren();
      return;
    }
    const rec = progress.get(lv.id);
    const p = getLevelPreview(lv.id);
    if (heroFor !== lv.id) {
      heroFor = lv.id;
      hero.dataset.state = p ? 'loading' : 'none';
      if (p?.lqip) hero.style.setProperty('--lqip', `url("${p.lqip}")`);
      else hero.style.removeProperty('--lqip');
      if (p) {
        heroImg.src = base + p.hero;
        heroImg.alt = p.alt;
        if (heroImg.complete && heroImg.naturalWidth > 0) hero.dataset.state = 'ready';
      } else heroImg.removeAttribute('src');
    }
    heroKick.textContent = `Heist ${i + 1} of ${levels.length}`;
    heroTitle.textContent = levelName(lv);
    const go = h('button.ch-btn.ch-primary.ch-big.ch-lv-go', { type: 'button', 'aria-label': `Start ${levelName(lv)}` }, icon('play'), h('span', null, 'Start'));
    go.addEventListener('click', () => {
      click();
      opts.onPlay(lv.id);
    });
    const rules = h('ul.ch-lv-rules', { 'aria-label': 'Star rules' });
    for (const r of STAR_RULES) {
      const li = h('li', null, icon('star'), h('span', null, h('b', null, r.label), h('small', null, r.detail)));
      if (rec.stars & r.bit) li.classList.add('ch-on');
      rules.appendChild(li);
    }
    block?.stop();
    const entry = opts.manifest?.cats.find((c) => c.id === lv.crate.catId);
    const cat = rescue(lv.id);
    block = rescueBlock(cat, entry, { base, reduced, loading: rescueLoading });
    dbody.replaceChildren(
      // The intro names the real cat too (the level's story name is swapped for display only).
      h('p.ch-lv-intro', null, withRescueName(lv, cat.name).meta.intro ?? ''),
      h(
        'div.ch-lv-facts',
        null,
        h('span', null, icon('clock'), `Par ${formatTime(lv.meta.parTicks, TICK_HZ)}`),
        h('span', null, icon('star'), `${lv.coins.length} catnip`),
        h('span', null, icon('eye'), `${lv.guards.length} guard dog${lv.guards.length === 1 ? '' : 's'}`),
        rec.won ? h('span', null, `Best ${rec.bestScore}`) : null,
      ),
      block.el,
      rules,
    );
    goWrap.replaceChildren(go);
    requestAnimationFrame(markMore);
  }

  /** Fade the brief's bottom edge while more of it is below (it scrolls under the Start bar). */
  function markMore() {
    const more = dbody.scrollHeight - dbody.clientHeight - dbody.scrollTop > 4;
    dbody.dataset.more = String(more);
  }
  dbody.addEventListener('scroll', markMore, { passive: true });

  // ------------------------------------------------------------ the one living loop
  let hoverId: string | null = null;
  let focusId: string | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let live: { id: string; video: HTMLVideoElement } | null = null;
  const onScreen = new Set<string>();
  const motionOk = () => !reduced && !saveData();

  function setHover(id: string | null) {
    if (hoverTimer) clearTimeout(hoverTimer);
    // A short delay, so sweeping the pointer across the grid does not start eight downloads.
    hoverTimer = setTimeout(
      () => {
        hoverId = id;
        updateLive();
      },
      id ? 140 : 60,
    );
  }
  function setFocus(id: string | null) {
    focusId = id && progress.isUnlocked(id) ? id : null;
    updateLive();
  }

  function stopLive() {
    if (!live) return;
    const v = live.video;
    live = null;
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch {
      /* not a real media element (tests) */
    }
    v.remove();
  }

  function playLive() {
    if (!live) return;
    const v = live.video;
    const shouldPlay = visible && !document.hidden && (!io || onScreen.has(live.id));
    try {
      if (shouldPlay) {
        const pr = v.play?.();
        if (pr && typeof pr.catch === 'function') pr.catch(() => undefined);
      } else v.pause?.();
    } catch {
      /* autoplay refused: the still stays */
    }
  }

  function updateLive() {
    const target = visible && motionOk() ? (hoverId ?? focusId ?? selected) : null;
    const p = target ? getLevelPreview(target) : null;
    if (!target || !p?.loop || p.loopType !== 'video/mp4' || !progress.isUnlocked(target)) {
      stopLive();
      return;
    }
    if (live?.id !== target) {
      stopLive();
      const parts = cards.get(target);
      if (!parts) return;
      const v = document.createElement('video');
      v.className = 'ch-lv-loop';
      v.muted = true;
      v.defaultMuted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.setAttribute('disablepictureinpicture', '');
      v.tabIndex = -1;
      v.preload = 'auto';
      v.poster = base + p.thumb;
      v.addEventListener('playing', () => v.classList.add('ch-on'));
      v.addEventListener('error', () => v.remove());
      v.src = base + p.loop;
      // Above the still, below the shade and the badges.
      parts.media.insertBefore(v, parts.media.querySelector('.ch-lv-shade'));
      live = { id: target, video: v };
    }
    playLive();
  }

  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const id = (e.target as HTMLElement).dataset.level;
              if (!id) continue;
              if (e.isIntersecting) onScreen.add(id);
              else onScreen.delete(id);
            }
            playLive();
          },
          { threshold: 0.35 },
        )
      : null;
  for (const { card } of cards.values()) io?.observe(card);
  const onVisibility = () => playLive();
  document.addEventListener('visibilitychange', onVisibility);

  // ------------------------------------------------------------ path, paint, selection
  function drawPath() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!visible || mq(STRIP_QUERY)) return;
    const box = map.getBoundingClientRect();
    if (box.width === 0) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const pts = levels.map((l) => {
      const r = cards.get(l.id)!.card.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    });
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const p = document.createElementNS(svgNS, 'path');
      const mx = (a.x + b.x) / 2;
      // Row turns swing out past the card edge (into the map's side padding) so the bend shows.
      // (A cubic with both handles at +out peaks at 0.75 * out from the centre line.)
      const out = (cards.get(levels[i].id)!.card.getBoundingClientRect().width / 2 + 16) / 0.75;
      const d = Math.abs(a.y - b.y) < 4 ? `M${a.x},${a.y} Q${mx},${a.y - 26} ${b.x},${b.y}` : `M${a.x},${a.y} C${a.x + (a.x > box.width / 2 ? out : -out)},${a.y} ${b.x + (b.x > box.width / 2 ? out : -out)},${b.y} ${b.x},${b.y}`;
      p.setAttribute('d', d);
      p.setAttribute('class', progress.isUnlocked(levels[i].id) ? 'ch-lv-open' : 'ch-lv-shut');
      svg.appendChild(p);
    }
  }

  /** In the strip layout, bring the selected card to the middle (only the strip scrolls). */
  function revealSelected(smooth: boolean) {
    if (!mq(STRIP_QUERY)) return;
    const c = cards.get(selected)?.card;
    if (!c || mapWrap.scrollWidth <= mapWrap.clientWidth) return;
    const left = Math.max(0, c.offsetLeft - (mapWrap.clientWidth - c.offsetWidth) / 2);
    if (typeof mapWrap.scrollTo === 'function') mapWrap.scrollTo({ left, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    else mapWrap.scrollLeft = left;
  }

  function paint() {
    levels.forEach(paintCard);
    const got = levels.reduce((n, l) => n + starCount(progress.get(l.id).stars), 0);
    total.replaceChildren(icon('star'), h('span', null, `${got} / ${levels.length * 3}`));
    paintDetail();
    updateLive();
    requestAnimationFrame(drawPath);
  }

  function select(id: string) {
    if (!cards.has(id) || !progress.isUnlocked(id)) return;
    selected = id;
    paint();
    revealSelected(true);
  }

  /** Arrow keys walk the unlocked heists in path order (Home / End jump to the ends). */
  map.addEventListener('keydown', (e) => {
    const open = levels.filter((l) => progress.isUnlocked(l.id)).map((l) => l.id);
    const from = (document.activeElement as HTMLElement | null)?.dataset?.level ?? selected;
    const at = Math.max(0, open.indexOf(from));
    let to = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = Math.min(open.length - 1, at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = Math.max(0, at - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = open.length - 1;
    if (to < 0 || !open[to]) return;
    e.preventDefault();
    if (open[to] !== selected) select(open[to]);
    cards.get(open[to])?.card.focus({ preventScroll: true });
  });

  /** The next level to beat: the first unlocked level not yet won, else the last unlocked. */
  function defaultSelection(): string {
    let last = levels[0]?.id ?? '';
    for (const l of levels) {
      if (!progress.isUnlocked(l.id)) break;
      last = l.id;
      if (!progress.get(l.id).won) return l.id;
    }
    return last;
  }

  // The real shelter cats: cached ones paint at once, live ones replace them when the API answers.
  let disposed = false;
  function fetchCats() {
    if (opts.rescueCats === false) return;
    rescueLoading = true;
    void loadRescueCats({ base }).then(() => {
      rescueLoading = false;
      if (disposed || !visible) return;
      levels.forEach(paintCard);
      paintDetail();
    });
  }

  const onResize = () => {
    if (!visible) return;
    drawPath();
    markMore();
    revealSelected(false);
  };
  window.addEventListener('resize', onResize);
  const onKey = (e: KeyboardEvent) => {
    if (!visible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onBack?.();
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    el,
    get visible() {
      return visible;
    },
    get selected() {
      return selected;
    },
    show(levelId) {
      visible = true;
      selected = levelId && cards.has(levelId) && progress.isUnlocked(levelId) ? levelId : defaultSelection();
      el.classList.add('ch-on');
      fetchCats();
      paint();
      revealSelected(false);
      cards.get(selected)?.card.focus({ preventScroll: true });
    },
    hide() {
      visible = false;
      el.classList.remove('ch-on');
      hoverId = focusId = null;
      stopLive();
      block?.stop();
    },
    refresh() {
      if (visible) paint();
    },
    dispose() {
      disposed = true;
      stopLive();
      block?.stop();
      io?.disconnect();
      if (hoverTimer) clearTimeout(hoverTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
