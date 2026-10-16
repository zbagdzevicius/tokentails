import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, cp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  buildStatement, serializeStatement, loadEnvelopes, disclosures, sponsorLabel, envelopeProblem, generate,
  checkOut, displayDir, microToUsdc, ratioLabel, decodeAgentGift, readAgentGifts, AGENT_GIFT_TOPIC, FUNDED_TOPIC, WITHDRAWN_TOPIC,
  PUBLIC_OUT, UsageError,
} from '../statement.mjs';
import { renderHtml } from '../lib/statement-html.mjs';
import { canonical } from '../log.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'statement');
const RECEIPTS = path.join(FIX, 'receipts');
const NOW = '2026-10-16T12:00:00.000Z';

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const sponsorFixture = () => readJson(path.join(FIX, 'sponsor.json'));
const quiet = () => {};

async function exampleSponsorPath() {
  const real = path.join(HERE, '..', 'desk.example.json');
  try {
    await access(real);
    return real;
  } catch {
    return path.join(FIX, 'sponsor.example.json');
  }
}

async function fixtureStatement(extra = {}) {
  return buildStatement({ file: await sponsorFixture(), envelopes: await loadEnvelopes(RECEIPTS), now: NOW, ...extra });
}

test('totals count only reconciled receipts; sent and live planned are pending', async () => {
  const st = await fixtureStatement();
  // reconciled-1 (0.02) + reconciled-2 (0.05) + a reconciled dry-run command the founder ran by hand (0.005)
  assert.equal(st.totals.reconciledUsdc, '0.075');
  assert.equal(st.totals.receipts, 3);
  // sent (0.01) + planned-live (0.015, 10 min old, TTL 30); planned-stale (4 h old) is not pending
  assert.equal(st.totals.pendingUsdc, '0.025');
  assert.equal(st.totals.giftsMatched, 4);
  assert.equal(st.totals.donors, 3);
  assert.equal(st.totals.giftsMatchedUsdc, '0.095'); // 0.02 + 0.03 + 0.04 + 0.005 (gift value, not match)
  assert.deepEqual(st.days, [
    { day: '2026-10-15', receipts: 1, reconciledUsdc: '0.02' },
    { day: '2026-10-16', receipts: 2, reconciledUsdc: '0.055' },
  ]);
  const statuses = st.receipts.map((r) => r.status).sort();
  // failed and planned-stale are listed, never counted; dry-run planned and the other spender are not input
  assert.deepEqual(statuses, ['failed', 'planned', 'planned', 'reconciled', 'reconciled', 'reconciled', 'sent']);
  assert.ok(!st.receipts.some((r) => r.receipt.spender !== '0x1111111111111111111111111111111111111111'));
  assert.ok(!st.receipts.some((r) => r.mode === 'dry-run' && r.status !== 'reconciled'));
});

test('a tampered body is excluded with "hash mismatch" and not counted', async () => {
  const st = await fixtureStatement();
  const tampered = await readJson(path.join(RECEIPTS, 'tampered.json'));
  assert.deepEqual(st.excluded, [{ reason: 'hash mismatch', sha256: tampered.sha256 }]);
  assert.ok(!st.receipts.some((r) => r.sha256 === tampered.sha256));
});

test('envelopeProblem: memo, sponsor, amounts and lowercase checks', async () => {
  const file = await sponsorFixture();
  const good = await readJson(path.join(RECEIPTS, 'reconciled-1.json'));
  assert.equal(envelopeProblem(good, file), null);
  const rehash = (env) => ({ ...env, sha256: createHash('sha256').update(canonical(env.receipt)).digest('hex') });

  assert.equal(envelopeProblem({ ...good, memo: 'tt:agent:m:motored:00000000' }, file), 'memo mismatch');
  assert.equal(envelopeProblem({ ...good, status: 'done' }, file), 'unknown status: done');

  const bad = structuredClone(good);
  bad.receipt.amountMicro = '20001';
  assert.equal(envelopeProblem(rehash(bad), file), 'memo mismatch'); // new hash, old memo
  const b2 = rehash(bad);
  b2.memo = `tt:agent:m:motored:${b2.sha256.slice(0, 8)}`;
  assert.equal(envelopeProblem(b2, file), 'amount mismatch: gifts do not add up');

  const upper = structuredClone(good);
  upper.receipt.gifts[0].donor = '0x' + 'D1'.repeat(20);
  const u = rehash(upper);
  u.memo = `tt:agent:m:motored:${u.sha256.slice(0, 8)}`;
  assert.match(envelopeProblem(u, file), /not lowercase/);

  const float = structuredClone(good);
  float.receipt.ratioBps = 1.5;
  const f = rehash(float);
  f.memo = `tt:agent:m:motored:${f.sha256.slice(0, 8)}`;
  assert.match(envelopeProblem(f, file), /safe integer/);

  const other = structuredClone(good);
  other.receipt.sponsor = 'someone';
  const o = rehash(other);
  o.memo = `tt:agent:m:someone:${o.sha256.slice(0, 8)}`;
  assert.equal(envelopeProblem(o, file), 'sponsor mismatch');
});

