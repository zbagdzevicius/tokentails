import { describe, expect, it } from 'vitest';
import { adoptLine, catCard, counterText, demoHeadline, demoLine, formatAsOf, formatToNext, formatUsd, hookLine, shareText, shoutFor, sourceLine } from './format';
import { DOUBLE_MS, GestureRecognizer, HOLD_MS } from './gestures';
import { parseParams } from './params';
import { FrameGovernor, pickQuality, stepDown, type DeviceHints } from './quality';
import { barRandom, planShot } from './schedule';
import type { Payout, RaveCat } from '../types';

describe('parseParams', () => {
  it('reads the documented params', () => {
    const p = parseParams('?cats=300&shot=top&mute=1&cat=%2312&quality=low&auto=0&embed=1&debug=1&api=http://localhost:3005/', 'localhost:5180');
    expect(p).toEqual({ cats: 300, shot: 'top', mute: true, cat: '#12', quality: 'low', auto: false, embed: true, debug: true, api: 'http://localhost:3005' });
  });
  it('defaults and rejects junk', () => {
    const p = parseParams('?cats=-4&shot=drone&quality=ultra', 'localhost:5180');
    expect(p.cats).toBeNull();
    expect(p.shot).toBeNull();
    expect(p.quality).toBeNull();
    expect(p.auto).toBe(true);
  });
  it('caps the demo count and takes ?tx= as the cat query', () => {
    expect(parseParams('?cats=999999', 'x').cats).toBe(100000);
    expect(parseParams('?tx=0xabc12345', 'x').cat).toBe('0xabc12345');
  });
  it('ignores ?api= on tokentails.com', () => {
    expect(parseParams('?api=https://evil.example', 'tokentails.com').api).toBeNull();
    expect(parseParams('?api=https://evil.example', 'www.tokentails.com').api).toBeNull();
  });
});

