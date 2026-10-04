// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLevels, LEVEL_IDS } from '../../../levels';
import { createLevelSelect, type LevelSelect } from '../LevelSelect';
import { PROGRESS_KEY, ProgressStore, type StorageLike } from '../progress';
import { decorateResults } from '../results';
import { fallbackRescueCat, resetRescueCats, RESCUE_SHELTER_LINE, type RescueCat } from '../rescue-cats';

function memStorage(init: Record<string, string> = {}): StorageLike {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
const won = { won: true, bestScore: 200, bestTicks: 1800, stars: 7, plays: 1 };

let ls: LevelSelect | null = null;
function open(wins: string[] = [], opts: { levelId?: string } = {}) {
  const levels = getLevels();
  const storage = memStorage({ [PROGRESS_KEY]: JSON.stringify({ v: 1, levels: Object.fromEntries(wins.map((id) => [id, won])) }) });
  const progress = new ProgressStore(storage, LEVEL_IDS);
  const onPlay = vi.fn();
  ls = createLevelSelect(document.body, { levels, progress, base: 'assets/', onPlay, rescueCats: false });
  ls.show(opts.levelId);
  return { onPlay, el: ls.el };
}

beforeEach(() => {
  resetRescueCats();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  ls?.dispose();
  ls = null;
  document.body.replaceChildren();
});

describe('level select previews', () => {
  it('gives every card a still with a 2x srcset, an aspect box and a blur-up placeholder', () => {
    const { el } = open();
    const cards = el.querySelectorAll<HTMLElement>('.ch-lv-card');
    expect(cards).toHaveLength(8);
    for (const card of cards) {
      const img = card.querySelector<HTMLImageElement>('.ch-lv-media img.ch-lv-thumb')!;
      const id = card.dataset.level!;
      expect(img.getAttribute('src')).toBe(`assets/images/levels/${id}.webp`);
      expect(img.getAttribute('srcset')).toContain(`assets/images/levels/${id}@2x.webp 2x`);
      expect(img.getAttribute('width')).toBe('480');
      expect(img.getAttribute('height')).toBe('270');
      expect(card.querySelector<HTMLElement>('.ch-lv-media')!.style.getPropertyValue('--lqip')).toContain('data:image/webp;base64,');
    }
    // The first row loads at once, the rest lazily.
    expect(cards[0].querySelector('img')!.getAttribute('loading')).toBe('eager');
    expect(cards[7].querySelector('img')!.getAttribute('loading')).toBe('lazy');
  });

  it('keeps the image on locked cards, with a lock overlay and the unlock hint', () => {
    const { el } = open();
    const locked = el.querySelector<HTMLButtonElement>('.ch-lv-card[data-level="heist-02"]')!;
    expect(locked.disabled).toBe(true);
    expect(locked.querySelector('img.ch-lv-thumb')).not.toBeNull();
    expect(locked.querySelector('.ch-lv-lockover')).not.toBeNull();
    expect(locked.textContent).toContain('Win heist 1 to unlock');
  });

  it('plays one muted inline loop, on the selected card only, and moves it with the selection', () => {
    const { el } = open(['heist-01', 'heist-02']);
    let videos = el.querySelectorAll<HTMLVideoElement>('video');
    expect(videos).toHaveLength(1);
    const v = videos[0];
    expect(v.closest<HTMLElement>('.ch-lv-card')!.dataset.level).toBe('heist-03');
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(true);
    expect(v.hasAttribute('playsinline')).toBe(true);
    expect(v.getAttribute('src')).toBe('assets/images/levels/heist-03-loop.mp4');
    const first = el.querySelector<HTMLButtonElement>('.ch-lv-card[data-level="heist-01"]')!;
    first.focus(); // a tap or click focuses the button first
    first.click();
    videos = el.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0].closest<HTMLElement>('.ch-lv-card')!.dataset.level).toBe('heist-01');
    ls!.hide();
    expect(el.querySelectorAll('video')).toHaveLength(0);
  });

  it('creates no video when the player prefers reduced motion', () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const { el } = open();
      expect(el.querySelectorAll('video')).toHaveLength(0);
      expect(el.querySelectorAll('img.ch-lv-thumb')).toHaveLength(8);
    } finally {
      window.matchMedia = real;
    }
  });

  it('shows the hero still in the brief panel', () => {
    const { el } = open(['heist-01']);
    const hero = el.querySelector<HTMLImageElement>('.ch-lv-hero img')!;
    expect(hero.getAttribute('src')).toBe('assets/images/levels/heist-02@2x.webp');
    expect(hero.alt.length).toBeGreaterThan(10);
  });

  it('walks the unlocked heists with the arrow keys', () => {
    const { el } = open(['heist-01', 'heist-02']);
    const map = el.querySelector<HTMLElement>('.ch-lv-map')!;
    map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(ls!.selected).toBe('heist-02');
    map.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(ls!.selected).toBe('heist-01');
    map.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(ls!.selected).toBe('heist-03');
    map.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(ls!.selected).toBe('heist-03');
  });
});