test('deterministic bytes: same input, same output, regardless of envelope order or key order', async () => {
  const file = await sponsorFixture();
  const envs = await loadEnvelopes(RECEIPTS);
  const a = serializeStatement(buildStatement({ file, envelopes: envs, now: NOW }));
  const reverseKeys = (v) => (Array.isArray(v) ? v.map(reverseKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reverseKeys(v[k])])) : v);
  const shuffled = envs.slice().reverse().map(reverseKeys);
  assert.notDeepEqual(Object.keys(shuffled[0].receipt), Object.keys(envs[envs.length - 1].receipt));
  const b = serializeStatement(buildStatement({ file, envelopes: shuffled, now: NOW }));
  assert.equal(a, b);
  const st = JSON.parse(a);
  assert.equal(renderHtml(st), renderHtml(JSON.parse(b)));
  // keys are sorted at every level
  assert.deepEqual(Object.keys(st), Object.keys(st).slice().sort());
  assert.deepEqual(Object.keys(st.receipts[0].receipt), Object.keys(st.receipts[0].receipt).slice().sort());
});

test('generatedAt: --now, else the newest updatedAt, else null', async () => {
  const file = await sponsorFixture();
  const envs = await loadEnvelopes(RECEIPTS);
  assert.equal(buildStatement({ file, envelopes: envs, now: NOW }).generatedAt, NOW);
  assert.equal(buildStatement({ file, envelopes: envs }).generatedAt, '2026-10-16T12:00:00.000Z');
  assert.equal(buildStatement({ file, envelopes: [] }).generatedAt, null);
});

test('receipts are newest first; rationale links other than the explorer are removed', async () => {
  const st = await fixtureStatement();
  const created = st.receipts.map((r) => r.createdAt);
  assert.deepEqual(created, created.slice().sort().reverse());
  const r1 = st.receipts.find((r) => r.receipt.gifts[0].logIndex === 1);
  assert.match(r1.decision.rationale, /\[link removed\]/);
  assert.match(r1.decision.rationale, /https:\/\/explorer\.testnet\.arc\.io\/tx\/0x1/);
  assert.equal(r1.decision.observationHash, 'sha256:' + 'ab'.repeat(32));
});

test('the related-party label and all eight disclosures are in statement.json and index.html', async () => {
  const st = await fixtureStatement();
  assert.equal(st.sponsors[0].label, "related-party sponsor (founder's company)");
  assert.equal(st.notTaxReceipt, true);
  assert.equal(st.disclosures.length, 8);
  const html = renderHtml(st);
  const must = [
    "Motored.lt is a related-party sponsor (founder's company). It is not an outside or independent sponsor.",
    'is held by Token Tails. Matched money reaches that wallet.',
    'up to 2x the daily cap can go out across midnight',
    "The agent's code enforces the per-donor limit. The contract does not.",
    'This statement is not a tax receipt.',
    'We do not use Circle Wallets, Paymaster or Gateway.',
    'Claude proposes. Code recomputes the amount and refuses a proposal that differs. The contract has the last word.',
    'A match counts only once its AgentGift event has been read back from the chain (reconciled).',
  ];
  for (const m of must) {
    assert.ok(st.disclosures.some((d) => d.includes(m)), `statement.json lacks: ${m}`);
    const htmlText = html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    assert.ok(htmlText.includes(m), `index.html lacks: ${m}`);
  }
  assert.ok(!/\b(independent|outside) sponsor\b(?! It is not)/i.test(st.disclosures.join(' ').replace(/not an outside or independent sponsor/g, '')));
});

