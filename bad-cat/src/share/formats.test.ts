import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT, type FormatContext } from '../types';
import { LINK_IN_BIO } from './clip/gates';
import { FORMAT_ORDER, formats } from './formats';
import { fallBreak, fixtureRoom, fixtureRun } from './test-fixtures';

function ctx(over: Partial<FormatContext> & { secondName?: string } = {}): FormatContext & { secondName?: string } {
  return {
    run: fixtureRun([...fallBreak(0, 900)]),
    play: fixtureRoom(),
    cat: { ...DEFAULT_CAT, name: 'Mochi' },
    dayLabel: 'Kitchen #18',
    shortUrl: 'https://tokentails.com/badcat',
    club: false,
    streak: 3,
    hasSecondCat: false,
    ...over,
  };
}

const byFormat = (c: ReturnType<typeof ctx>) => Object.fromEntries(formats(c).map((t) => [t.format, t]));

describe('post format templates', () => {
  it('lists the 6 formats + household in share-sheet order', () => {
    expect(formats(ctx()).map((t) => t.format)).toEqual([...FORMAT_ORDER]);
    expect(FORMAT_ORDER).toHaveLength(8);
  });

  it('every caption carries the short URL and #badcatdaily, never "link in bio"', () => {
    const contexts = [
      ctx(),
      ctx({ handle: '@luna.mom', club: true, hasSecondCat: true, secondName: 'Luna', pinkPaw: { name: 'Mila', waiting: true, adoptUrl: 'https://tokentails.com/cats/1' } }),
      ctx({ pinkPaw: { name: 'Mila', waiting: false } }),
      ctx({ cat: { ...DEFAULT_CAT, name: 'Linkinbio' } }),
    ];
    for (const c of contexts)
      for (const t of formats(c)) {
        expect(t.caption, t.format).toContain('tokentails.com/badcat');
        expect(t.caption).not.toContain('https://');
        expect(t.caption).toContain('#badcatdaily');
        expect(LINK_IN_BIO.test(t.caption), t.caption).toBe(false);
        expect(LINK_IN_BIO.test(t.label)).toBe(false);
      }
  });

  it('GDD captions per format', () => {
    const t = byFormat(ctx({ handle: 'luna.mom' }));
    expect(t.stitch.label).toBe("I put @luna.mom's cat in my game");
    expect(t.stitch.needsHandle).toBe(true);
    expect(t.stitch.artifact).toBe('reply_video');
    expect(t.pov.label).toBe('POV: you left Mochi alone for 75 seconds');
    expect(t.pov.caption).toMatch(/^Mochi chose violence 😼 tokentails\.com\/badcat #badcatdaily/);
    expect(t.reply.label).toBe('Replying to @luna.mom: I put Mochi in the game');
    expect(t.reply.caption).toContain("Comment your cat's name and I'll do yours");
    expect(t.irl_vs_game.label).toBe('My cat in real life vs. my cat in the game');
    expect(t.roomba.label).toBe('Framed the Roomba. Again.');
    expect(t.carousel.artifact).toBe('card');
  });

  it('roomba needs a frame-up; still_waiting a Pink Paw cat; household a second cat', () => {
    const t = byFormat(ctx());
    expect(t.roomba.available).toBe(false);
    expect(t.roomba.reason).toBe('Needs a Roomba crime');
    expect(t.still_waiting.available).toBe(false);
    expect(t.household.available).toBe(false);
    expect(t.household.reason).toBe('Club: up to 5 cats');
    const u = byFormat(
      ctx({ run: fixtureRun([], { framed: 2 }), hasSecondCat: true, club: true, secondName: 'Luna', pinkPaw: { name: 'Mila', waiting: true, adoptUrl: 'https://tokentails.com/cats/1' } }),
    );
    expect(u.roomba.available).toBe(true);
    expect(u.household.available).toBe(true);
    expect(u.household.label).toBe("Mochi vs Luna: who's worse?");
    expect(u.still_waiting.label).toBe('Mila is still waiting for a home');
    expect(u.still_waiting.caption).toContain('tokentails.com/cats/1');
    const home = byFormat(ctx({ pinkPaw: { name: 'Mila', waiting: false } }));
    expect(home.still_waiting.label).toBe('Mila went home');
    expect(home.still_waiting.caption).toContain('Her crimes stay in the game');
  });

  it('FTUE POV says 40 seconds', () => {
    const t = byFormat(ctx({ play: fixtureRoom({ mode: 'ftue' }) }));
    expect(t.pov.label).toBe('POV: you left Mochi alone for 40 seconds');
  });
});
