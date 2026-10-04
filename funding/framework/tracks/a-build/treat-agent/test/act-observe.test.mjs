import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { act, buildCastArgs, formatCommand, isLocalRpc } from '../act.mjs';
import { observe, makeRpc, classify, matchedPrefixes, trustedSenders } from '../observe.mjs';
import { decodeRevert, formatUnits, parseUnits, stringAt } from '../lib/abi.mjs';
import { canonical, hashObservation } from '../log.mjs';
import { round, isPlainRpc, describe, formatRevert } from '../run.mjs';
import { stubRpc, batchLog, encodeWithString, addrWord, SPENDER, AGENT, DONOR, w } from '../test-support/helpers.mjs';

const E18 = 10n ** 18n;

// ------------------------------------------------------------------ act

test('dry run prints the founder command with --account, never sends', async () => {
  let ran = false;
  const r = await act(
    { action: 'give', amountUsdc: 0.02, memo: 'tt:agent:match-abcdef01' },
    { spender: SPENDER, rpc: 'https://rpc.example', rpcDisplay: '"$TREAT_AGENT_RPC"', unitDecimals: 18, keystore: 'tt-agent', execImpl: () => { ran = true; } },
  );
  assert.equal(ran, false);
  assert.equal(r.mode, 'dry-run');
  assert.equal(r.amountRaw, (2n * 10n ** 16n).toString());
  assert.equal(r.command, `cast send ${SPENDER} 'give(uint256,string)' 20000000000000000 tt:agent:match-abcdef01 --rpc-url '"$TREAT_AGENT_RPC"' --account tt-agent`);
});

test('cast argv shape: ERC-20 units, fork flags, guards', () => {
  const a = buildCastArgs({ spender: SPENDER, amountRaw: parseUnits(0.05, 6), memo: 'tt:agent:pace', rpc: 'http://127.0.0.1:8548', fork: true, from: AGENT });
  assert.deepEqual(a, ['send', SPENDER, 'give(uint256,string)', '50000', 'tt:agent:pace', '--rpc-url', 'http://127.0.0.1:8548', '--unlocked', '--from', AGENT]);
  assert.match(formatCommand(['send', 'a b']), /'a b'/);
  assert.throws(() => buildCastArgs({ spender: SPENDER, amountRaw: 1n, memo: 'x402:1', rpc: 'r' }), /tt:agent:/);
  assert.throws(() => buildCastArgs({ spender: 'nope', amountRaw: 1n, memo: 'tt:agent:x', rpc: 'r' }), /address/);
  assert.throws(() => buildCastArgs({ spender: SPENDER, amountRaw: 0n, memo: 'tt:agent:x', rpc: 'r' }), /positive/);
});

test('--fork refuses a non-local RPC', async () => {
  await assert.rejects(
    act({ action: 'give', amountUsdc: 0.01, memo: 'tt:agent:x' }, { spender: SPENDER, rpc: 'https://rpc.testnet.arc.io', unitDecimals: 18, fork: true, from: AGENT }),
    /local anvil/,
  );
  assert.equal(isLocalRpc('http://127.0.0.1:8548'), true);
  assert.equal(isLocalRpc('http://localhost:8545'), true);
  assert.equal(isLocalRpc('https://rpc.mainnet.arc.io'), false);
  assert.equal(isPlainRpc('https://rpc.testnet.arc.io'), true);
  assert.equal(isPlainRpc('https://eth.provider.io/v2/SECRETKEY'), false);
  assert.equal(isPlainRpc('https://rpc.io/?apikey=x'), false);
});

test('fork mode records the tx hash on success and the decoded revert on refusal', async () => {
  const ok = (_bin, _args, _o, cb) => cb(null, JSON.stringify({ transactionHash: '0xaa', status: '0x1', blockNumber: '0x10' }), '');
  const r1 = await act({ action: 'give', amountUsdc: 0.01, memo: 'tt:agent:x' }, { spender: SPENDER, rpc: 'http://127.0.0.1:8548', unitDecimals: 18, fork: true, from: AGENT, execImpl: ok });
  assert.equal(r1.status, 'success');
  assert.equal(r1.txHash, '0xaa');
  const data = '0x734e76f9' + w(10n ** 17n) + w(5n * 10n ** 16n);
  const bad = (_bin, _args, _o, cb) => cb(new Error('exit 1'), '', `Error: server returned an error response: error code 3: execution reverted, data: "${data}" from ${AGENT}`);
  const r2 = await act({ action: 'give', amountUsdc: 0.1, memo: 'tt:agent:demo-overcap' }, { spender: SPENDER, rpc: 'http://127.0.0.1:8548', unitDecimals: 18, fork: true, from: AGENT, execImpl: bad });
  assert.equal(r2.status, 'reverted');
  assert.deepEqual(r2.revert, { name: 'OverTxCap', args: { amount: '100000000000000000', cap: '50000000000000000' } });
});