test('labels: self-sponsor and custody variants', async () => {
  const file = await sponsorFixture();
  assert.equal(sponsorLabel({ id: 'self', relatedParty: true, relation: 'founder' }), 'self-sponsor (Token Tails founder)');
  assert.equal(sponsorLabel({ id: 'acme', relatedParty: false }), 'sponsor');
  const self = { ...file, sponsor: { id: 'self', name: 'Token Tails founder', relatedParty: true, relation: 'founder' } };
  assert.match(disclosures(self)[0], /self-sponsor \(Token Tails founder\)/);
  const handed = { ...file, shelter: { ...file.shelter, custody: 'held-by-shelter' } };
  assert.match(disclosures(handed)[1], /held by the shelter itself/);
  const pinkPaw = { ...file, shelter: { ...file.shelter, custody: 'pink-paw-wallet' } };
  assert.match(disclosures(pinkPaw)[1], /^Matched money goes to the wallet of /);
  assert.doesNotMatch(disclosures(pinkPaw)[1], /held by|only|own key/i);
  assert.throws(() => disclosures({ ...file, shelter: { ...file.shelter, custody: 'shelter-held' } }), /shelter\.custody must be/);
  assert.equal(ratioLabel(10000), '1:1');
  assert.equal(ratioLabel(5000), '0.5:1');
  assert.equal(microToUsdc(50000n), '0.05');
  assert.equal(microToUsdc('0'), '0');
  assert.equal(microToUsdc('1000000'), '1');
});

test('a fork (mode fork or chain 31337) statement refuses the public path and needs an explicit --out', async () => {
  const file = await sponsorFixture();
  const local = { ...file, chainId: 31337 };
  await assert.rejects(checkOut({ out: PUBLIC_OUT, outGiven: true, file: local, envelopes: [] }), /refusing/);
  await assert.rejects(checkOut({ out: path.join(PUBLIC_OUT, 'x'), outGiven: true, file: local, envelopes: [] }), /refusing/);
  await assert.rejects(checkOut({ out: PUBLIC_OUT, outGiven: false, file: local, envelopes: [] }), /explicit --out/);
  await checkOut({ out: path.join(tmpdir(), 'md-fork'), outGiven: true, file: local, envelopes: [] });

  const envs = await loadEnvelopes(RECEIPTS);
  const forkEnv = { ...(await readJson(path.join(RECEIPTS, 'reconciled-1.json'))), mode: 'fork' };
  await assert.rejects(checkOut({ out: PUBLIC_OUT, outGiven: true, file, envelopes: [forkEnv] }), UsageError);
  // an Arc mainnet statement with send envelopes may go to the public folder
  const sends = envs.filter((e) => e.mode === 'send');
  await checkOut({ out: PUBLIC_OUT, outGiven: false, file: { ...file, chainId: 5042 }, envelopes: sends });
  // Arc testnet never does, even from send envelopes; another folder is fine
  await assert.rejects(checkOut({ out: PUBLIC_OUT, outGiven: false, file: { ...file, chainId: 5042002 }, envelopes: sends }), /Arc mainnet 5042 only/);
  await assert.rejects(checkOut({ out: path.join(PUBLIC_OUT, 'sub'), outGiven: true, file: { ...file, chainId: 5042002 }, envelopes: sends }), /Arc mainnet 5042 only/);
  await checkOut({ out: path.join(tmpdir(), 'md-testnet'), outGiven: true, file: { ...file, chainId: 5042002 }, envelopes: sends });
});

test('displayDir: relative inside the working directory, absolute outside it', () => {
  assert.equal(displayDir('/repo/a/out', '/repo/a'), 'out');
  assert.equal(displayDir('/repo/a', '/repo/a'), '.');
  assert.equal(displayDir('/private/tmp/x/statement', '/repo/a'), '/private/tmp/x/statement');
  assert.equal(displayDir('../b', '/repo/a'), '/repo/b');
});

