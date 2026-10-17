import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildReceiptBody, receiptSha, memoFor, newEnvelope, setStatus, verifyEnvelope, saveEnvelope, loadEnvelopes,
  loadPublished, assertPlain, MEMO_MAX_BYTES, stateDir,
} from '../lib/receipt.mjs';
import { validateSponsor } from '../lib/policy.mjs';
import { canonical } from '../log.mjs';
import { sponsorRaw, SPENDER } from '../test-support/helpers.mjs';

const sponsor = validateSponsor(sponsorRaw());
const DONOR = '0x' + 'D0'.repeat(20);
const g = (id, block, logIndex, giftMicro) => ({
  id, tx: id.split(':')[0], logIndex, block, batchId: '45', kind: 'public', donor: DONOR, day: '2026-10-15', giftMicro,
});
const check = (gifts, amount) => ({
  ok: true, amountMicro: amount, uncappedMicro: amount, clampedBy: null,
  perGift: gifts.map((x) => ({ id: x.id, matchMicro: x.giftMicro })), gifts,
});
const TX = '0x' + 'ab'.repeat(32);
const body = () => buildReceiptBody({ sponsor, policyHash: 'f'.repeat(64), check: check([g(`${TX}:12`, 25_763_386, 12, 20_000n)], 20_000n), unitDecimals: 18 });

test('body shape: strings for amounts, lowercase addresses, amountRaw in 18 decimals, no timestamps', () => {
  const b = body();
  assert.equal(b.type, 'tt.match-desk.receipt');
  assert.equal(b.v, 1);
  assert.equal(b.sponsor, 'motored');
  assert.equal(b.spender, SPENDER);
  assert.equal(b.amountMicro, '20000');
  assert.equal(b.amountRaw, '20000000000000000');
  assert.equal(b.gifts[0].donor, DONOR.toLowerCase());
  assert.equal(b.gifts[0].matchMicro, '20000');
  assert.doesNotMatch(JSON.stringify(b), /"(at|createdAt|ts|rationale)"/);
});

test('hash: sha256 over canonical(body), stable under key order; same gifts give the same memo', () => {
  const b = body();
  const reordered = Object.fromEntries(Object.entries(b).reverse());
  assert.equal(receiptSha(b), receiptSha(reordered));
  assert.equal(receiptSha(b), createHash('sha256').update(canonical(b), 'utf8').digest('hex'));
  assert.equal(memoFor('motored', receiptSha(b)), memoFor('motored', receiptSha(body())));
  const other = buildReceiptBody({ sponsor, policyHash: 'f'.repeat(64), check: check([g(`${TX}:13`, 25_763_386, 13, 20_000n)], 20_000n), unitDecimals: 18 });
  assert.notEqual(receiptSha(other), receiptSha(b));
});

test('memo format and length (<= 44 bytes, tt:agent: prefix)', () => {
  const m = memoFor('motored', 'a'.repeat(64));
  assert.equal(m, 'tt:agent:m:motored:aaaaaaaa');
  const longest = memoFor('a'.repeat(24), 'b'.repeat(64));
  assert.equal(Buffer.byteLength(longest), MEMO_MAX_BYTES);
  assert.ok(longest.startsWith('tt:agent:'));
  assert.throws(() => memoFor('Bad', 'a'.repeat(64)));
});

test('floats, undefined and bigint are refused in a body', () => {
  assert.throws(() => assertPlain({ a: 0.5 }), /safe integer/);
  assert.throws(() => assertPlain({ a: undefined }), /undefined/);
  assert.throws(() => assertPlain({ a: 1n }), /bigint/);
  assert.doesNotThrow(() => assertPlain({ a: [1, 'x', null, true, { b: 2 }] }));
});

test('envelope lifecycle, save/load round trip, tampered body is ignored', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-receipt-'));
  const env = newEnvelope({ body: body(), sponsorId: 'motored', mode: 'dry-run', decision: { model: 'm', rationale: 'r', observationHash: 'sha256:x', checker: { ok: true } }, now: Date.parse('2026-10-15T10:00:00Z') });
  assert.equal(env.status, 'planned');
  assert.equal(env.createdAt, '2026-10-15T10:00:00.000Z');
  assert.ok(verifyEnvelope(env));
  setStatus(env, 'sent', { tx: { hash: '0x1', block: 2, status: 'success' } }, Date.parse('2026-10-15T10:01:00Z'));
  assert.equal(env.updatedAt, '2026-10-15T10:01:00.000Z');
  assert.throws(() => setStatus(env, 'lost'));
  await saveEnvelope(dir, env);
  const tampered = JSON.parse(JSON.stringify(env));
  tampered.receipt.amountMicro = '50000';
  await writeFile(path.join(dir, 'receipts', `${'0'.repeat(64)}.json`), JSON.stringify(tampered));
  const { envelopes, bad } = await loadEnvelopes(dir);
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0].status, 'sent');
  assert.equal(bad.length, 1);
  assert.equal((await loadEnvelopes(path.join(dir, 'none'))).envelopes.length, 0);
  assert.equal(stateDir('/x', 5042, '0xABC'), path.join('/x', '5042-0xabc'));
});

test('published statement receipts load only for the same spender and only when their hash verifies', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-pub-'));
  const env = newEnvelope({ body: body(), sponsorId: 'motored', mode: 'send', decision: null });
  const bad = JSON.parse(JSON.stringify(env));
  bad.receipt.amountRaw = '1';
  const f = path.join(dir, 'statement.json');
  await mkdir(dir, { recursive: true });
  await writeFile(f, JSON.stringify({ contract: { spender: SPENDER.toUpperCase().replace('0X', '0x') }, receipts: [env, bad] }));
  assert.equal((await loadPublished(f, SPENDER)).length, 1);
  assert.equal((await loadPublished(f, '0x' + '1'.repeat(40))).length, 0);
  assert.equal((await loadPublished(path.join(dir, 'missing.json'), SPENDER)).length, 0);
  assert.ok((await readFile(f, 'utf8')).length > 0);
});
