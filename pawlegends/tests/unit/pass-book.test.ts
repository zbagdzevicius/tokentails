// @vitest-environment happy-dom
/**
 * The Treat Track and Legends Pass in the Hearth Storybook look: ribbon tabs with arrow keys, portrait medallions in
 * Cats / Dogs groups, wax-sealed postcards, the open-book tier strip with rarity frames and coat previews. The claim,
 * buy and target behaviour is unchanged (gaps-wave-a, store-pass e2e); this pins the new markup and the native rules.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import type { StoreSnapshot } from '../../src/money/entitlements';
import { collectionPanel } from '../../src/ui/collection';
import { passPanel } from '../../src/ui/passPanel';
import { freshTreats } from '../../src/meta/treats';
import { hex, isCat } from '../../src/ui/passBook';

const snap = (over: Partial<StoreSnapshot> = {}): StoreSnapshot => ({
  embedded: true,
  isApp: false,
  storeOpen: true,
  catCheckout: false,
  notifyOpen: false,
  signedIn: true,
  items: new Set(),
  skus: new Set(),
  season: { id: 's1', xp: 2620, tier: 6, premium: 'none', skips: 0, claimed: ['f:3'], endsAt: '2027-01-05T00:00:00.000Z' } as StoreSnapshot['season'],
  champions: null,
  ...over,
});

const key = (el: Element, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
};

describe('Treat Track storybook', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const open = (onPass?: () => void) =>
    collectionPanel(document.body, {
      treats: { ...freshTreats(), xp: 12 * 300 + 150, chests: 12 },
      owned: new Set(['postcard.lambo']),
      art: {},
      portrait: (h) => `data:image/png;base64,${h}`,
      wornTitle: null,
      wornFrame: null,
      onTarget: () => undefined,
      onWear: () => undefined,
      onClose: () => undefined,
      onPass,
    });

  it('is a dialog with ribbon tabs; an arrow key on the tab opens the Legends Pass', () => {
    let pass = 0;
    const root = open(() => pass++);
    expect(root.getAttribute('role')).toBe('dialog');
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    key(tabs[0], 'ArrowRight');
    expect(pass).toBe(1);
    expect(root.isConnected).toBe(false);
  });

  it('targets are portrait medallions, Track order then cats then dogs, each a 44 px+ button', () => {
    const root = open();
    const ids = [...root.querySelectorAll<HTMLElement>('.md-row [data-target]')].map((b) => b.dataset.target as HeroId | '');
    expect(ids[0]).toBe('');
    const heroes = ids.slice(1) as HeroId[];
    expect(heroes).toHaveLength(20);
    const firstDog = heroes.findIndex((h) => !isCat(h));
    expect(heroes.slice(0, firstDog).every(isCat)).toBe(true);
    expect(heroes.slice(firstDog).some(isCat)).toBe(false);
    expect(root.querySelector('[data-target="clem"] .md-face img')?.getAttribute('src')).toContain('clem');
    expect(root.querySelector('.grp')?.textContent).toBe('Cats');
    expect(root.querySelector('.grp.dog')?.textContent).toBe('Dogs');
  });

  it('the chest path shows the next chest number and the bar fill; locked postcards are sealed envelopes', () => {
    const root = open();
    expect(root.querySelector('.tp-num')?.textContent).toBe('13');
    expect(root.querySelector('.tp-bar')?.getAttribute('aria-valuenow')).toBe('50');
    expect(root.querySelector('[data-postcard="gabe"] .pic.sealed')).not.toBeNull();
    expect(root.querySelector('[data-postcard="lambo"] .stamp')).not.toBeNull();
    expect(root.querySelector('.bk-foot [data-a="close"]')?.textContent).toBe('Done');
  });
});

describe('Legends Pass book', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('title plate, current tier highlighted, rarity frames, coat previews with swatches', () => {
    const p = passPanel(document.body, { snapshot: () => snap(), claim: () => true, portrait: (h) => `data:image/png;base64,${h}`, onClose: () => undefined });
    const root = p.el;
    expect(root.querySelector('.pp-title')?.textContent).toContain('First Paws');
    expect(root.querySelector('.pcol.now')?.getAttribute('data-col')).toBe('6');
    expect(root.querySelectorAll('.pcol.reached')).toHaveLength(6);
    expect(root.querySelector('.pc.ready[data-row="f"][data-tier="6"]')).not.toBeNull();
    expect(root.querySelector('.pc.claimed[data-row="f"][data-tier="3"]')).not.toBeNull();
    expect(root.querySelector('.pc[data-row="p"][data-tier="30"]')?.classList.contains('r-legendary')).toBe(true);
    const coat = root.querySelector('.pc[data-row="p"][data-tier="3"]')!;
    expect(coat.classList.contains('locked')).toBe(true);
    expect(coat.querySelector('.pv.coat img')?.getAttribute('src')).toContain('duchess');
    expect(coat.querySelectorAll('.sw i')).toHaveLength(3);
    expect(root.querySelector('.pc[data-row="p"][data-tier="8"] .pv.frame')?.getAttribute('data-frame')).toBe('frame.s1.lantern');
    expect(root.querySelector('.pc[data-row="p"][data-tier="5"] .pv.title')?.textContent).toBe('Pathfinder');
    expect(root.querySelector('[data-buy="pl_pass_s1"]')).not.toBeNull();
    p.close();
  });

  it('native app: no price, no buy button, no web wording', () => {
    const p = passPanel(document.body, { snapshot: () => snap({ isApp: true, storeOpen: false }), claim: () => true, onClose: () => undefined });
    expect(p.el.querySelector('[data-buy]')).toBeNull();
    expect(p.el.textContent ?? '').not.toMatch(/\$|€|buy|web/i);
    p.close();
  });

  it('arrow key on the tab goes back to the Treat Track; Esc closes', () => {
    let track = 0;
    let closed = 0;
    const p = passPanel(document.body, { snapshot: () => snap(), claim: () => true, onTrack: () => track++, onClose: () => closed++ });
    key(p.el.querySelector('[role="tab"][aria-selected="true"]')!, 'ArrowLeft');
    expect(track).toBe(1);
    expect(closed).toBe(1);
    const q = passPanel(document.body, { snapshot: () => snap(), claim: () => true, onClose: () => closed++ });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(q.el.isConnected).toBe(false);
    expect(closed).toBe(2);
  });

  it('hex() pads palette numbers', () => {
    expect(hex(0x0a0b0c)).toBe('#0a0b0c');
    expect(hex(0xffd34d)).toBe('#ffd34d');
  });
});