test('hold does nothing', async () => {
  assert.deepEqual(await act({ action: 'hold', rationale: 'x' }, {}), { mode: 'none' });
});

// ------------------------------------------------------------------ abi

test('units and decoders', () => {
  assert.equal(formatUnits(5n * 10n ** 16n, 18), '0.05');
  assert.equal(formatUnits(1_000_000n, 6), '1');
  assert.equal(parseUnits(0.05, 18), 5n * 10n ** 16n);
  assert.equal(parseUnits('1.5', 6), 1_500_000n);
  assert.throws(() => parseUnits('0.0000001', 6));
  assert.equal(stringAt(encodeWithString([1, 2], 'tt:agent:hi'), 2), 'tt:agent:hi');
  assert.equal(decodeRevert('0x68de5ce4').name, 'SplitPaused');
  assert.equal(decodeRevert(`addr ${AGENT} data 0x92ec8899${w(11)}${w(10)}`).name, 'OverDailyCap');
  assert.equal(decodeRevert('nothing here'), null);
});

const HOT = '0x' + '11'.repeat(20); // a backend treat/match hot wallet (TREAT_AGENT_TT_SENDERS)

test('memo classes and matched prefixes (trusted payers)', () => {
  const trusted = trustedSenders(SPENDER, `${HOT}, not-an-address`);
  assert.equal(trusted.size, 2);
  assert.equal(classify('tt:agent:pace', SPENDER, SPENDER, trusted), 'agent');
  assert.equal(classify('', SPENDER, SPENDER, trusted), 'agent');
  assert.equal(classify('tt:match:abcdef01', HOT, SPENDER, trusted), 'match');
  assert.equal(classify('tt:heist:12345678', HOT, SPENDER, trusted), 'treat');
  assert.equal(classify('x402:abc', DONOR, SPENDER, trusted), 'x402');
  assert.equal(classify('hello', DONOR, SPENDER, trusted), 'public');
  assert.deepEqual([...matchedPrefixes(['tt:agent:match-abcdef01', 'tt:match:12345678', 'tt:agent:pace'])], ['abcdef01', '12345678']);
});

test('a tt:* memo from an untrusted payer is public money and marks nothing as matched', () => {
  const trusted = trustedSenders(SPENDER, HOT);
  assert.equal(classify('tt:agent:match-abcdef01', DONOR, SPENDER, trusted), 'public');
  assert.equal(classify('tt:match:abcdef01', DONOR, SPENDER, trusted), 'public');
  assert.equal(classify('tt:heist:12345678', DONOR, SPENDER, trusted), 'public');
  const batches = [
    { memo: 'tt:agent:match-abcdef01', payer: DONOR },
    { memo: 'tt:match:12345678', payer: HOT },
    { memo: 'tt:agent:match-99999999', payer: SPENDER },
  ];
  assert.deepEqual([...matchedPrefixes(batches, trusted)].sort(), ['12345678', '99999999']);
});

test('observe: a spoofed match memo does not hide a real gift from matching', async () => {
  const logs = [
    batchLog({ batchId: 1, payer: DONOR, amount: 2n * 10n ** 16n, memo: 'real fan gift', tx: '0xabcdef01' + '0'.repeat(56), block: 199_000 }),
    batchLog({ batchId: 2, payer: '0x' + 'ee'.repeat(20), amount: 10n ** 16n, memo: 'tt:agent:match-abcdef01', tx: '0xeeeeeeee' + '0'.repeat(56), block: 199_100 }),
  ];
  const { fetchImpl } = stubRpc({ logs });
  const obs = await observe({ rpc: makeRpc('http://stub', { fetchImpl }), spender: SPENDER, needsFile: null, ttSenders: HOT });
  assert.equal(obs.last24h.tokenTailsUsdc, 0, 'the stranger\'s gift is not counted as Token Tails money');
  assert.equal(obs.last24h.publicGiftsUsdc, 0.03);
  assert.deepEqual(obs.last24h.unmatchedPublicGifts.map((g) => g.txPrefix), ['eeeeeeee', 'abcdef01']);
});

