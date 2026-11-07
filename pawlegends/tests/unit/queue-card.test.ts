// @vitest-environment happy-dom
/**
 * Quick Play M1a (docs/plans/moba/M1A-IMPL.md §6, §9.3): the queue card and the backfill offer. Timer and estimate
 * formatting, the found pips, the side radio, the low-priority countdown, Cancel from the first render, and escaping.
 */
import { describe, expect, it } from 'vitest';
import { queueCardHtml, pipsHtml, type QueueModel } from '../../src/party/ui/queueCard';
import { backfillHtml, scoreLine } from '../../src/party/ui/backfillCard';
import { clockText } from '../../src/party/ui/copy';

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
  ...o,
});
const dom = (html: string): HTMLElement => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};

describe('queue card (M1a)', () => {
  it('formats the clock as m:ss', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(7.9)).toBe('0:07');
    expect(clockText(75)).toBe('1:15');
    expect(clockText(-3)).toBe('0:00');
  });

  it('first render: a running timer at 0:00 and Cancel, before any status', () => {
    const d = dom(queueCardHtml(model()));
    expect(d.querySelector('[data-testid="mm-timer"]')?.textContent).toBe('0:00');
    expect(d.querySelector('[data-testid="mm-cancel"]')).not.toBeNull();
    expect(d.textContent).toContain('Finding teammates');
    expect(d.textContent).not.toContain('usually');
  });

  it('shows the estimate and the found pips', () => {
    const d = dom(queueCardHtml(model({ waitedS: 7, estimateS: 15, found: 2 })));
    expect(d.querySelector('[data-testid="mm-timer"]')?.textContent).toBe('0:07');
    expect(d.textContent).toContain('usually 0:15');
    expect(d.querySelectorAll('.pp-pip.on')).toHaveLength(2);
    expect(dom(pipsHtml(9)).querySelectorAll('.pp-pip.on')).toHaveLength(3);
    expect(dom(pipsHtml(0)).querySelectorAll('.pp-pip.on')).toHaveLength(1);
  });

  it('the side chip is a radio group with one checked option and roving tabindex', () => {
    const d = dom(queueCardHtml(model({ side: 'dog' })));
    const radios = [...d.querySelectorAll<HTMLElement>('[role="radio"][data-p="mm-side"]')];
    expect(radios.map((r) => r.dataset.v)).toEqual(['cat', 'dog', 'any']);
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.dataset.v)).toEqual(['dog']);
    expect(radios.map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('a low-priority wait shows its countdown (and replaces the leaver warning)', () => {
    const d = dom(queueCardHtml(model({ lowPriorityS: 65, warn: true })));
    expect(d.querySelector('[data-testid="mm-low"]')?.textContent).toContain('1:05');
    expect(d.querySelector('[data-testid="mm-warn"]')).toBeNull();
    expect(dom(queueCardHtml(model({ warn: true }))).querySelector('[data-testid="mm-warn"]')).not.toBeNull();
    // still cancellable
    expect(d.querySelector('[data-testid="mm-cancel"]')).not.toBeNull();
  });

  it('match found: the strip, no Cancel', () => {
    const d = dom(queueCardHtml(model({ match: { humans: 2, bots: 1, side: 'dog', difficulty: 'normal' } })));
    expect(d.querySelector('[data-testid="mm-found"]')?.textContent).toContain('2 players + 1 bot · Dogs · Normal');
    expect(d.querySelector('[data-testid="mm-cancel"]')).toBeNull();
  });

  it('stopped states offer Search again (disabled while a lock runs) and Back', () => {
    const away = dom(queueCardHtml(model({ stopped: 'away' })));
    expect(away.textContent).toContain('Search stopped while you were away');
    expect((away.querySelector('[data-testid="mm-again"]') as HTMLButtonElement).disabled).toBe(false);
    const locked = dom(queueCardHtml(model({ stopped: 'locked', retryS: 30 })));
    expect(locked.textContent).toContain('Try again in 30s');
    expect((locked.querySelector('[data-testid="mm-again"]') as HTMLButtonElement).disabled).toBe(true);
    const update = dom(queueCardHtml(model({ stopped: 'update' })));
    expect(update.querySelector('[data-p="reload"]')).not.toBeNull();
  });

  it('the backfill offer: clock, Join and Keep searching, the ring; the score line only when it is not level', () => {
    const d = dom(backfillHtml({ clockS: 102, score: [3, 1], leftS: 7.2, totalS: 10 }));
    expect(d.textContent).toContain('Join a match in progress');
    expect(d.textContent).toContain('1:42');
    expect(d.textContent).toContain('your team is ahead');
    expect(d.querySelector('[data-testid="mm-offer-join"]')).not.toBeNull();
    expect(d.querySelector('[data-testid="mm-offer-keep"]')).not.toBeNull();
    expect(d.querySelector('[data-live="offer"]')?.textContent).toBe('8');
    expect(scoreLine([0, 0])).toBe('');
    expect(scoreLine([1, 4])).toBe('your team is behind');
    expect(scoreLine(null)).toBe('');
    // inside the searching card
    expect(dom(queueCardHtml(model({ offer: { clockS: 10, score: null, leftS: 10, totalS: 10 } }))).querySelector('[data-testid="mm-offer"]')).not.toBeNull();
  });

  it('every text is markup-safe (no injected elements)', () => {
    const html = queueCardHtml(model({ match: { humans: 1, bots: 2, side: 'cat', difficulty: '<img src=x onerror=alert(1)>' } }));
    expect(dom(html).querySelector('img')).toBeNull();
  });
});