describe('level select rescue cat', () => {
  it('shows the real cat: photo, pixel cat, name, status, shelter line', () => {
    const { el } = open();
    const rc = el.querySelector<HTMLElement>('[data-testid="rescue-cat"]')!;
    const cat = fallbackRescueCat('heist-01', 'assets/');
    expect(rc.querySelector<HTMLImageElement>('.ch-lv-rc-photo img')!.getAttribute('src')).toBe(cat.photo);
    expect(rc.querySelector<HTMLImageElement>('.ch-lv-rc-photo img')!.alt).toBe(`Photo of ${cat.name} at the Pink Paw shelter`);
    expect(rc.querySelector('.ch-lv-rc-sprite')).not.toBeNull();
    expect(rc.querySelector('.ch-lv-rc-name')!.textContent).toBe(cat.name);
    // The display face has no "ė": the base letter is drawn with the mark, the real letter kept.
    if (cat.name === 'Gabė') {
      const dia = rc.querySelector<HTMLElement>('.ch-lv-rc-name .ch-dia-dot')!;
      expect(dia.dataset.base).toBe('e');
      expect(dia.textContent).toBe('ė');
      expect(rc.querySelector('.ch-lv-rc-name .ch-lv-body-font')).toBeNull();
    }
    // The intro names the same cat as the rescue block (never the level's story name).
    const intro = el.querySelector('.ch-lv-intro')!.textContent!;
    expect(intro).not.toContain('Mochi');
    expect(intro).toContain(cat.name);
    expect(rc.querySelector('.ch-lv-rc-chip')!.textContent).toBe('waiting for a home');
    expect(rc.querySelector('.ch-lv-rc-line')!.textContent).toContain(RESCUE_SHELTER_LINE);
    // A local copy says when its status was recorded.
    expect(rc.querySelector('.ch-lv-rc-line')!.textContent).toContain('as of');
    // Every card carries its cat's photo too.
    expect(el.querySelectorAll('.ch-lv-avatar img')).toHaveLength(8);
  });

  it('links "Meet <name>" only when the build has a site link (owned channels)', () => {
    const { el } = open();
    const cat = fallbackRescueCat('heist-01', 'assets/');
    const meet = el.querySelector<HTMLAnchorElement>('[data-testid="rescue-cat-meet"]');
    if (cat.profileUrl) {
      expect(meet!.textContent).toBe(`Meet ${cat.name} ›`);
      expect(meet!.target).toBe('_blank');
      expect(meet!.rel).toBe('noopener');
    } else expect(meet).toBeNull();
  });

  it('never shows another cat\'s bundled photo when a live replacement cat\'s photo fails', async () => {
    const { localPhotoFor, rescuePhoto } = await import('../rescue-view');
    const pinned = fallbackRescueCat('heist-02', 'assets/');
    const other: RescueCat = { ...pinned, id: 'a'.repeat(24), name: 'Someone', photo: 'https://cdn.example.com/x.webp', source: 'live' };
    expect(localPhotoFor(pinned, 'assets/')).toBe(pinned.photo);
    expect(localPhotoFor(other, 'assets/')).toBeNull();
    const el = rescuePhoto(other, { base: 'assets/' });
    const img = el.querySelector('img')!;
    img.dispatchEvent(new Event('error'));
    expect(el.dataset.state).toBe('error');
    expect(el.querySelector('img')).toBeNull();
  });

  it('falls back to the bundled photo when the live one fails', () => {
    const { el } = open();
    const img = el.querySelector<HTMLImageElement>('.ch-lv-rc-photo img')!;
    img.src = 'https://cdn.example.com/broken.webp';
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toBe(fallbackRescueCat('heist-01', 'assets/').photo);
    img.dispatchEvent(new Event('error'));
    expect(el.querySelector<HTMLElement>('.ch-lv-rc-photo')!.dataset.state).toBe('error');
  });
});

