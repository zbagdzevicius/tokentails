import { describe, expect, it } from 'vitest';
import { packScores, scoreAt, unpackScores } from './scores';
import { challengeBytes, decodeChallenge, encodeChallenge, encodeChallengeSync, fitChallenge, fromB64url, MAX_LINK, toB64url, type Challenge } from './code';
import { dayForSeed, dayKey, dayLabel, seedForDay, themeForSeed } from './daily';
import { F_AIR, F_CUT, F_SLIDE, ghostOf, GhostTape, newPoint, packGhost, resampleGhost, sampleAt, unpackGhost, type GhostSample } from './ghost';

/** a synthetic run: 20 u/s with weaving, jumps, a slide and a respawn teleport back 300 u at 40 s */
function syntheticRun(seconds: number, hz = 6): GhostSample[] {
  const out: GhostSample[] = [];
  let s = 0;
  for (let i = 0; i <= seconds * hz; i++) {
    const t = i / hz;
    let flags = 0;
    if (i === 40 * hz) {
      s -= 300;
      flags |= F_CUT;
    } else if (i > 0) s += (20 + 6 * Math.sin(t * 0.3)) / hz;
    const jump = t % 7 < 0.7;
    const y = jump ? 2.6 * Math.sin(((t % 7) / 0.7) * Math.PI) : 0;
    if (jump) flags |= F_AIR;
    if (t % 11 > 10) flags |= F_SLIDE;
    out.push({ s, x: 3.2 * Math.sin(t * 0.9), y, flags });
  }
  return out;
}

const base = (o: Partial<Challenge> = {}): Challenge => ({ v: 1, stage: 'meadow', score: 512340, name: 'Mia', look: '3a0210', chain: 23, ghost: packGhost(syntheticRun(20)), ...o });

describe('daily', () => {
  it('day keys are UTC', () => {
    expect(dayKey(Date.UTC(2026, 9, 24, 23, 59))).toBe('2026-10-24');
    expect(dayKey(Date.UTC(2026, 9, 25, 0, 0))).toBe('2026-10-25');
    expect(dayLabel('2026-10-24')).toBe('Oct 24');
    expect(dayLabel('2026-01-03')).toBe('Jan 3');
    expect(dayLabel('nope')).toBe('');
  });
  it('seeds are stable, non-zero and differ per day', () => {
    const a = seedForDay('2026-10-24');
    expect(a).toBe(seedForDay('2026-10-24'));
    expect(a).toBeGreaterThan(0);
    const seen = new Set<number>();
    const themes = new Set<string>();
    for (let d = 0; d < 60; d++) {
      const s = seedForDay(dayKey(Date.UTC(2026, 0, 1) + d * 86400000));
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
      seen.add(s);
      themes.add(themeForSeed(s));
    }
    expect(seen.size).toBe(60);
    expect(themes.size).toBe(3);
  });
  it('finds the day of a recent seed', () => {
    const now = Date.UTC(2026, 9, 24, 12);
    expect(dayForSeed(seedForDay('2026-10-22'), now)).toBe('2026-10-22');
    expect(dayForSeed(12345, now)).toBe('');
  });
});

describe('ghost', () => {
  it('quantisation stays within 0.15 u (s, x) and 0.1 u (y), across a teleport', () => {
    const run = syntheticRun(90);
    const g = unpackGhost(packGhost(run, 6))!;
    expect(g).not.toBeNull();
    expect(g.n).toBe(run.length);
    for (let i = 0; i < run.length; i++) {
      expect(Math.abs(g.s[i] - run[i].s)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(g.x[i] - run[i].x)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(g.y[i] - run[i].y)).toBeLessThanOrEqual(0.1);
      expect(g.flags[i]).toBe(run[i].flags);
    }
    // sampling at the sample times returns the samples
    const p = newPoint();
    for (let i = 0; i < run.length; i += 7) {
      sampleAt(g, i / 6, p);
      expect(Math.abs(p.s - run[i].s)).toBeLessThanOrEqual(0.15);
      expect(Math.abs(p.x - run[i].x)).toBeLessThanOrEqual(0.15);
    }
  });
  it('is about 3 bytes per sample', () => {
    const run = syntheticRun(60);
    const b = packGhost(run, 6);
    expect(b.length).toBeLessThan(run.length * 3.6 + 16);
  });
  it('never interpolates across a cut and interpolates smoothly elsewhere', () => {
    const g = unpackGhost(packGhost(syntheticRun(60)))!;
    const p = newPoint();
    const cut = 40 * 6;
    sampleAt(g, (cut - 0.5) / 6, p);
    expect(p.s).toBeCloseTo(g.s[cut - 1], 5); // holds before the jump back
    sampleAt(g, (cut + 0.5) / 6, p);
    expect(p.s).toBeGreaterThan(g.s[cut]);
    expect(p.s).toBeLessThan(g.s[cut + 1]);
    expect(p.speed).toBeGreaterThan(10);
    sampleAt(g, 1e6, p);
    expect(p.inside).toBe(false);
    expect(p.s).toBe(g.s[g.n - 1]);
  });
  it('resamples to a lower rate', () => {
    const g = unpackGhost(packGhost(syntheticRun(60)))!;
    const r = resampleGhost(g, 3);
    expect(r.hz).toBe(3);
    expect(r.n).toBe(181);
    const back = unpackGhost(packGhost(r))!;
    expect(Math.abs(back.s[90] - g.s[180])).toBeLessThan(0.2);
    expect(back.flags[120] & F_CUT).toBe(F_CUT);
  });
  it('the tape records without growing', () => {
    const t = new GhostTape(10);
    for (let i = 0; i < 20; i++) t.push(i, 0, 0, 0);
    expect(t.n).toBe(10);
    expect(t.full).toBe(true);
    expect(t.snapshot().n).toBe(10);
    t.clear();
    expect(t.n).toBe(0);
  });
  it('rejects garbage', () => {
    expect(unpackGhost(new Uint8Array([6, 0, 0]))).toBeNull();
    expect(unpackGhost(new Uint8Array([0, 1, 0, 0, 0, 0, 0, 255, 1, 2, 3, 4, 0, 0]))).toBeNull();
    const b = packGhost(syntheticRun(10));
    expect(unpackGhost(b.slice(0, b.length - 1))).toBeNull();
    expect(unpackGhost(ghostOf([]) && new Uint8Array(0))).toBeNull();
  });
});

