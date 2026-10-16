import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  validateSponsor, loadSponsor, policyHashOf, PolicyError, GuardError, LABEL_RELATED, LABEL_SELF, sponsorLabel,
} from '../lib/policy.mjs';
import { sponsorRaw } from '../test-support/helpers.mjs';

const EXAMPLE = new URL('../sponsor.example.json', import.meta.url);

const bad = (raw, re) => assert.throws(() => validateSponsor(raw), (e) => e instanceof PolicyError && e instanceof GuardError && re.test(e.message), re.toString());
const clone = (o) => JSON.parse(JSON.stringify(o));
const withPolicy = (patch) => sponsorRaw({ policy: patch });

test('the committed example loads: related-party label, micro amounts, lowercase addresses, null spender', async () => {
  const { sponsor, policyHash } = await loadSponsor(EXAMPLE);
  assert.equal(sponsor.sponsor.label, LABEL_RELATED);
  assert.equal(sponsor.sponsor.label, "related-party sponsor (founder's company)");
  assert.equal(sponsor.chainId, 5042);
  assert.equal(sponsor.spender.address, null);
  assert.equal(sponsor.policy.perGiftMaxMicro, 50_000n);
  assert.equal(sponsor.policy.budgetMicro, 1_000_000n);
  assert.equal(sponsor.policy.eligible.matchTreats, false);
  assert.ok(sponsor.policy.excludedSenders.has('0x8d03d8295892f7de2b7ce57585aa45dd4b3c2ba0'));
  assert.equal(sponsor.shelter.custody, 'pink-paw-wallet');
  assert.match(policyHash, /^[0-9a-f]{64}$/);
});

test('policyHash is canonical (key order does not matter) and follows the raw strings', () => {
  const a = sponsorRaw().policy;
  const b = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(policyHashOf(a), policyHashOf(b));
  assert.notEqual(policyHashOf(a), policyHashOf({ ...a, budgetUsdc: '1.0' }));
});

test('labels: related party, self-sponsor, plain', () => {
  assert.equal(sponsorLabel({ id: 'motored', relatedParty: true, relation: "founder's company" }), LABEL_RELATED);
  assert.equal(sponsorLabel({ id: 'self', relatedParty: true, relation: 'self' }), LABEL_SELF);
  assert.equal(sponsorLabel({ id: 'acme', relatedParty: false }), 'sponsor');
});

test('top-level rows: schema, sponsor id/name/relatedParty, chainId, addresses, custody', () => {
  bad({ ...sponsorRaw(), schema: 'tt.match-desk.sponsor/v2' }, /schema/);
  bad(sponsorRaw({ sponsor: { id: 'Motored', name: 'x', relatedParty: false } }), /sponsor\.id/);
  bad(sponsorRaw({ sponsor: { id: 'a'.repeat(25), name: 'x', relatedParty: false } }), /sponsor\.id/);
  bad(sponsorRaw({ sponsor: { id: 'ok', name: '', relatedParty: false } }), /sponsor\.name/);
  bad(sponsorRaw({ sponsor: { id: 'ok', name: 'x'.repeat(81), relatedParty: false } }), /sponsor\.name/);
  bad(sponsorRaw({ sponsor: { id: 'ok', name: 'x', relatedParty: 'yes' } }), /relatedParty/);
  bad(sponsorRaw({ sponsor: { id: 'ok', name: 'x', relatedParty: true, relation: ' ' } }), /relation/);
  bad(sponsorRaw({ chainId: 1 }), /chainId/);
  bad(sponsorRaw({ spender: { address: '0x12', deployBlock: 1, owner: null, agent: null } }), /spender\.address/);
  bad(sponsorRaw({ spender: { address: null, deployBlock: -1, owner: null, agent: null } }), /deployBlock/);
  bad(sponsorRaw({ split: null }), /split/);
  bad(sponsorRaw({ router: 'nope' }), /router/);
  bad(sponsorRaw({ shelter: { name: 'P', wallet: '0x' + '1'.repeat(40), custody: 'unknown' } }), /custody/);
  bad(sponsorRaw({ shelter: { name: 'P', wallet: 'x', custody: 'held-by-shelter' } }), /shelter\.wallet/);
  const ok = validateSponsor(sponsorRaw({ spender: { address: null, deployBlock: null, owner: null, agent: null }, router: null }));
  assert.equal(ok.router, null);
});

