// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { inviteUrl, partyFromLink } from '../../src/share/partyLink';
import { LINK_EVENT, LINK_RETRY_MS, LINK_WAIT_MS, LINKS_GLOBAL, LinkRouter, listenLinks, type LinkTarget } from '../../src/app/links';
import { qrMatrix } from '../../src/party/qr';

/* DEEP-LINKS.md: the app opened with a party link (QR scan, tapped link) goes straight into that party. */

describe('partyFromLink', () => {
  it('reads the canonical /p/<code> link: any case, dashes, spaces, a trailing slash', () => {
    expect(partyFromLink('https://pawlegends.app/p/K7QX2M')).toEqual({ code: 'K7QX2M' });
    expect(partyFromLink('https://pawlegends.app/p/k7qx2m')).toEqual({ code: 'K7QX2M' });
    expect(partyFromLink('https://PAWLEGENDS.APP/P/K7Q-X2M/')).toEqual({ code: 'K7QX2M' });
    expect(partyFromLink('https://www.pawlegends.app/p/K7Q%20X2M?utm_source=qr#x')).toEqual({ code: 'K7QX2M' });
  });

  it('keeps the older ?party= links working (/ and /play)', () => {
    expect(partyFromLink('https://pawlegends.app/?party=K7QX2M')).toEqual({ code: 'K7QX2M' });
    expect(partyFromLink('https://pawlegends.app/play?party=k7qx2m')).toEqual({ code: 'K7QX2M' });
  });

  it('a party link with a broken code is "bad" (the game says so)', () => {
    for (const bad of ['https://pawlegends.app/p/', 'https://pawlegends.app/p/K7QX2', 'https://pawlegends.app/p/K7QX0M', 'https://pawlegends.app/p/%E0%A4%A', 'https://pawlegends.app/p/<script>', 'https://pawlegends.app/?party=nope'])
      expect(partyFromLink(bad)).toEqual({ bad: true });
  });

  it('anything else is not a party link', () => {
    for (const other of [
      'https://pawlegends.app/',
      'https://pawlegends.app/play',
      'https://pawlegends.app/p/K7QX2M/extra',
      'https://pawlegends.app/px/K7QX2M',
      'http://pawlegends.app/p/K7QX2M',
      'https://evil.example/p/K7QX2M',
      'https://pawlegends.app.evil.example/p/K7QX2M',
      'pawlegends://party/K7QX2M',
      'not a url',
      '',
      `https://pawlegends.app/p/K7QX2M?${'x'.repeat(600)}`,
      null,
      42,
    ])
      expect(partyFromLink(other)).toBeNull();
  });

  it('the invite link the game shares parses back to its code, and its QR stays small (29 modules)', () => {
    expect(partyFromLink(inviteUrl('ABCDEF'))).toEqual({ code: 'ABCDEF' });
    expect(qrMatrix(inviteUrl('K7QX2M')).size).toBeLessThanOrEqual(29);
  });
});

describe('listenLinks (the shell queue)', () => {
  it('drains a cold-start queue at once, then every pl:link (warm); each URL once', () => {
    const w = window as unknown as Record<string, unknown>;
    w[LINKS_GLOBAL] = ['https://pawlegends.app/p/AAAAAA'];
    const got: string[] = [];
    const off = listenLinks(window, (u) => got.push(u));
    expect(got).toEqual(['https://pawlegends.app/p/AAAAAA']);
    (w[LINKS_GLOBAL] as string[]).push('https://pawlegends.app/p/BBBBBB', 42 as never);
    window.dispatchEvent(new Event(LINK_EVENT));
    window.dispatchEvent(new Event(LINK_EVENT));
    expect(got).toEqual(['https://pawlegends.app/p/AAAAAA', 'https://pawlegends.app/p/BBBBBB']);
    off();
    (w[LINKS_GLOBAL] as string[]).push('https://pawlegends.app/p/CCCCCC');
    window.dispatchEvent(new Event(LINK_EVENT));
    expect(got).toHaveLength(2);
    delete w[LINKS_GLOBAL];
  });

  it('no shell (the web): nothing happens', () => {
    const got: string[] = [];
    const off = listenLinks(window, (u) => got.push(u));
    window.dispatchEvent(new Event(LINK_EVENT));
    expect(got).toEqual([]);
    off();
  });
});

