// @vitest-environment happy-dom
/**
 * Bots trickle in (founder, 2026-11-19: "add a bot / 3s from 3s, not from 17s"): no bot pip before 3 s, then one every
 * 3 s, this team's seats first; casual 3v3 fills the other team to the last seat (a lone search plays a team of bots at
 * 15 s), Classic keeps the other team's last seat for a player; and no text announcing the fill.
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
  it('the schedule matches the backend: none before 3 s, then one every 3 s', () => {
    expect(BOT_TRICKLE).toEqual({ startS: 3, stepS: 3 });
    expect([0, 2, 2.9, 3, 5, 6, 8, 9, 12, 15].map(trickleBots)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 4, 5]);
  });

  it('fills this team first; casual fills the other team to the last seat, Classic keeps it for a player', () => {
    expect(queueBots(2, 3, 1, 0)).toEqual({ mine: 0, theirs: 0 });
    expect(queueBots(3, 3, 1, 0)).toEqual({ mine: 1, theirs: 0 });
    expect(queueBots(6, 3, 1, 0)).toEqual({ mine: 2, theirs: 0 });
    expect(queueBots(9, 3, 1, 0)).toEqual({ mine: 2, theirs: 1 });
    expect(queueBots(12, 3, 1, 0)).toEqual({ mine: 2, theirs: 2 });
    // casual 3v3: the fifth bot seat at 15 s fills the card (the matchmaker seats a team of bots)
    expect(queueBots(15, 3, 1, 0)).toEqual({ mine: 2, theirs: 3 });
    expect(queueBots(60, 3, 1, 0)).toEqual({ mine: 2, theirs: 3 });
    // a party of two: one bot seat on this team
    expect(queueBots(9, 3, 2, 0)).toEqual({ mine: 1, theirs: 2 });
    // Classic 5v5: one seat stays open for an opponent
    expect(queueBots(60, 5, 1, 0)).toEqual({ mine: 4, theirs: 4 });
  });

  it('the card shows bot pips, labelled for screen readers, and no fill text', () => {
    const early = dom(queueCardHtml(model({ waitedS: 2 })));
    expect(early.querySelectorAll('.pp-pip.bot')).toHaveLength(0);
    const later = dom(queueCardHtml(model({ waitedS: 9 })));
    const pips = later.querySelector<HTMLElement>('[data-testid="mm-pips"]')!;
    expect(pips.dataset.bots).toBe('3');
    expect(pips.querySelectorAll('span:first-child .pp-pip.bot')).toHaveLength(2);
    expect(pips.querySelectorAll('.their .pp-pip.bot')).toHaveLength(1);
    expect(pips.getAttribute('aria-label')).toBe('Your team 1 of 3 · Their team 0 of 3 · 3 bots');
    expect(later.textContent).not.toMatch(/bots? fill|empty seat|0:30/i);
    const classic = dom(queueCardHtml(model({ waitedS: 6, teamSize: 5 })));
    expect(classic.querySelector('[data-testid="mm-pips"]')!.getAttribute('aria-label')).toBe('Your team 1 of 5 · Their team 0 of 5 · 2 bots');
  });

  it('co-op and the switch to co-op show no bot pips or fill text', () => {
    const coop = dom(queueCardHtml(model({ waitedS: 25, pvp: undefined })));
    expect(coop.querySelectorAll('.pp-pip.bot')).toHaveLength(0);
    expect(coop.textContent).not.toMatch(/bots? fill|empty seat/i);
    const toCoop = dom(queueCardHtml(model({ waitedS: 41, pvp: { theirs: 0, toCoop: true, requeued: false } })));
    expect(toCoop.querySelectorAll('.pp-pip.bot')).toHaveLength(0);
  });

  it('the move to co-op holds the entry 5 s: no "Short wait after leaving matches" for it, a real penalty still shows', () => {
    const grace = dom(queueCardHtml(model({ waitedS: 41, lowPriorityS: 4.2, pvp: { theirs: 0, toCoop: true, requeued: false } })));
    expect(grace.querySelector('[data-testid="mm-low"]')).toBeNull();
    expect(grace.textContent).not.toMatch(/leaving matches/i);
    const penalty = dom(queueCardHtml(model({ waitedS: 41, lowPriorityS: 50, pvp: { theirs: 0, toCoop: true, requeued: false } })));
    expect(penalty.querySelector('[data-testid="mm-low"]')?.textContent).toContain('0:50');
    const searching = dom(queueCardHtml(model({ waitedS: 10, lowPriorityS: 4 })));
    expect(searching.querySelector('[data-testid="mm-low"]')?.textContent).toContain('0:04');
  });
});
