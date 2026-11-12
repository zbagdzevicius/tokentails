// @vitest-environment happy-dom
/**
 * The nap card (founder ask 2026-11-12: the dead-player card was Token Tails' card back and element frame; it should be
 * Paw Legends' own): it shows while the hero is out with the countdown, who did it (their champion medallion), the
 * player's champion and a Paw Legends tip or lore line, and nothing from Token Tails (no card back, frame or rarity).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hud } from '../../src/ui/hud';
import { NAP_ART, NAP_LINE_MS, NapCard, _resetNapLines, napLines } from '../../src/ui/napCard';
import { HERO_IDS } from '../../src/data/heroes';
import type { EntitySnap, MatchClock } from '../../src/sim/api';

vi.mock('../../src/render/portraits', () => ({ portraitUrl: () => null }));

const CLOCK: MatchClock = { tick: 900, seconds: 30, phase: 'play', nextPhaseIn: 1000 } as MatchClock;
const me = (o: Partial<EntitySnap> = {}): EntitySnap =>
  ({ id: 0, kind: 'hero', team: 0, hero: 'clem', x: 0, y: 0, hp: 500, maxHp: 500, shield: 0, state: 'idle', level: 3, cooldowns: [0, 0, 0, 0, 0], ...o }) as EntitySnap;
const SCORE = { kills: [0, 0], towers: [0, 0] } as never;
const TT = /token\s?tails|tt-card|tt-back|tt-flip|tt-respawn|data-tier|legendary|epic|rare\b/i;

beforeEach(() => {
  document.body.innerHTML = '<div class="pl-match"></div>';
  _resetNapLines();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('nap card in the HUD', () => {
  it('renders when the hero is knocked out: countdown, killer medallion, champion, a line; hides when back', () => {
    const root = document.querySelector('.pl-match') as HTMLElement;
    const hud = new Hud(root, 'clem', 'pounce', { onSlot: () => undefined });
    expect(root.querySelector('.pl-napcard.on')).toBeNull();
    hud.recap('Knocked out by Sir Brutus', { kind: 'hero', hero: 'brutus' });
    hud.update(me({ state: 'dead', hp: 0, respawnIn: 200 }), CLOCK, SCORE, 0);
    const card = root.querySelector<HTMLElement>('.pl-napcard.on')!;
    expect(card).not.toBeNull();
    expect(card.querySelector('.nc-kicker')?.textContent).toBe('Napping at the fountain');
    expect(card.querySelector('.nc-secs')?.textContent).toBe('7');
    expect(card.querySelector('.nc-recap')?.textContent).toBe('Knocked out by Sir Brutus');
    const medal = card.querySelector<HTMLElement>('.nc-medal')!;
    expect(medal.dataset.hero).toBe('brutus');
    expect(medal.style.backgroundImage).toContain('splash/brutus-360.webp');
    expect(card.querySelector('img')?.getAttribute('src')).toContain('splash/clem-360.webp');
    expect(card.querySelector<HTMLElement>('.nc-art')!.style.backgroundImage).toContain(NAP_ART.hi);
    expect(card.querySelector('.nc-line')?.textContent?.length).toBeGreaterThan(10);
    // the countdown follows the snapshot
    hud.update(me({ state: 'dead', hp: 0, respawnIn: 61 }), CLOCK, SCORE, 0);
    expect(card.querySelector('.nc-secs')?.textContent).toBe('3');
    // no Token Tails: no card back, element frame, rarity or name anywhere in the card
    expect(card.outerHTML).not.toMatch(TT);
    expect(card.textContent).not.toMatch(/token\s?tails/i);
    // and the old Token Tails respawn card never mounts
    expect(root.querySelector('.tt-respawn, .tt-card, .tt-back')).toBeNull();
    hud.update(me(), CLOCK, SCORE, 0);
    expect(root.querySelector('.pl-napcard.on')).toBeNull();
    hud.dispose();
    expect(root.querySelector('.pl-napcard')).toBeNull();
  });

  it('Low quality takes the light backdrop; a tower knockout shows the tower glyph', () => {
    const root = document.querySelector('.pl-match') as HTMLElement;
    const hud = new Hud(root, 'brutus', 'pounce', { onSlot: () => undefined });
    hud.lowQuality = true;
    hud.recap('Knocked out by a tower: wait for your minions to tank', { kind: 'tower' });
    hud.update(me({ hero: 'brutus', state: 'dead', hp: 0, respawnIn: 90 }), CLOCK, SCORE, 0);
    const card = root.querySelector<HTMLElement>('.pl-napcard.on')!;
    expect(card.dataset.side).toBe('dog');
    expect(card.querySelector<HTMLElement>('.nc-art')!.style.backgroundImage).toContain(NAP_ART.lo);
    expect(card.querySelector('.nc-medal.tower svg')).not.toBeNull();
    hud.dispose();
  });
});

describe('NapCard', () => {
  it('rotates the line every NAP_LINE_MS of a long nap and starts the next knockout on a new line', () => {
    const c = new NapCard(document.body, 'sage');
    c.show(20, false, 1000);
    const first = c.el.querySelector('.nc-line')!.textContent;
    c.show(19, false, 1000 + NAP_LINE_MS - 1);
    expect(c.el.querySelector('.nc-line')!.textContent).toBe(first);
    c.show(14, false, 1000 + NAP_LINE_MS);
    const second = c.el.querySelector('.nc-line')!.textContent;
    expect(second).not.toBe(first);
    c.hide();
    c.show(10, false, 99999);
    expect(c.el.querySelector('.nc-line')!.textContent).not.toBe(first);
    c.dispose();
  });

  it('every champion has Paw Legends lines and none names Token Tails or a card rarity', () => {
    for (const h of HERO_IDS) {
      const lines = napLines(h);
      expect(lines.length).toBeGreaterThan(5);
      for (const l of lines) expect(l).not.toMatch(/token\s?tails|rarity|legendary|\bcard\b|kill|die\b|blood/i);
    }
  });
});
