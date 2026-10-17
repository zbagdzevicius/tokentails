import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghostFromLink, ghostPayloadOf, median, mergePar, parFrom } from './lib/par-math.mjs';

test('median of 5 and of an even count (lower middle, integer)', () => {
  assert.equal(median([900, 100, 500, 300, 700]), 500);
  assert.equal(median([4, 1, 3, 2]), 2);
  assert.equal(median([]), 0);
});

test('par: bronze = median, silver = best, gold = floor(best x 1.15)', () => {
  assert.deepEqual(parFrom([2000, 4100, 3300, 5200, 2900]), { bronze: 3300, silver: 5200, gold: 5980 });
  assert.deepEqual(parFrom([1001]), { bronze: 1001, silver: 1001, gold: 1151 });
  assert.equal(parFrom([]), null);
  assert.equal(parFrom([NaN, -5]), null);
  // integer only, no float drift: 7 x 1.15 = 8.049999... in floats
  assert.equal(parFrom([7]).gold, 8);
});

test('mergePar keeps rooms without runs unless pruned, sorted keys', () => {
  const old = { 'daily-002': { bronze: 1, silver: 2, gold: 2 }, glass: { bronze: 5, silver: 6, gold: 6 } };
  const fresh = { 'daily-001': { bronze: 10, silver: 20, gold: 23 }, glass: { bronze: 7, silver: 8, gold: 9 } };
  assert.deepEqual(Object.keys(mergePar(old, fresh)), ['daily-001', 'daily-002', 'glass']);
  assert.deepEqual(mergePar(old, fresh).glass, fresh.glass);
  assert.deepEqual(Object.keys(mergePar(old, fresh, { prune: true })), ['daily-001', 'glass']);
});

test('ghost files and links', () => {
  assert.equal(ghostPayloadOf('# daily-018 score 1\n\nAbCdEf_-123\n'), 'AbCdEf_-123');
  assert.equal(ghostPayloadOf('# only a comment'), null);
  assert.equal(ghostFromLink('https://tokentails.com/badcat/d/18?g=AQ3kxyz12&c=Bv4&n=Mochi'), 'AQ3kxyz12');
  assert.equal(ghostFromLink('https://x.dev/index.html#d=18&g=HashGhost99'), 'HashGhost99');
  assert.equal(ghostFromLink('/badcat/d/18?rp=ReplayGhost1&clip=1'), 'ReplayGhost1');
  assert.equal(ghostFromLink('RawPayload_123'), 'RawPayload_123');
  assert.equal(ghostFromLink('https://tokentails.com/badcat/d/18'), null);
});
