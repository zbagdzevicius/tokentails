// @vitest-environment happy-dom
/**
 * Bots trickle in (founder, 2026-11-17): no bot pip before 17 s, then one every 3 s, this team's seats first, never
 * the other team's last seat (a PvP match needs a player there), and no text announcing the fill.
 */
import { describe, expect, it } from 'vitest';
import { BOT_TRICKLE, queueBots, trickleBots } from '../../src/party/botTrickle';
import { queueCardHtml, type QueueModel } from '../../src/party/ui/queueCard';

const model = (o: Partial<QueueModel> = {}): QueueModel => ({
  side: 'any',
  waitedS: 0,
  estimateS: null,
  found: 1,
  lowPriorityS: 0,
  warn: false,
  party: false,
  stopped: null,
  retryS: 0,
  match: null,
  offer: null,
  pvp: { theirs: 0, toCoop: false, requeued: false },
  ...o,
});
const dom = (html: string): HTMLElement => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};

describe('bot trickle on the PvP queue card', () => {
  it('the schedule matches the backend: none before 17 s, then one every 3 s', () => {
    expect(BOT_TRICKLE).toEqual({ startS: 17, stepS: 3 });
    expect([0, 16, 16.9, 17, 19, 20, 22, 23, 26].map(trickleBots)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 4]);
  });

  it('fills this team first and keeps the other team’s last seat for a player', () => {
    expect(queueBots(16, 3, 1, 0)).toEqual({ mine: 0, theirs: 0 });
    expect(queueBots(17, 3, 1, 0)).toEqual({ mine: 1, theirs: 0 });
    expect(queueBots(20, 3, 1, 0)).toEqual({ mine: 2, theirs: 0 });
    expect(queueBots(23, 3, 1, 0)).toEqual({ mine: 2, theirs: 1 });
    expect(queueBots(26, 3, 1, 0)).toEqual({ mine: 2, theirs: 2 });
    // capped: one seat stays open for an opponent
    expect(queueBots(60, 3, 1, 0)).toEqual({ mine: 2, theirs: 2 });
    // a party of two: one bot seat on this team
    expect(queueBots(23, 3, 2, 0)).toEqual({ mine: 1, theirs: 2 });
    expect(queueBots(60, 5, 1, 0)).toEqual({ mine: 4, theirs: 4 });
  });

  it('the card shows bot pips, labelled for screen readers, and no fill text', () => {
    const early = dom(queueCardHtml(model({ waitedS: 10 })));
    expect(early.querySelectorAll('.pp-pip.bot')).toHaveLength(0);
    const later = dom(queueCardHtml(model({ waitedS: 23 })));
    const pips = later.querySelector<HTMLElement>('[data-testid="mm-pips"]')!;
    expect(pips.dataset.bots).toBe('3');
    expect(pips.querySelectorAll('span:first-child .pp-pip.bot')).toHaveLength(2);
    expect(pips.querySelectorAll('.their .pp-pip.bot')).toHaveLength(1);
    expect(pips.getAttribute('aria-label')).toBe('Your team 1 of 3 · Their team 0 of 3 · 3 bots');
    expect(later.textContent).not.toMatch(/bots? fill|empty seat|0:30/i);
    const classic = dom(queueCardHtml(model({ waitedS: 20, teamSize: 5 })));
    expect(classic.querySelector('[data-testid="mm-pips"]')!.getAttribute('aria-label')).toBe('Your team 1 of 5 · Their team 0 of 5 · 2 bots');
  });

  it('co-op and the switch to co-op show no bot pips or fill text', () => {
    const coop = dom(queueCardHtml(model({ waitedS: 25, pvp: undefined })));
    expect(coop.querySelectorAll('.pp-pip.bot')).toHaveLength(0);
    expect(coop.textContent).not.toMatch(/bots? fill|empty seat/i);
    const toCoop = dom(queueCardHtml(model({ waitedS: 41, pvp: { theirs: 0, toCoop: true, requeued: false } })));
    expect(toCoop.querySelectorAll('.pp-pip.bot')).toHaveLength(0);
  });
});