test('observe: router gifts are left to the backend matcher unless TREAT_AGENT_MATCH_ROUTER', async () => {
  const ROUTER = '0x' + 'ab'.repeat(20);
  const tx = '0xcafebabe' + '0'.repeat(56);
  const routerLog = {
    address: ROUTER,
    topics: ['0xf057bcd6794500ca5bd0ed074e76b7ab595a7b9fdc70b87528191f50eae48a0c', '0x' + addrWord(DONOR), '0x' + w(7), '0x' + w(0)],
    data: encodeWithString([2n * 10n ** 16n, 1], 'via router'),
    transactionHash: tx,
    blockNumber: '0x' + (199_000).toString(16),
  };
  const logs = [batchLog({ batchId: 7, payer: ROUTER, amount: 2n * 10n ** 16n, memo: 'via router', tx, block: 199_000 }), routerLog];
  const { fetchImpl } = stubRpc({ logs });
  const rpc = makeRpc('http://stub', { fetchImpl });
  const off = await observe({ rpc, spender: SPENDER, router: ROUTER, needsFile: null });
  assert.equal(off.last24h.publicGifts[0].kind, 'router-native');
  assert.equal(off.last24h.unmatchedPublicGifts.length, 0);
  assert.equal(off.last24h.routerMatchedByBackend, true);
  const on = await observe({ rpc, spender: SPENDER, router: ROUTER, needsFile: null, matchRouter: true });
  assert.equal(on.last24h.unmatchedPublicGifts.length, 1);
});

test('observe refuses a native-mode spender off Arc (the native coin would not be USDC)', async () => {
  const { fetchImpl } = stubRpc({ chainId: 10143 });
  await assert.rejects(observe({ rpc: makeRpc('http://stub', { fetchImpl }), spender: SPENDER, needsFile: null }), /native mode is Arc only/);
  const erc = stubRpc({ chainId: 10143, native: false });
  const obs = await observe({ rpc: makeRpc('http://stub', { fetchImpl: erc.fetchImpl }), spender: SPENDER, needsFile: null });
  assert.equal(obs.spender.unitDecimals, 6);
});

test('a gift that would leave treasury dust is held before sending', async () => {
  const logs = [batchLog({ batchId: 1, payer: DONOR, amount: 2n * 10n ** 16n, memo: 'gift', tx: '0xabcdef01' + '0'.repeat(56), block: 199_000 })];
  const { fetchImpl } = stubRpc({ logs, toTreasury: 1n });
  const dir = await mkdtemp(path.join(tmpdir(), 'treat-agent-'));
  process.env.TREAT_AGENT_FAKE_LLM = '1';
  try {
    const r = await round({ rpc: 'http://stub', spender: SPENDER, fork: false, demoOvercap: false, hours: 24 }, { rpcFetch: fetchImpl, logDir: dir });
    assert.equal(r.decision.action, 'hold');
    assert.equal(r.decision.heldForDust, true);
    assert.equal(r.result.mode, 'none');
  } finally {
    delete process.env.TREAT_AGENT_FAKE_LLM;
  }
});