describe('format', () => {
  it('money and the next cat', () => {
    expect(formatUsd(9_970_000)).toBe('$9.97');
    expect(formatUsd(12_345_670_000)).toBe('$12,345.67');
    expect(formatToNext(30_000)).toBe('3¢');
    expect(formatToNext(29_001)).toBe('3¢');
    expect(formatToNext(5_000)).toBe('<1¢');
    expect(formatToNext(1_000_000)).toBe('$1');
  });
  it('hook line by crowd size', () => {
    expect(hookLine(0)).toMatch(/empty/);
    expect(hookLine(9)).toBe('Fill the dance floor.');
  });
  it('source line says live, stale or snapshot', () => {
    expect(sourceLine({ origin: 'live', stale: false, asOf: '' })).toBe('live · public on-chain payouts');
    expect(sourceLine({ origin: 'live', stale: true, asOf: '' })).toBe('live · index catching up');
    expect(sourceLine({ origin: 'live', stale: true, asOf: '', delayedChains: ['Base', 'Avalanche'] })).toBe('live · Base, Avalanche delayed');
    expect(sourceLine({ origin: 'snapshot', stale: true, asOf: '2026-10-16T15:33:55Z' })).toContain('Oct 16, 15:33 UTC');
    expect(formatAsOf('nope')).toBe('nope');
  });
  it('never says live after a failed read', () => {
    expect(sourceLine({ origin: 'live', stale: true, asOf: '2026-10-16T15:33:55Z', fetchFailed: true })).toBe('as of Oct 16, 15:33 UTC · public on-chain payouts');
  });
  it('the counter shows real cats, the demo number only in its own label', () => {
    const s = { totalUsdMicro: 10_110_000, realCats: 10, cats: 5000, demo: true };
    expect(counterText(s)).toEqual({ amount: '$10.11', cats: '10 cats dancing' });
    expect(demoLine(s)).toBe('DEMO · 5,000');
    expect(demoLine(s, 2500)).toBe('DEMO · 5,000 (2,500 drawn)');
    expect(adoptLine(1_000_000)).toBe('$2.50 goes to the shelter on-chain: 2 dancing cats + 50¢ toward the next.');
    expect(adoptLine(230_000)).toBe('$2.50 goes to the shelter on-chain: 3 dancing cats + 27¢ toward the next.');
    expect(adoptLine(500_000)).toBe('$2.50 goes to the shelter on-chain: 3 dancing cats.');
    expect(formatUsd(9_995_000)).toBe('$9.99');
    expect(demoLine({ ...s, demo: false })).toBeNull();
    expect(demoHeadline(s)).toEqual({ headline: '5,000 cats', tag: '(demo)', real: 'real: $10.11 raised · 10 cats dancing' });
  });
  const payout: Payout = {
    id: '5042:0xabc:1',
    chainId: 5042,
    chainName: 'Arc',
    txHash: '0xabc',
    logIndex: 1,
    timestamp: Date.UTC(2026, 9, 16, 13, 44) / 1000,
    symbol: 'USDC',
    amountText: '5',
    usdMicro: 5_000_000,
    source: 'wallet',
    explorerTxUrl: 'https://explorer.arc.io/tx/0xabc',
  };
  const cat: RaveCat = { index: 3, payout, contributors: 1, completedAt: payout.timestamp, demo: false, seed: 0.5 };
  it('cat card and shout', () => {
    const c = catCard({ ...cat, contributors: 9 }, 5);
    expect(c.title).toBe('Cat #4');
    // A gift over $1: which of its cats this is; never "made of N".
    expect(c.amount).toBe('1 of 5 cats from a 5.00 USDC wallet gift');
    expect(c.meta).toBe('Arc · Oct 16');
    expect(c.extra).toEqual([]);
    expect(c.href).toBe(payout.explorerTxUrl);
    expect(catCard({ ...cat, payout: { ...payout, amountText: '8', usdMicro: 8_000_000 } }, 8).amount).toBe('1 of 8 cats from an 8.00 USDC wallet gift');
    // A dollar of small payouts: $1.00 is the headline, the completing payout is the small print.
    const small = catCard({ ...cat, contributors: 58, payout: { ...payout, amountText: '0.02', usdMicro: 20_000, source: 'partner' } });
    expect(small.amount).toBe('$1.00 from 58 payouts');
    expect(small.meta).toBe('completed by 0.02 USDC (partner campaign, Arc, Oct 16)');
    expect(catCard({ ...cat, payout: { ...payout, amountText: '0.1', symbol: 'EURC' } }).meta).toBe('a 0.10 EURC wallet gift (Arc, Oct 16)');
    expect(catCard({ ...cat, payout: null, demo: true }).href).toBeNull();
    expect(shoutFor(cat)).toBe('Cat #4 just landed! Thanks to a wallet gift on Arc');
  });
  it('share text', () => {
    expect(shareText(9)).toBe('9 cats are dancing for the Pink Paw shelter. Add one:');
    expect(shareText(1)).toBe('1 cat is dancing for the Pink Paw shelter. Add one:');
  });
});

describe('GestureRecognizer', () => {
  it('tap', () => {
    const g = new GestureRecognizer();
    g.down(1, 100, 100, 0);
    g.move(1, 103, 102);
    expect(g.up(1, 120).map((a) => a.type)).toEqual(['tap']);
  });
  it('double tap within 300 ms', () => {
    const g = new GestureRecognizer();
    g.down(1, 100, 100, 0);
    g.up(1, 80);
    g.down(1, 104, 98, 80 + DOUBLE_MS - 100);
    expect(g.up(1, 80 + DOUBLE_MS - 20).map((a) => a.type)).toEqual(['doubleTap']);
    // a third tap is a fresh tap
    g.down(1, 104, 98, 400);
    expect(g.up(1, 450).map((a) => a.type)).toEqual(['tap']);
  });
  it('slow second tap is two taps', () => {
    const g = new GestureRecognizer();
    g.down(1, 100, 100, 0);
    g.up(1, 50);
    g.down(1, 100, 100, 600);
    expect(g.up(1, 650).map((a) => a.type)).toEqual(['tap']);
  });
  it('hold starts after 350 ms and ends on release', () => {
    const g = new GestureRecognizer();
    g.down(1, 10, 10, 0);
    expect(g.poll(HOLD_MS - 1)).toEqual([]);
    expect(g.poll(HOLD_MS).map((a) => a.type)).toEqual(['holdStart']);
    expect(g.poll(HOLD_MS + 100)).toEqual([]);
    expect(g.up(1, 2000).map((a) => a.type)).toEqual(['holdEnd']);
  });
  it('movement over 8 px is a drag, never a tap or hold', () => {
    const g = new GestureRecognizer();
    g.down(1, 10, 10, 0);
    expect(g.move(1, 30, 10)).toEqual([{ type: 'drag', dx: 20, dy: 0 }]);
    expect(g.move(1, 35, 12)).toEqual([{ type: 'drag', dx: 5, dy: 2 }]);
    expect(g.poll(1000)).toEqual([]);
    expect(g.up(1, 1000).map((a) => a.type)).toEqual(['dragEnd']);
  });
  it('two fingers pinch', () => {
    const g = new GestureRecognizer();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    expect(g.move(2, 220, 100)).toEqual([{ type: 'pinch', delta: 20 }]);
    g.up(2, 100);
    expect(g.up(1, 120).map((a) => a.type)).toEqual(['dragEnd']);
  });
});