function harness(o: { busy?: boolean; code?: string | null } = {}) {
  const log: string[] = [];
  const timers: { fn: () => void; at: number }[] = [];
  const s = { busy: o.busy ?? false, code: o.code ?? null, now: 0 };
  const t: LinkTarget = {
    busy: () => s.busy,
    currentCode: () => s.code,
    join: (c) => {
      log.push(`join ${c}`);
      s.code = c;
    },
    showParty: () => log.push('show'),
    bad: () => log.push('bad'),
    now: () => s.now,
    setTimeout: (fn, ms) => {
      const h = { fn, at: s.now + ms };
      timers.push(h);
      return h;
    },
    clearTimeout: (h) => {
      const i = timers.indexOf(h as never);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  const tick = (ms: number) => {
    s.now += ms;
    for (const h of timers.splice(0).filter((x) => x.at <= s.now)) h.fn();
  };
  return { r: new LinkRouter(t), s, log, timers, tick };
}

describe('LinkRouter', () => {
  it('on the title (cold start, game up): joins at once', () => {
    const h = harness();
    expect(h.r.open('https://pawlegends.app/p/K7QX2M')).toBe('joined');
    expect(h.log).toEqual(['join K7QX2M']);
  });

  it('already in that party: brings the lobby up, no second join', () => {
    const h = harness({ code: 'K7QX2M' });
    expect(h.r.open('https://pawlegends.app/p/k7qx2m')).toBe('same');
    expect(h.log).toEqual(['show']);
  });

  it('in another lobby (warm start): joins the new party (the app leaves the old one)', () => {
    const h = harness({ code: 'AAAAAA' });
    expect(h.r.open('https://pawlegends.app/p/K7QX2M')).toBe('joined');
    expect(h.log).toEqual(['join K7QX2M']);
  });

  it('mid-match: waits, then joins once the match is over; the newest link wins', () => {
    const h = harness({ busy: true });
    expect(h.r.open('https://pawlegends.app/p/AAAAAA')).toBe('waiting');
    expect(h.r.open('https://pawlegends.app/p/K7QX2M')).toBe('waiting');
    expect(h.timers).toHaveLength(1);
    h.tick(LINK_RETRY_MS * 5);
    expect(h.log).toEqual([]);
    expect(h.r.waiting).toBe('K7QX2M');
    h.s.busy = false;
    h.tick(LINK_RETRY_MS);
    expect(h.log).toEqual(['join K7QX2M']);
    expect(h.r.waiting).toBeNull();
    expect(h.timers).toHaveLength(0);
  });

  it('a link that waited past LINK_WAIT_MS is dropped', () => {
    const h = harness({ busy: true });
    h.r.open('https://pawlegends.app/p/K7QX2M');
    for (let i = 0; i < 40; i++) h.tick(LINK_WAIT_MS / 30);
    h.s.busy = false;
    h.tick(LINK_RETRY_MS);
    expect(h.log).toEqual([]);
    expect(h.r.waiting).toBeNull();
  });

  it('a bad code says so and joins nothing; another site\'s link is ignored', () => {
    const h = harness();
    expect(h.r.open('https://pawlegends.app/p/K7QX0M')).toBe('bad');
    expect(h.r.open('https://example.com/p/K7QX2M')).toBe('ignored');
    expect(h.log).toEqual(['bad']);
  });

  it('dispose stops a waiting link', () => {
    const h = harness({ busy: true });
    h.r.open('https://pawlegends.app/p/K7QX2M');
    h.r.dispose();
    h.s.busy = false;
    h.tick(LINK_RETRY_MS * 3);
    expect(h.log).toEqual([]);
  });
});
