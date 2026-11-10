// @vitest-environment happy-dom
/**
 * The Fish chip (lane F1) on phones. The B3 HUD diet hides the hero box (`.pl-bar`, display: none) and the chip lived
 * inside it, so phones lost it. Hud.placeFish moves it to the match layer in touch mode (on the minimap's bottom-left
 * corner, lol-hud.css) and back into the ability plate on desktop, on a data-touch change, never per frame.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Hud } from '../../src/ui/hud';
import type { EntitySnap, MatchClock } from '../../src/sim/api';

const CLOCK: MatchClock = { tick: 900, seconds: 30, phase: 'play', nextPhaseIn: 9000 } as MatchClock;
const me = (o: Partial<EntitySnap> = {}): EntitySnap =>
  ({ id: 0, kind: 'hero', team: 0, slot: 0, hero: 'sage', level: 3, x: 0, y: 0, hp: 500, maxHp: 600, shield: 0, state: 'idle', facing: 0, buffs: 0, cooldowns: [0, 0, 0, 0, 0], xp: 0, ...o }) as EntitySnap;
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(touch: boolean): Hud {
  document.documentElement.dataset.touch = touch ? '1' : '';
  document.body.innerHTML = '<div class="pl-match"></div>';
  return new Hud(document.querySelector('.pl-match') as HTMLElement, 'sage', 'pounce', { onSlot: () => undefined });
}

afterEach(() => {
  document.documentElement.dataset.touch = '';
});

describe('Fish chip on phones', () => {
  it('touch: the chip (fish glyph, count, Toy pips) sits on the match layer, outside the hidden hero box', () => {
    const hud = mount(true);
    hud.update(me({ fish: 19, toy: 1 }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    const chip = document.querySelector<HTMLElement>('.pl-fish')!;
    expect(chip).not.toBeNull();
    expect(chip.parentElement?.classList.contains('pl-match')).toBe(true);
    expect(chip.closest('.pl-bar')).toBeNull();
    expect(chip.querySelector('.ring svg')).not.toBeNull();
    expect(chip.querySelector('.n')?.textContent).toBe('19');
    expect(chip.querySelectorAll('.pips i').length).toBeGreaterThan(0);
    expect(chip.querySelectorAll('.pips i.on').length).toBe(1);
    hud.dispose();
    expect(document.querySelector('.pl-fish')).toBeNull();
  });

  it('desktop: the chip stays a tab on the ability plate', () => {
    const hud = mount(false);
    hud.update(me({ fish: 7 }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    const chip = document.querySelector<HTMLElement>('.pl-fish')!;
    expect(chip.parentElement?.classList.contains('pl-bar')).toBe(true);
    expect(chip.querySelector('.n')?.textContent).toBe('7');
    hud.dispose();
  });

  it('follows touch mode when it turns on or off mid-match', async () => {
    const hud = mount(false);
    document.documentElement.dataset.touch = '1';
    await flush();
    expect(document.querySelector('.pl-fish')?.parentElement?.classList.contains('pl-match')).toBe(true);
    document.documentElement.dataset.touch = '';
    await flush();
    expect(document.querySelector('.pl-fish')?.parentElement?.classList.contains('pl-bar')).toBe(true);
    hud.dispose();
  });
});