describe('auto-director schedule', () => {
  it('drops cut to top/hero, builds go pov', () => {
    expect(planShot({ section: 'drop', sectionStart: true, bar: 24, prev: 'pov', dropCount: 0 })).toMatchObject({ shot: 'top', cut: true });
    expect(planShot({ section: 'drop', sectionStart: true, bar: 72, prev: 'pov', dropCount: 1 })).toMatchObject({ shot: 'hero', cut: true });
    expect(planShot({ section: 'build', sectionStart: true, bar: 16, prev: 'hero', dropCount: 0 }).shot).toBe('pov');
  });
  it('holds 4–8 bars and never repeats the previous shot', () => {
    for (let bar = 0; bar < 400; bar++) {
      for (const section of ['intro', 'groove', 'breakdown', 'drop'] as const) {
        const p = planShot({ section, sectionStart: false, bar, prev: 'hero', dropCount: 0 });
        expect(p.holdBars).toBeGreaterThanOrEqual(4);
        expect(p.holdBars).toBeLessThanOrEqual(8);
        expect(p.shot).not.toBe('hero');
      }
    }
  });
  it('barRandom is stable and in 0..1', () => {
    expect(barRandom(5)).toBe(barRandom(5));
    for (let i = 0; i < 100; i++) {
      const r = barRandom(i, 3);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

describe('quality', () => {
  const base: DeviceHints = { coarsePointer: false, memoryGb: 8, cores: 8, gpu: 'angle (apple, apple m2, opengl 4.1)', screenPx: 4e6, webgl2: true };
  it('picks tiers', () => {
    expect(pickQuality(base)).toBe('high');
    expect(pickQuality({ ...base, gpu: 'angle (intel, intel(r) uhd graphics 620)' })).toBe('mid');
    expect(pickQuality({ ...base, webgl2: false })).toBe('low');
    expect(pickQuality({ ...base, coarsePointer: true, gpu: 'mali-g52', cores: 8, memoryGb: 4 })).toBe('low');
    expect(pickQuality({ ...base, coarsePointer: true, gpu: 'apple gpu', cores: 6, memoryGb: null })).toBe('mid');
    expect(pickQuality({ ...base, coarsePointer: true, gpu: 'mali-g78', cores: 8, memoryGb: 6 })).toBe('mid');
    // deviceMemory reports powers of two: a 6 GB Pixel 6a says 4.
    expect(pickQuality({ ...base, coarsePointer: true, gpu: 'mali-g78', cores: 8, memoryGb: 4 })).toBe('mid');
    expect(pickQuality({ ...base, coarsePointer: true, gpu: 'mali-g78', cores: 8, memoryGb: 2 })).toBe('low');
  });
  it('steps down, never up', () => {
    expect(stepDown('high')).toBe('mid');
    expect(stepDown('mid')).toBe('low');
    expect(stepDown('low')).toBeNull();
  });
  it('governor steps down after ~3 s over budget, ignores hitches', () => {
    const g = new FrameGovernor(60);
    let fired = 0;
    for (let i = 0; i < 60 * 2; i++) fired += Number(g.sample(1 / 60));
    expect(fired).toBe(0);
    const g2 = new FrameGovernor(60);
    let t = 0;
    let at = -1;
    while (t < 10 && at < 0) {
      if (g2.sample(1 / 30)) at = t;
      t += 1 / 30;
    }
    expect(at).toBeGreaterThan(5);
    expect(at).toBeLessThan(6.5);
    const g3 = new FrameGovernor(30);
    for (let i = 0; i < 100; i++) expect(g3.sample(1)).toBe(false);
  });
});