describe('challenge codes', () => {
  it('base64url round trip', () => {
    for (let n = 0; n < 40; n++) {
      const b = new Uint8Array(n).map((_, i) => (i * 97 + n * 13) & 255);
      expect(fromB64url(toB64url(b))).toEqual(b);
    }
    expect(fromB64url('ab+c')).toBeNull();
  });
  it('round trips every stage kind', async () => {
    const cases: Challenge[] = [
      base(),
      base({ stage: 'gorge', score: 0 }),
      base({ stage: 'sunset', score: 1e9 }),
      base({ stage: 'daily', seed: seedForDay('2026-10-24'), theme: 'gorge' }),
      base({ stage: 'trail', trail: '1a0k3x0a1b2c-TXkgdHJhaWw' }),
      base({ ghost: new Uint8Array(0) }),
    ];
    for (const c of cases) {
      for (const code of [await encodeChallenge(c), encodeChallengeSync(c)]) {
        expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
        const d = await decodeChallenge(code);
        expect(d).not.toBeNull();
        expect(d!.stage).toBe(c.stage);
        expect(d!.score).toBe(c.score);
        expect(d!.name).toBe(c.name);
        expect(d!.look).toBe(c.look);
        expect(d!.chain).toBe(c.chain);
        expect(d!.seed).toBe(c.seed);
        expect(d!.theme).toBe(c.theme);
        expect(d!.trail).toBe(c.trail);
        expect([...d!.ghost]).toEqual([...c.ghost]);
      }
    }
  });
  it('carries the running score track (and older links without one still decode)', async () => {
    const run = Array.from({ length: 120 }, (_, i) => i * 6123 + (i > 60 ? -2500 : 0));
    const c = base({ scores: packScores(run) });
    const d = await decodeChallenge(await encodeChallenge(c));
    const tr = unpackScores(d!.scores)!;
    expect(tr.n).toBe(120);
    for (let i = 0; i < 120; i++) expect(Math.abs(tr.v[i] - run[i])).toBeLessThanOrEqual(5);
    expect(scoreAt(tr, 10.5)).toBeCloseTo((tr.v[10] + tr.v[11]) / 2);
    expect(scoreAt(tr, 1e6)).toBe(tr.v[119]);
    expect((await decodeChallenge(encodeChallengeSync(base())))!.scores).toBeUndefined();
    expect(unpackScores(new Uint8Array([1, 0x80]))).toBeNull();
    expect(unpackScores(new Uint8Array([0, 2]))).toBeNull();
  });
  it('compresses', async () => {
    const c = base();
    expect((await encodeChallenge(c)).length).toBeLessThan(encodeChallengeSync(c).length);
  });
  it('keeps unicode names and sanitises hostile ones', async () => {
    for (const [inp, want] of [
      ['Žygimantas', 'Žygimantas'],
      ['ミアちゃん', 'ミアちゃん'],
      ['<img src=x>', 'img srcx'],
      ['a'.repeat(40), 'a'.repeat(14)],
    ]) {
      const d = await decodeChallenge(await encodeChallenge(base({ name: inp })));
      expect(d!.name).toBe(want);
    }
  });
  it('rejects garbage and truncated codes', async () => {
    const good = await encodeChallenge(base());
    const bad: unknown[] = ['', 'x', '!!!!', 'AAAA', good.slice(0, good.length - 7), good.slice(0, 20), good + 'AAAA', null, 42, `${good}*`];
    for (const b of bad) expect(await decodeChallenge(b)).toBeNull();
    // unknown stage / version / look / score
    const body = challengeBytes(base({ ghost: new Uint8Array(0) }));
    const mut = (i: number, v: number) => {
      const c = body.slice();
      c[i] = v;
      const all = new Uint8Array(c.length + 1);
      all.set(c, 1);
      return toB64url(all);
    };
    expect(await decodeChallenge(mut(1, 9))).toBeNull(); // stage
    expect(await decodeChallenge(mut(0, 2))).toBeNull(); // version
    expect(await decodeChallenge(mut(8, 'A'.charCodeAt(0)))).toBeNull(); // look char
    expect(await decodeChallenge(mut(5, 0xff))).toBeNull(); // score > 1e9
  });
  it('a long ghost is resampled until the link fits', async () => {
    const long = base({ ghost: packGhost(syntheticRun(600)) }); // 10 minutes
    const prefix = 'https://tokentails.com/meow-run?c=';
    const fit = await fitChallenge(long, MAX_LINK - prefix.length);
    expect(prefix.length + fit.code.length).toBeLessThanOrEqual(MAX_LINK);
    const d = await decodeChallenge(fit.code);
    expect(d).not.toBeNull();
    const g = unpackGhost(d!.ghost)!;
    expect(g).not.toBeNull();
    expect(g.hz).toBeLessThan(6);
    // a normal stage-length run fits at full rate
    const short = base({ ghost: packGhost(syntheticRun(110)) });
    const f2 = await fitChallenge(short, MAX_LINK - prefix.length);
    expect(unpackGhost(f2.ghost)!.hz).toBe(6);
  });
});
