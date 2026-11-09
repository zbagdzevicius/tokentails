// @vitest-environment happy-dom
/**
 * Token Tails card art in the game (ui/cards/, render/skins/tierCardFx.ts): pick tiles are element-framed cards that
 * keep the tile contract (one <b>, data-h), the picked tile carries its worn card's rung, the respawn card counts
 * down and flips, the kill feed shows element-ringed faces, the MVP and VS cards render both teams, and the world
 * flourish only fires for Rare+ cards on the way back and stays inside the cosmetic caps. Render and UI only.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { pickScreen } from '../../src/ui/screens';
import { cardFrame } from '../../src/ui/cards/frame';
import { cardAttrs, heroElement } from '../../src/ui/cards/el';
import { RespawnCard, cardReveal } from '../../src/ui/cards/reveal';
import { mvpCard } from '../../src/ui/cards/mvp';
import { showVsIntro } from '../../src/ui/cards/vs';
import { Hud } from '../../src/ui/hud';
import { HERO_IDS } from '../../src/data/heroes';
import { rosterCosmetics } from '../../src/meta/roster';
import { setRosterSkins } from '../../src/render/skins/registry';
import { COSMETIC_MAX, TierFx, setTierExt, type FxHero, type FxParticles } from '../../src/render/skins/tierFx';
import { cardFlourish, TWINKLE_GAP } from '../../src/render/skins/tierCardFx';

vi.mock('../../src/render/portraits', () => ({ portraitUrl: () => 'data:image/png;base64,AAAA' }));

describe('card frame and pick tiles', () => {
  it('every champion has a card element, and a frame sets only data attributes (the art lives in CSS)', () => {
    for (const h of HERO_IDS) expect(['ICE', 'ELECTRIC', 'FIRE', 'WIND', 'DARK', 'WATER', 'GRASS', 'SAND', 'FAIRY', 'STELLAR']).toContain(heroElement(h));
    const html = cardFrame({ el: 'FIRE', tier: 'EPIC', inner: '<b>x</b>', foot: true, sparkles: true, icon: true });
    expect(html).toContain(cardAttrs('FIRE', 'EPIC'));
    expect(html).toContain('Epic · TOKEN TAILS');
    expect(html.match(/tt-sp /g)).toHaveLength(4);
    expect(html).not.toMatch(/url\(/);
  });
  it('pick (champion select): a portrait tile per hero (20), one name each, the worn card rung as the tile border', () => {
    document.body.innerHTML = '';
    setRosterSkins([{ id: 'z', name: 'Zuzu', type: 'ICE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt' }]);
    const root = pickScreen(document.body, {
      initial: { hero: 'meatball', trick: 'pounce', difficulty: 'easy' },
      owned: { items: new Set(), unlocks: new Set(), roster: rosterCosmetics([{ id: 'z', name: 'Zuzu', type: 'ICE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt' }]) },
      looks: { meatball: { coat: 'cat.z', chroma: null } },
      onHero: () => undefined,
      onStart: () => undefined,
      onBack: () => undefined,
    });
    const tiles = root.querySelectorAll<HTMLElement>('.cs-grid .cs-tile');
    expect(tiles).toHaveLength(20);
    for (const t of tiles) expect(t.querySelectorAll('.cs-tn')).toHaveLength(1);
    const on = root.querySelector<HTMLElement>('.cs-tile.on') as HTMLElement;
    expect(on.dataset.h).toBe('meatball');
    // the portrait sits on its element gradient; the worn card's rung is the tile border (no heavy card frame)
    expect(on.querySelector<HTMLElement>('.cs-face')?.dataset.ttEl).toBe('GRASS');
    expect(on.dataset.rung).toBe('LEGENDARY');
    expect(on.querySelector('.cs-tn')?.textContent).toBe('Zuzu');
    const off = root.querySelector<HTMLElement>('.cs-tile[data-h="clem"]') as HTMLElement;
    expect(off.dataset.rung).toBeUndefined();
    expect(root.querySelector('.tt-card')).toBeNull();
  });
});

describe('respawn and reveal cards', () => {
  it('RespawnCard: face down with a paw (no second countdown), flips up once on the way back, hides', () => {
    document.body.innerHTML = '';
    const c = new RespawnCard(document.body, 'clem', null, 'RARE');
    c.down(9);
    c.down(9);
    c.down(8);
    expect(c.el.classList.contains('on')).toBe(true);
    // the HUD's "Back in N" chip is the one countdown: the card back shows a paw, never a number
    expect(c.el.querySelector('.tt-back-paw')).not.toBeNull();
    expect(c.el.querySelector('.tt-face-back')?.textContent?.trim()).toBe('');
    expect(c.el.querySelector('.tt-flip')?.classList.contains('up')).toBe(false);
    c.reveal();
    expect(c.el.querySelector('.tt-flip')?.classList.contains('up')).toBe(true);
    c.hide();
    expect(c.el.classList.contains('on')).toBe(false);
    c.dispose();
    expect(document.body.querySelector('.tt-respawn')).toBeNull();
  });
  it('cardReveal: mounts, resolves done on dispose, safe twice', async () => {
    document.body.innerHTML = '';
    const r = cardReveal(document.body, { hero: 'brutus', ribbon: 'Back!', anchor: () => ({ x: 10, y: 20 }) });
    expect(document.body.querySelector('.tt-reveal.anchored .tt-flip')).not.toBeNull();
    expect(r.el.querySelector('.tt-ribbon')?.textContent).toBe('Back!');
    r.dispose();
    r.dispose();
    await r.done;
    expect(document.body.querySelector('.tt-reveal')).toBeNull();
  });
  it('the HUD kill feed puts an element-ringed face before each hero name', () => {
    document.body.innerHTML = '';
    const hud = new Hud(document.body, 'clem', 'pounce', { onSlot: () => undefined });
    hud.kill({ name: 'You', rel: 'self', hero: 'clem' }, { name: 'Sir Brutus', rel: 'enemy', hero: 'brutus' }, true);
    const faces = document.querySelectorAll<HTMLElement>('.pl-feed-row .tt-kf');
    expect(faces).toHaveLength(2);
    expect(faces[1].dataset.ttEl).toBe(heroElement('brutus'));
    expect(document.querySelectorAll('.pl-feed-row b')[1].textContent).toBe('Sir Brutus');
    hud.dispose();
  });
});

describe('MVP and VS cards', () => {
  it('MVP: a face-down card with the ribbon; the tier decorations follow the rung', () => {
    expect(mvpCard({ hero: 'stilts', name: 'Marmalade', you: false, won: true })).toContain('tt-mvp-deco wl');
    const leg = mvpCard({ hero: 'clem', name: 'You', you: true, tier: 'LEGENDARY', won: true });
    expect(leg).toContain('tt-mvp-leg');
    expect(leg).toContain('MVP');
    expect(leg).toContain('data-tt-tier="LEGENDARY"');
  });
  it('VS: both teams as six flip cards, own team first, and it is gone after a dispose', () => {
    document.body.innerHTML = '<div class="pl-rail"></div>';
    const off = showVsIntro(document.body, { picks: ['clem', 'sage', 'lambo', 'brutus', 'cacklejaw', 'brutus'], mySlot: 4, names: ['A', 'B', 'C', 'D', 'E', 'F'] });
    const rows = document.querySelectorAll('.tt-vs-row');
    expect(rows[0].classList.contains('mine')).toBe(true);
    expect(document.querySelectorAll('.tt-vs .tt-flip')).toHaveLength(6);
    expect(document.querySelector('.tt-vs-slot.me .tt-name')?.textContent).toBe('You');
    // LoL pass (lane A): appended over the rail (whose countdown hides under it, vs.css)
    expect(document.body.lastElementChild?.classList.contains('tt-vs')).toBe(true);
    off();
    expect(document.querySelector('.tt-vs')).toBeNull();
  });
});

describe('the card flourish in the world (TierFx extension)', () => {
  function pool(): FxParticles & { bursts: number; rings: number } {
    const p = {
      add: { count: 0, limit: 1000 },
      alpha: { count: 0, limit: 600 },
      bursts: 0,
      rings: 0,
      burst(_pos: THREE.Vector3, _o: Record<string, unknown>) {
        p.bursts++;
      },
      ring() {
        p.rings++;
      },
    };
    return p;
  }
  const hero = (over: Partial<FxHero> = {}): FxHero => ({ id: 0, x: 0, z: 0, rung: 'RARE', element: 'FIRE', self: true, moving: true, stealth: false, dead: false, napping: false, phase: 0, ...over });
  const alone = [{ x: 0, z: 0, dead: false }];
  const frame = (fx: TierFx, h: FxHero, dt = 0.1): void => {
    fx.begin(dt, 0, 0, alone);
    fx.hero(h);
    fx.end();
  };

  it('Common: nothing; Rare: one ring on the way back; Legendary: ring, column and flash', () => {
    setTierExt(cardFlourish);
    try {
      for (const [rung, rings, bursts] of [
        ['COMMON', 0, 0],
        ['RARE', 1, 0],
        ['EPIC', 1, 1],
        ['LEGENDARY', 2, 1],
      ] as const) {
        const p = pool();
        const fx = new TierFx(p);
        const h = hero({ rung, dead: true });
        frame(fx, h);
        h.dead = false;
        frame(fx, h);
        frame(fx, h);
        expect([rung, p.rings, p.bursts]).toEqual([rung, rings, bursts]);
      }
    } finally {
      setTierExt(null);
    }
  });
  it('Epic standing still twinkles at most once per TWINKLE_GAP; never for another hero in a team fight', () => {
    setTierExt(cardFlourish);
    try {
      const p = pool();
      const fx = new TierFx(p);
      const h = hero({ rung: 'EPIC', moving: false });
      for (let i = 0; i < 30; i++) frame(fx, h, 0.1);
      expect(p.bursts).toBeLessThanOrEqual(Math.ceil(3 / TWINKLE_GAP) + 1);
      expect(fx.alive()).toBeLessThanOrEqual(COSMETIC_MAX);
      const q = pool();
      const fy = new TierFx(q);
      const crowd = [0, 1, 2, 3, 4].map(() => ({ x: 0, z: 0, dead: false }));
      const other = hero({ id: 3, self: false, rung: 'LEGENDARY', moving: false });
      for (let i = 0; i < 30; i++) {
        fy.begin(0.1, 0, 0, crowd);
        fy.hero(other);
        fy.end();
      }
      expect(q.bursts + q.rings).toBe(0);
    } finally {
      setTierExt(null);
    }
  });
});
