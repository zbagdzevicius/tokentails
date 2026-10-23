// @vitest-environment happy-dom
/** First-match tips (POC.md §12, §15 item 20): every tip shows on its event and hides when done or after 8 s. */
import { describe, expect, it } from 'vitest';
import { TIP_HIDE_S, Tips, type TipId } from '../../src/onboarding/tips';

const shown = (root: HTMLElement) => (root.querySelector('.pl-tip.on') as HTMLElement | null)?.textContent ?? '';

describe('first-match tips', () => {
  it('each of the five tips shows its text and hides once done', () => {
    const root = document.createElement('div');
    const tips = new Tips(root, true);
    const text: Record<TipId, RegExp> = {
      move: /right-click the ground/i,
      attack: /right-click an enemy minion/i,
      q: /Press Q/,
      dodge: /Press E to Tumble out of the way/,
      ult: /Press R for your ultimate/,
    };
    for (const id of Object.keys(text) as TipId[]) {
      tips.trigger(id);
      expect(tips.current).toBe(id);
      expect(shown(root)).toMatch(text[id]);
      tips.complete(id);
      expect(tips.current).toBeNull();
      expect(shown(root)).toBe('');
    }
    expect(tips.completed).toEqual(['move', 'attack', 'q', 'dodge', 'ult']);
    // Once done, a tip never comes back.
    tips.trigger('move');
    expect(tips.current).toBeNull();
  });

  it('re-words the move tip when Auto flips the pad mode mid-tip', () => {
    const root = document.createElement('div');
    const tips = new Tips(root, true);
    let pad: boolean | null = null;
    tips.padMode = () => pad;
    tips.trigger('move');
    expect(shown(root)).toMatch(/^Click or right-click the ground/);
    pad = true;
    tips.update(0.1);
    expect(shown(root)).toMatch(/^Click the ground/);
    pad = false;
    tips.update(0.1);
    expect(shown(root)).toMatch(/^Right-click the ground/);
  });

  it('hides after 8 s on its own', () => {
    const tips = new Tips(document.createElement('div'), true);
    tips.trigger('move');
    tips.update(TIP_HIDE_S - 0.1);
    expect(tips.current).toBe('move');
    tips.update(0.2);
    expect(tips.current).toBeNull();
  });

  it('a tip blocked by another waits and shows next; one done meanwhile is skipped', () => {
    const tips = new Tips(document.createElement('div'), true);
    tips.trigger('move');
    tips.trigger('dodge'); // a one-off event (the first wind-up at you) while the move tip is up
    tips.trigger('ult');
    tips.trigger('dodge');
    expect(tips.current).toBe('move');
    tips.complete('move');
    expect(tips.current).toBe('dodge');
    tips.complete('ult'); // the player pressed R before its tip came up
    tips.update(TIP_HIDE_S + 1);
    expect(tips.current).toBeNull();
    expect(tips.shown).toEqual(['move', 'dodge']);
  });

  it('touch text, and nothing at all outside the first match', () => {
    const root = document.createElement('div');
    const tips = new Tips(root, true);
    tips.touch = true;
    tips.trigger('attack');
    expect(shown(root)).toMatch(/Tap ATK/);
    const off = new Tips(document.createElement('div'), false);
    off.trigger('move');
    expect(off.current).toBeNull();
  });
});
