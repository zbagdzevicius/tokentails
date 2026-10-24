import { describe, expect, it } from 'vitest';
import { CalloutQueue, CALLOUT_MS } from './calloutq';

describe('callout queue', () => {
  it('shows one at a time: a lower priority callout is dropped while a higher one shows', () => {
    const q = new CalloutQueue();
    expect(q.offer('GO LEFT!', 0, true)).toBe(true);
    expect(q.offer('PURRFECT!', 300, true)).toBe(false);
    expect(q.offer('OUCH!', 400, true)).toBe(false);
    expect(q.offer('WOOF!', 500, true)).toBe(true);
    // after it fades, anything goes again
    expect(q.offer('PURRFECT!', 500 + CALLOUT_MS + 1, false)).toBe(true);
  });
  it('mutes pickup chatter during a chase', () => {
    const q = new CalloutQueue();
    expect(q.offer('NOM NOM!', 0, true)).toBe(false);
    expect(q.offer('CLOSE ONE!', 0, true)).toBe(false);
    expect(q.offer('NOM NOM!', 0, false)).toBe(true);
  });
  it('rate-limits PURRFECT! and WHOOSH!', () => {
    const q = new CalloutQueue();
    expect(q.offer('PURRFECT!', 0, false)).toBe(true);
    expect(q.offer('PURRFECT!', 2000, false)).toBe(false);
    expect(q.offer('PURRFECT!', 4100, false)).toBe(true);
    expect(q.offer('WHOOSH!', 10000, false)).toBe(true);
    expect(q.offer('WHOOSH!', 20000, false)).toBe(false);
  });
  it('a higher priority callout replaces a lower one', () => {
    const q = new CalloutQueue();
    expect(q.offer('NOM NOM!', 0, false)).toBe(true);
    expect(q.offer('OUCH!', 100, false)).toBe(true);
    q.reset();
    expect(q.offer('NOM NOM!', 150, false)).toBe(true);
  });
});