test('amount rows: decimal strings, at most 6 decimals, never numbers', () => {
  bad(withPolicy({ perGiftMaxUsdc: 0.05 }), /perGiftMaxUsdc/);
  bad(withPolicy({ perGiftMaxUsdc: '0.0000001' }), /perGiftMaxUsdc/);
  bad(withPolicy({ perGiftMaxUsdc: '1e-2' }), /perGiftMaxUsdc/);
  bad(withPolicy({ perGiftMaxUsdc: '0' }), /perGiftMaxUsdc/);
  bad(withPolicy({ perGiftMaxUsdc: '2', budgetUsdc: '1' }), /must not exceed/);
  bad(withPolicy({ perDonorDailyMaxUsdc: '0' }), /perDonorDailyMaxUsdc/);
  bad(withPolicy({ minGiftUsdc: '0' }), /minGiftUsdc/);
  bad(withPolicy({ budgetUsdc: '-1' }), /budgetUsdc/);
  const s = validateSponsor(withPolicy({ minGiftUsdc: '0.000001' }));
  assert.equal(s.policy.minGiftMicro, 1n);
});

test('ratio, age, dates, refund, kinds, senders, treats', () => {
  bad(withPolicy({ ratioBps: 0 }), /ratioBps/);
  bad(withPolicy({ ratioBps: 10001 }), /ratioBps/);
  bad(withPolicy({ ratioBps: 0.5 }), /ratioBps/);
  bad(withPolicy({ maxGiftAgeHours: 0 }), /maxGiftAgeHours/);
  bad(withPolicy({ maxGiftAgeHours: 169 }), /maxGiftAgeHours/);
  bad(withPolicy({ validFrom: 'soon' }), /validFrom/);
  bad(withPolicy({ pace: { from: '2026-11-01', to: '2026-10-01', floatLowUsdc: '0.1' } }), /before/);
  bad(withPolicy({ pace: { from: '2026-10-1', to: '2026-11-01', floatLowUsdc: '0.1' } }), /pace\.from/);
  bad(withPolicy({ refund: { after: '2026-11-15', to: '0x' + '1'.repeat(40) } }), /exactly "owner"/);
  bad(withPolicy({ refund: { after: 'later', to: 'owner' } }), /refund\.after/);
  bad(sponsorRaw({ eligible: { kinds: ['public', 'router-flush'] } }), /router-flush is never eligible/);
  bad(sponsorRaw({ eligible: { kinds: ['public', 'public'] } }), /kinds/);
  bad(sponsorRaw({ eligible: { senders: [] } }), /senders/);
  bad(sponsorRaw({ eligible: { senders: ['nope'] } }), /senders/);
  bad(sponsorRaw({ eligible: { chains: [5042] } }), /must include chainId/);
  bad(sponsorRaw({ eligible: { matchTreats: true, treatsDailyMaxUsdc: '0' } }), /treatsDailyMaxUsdc/);
  bad(sponsorRaw({ eligible: { matchTreats: 'no' } }), /matchTreats/);
  bad(withPolicy({ excludedSenders: ['0x12'] }), /excludedSenders/);
  bad(withPolicy({ farming: { maxGiftsPerDonorDay: 0 } }), /maxGiftsPerDonorDay/);
  bad(withPolicy({ plannedTtlMinutes: 0 }), /plannedTtlMinutes/);
  const allow = validateSponsor(sponsorRaw({ eligible: { senders: ['0x' + 'AB'.repeat(20)] } }));
  assert.ok(allow.policy.eligible.senders.has('0x' + 'ab'.repeat(20)));
});

test('loadSponsor: unreadable or invalid JSON is a PolicyError', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-policy-'));
  const f = path.join(dir, 'sponsor.json');
  await writeFile(f, '{ not json');
  await assert.rejects(loadSponsor(f), PolicyError);
  await assert.rejects(loadSponsor(path.join(dir, 'missing.json')), PolicyError);
  await writeFile(f, JSON.stringify(clone(sponsorRaw())));
  const { sponsor } = await loadSponsor(f);
  assert.equal(sponsor.spender.deployBlock, 150_000);
});

test('Motored.lt is never a plain sponsor: relatedParty false is refused (by id or by name)', () => {
  bad(sponsorRaw({ sponsor: { id: 'motored', name: 'Motored.lt', relatedParty: false } }), /founder's company/);
  bad(sponsorRaw({ sponsor: { id: 'acme', name: 'motored.lt', relatedParty: false } }), /relatedParty must be true/);
  assert.equal(sponsorLabel({ id: 'x', relatedParty: true, relation: 'founder' }), LABEL_SELF);
});
