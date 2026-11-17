// @vitest-environment happy-dom
/**
 * The honesty rule (PARITY.md, SOCIAL-RANKED.md §8.1): every bot seat reads "Bot" in the match too. The scoreboard row
 * of a bot ("Socks the Stilts", with its seeded flag) carries the Bot chip; humans and your own row never do, and a
 * friend's seat keeps its own chip (shown only while a bot covers for them).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Scoreboard } from '../../src/ui/scoreboard';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('scoreboard bot label', () => {
  const picks = ['clem', 'sage', 'bengas', 'howler', 'chili', 'stilts'] as never;

  it('labels every bot row "Bot" and no human row', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const sb = new Scoreboard(parent, picks, 0, ['Me', 'Pepper the Sage', 'Mate', 'Foe', 'Bruno the Chili', 'Socks the Stilts']);
    sb.bots = new Set([1, 4, 5]);
    sb.show(true, null);
    const botChip = (slot: number) => sb.root.querySelector(`tr[data-slot="${slot}"] .sb-bot`)?.textContent ?? null;
    expect([0, 1, 2, 3, 4, 5].map(botChip)).toEqual([null, 'Bot', null, null, 'Bot', 'Bot']);
  });

  it('a friend seat keeps its own chip, only while a bot flies it', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const sb = new Scoreboard(parent, picks, 0, ['Me', 'Mira', 'Pepper the Bengal', 'A', 'B', 'C']);
    sb.bots = new Set([2, 3, 4, 5]);
    sb.seats = new Map([[1, { ring: '#fff', bot: false, conn: 'on' as const, muted: false }]]);
    sb.show(true, null);
    expect(sb.root.querySelector('tr[data-slot="1"] .sb-bot')).toBeNull();
    expect(sb.root.querySelector('tr[data-slot="2"] .sb-bot')?.textContent).toBe('Bot');
  });
});