test('an API failure is logged as an API error, not a model decision', async () => {
  const { fetchImpl } = stubRpc();
  const dir = await mkdtemp(path.join(tmpdir(), 'treat-agent-'));
  const llmFetch = async () => ({ ok: false, status: 400, text: async () => 'bad field' });
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    const r = await round({ rpc: 'http://stub', spender: SPENDER, fork: false, demoOvercap: false, hours: 24 }, { rpcFetch: fetchImpl, llmFetch, logDir: dir });
    assert.equal(r.meta.apiError, true);
    assert.equal(r.meta.status, 400);
    assert.equal(r.decision.action, 'hold');
    assert.match(describe(r), /Messages API call failed/);
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('refusals are shown in USDC, not raw wei', () => {
  assert.equal(formatRevert({ name: 'OverTxCap', args: { amount: '100000000000000000', cap: '50000000000000000' } }, 18), 'OverTxCap(0.1, 0.05)');
  assert.equal(formatRevert({ name: 'OverDailyCap', args: { wouldSpend: '110000', cap: '100000' } }, 6), 'OverDailyCap(0.11, 0.1)');
  assert.equal(formatRevert({ name: 'SplitPaused', args: {} }, 18), 'SplitPaused()');
});

// ------------------------------------------------------------------ observe

test('observe reads caps, float and sorts the last 24 h of payouts', async () => {
  const logs = [
    batchLog({ batchId: 1, payer: DONOR, amount: 2n * 10n ** 16n, memo: 'from a fan', tx: '0xabcdef01' + '0'.repeat(56), block: 199_000 }),
    batchLog({ batchId: 2, payer: DONOR, amount: 3n * 10n ** 16n, memo: 'second', tx: '0x12345678' + '0'.repeat(56), block: 199_500 }),
    batchLog({ batchId: 3, payer: SPENDER, amount: 2n * 10n ** 16n, memo: 'tt:agent:match-abcdef01', tx: '0x99' + '0'.repeat(62), block: 199_600 }),
    batchLog({ batchId: 4, payer: HOT, amount: 10_000n, memo: 'tt:heist:aaaa0000', native: false, tx: '0x77' + '0'.repeat(62), block: 199_700 }),
    batchLog({ batchId: 5, payer: DONOR, amount: E18, memo: 'too old', tx: '0x55' + '0'.repeat(62), block: 10 }),
  ];
  const { fetchImpl } = stubRpc({ remaining: 8n * 10n ** 16n, spent: 2n * 10n ** 16n, logs });
  const obs = await observe({ rpc: makeRpc('http://stub', { fetchImpl }), spender: SPENDER, router: null, needsFile: null, ttSenders: HOT, now: Date.parse('2026-10-04T12:00:00Z') });
  assert.equal(obs.chainId, 31337);
  assert.equal(obs.spender.native, true);
  assert.equal(obs.spender.agent, AGENT);
  assert.equal(obs.spender.perTxCapUsdc, 0.05);
  assert.equal(obs.spender.remainingTodayUsdc, 0.08);
  assert.equal(obs.spender.floatUsdc, 1);
  assert.equal(obs.window.toBlock, 200_000);
  assert.equal(obs.window.fromBlock, 200_000 - 172_800);
  assert.equal(obs.last24h.publicGiftsUsdc, 0.05);
  assert.equal(obs.last24h.agentGiftsUsdc, 0.02);
  assert.equal(obs.last24h.treatsUsdc, 0.01);
  assert.equal(obs.last24h.unmatchedPublicGifts.length, 1);
  assert.equal(obs.last24h.unmatchedPublicGifts[0].txPrefix, '12345678');
  assert.equal(obs.campaign.goalUsdc, 90);
  assert.equal(obs.campaign.endDate, '2027-01-31');
  assert.equal(obs.campaign.sameChain, false);
  assert.match(obs.campaign.note, /test USDC/);
});

test('one round with stubs: observe -> decide -> dry-run -> JSONL log', async () => {
  const logs = [batchLog({ batchId: 1, payer: DONOR, amount: 2n * 10n ** 16n, memo: 'gift', tx: '0xabcdef01' + '0'.repeat(56), block: 199_000 })];
  const { fetchImpl } = stubRpc({ logs });
  const dir = await mkdtemp(path.join(tmpdir(), 'treat-agent-'));
  process.env.TREAT_AGENT_FAKE_LLM = '1';
  try {
    const r = await round({ rpc: 'http://stub', rpcDisplay: '"$TREAT_AGENT_RPC"', spender: SPENDER, fork: false, demoOvercap: false, keystore: 'tt-agent', hours: 24 }, { rpcFetch: fetchImpl, logDir: dir });
    assert.equal(r.decision.memo, 'tt:agent:match-abcdef01');
    assert.equal(r.result.mode, 'dry-run');
    const line = JSON.parse((await readFile(r.file, 'utf8')).trim());
    assert.match(line.observationHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal(line.decision.amountUsdc, 0.02);
    assert.equal(line.result.mode, 'dry-run');
    assert.doesNotMatch(JSON.stringify(line), /http:\/\/stub/);
  } finally {
    delete process.env.TREAT_AGENT_FAKE_LLM;
  }
});

test('observation hash is stable under key order', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2n }] }), '{"a":[2,{"c":"2","d":1}],"b":1}');
  assert.equal(hashObservation({ a: 1, b: 2 }), hashObservation({ b: 2, a: 1 }));
});

test('getLogs halves its block range when the provider says the range is too large', async () => {
  const logs = [
    batchLog({ batchId: 1, payer: DONOR, amount: 10n ** 16n, memo: 'old', tx: '0xaaaaaaaa' + '0'.repeat(56), block: 150_000 }),
    batchLog({ batchId: 2, payer: DONOR, amount: 2n * 10n ** 16n, memo: 'new', tx: '0xbbbbbbbb' + '0'.repeat(56), block: 199_999 }),
  ];
  const { fetchImpl } = stubRpc({ logs });
  let refused = 0;
  const limited = async (url, init) => {
    const req = JSON.parse(init.body);
    if (req.method === 'eth_getLogs') {
      const f = req.params[0];
      if (Number(BigInt(f.toBlock)) - Number(BigInt(f.fromBlock)) >= 10_000) {
        refused++;
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: req.id, error: { message: 'requested range too large' } }) };
      }
    }
    return fetchImpl(url, init);
  };
  const obs = await observe({ rpc: makeRpc('http://stub', { fetchImpl: limited }), spender: SPENDER, needsFile: null });
  assert.ok(refused > 0);
  assert.equal(obs.last24h.publicGifts.length, 2);
  assert.deepEqual(obs.last24h.unmatchedPublicGifts.map((g) => g.txPrefix), ['bbbbbbbb', 'aaaaaaaa'], 'newest first');
});