test('index.html: self-contained, only explorer and tokentails.com links, no paths, embedded data parses', async () => {
  const st = await fixtureStatement();
  const html = renderHtml(st);
  const urls = html.match(/https?:\/\/[^\s"'<>\\)]+/g) || [];
  assert.ok(urls.length > 0);
  for (const u of urls) {
    assert.ok(u === 'https://explorer.testnet.arc.io' || u.startsWith('https://explorer.testnet.arc.io/') || /^https:\/\/tokentails\.com(\/|$)/.test(u), `unexpected URL ${u}`);
  }
  assert.ok(!/<link\b|<script[^>]+src=|<img\b|@import|url\(/i.test(html), 'no external resources');
  assert.ok(!/\/Users\/|\/home\/|fixtures|runs\/match-desk/.test(html), 'no file paths');
  assert.ok(!/rpc/i.test(html.replace(/\bdescription\b/g, '')), 'no RPC URL');
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /name="viewport"/);
  const json = html.match(/<script type="application\/json" id="statement">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(json), st);
  assert.equal((html.match(/class="verify"/g) || []).length, st.receipts.length);
  assert.match(html, /https:\/\/explorer\.testnet\.arc\.io\/tx\/0x1{64}/);
  assert.match(html, /https:\/\/explorer\.testnet\.arc\.io\/address\/0x1{40}/);
});

test('the browser hash check (page JS) agrees with node canonical + sha256', async () => {
  const st = await fixtureStatement();
  const html = renderHtml(st);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const fn = script.match(/function canonical\(v\)\{[\s\S]*?\n  \}/)[0];
  const browserCanonical = new Function(`${fn}; return canonical;`)();
  for (const env of st.receipts) {
    const h = createHash('sha256').update(browserCanonical(env.receipt)).digest('hex');
    assert.equal(h, env.sha256);
    assert.equal(browserCanonical(env.receipt), canonical(env.receipt));
  }
});

test('a hostile string cannot break out of the embedded JSON or the markup', async () => {
  const st = await fixtureStatement();
  st.receipts[0].decision.rationale = '</script><script>alert(1)</script><!-- &';
  const html = renderHtml(st);
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
  assert.ok(!html.includes('<script>alert(1)'));
  const json = html.match(/<script type="application\/json" id="statement">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(json).receipts[0].decision.rationale, '</script><script>alert(1)</script><!-- &');
});

test('--verify-onchain counts a reconciled receipt only when memo, tx and amount match an AgentGift', async () => {
  const file = await sponsorFixture();
  const envs = await loadEnvelopes(RECEIPTS);
  const r1 = envs.find((e) => e.receipt.gifts[0].logIndex === 1);
  const r2 = envs.find((e) => e.receipt.gifts[0].logIndex === 2);
  const dr = envs.find((e) => e.mode === 'dry-run' && e.status === 'reconciled');
  const events = [
    { memo: r1.memo, amountRaw: r1.receipt.amountRaw, tx: r1.witness.tx },
    { memo: r2.memo, amountRaw: '1', tx: r2.witness.tx }, // wrong amount
    { memo: dr.memo, amountRaw: dr.receipt.amountRaw, tx: '0x' + 'f'.repeat(64) }, // wrong tx
  ];
  const st = buildStatement({ file, envelopes: envs, now: NOW, onchain: { events } });
  assert.equal(st.verifiedOnchain, true);
  assert.equal(st.totals.reconciledUsdc, '0.02');
  assert.equal(st.totals.receipts, 1);
  assert.equal(st.excluded.filter((x) => /no matching AgentGift/.test(x.reason)).length, 2);
});

function abiString(s) {
  const hex = Buffer.from(s, 'utf8').toString('hex');
  return (s.length.toString(16).padStart(64, '0')) + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
}

test('decodeAgentGift and readAgentGifts (stubbed RPC, range halving, chain check)', async () => {
  const memo = 'tt:agent:m:motored:1a2b3c4d';
  const data = '0x' + (50000000000000000n).toString(16).padStart(64, '0') + (0x60).toString(16).padStart(64, '0')
    + (100000000000000000n).toString(16).padStart(64, '0') + abiString(memo);
  const log = { data, transactionHash: '0x' + 'AB'.repeat(32), topics: [AGENT_GIFT_TOPIC, '0x' + '0'.repeat(63) + '5'] };
  assert.deepEqual(decodeAgentGift(log), { memo, amountRaw: '50000000000000000', tx: '0x' + 'ab'.repeat(32) });

  const file = await sponsorFixture();
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const { method, params, id } = JSON.parse(init.body);
    calls.push({ method, params });
    let result;
    if (method === 'eth_chainId') result = '0x' + (5042002).toString(16);
    else if (method === 'eth_blockNumber') result = '0x' + (1000 + 450).toString(16);
    else if (method === 'eth_getLogs') {
      const span = Number(params[0].toBlock) - Number(params[0].fromBlock) + 1;
      if (span > 200) return { ok: true, json: async () => ({ id, error: { message: 'block range too large' } }) };
      assert.equal(params[0].address, file.spender.address);
      const gifts = JSON.stringify(params[0].topics) === JSON.stringify([AGENT_GIFT_TOPIC]);
      assert.ok(gifts || JSON.stringify(params[0].topics) === JSON.stringify([[FUNDED_TOPIC, WITHDRAWN_TOPIC]]), 'AgentGift, or Funded + Withdrawn');
      result = Number(params[0].fromBlock) === 1000 && gifts ? [log] : [];
      if (!gifts && Number(params[0].fromBlock) === 1000) result = [{ topics: [FUNDED_TOPIC, '0x' + '0'.repeat(64)], data: '0x' + (10n ** 18n).toString(16).padStart(64, '0') }];
    } else if (method === 'eth_call') result = '0x' + (95n * 10n ** 16n).toString(16).padStart(64, '0');
    return { ok: true, json: async () => ({ id, result }) };
  };
  const { events, vaults } = await readAgentGifts({ rpcUrl: 'http://127.0.0.1:8545', file, fetchImpl, chunk: 1000, gapMs: 0 });
  assert.equal(events.length, 1);
  assert.equal(events[0].spender, file.spender.address);
  assert.deepEqual(vaults[file.spender.address], {
    fundedRaw: '1000000000000000000', withdrawnRaw: '0', givenRaw: '50000000000000000', floatRaw: '950000000000000000', unitDecimals: 18,
  });
  assert.ok(calls.filter((c) => c.method === 'eth_getLogs').length > 2);
  await assert.rejects(
    readAgentGifts({ rpcUrl: 'x', file: { ...file, chainId: 5042 }, fetchImpl, gapMs: 0 }),
    /RPC chain 5042002 is not the sponsor file's chain 5042/,
  );
});

test('generate writes both files; unchanged input gives identical bytes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-statement-'));
  try {
    const opts = { sponsorFile: path.join(FIX, 'sponsor.json'), receipts: RECEIPTS, out: dir, log: quiet };
    await generate(opts);
    const j1 = await readFile(path.join(dir, 'statement.json'), 'utf8');
    const h1 = await readFile(path.join(dir, 'index.html'), 'utf8');
    await generate(opts);
    assert.equal(await readFile(path.join(dir, 'statement.json'), 'utf8'), j1);
    assert.equal(await readFile(path.join(dir, 'index.html'), 'utf8'), h1);
    assert.ok(!j1.includes(RECEIPTS) && !j1.includes(dir), 'no file paths in statement.json');
    await assert.rejects(generate({ ...opts, now: 'not a date' }), UsageError);
    await assert.rejects(generate({ ...opts, verifyOnchain: true }), /needs --rpc/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generate refuses a bad sponsor file and a fork statement to the public folder', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-statement-'));
  try {
    const sp = await sponsorFixture();
    await writeFile(path.join(dir, 'bad.json'), JSON.stringify({ ...sp, schema: 'nope' }));
    await assert.rejects(generate({ sponsorFile: path.join(dir, 'bad.json'), out: dir, log: quiet }), /schema/);
    await writeFile(path.join(dir, 'chain.json'), JSON.stringify({ ...sp, chainId: 1 }));
    await assert.rejects(generate({ sponsorFile: path.join(dir, 'chain.json'), out: dir, log: quiet }), /chainId/);
    await writeFile(path.join(dir, 'local.json'), JSON.stringify({ ...sp, chainId: 31337 }));
    await assert.rejects(generate({ sponsorFile: path.join(dir, 'local.json'), receipts: dir, log: quiet }), /explicit --out/);
    await assert.rejects(generate({ sponsorFile: path.join(dir, 'local.json'), receipts: dir, out: PUBLIC_OUT, log: quiet }), /refusing/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the committed placeholder equals the generator output for desk.example.json with zero receipts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-placeholder-'));
  try {
    const empty = path.join(dir, 'receipts');
    const out = path.join(dir, 'out');
    const st = await generate({ sponsorFile: await exampleSponsorPath(), receipts: empty, out, log: quiet });
    assert.deepEqual(st.sponsors.map((x) => [x.id, x.label, x.vault.spender]), [
      ['motored', "related-party sponsor (founder's company)", null],
      ['tokentails', "operator's own money", null],
    ]);
    assert.equal(st.generatedAt, null);
    assert.equal(st.totals.reconciledUsdc, '0');
    assert.equal(st.receipts.length, 0);
    for (const f of ['statement.json', 'index.html']) {
      const want = await readFile(path.join(out, f), 'utf8');
      const have = await readFile(path.join(PUBLIC_OUT, f), 'utf8');
      assert.equal(have, want, `client/public/match-desk/${f} is stale: run node statement.mjs --sponsor desk.example.json --receipts /nonexistent`);
    }
    const html = await readFile(path.join(PUBLIC_OUT, 'index.html'), 'utf8');
    assert.match(html, /Not deployed yet\. No matches\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a copied receipt file is counted once', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'md-dup-'));
  try {
    await cp(RECEIPTS, dir, { recursive: true });
    await cp(path.join(RECEIPTS, 'reconciled-1.json'), path.join(dir, 'copy-of-reconciled-1.json'));
    const st = buildStatement({ file: await sponsorFixture(), envelopes: await loadEnvelopes(dir), now: NOW });
    assert.equal(st.totals.reconciledUsdc, '0.075');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the lead sentence is in the present tense only once a match is reconciled', async () => {
  const st = await fixtureStatement();
  assert.ok(st.sponsors[0].vault.spender && st.totals.receipts > 0);
  assert.match(renderHtml(st), /related-party sponsor \(founder&#39;s company\), matches public gifts|related-party sponsor \(founder's company\), matches public gifts/);
  const none = { ...st, totals: { ...st.totals, receipts: 0 } };
  const html0 = renderHtml(none);
  assert.match(html0, /will match public gifts to .* through its match vault\. No match has been read back from the chain yet\./);
  assert.doesNotMatch(html0, /\), matches public gifts/);
  const undeployed = { ...none, sponsors: none.sponsors.map((x) => ({ ...x, vault: { ...x.vault, spender: null } })) };
  const html1 = renderHtml(undeployed);
  assert.match(html1, /will match public gifts to .* once its match vault is deployed and funded\./);
  assert.doesNotMatch(html1, /\) matches public gifts|\), matches public gifts/);
});

test('one sponsorLabel (lib/policy.mjs): the statement and the agent agree; Motored.lt must be a related party', async () => {
  const policy = await import('../lib/policy.mjs');
  assert.equal(sponsorLabel, policy.sponsorLabel);
  for (const s of [
    { id: 'motored', relatedParty: true, relation: "founder's company" },
    { id: 'x', relatedParty: true, relation: 'founder' },
    { id: 'x', relatedParty: true, relation: 'Token Tails founder' },
    { id: 'self', relatedParty: false },
    { id: 'acme', relatedParty: false },
  ]) assert.equal(sponsorLabel(s), policy.sponsorLabel(s));
  assert.equal(sponsorLabel({ id: 'x', relatedParty: true, relation: 'founder' }), 'self-sponsor (Token Tails founder)');
  const file = await sponsorFixture();
  const plain = { ...file, sponsor: { ...file.sponsor, relatedParty: false } };
  const dir = await mkdtemp(path.join(tmpdir(), 'md-rp-'));
  const sf = path.join(dir, 'sponsor.json');
  await writeFile(sf, JSON.stringify(plain));
  await assert.rejects(generate({ sponsorFile: sf, receipts: dir, out: path.join(dir, 'out'), log: quiet }),
    (e) => e instanceof UsageError && /founder's company/.test(e.message));
  const renamed = { ...file, sponsor: { id: 'acme', name: 'Motored.lt UAB', relatedParty: false } };
  await writeFile(sf, JSON.stringify(renamed));
  await assert.rejects(generate({ sponsorFile: sf, receipts: dir, out: path.join(dir, 'out'), log: quiet }), /relatedParty must be true/);
});

test('index.html says when the totals were not re-checked against the chain', async () => {
  const st = await fixtureStatement();
  assert.notEqual(st.verifiedOnchain, true);
  assert.match(renderHtml(st), /Not re-checked against the chain/);
  assert.doesNotMatch(renderHtml({ ...st, verifiedOnchain: true }), /Not re-checked against the chain/);
  assert.match(renderHtml({ ...st, verifiedOnchain: true }), /re-checked against the chain when this statement was built/);
});
