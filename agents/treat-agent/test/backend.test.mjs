import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readBackend, routerBlocked, splitMismatch, networkFor, parsePayouts } from '../lib/backend.mjs';
import { httpStub, SPLIT, NOW_MS } from '../test-support/helpers.mjs';

const fx = async (name) => JSON.parse(await readFile(new URL(`./fixtures/match-desk/${name}`, import.meta.url), 'utf8'));
const API = 'https://api.example';

test('the three shapes: payouts timestamps and freshness, donate-status split, match state', async () => {
  const { fetchImpl, seen } = httpStub({ payouts: await fx('payouts.json'), donate: await fx('donate-status.json'), match: await fx('match-status-off.json') });
  const b = await readBackend({ api: API, chainId: 5042002, split: SPLIT, fetchImpl, now: NOW_MS });
  assert.equal(b.payouts.ok, true);
  assert.equal(b.payouts.stale, false);
  assert.equal(b.payouts.indexedThrough.block, 199_950);
  assert.equal(b.payouts.timestamps['0x' + '0'.repeat(62) + 'a1'], 1_790_999_400);
  assert.equal(b.donateStatus.ok, true);
  assert.equal(b.donateStatus.splitMatches, true, 'testnet entry names the same split (case-insensitive)');
  assert.equal(b.donateStatus.treatsLeftToday, 99);
  assert.equal(b.match.state, 'off');
  assert.equal(routerBlocked(b), false);
  assert.equal(splitMismatch(b), false);
  const urls = seen.map((s) => s.url).sort();
  assert.match(urls[2], /\/shelter\/payouts\?network=testnet&chainId=5042002&address=0x5a5a.*&limit=500$/);
  assert.match(urls[1], /\/shelter\/match\/status\?chainId=5042002$/);
  assert.deepEqual(seen[0].headers, { accept: 'application/json' }, 'no headers beyond accept');
});

test('fail-soft: a failing endpoint is { ok: false } and the rest still answers', async () => {
  const { fetchImpl } = httpStub({ payouts: { status: 500 }, donate: 'throw', match: await fx('match-status-off.json') });
  const b = await readBackend({ api: API, chainId: 5042002, split: SPLIT, fetchImpl, now: NOW_MS });
  assert.deepEqual(b.payouts, { ok: false, error: 'HTTP 500' });
  assert.equal(b.donateStatus.ok, false);
  assert.equal(b.match.ok, true);
  assert.equal(splitMismatch(b), false, 'an unreachable donate-status is not a mismatch');
});

test('a split mismatch is the hard stop', async () => {
  const { fetchImpl } = httpStub({ payouts: await fx('payouts.json'), donate: await fx('donate-status.json'), match: await fx('match-status-off.json') });
  const b = await readBackend({ api: API, chainId: 5042, split: SPLIT, fetchImpl, now: NOW_MS });
  assert.equal(b.donateStatus.splitMatches, false);
  assert.equal(splitMismatch(b), true);
});

test('match state other than off, or a failed call, excludes router gifts', async () => {
  const live = await readBackend({ api: API, chainId: 5042002, split: SPLIT, fetchImpl: httpStub({ match: await fx('match-status-live.json') }).fetchImpl, now: NOW_MS });
  assert.equal(live.match.state, 'live');
  assert.equal(routerBlocked(live), true);
  const failed = await readBackend({ api: API, chainId: 5042002, split: SPLIT, fetchImpl: httpStub({}).fetchImpl, now: NOW_MS });
  assert.equal(routerBlocked(failed), true);
  const weird = await readBackend({ api: API, chainId: 5042002, split: SPLIT, fetchImpl: httpStub({ match: { state: 'maybe' } }).fetchImpl, now: NOW_MS });
  assert.equal(weird.match.ok, false);
});

test('MATCH_DESK_API=off and a local chain skip all three (router gifts stay excluded)', async () => {
  let called = false;
  const f = async () => { called = true; };
  const off = await readBackend({ api: 'off', chainId: 5042002, split: SPLIT, fetchImpl: f });
  assert.equal(off.off, true);
  assert.equal(routerBlocked(off), true);
  const local = await readBackend({ api: API, chainId: 31337, split: SPLIT, fetchImpl: f });
  assert.equal(local.off, true);
  assert.equal(called, false);
  assert.equal(networkFor(5042), 'mainnet');
  assert.equal(networkFor(5042002), 'testnet');
});

test('a timeout is a soft failure', async () => {
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const b = await readBackend({ api: API, chainId: 5042002, split: SPLIT, fetchImpl: hang, now: NOW_MS, timeoutMs: 20 });
  assert.match(b.payouts.error, /timeout/);
});

test('stale index: indexedThrough older than 15 minutes', async () => {
  const body = await fx('payouts.json');
  assert.equal(parsePayouts(body, { split: SPLIT, nowS: 1_790_999_975 + 16 * 60 }).stale, true);
  assert.equal(parsePayouts({ contracts: [] }, { split: SPLIT, nowS: 0 }).stale, true);
});