describe('results: the real cat', () => {
  function resultsDom(name: string) {
    const root = document.createElement('div');
    root.innerHTML = `<section class="ch-results"><div class="ch-dialog"><div class="ch-rescue"><canvas></canvas><p>You rescued ${name}!<small data-testid="rail-line">rail</small></p></div><div class="ch-row"></div></div></section>`;
    document.body.appendChild(root);
    return root;
  }

  it('puts the shelter photo next to the pixel cat and keeps the headline first', () => {
    const cat: RescueCat = fallbackRescueCat('heist-03', 'assets/');
    const root = resultsDom(cat.name);
    decorateResults(root, { stars: 1, newStars: 1, nextName: null, unlockedNow: false, rescue: cat, base: 'assets/' });
    const box = root.querySelector('.ch-rescue')!;
    // The photo is the hero; the pixel cat rides on its corner as a badge.
    const pics = box.querySelector('.ch-lv-res-pics')!;
    expect(pics.firstElementChild!.classList.contains('ch-lv-res-photo')).toBe(true);
    expect(pics.querySelector('canvas.ch-lv-res-badge')).not.toBeNull();
    const p = box.querySelector('p')!;
    expect(p.textContent!.startsWith(`You rescued ${cat.name}!`)).toBe(true);
    const real = p.querySelector('[data-testid="rescue-real"]')!;
    expect(real.textContent).toContain(RESCUE_SHELTER_LINE);
    expect(real.textContent).toContain('as of');
    expect(real.nextElementSibling!.getAttribute('data-testid')).toBe('rail-line');
    // Decorating again (a re-render) does not duplicate it.
    decorateResults(root, { stars: 1, newStars: 0, nextName: null, unlockedNow: false, rescue: cat, base: 'assets/' });
    expect(root.querySelectorAll('.ch-lv-res-photo')).toHaveLength(1);
    expect(root.querySelectorAll('.ch-rescue canvas')).toHaveLength(1);
  });

  it('pins every action (Next, Heists, Retry, Menu) in one footer at the bottom of the scroll', () => {
    const root = document.createElement('div');
    root.innerHTML = `<section class="ch-results"><div class="ch-dialog"><div class="ch-scroll"><div class="ch-rescue"><canvas></canvas><p>You rescued Gabė!<small>rail</small></p></div><div class="ch-row"><button>Retry</button><button>Menu</button></div><div class="signin"></div></div></div></section>`;
    document.body.appendChild(root);
    const cat = fallbackRescueCat('heist-01', 'assets/');
    const x = { stars: 1, newStars: 0, nextName: 'Kennel Row', unlockedNow: true, rescue: cat, base: 'assets/', onNext: () => undefined, onLevels: () => undefined };
    decorateResults(root, x);
    decorateResults(root, x);
    const scroll = root.querySelector('.ch-scroll')!;
    const foot = scroll.querySelector('.ch-lv-resfoot')!;
    expect(foot).not.toBeNull();
    expect(scroll.querySelectorAll('.ch-lv-resfoot')).toHaveLength(1);
    expect(scroll.lastElementChild).toBe(foot);
    expect(foot.querySelectorAll('.ch-lv-resrow')).toHaveLength(1);
    expect(foot.querySelector('.ch-row')).not.toBeNull();
    expect(scroll.querySelectorAll('.ch-lv-res')).toHaveLength(1);
    expect(scroll.querySelector('.signin')!.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The headline keeps its text, with the name in the display face.
    const p = root.querySelector('.ch-rescue p')!;
    expect(p.textContent!.startsWith('You rescued Gabė!')).toBe(true);
    expect(p.querySelector('.ch-lv-headline .ch-dia-dot')).not.toBeNull();
    root.remove();
  });
});
